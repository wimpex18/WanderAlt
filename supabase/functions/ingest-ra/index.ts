// ============================================================
// ingest-ra  v1
// Pulls upcoming electronic / club events from Resident Advisor
// (ra.co) via their GraphQL endpoint and pushes them to
// staging_messages for process-staging to curate.
//
// RA's HTML frontend is Cloudflare-gated, but the GraphQL API at
// https://ra.co/graphql answers eventListings queries from a
// datacenter IP when the browser-like headers below are sent.
//
// Area ids come from RA's `search` resolver (searchType: AREA).
//   Vilnius = 561 (countryName "Lithuania").
// Add a city by appending to AREAS + inserting a matching
// sources row (kind 'web', channel 'ra-<city>').
//
// Dedup key: (channel, message_id) where message_id = RA listing id.
// Schedule: NONE by default — invoke manually, or add a cron once
//           the RA terms-of-service question is settled.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RA_GRAPHQL   = 'https://ra.co/graphql';

const AREAS: Record<string, { area: number; channel: string }> = {
  vilnius: { area: 561, channel: 'ra-vilnius' },
};

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey:         SERVICE_KEY,
      Authorization:  `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

type RAEvent = {
  id: string;
  listingDate: string;
  event: {
    id: string;
    title: string;
    contentUrl: string;
    startTime: string | null;
    endTime: string | null;
    content: string | null;
    venue: { name: string | null } | null;
    artists: { name: string }[] | null;
  } | null;
};

const EVENT_QUERY = `query GET_EVENT_LISTINGS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int){
  eventListings(filters: $filters, pageSize: $pageSize, page: $page){
    data{ id listingDate event{ id title contentUrl startTime endTime content venue{ name } artists{ name } } }
    totalResults
  }
}`;

async function fetchArea(area: number): Promise<RAEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const all: RAEvent[] = [];
  const pageSize = 50;

  for (let page = 1; page <= 4; page++) {
    const res = await fetch(RA_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'User-Agent':         'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Referer':            'https://ra.co/events',
        'Origin':             'https://ra.co',
        'ra-content-language': 'en',
      },
      body: JSON.stringify({
        operationName: 'GET_EVENT_LISTINGS',
        variables: {
          filters: { areas: { eq: area }, listingDate: { gte: today } },
          pageSize, page,
        },
        query: EVENT_QUERY,
      }),
    });
    if (!res.ok) throw new Error(`RA GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`RA GraphQL: ${json.errors[0].message}`);

    const listing = json.data?.eventListings;
    const batch   = (listing?.data ?? []) as RAEvent[];
    all.push(...batch);

    const total = listing?.totalResults ?? 0;
    if (all.length >= total || batch.length === 0) break;
  }

  return all;
}

function composeText(e: RAEvent): string {
  const ev = e.event!;
  const when = ev.startTime
    ? new Date(ev.startTime).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : e.listingDate.slice(0, 10);
  const lineup = (ev.artists ?? []).map(a => a.name).filter(Boolean).join(', ');
  const body   = (ev.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 700);
  return [
    ev.title,
    `When: ${when}`,
    ev.venue?.name ? `Venue: ${ev.venue.name}` : '',
    lineup ? `Lineup: ${lineup}` : '',
    body,
    'Source: Resident Advisor',
  ].filter(Boolean).join('\n');
}

async function getSourceId(channel: string, city: string): Promise<number | null> {
  const res = await rest(`sources?channel=eq.${channel}&city=eq.${city}&select=id`);
  if (!res.ok) return null;
  const rows = (await res.json()) as { id: number }[];
  return rows[0]?.id ?? null;
}

async function upsertEvent(
  sourceId: number,
  channel: string,
  e: RAEvent,
): Promise<'inserted' | 'skipped' | 'error'> {
  const ev = e.event;
  if (!ev) return 'skipped';
  const messageId = Number(e.id);
  if (!Number.isFinite(messageId)) return 'skipped';

  const row = {
    source_id:  sourceId,
    channel,
    message_id: messageId,
    text:       composeText(e),
    posted_at:  ev.startTime || e.listingDate || new Date().toISOString(),
    permalink:  `https://ra.co${ev.contentUrl}`,
    status:     'new',
  };
  const res = await rest('staging_messages', {
    method:  'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body:    JSON.stringify(row),
  });
  if (!res.ok) {
    console.error(`staging insert failed ${messageId}: ${res.status} ${await res.text()}`);
    return 'error';
  }
  const body = await res.json().catch(() => []);
  return Array.isArray(body) && body.length ? 'inserted' : 'skipped';
}

async function markSource(sourceId: number) {
  await rest(`sources?id=eq.${sourceId}`, {
    method: 'PATCH',
    body:   JSON.stringify({ last_scraped_at: new Date().toISOString() }),
  });
}

async function logRun(stats: { inserted: number; skipped: number; error: string | null }) {
  await rest('ingest_log', {
    method: 'POST',
    body:   JSON.stringify({
      fn:          'ingest-ra',
      status:      stats.error ? 'error' : 'ok',
      inserted:    stats.inserted,
      rejected:    0,
      error:       stats.error,
      finished_at: new Date().toISOString(),
    }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  let onlyCity: string | undefined;
  try {
    const b = await req.json();
    if (b && typeof b.city === 'string') onlyCity = b.city.toLowerCase();
  } catch { /* no body */ }

  const cities = onlyCity
    ? (AREAS[onlyCity] ? [onlyCity] : [])
    : Object.keys(AREAS);

  let totalInserted = 0;
  let totalSkipped  = 0;
  const errors: string[] = [];

  for (const city of cities) {
    const { area, channel } = AREAS[city];
    try {
      const sourceId = await getSourceId(channel, city);
      if (!sourceId) throw new Error(`source row not found: ${channel}/${city}`);

      const events = await fetchArea(area);
      console.log(`[ingest-ra] ${city}: ${events.length} events`);

      for (const e of events) {
        const r = await upsertEvent(sourceId, channel, e);
        if (r === 'inserted') totalInserted++;
        else if (r === 'skipped') totalSkipped++;
      }
      await markSource(sourceId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${city}: ${msg}`);
      console.error('[ingest-ra]', msg);
    }
  }

  const runError = errors.length ? errors.join('; ') : null;
  await logRun({ inserted: totalInserted, skipped: totalSkipped, error: runError });

  return new Response(JSON.stringify({
    ok:         !runError,
    inserted:   totalInserted,
    skipped:    totalSkipped,
    error:      runError,
    latency_ms: Date.now() - t0,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status:  runError ? 500 : 200,
  });
});
