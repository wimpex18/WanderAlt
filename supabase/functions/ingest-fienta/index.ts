import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// ingest-fienta  v1
// Pulls Tallinn underground venue events from Fienta's JSON API
// and pushes them to staging_messages for process-staging to
// turn into curated picks.
//
// Sources rows (kind='fienta'):
//   channel    = Fienta organizer slug or id (e.g. 'paavli-kultuurivabrik', '15')
//   feed_url   = full JSON endpoint (https://fienta.com/o/<slug>?format=json)
//   curator_handle = '@paavli' | '@vonkrahl' | ... (FK to curators)
//
// On each run:
//   1. Read all enabled sources where kind='fienta'.
//   2. Fetch the JSON for each.
//   3. For every future event (starts_at >= now), upsert into
//      staging_messages with channel = source.channel and
//      message_id = event.id (deduplication key).
//   4. Update last_scraped_at on the source.
//   5. Write a single row to ingest_log.
//
// Schedule (pg_cron, see migration):
//   ingest-fienta runs daily at 04:00 UTC, after enrich-venues.
//
// Manual trigger (smoke test):
//   curl -X POST -H "Authorization: Bearer <SERVICE_KEY>" \
//     "$SUPABASE_URL/functions/v1/ingest-fienta"
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey:        SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

type FientaEvent = {
  id: number;
  title: string;
  starts_at: string;          // 'YYYY-MM-DD HH:mm:ss' (local time, Estonia)
  ends_at?: string;
  venue?: string;
  address?: string;
  description?: string;       // HTML
  url?: string;
  image_url?: string;
  organizer_name?: string;
  organizer_id?: number;
  categories?: string[];
  event_status?: string;
  sale_status?: string;
};

type FientaResponse = { events?: FientaEvent[] };

type Source = {
  id: number;
  channel: string;
  curator_handle: string | null;
  city: string;
  feed_url: string | null;
};

// Strip HTML tags from description, collapse whitespace, cap length.
function plain(html: string | undefined, max = 600): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Compose a staging text in a shape process-staging expects.
// Mirrors the Telegram message style: title, venue, when, blurb.
function composeText(e: FientaEvent): string {
  const when  = e.starts_at?.slice(0, 16).replace(' ', ' · '); // "2026-05-16 · 23:00"
  const venue = e.venue ? `Venue: ${e.venue}` : '';
  const blurb = plain(e.description, 600);
  const cats  = e.categories?.length ? `Categories: ${e.categories.join(', ')}` : '';
  return [
    `${e.title}`,
    when ? `When: ${when}` : '',
    venue,
    cats,
    blurb,
  ].filter(Boolean).join('\n');
}

async function fetchSourceEvents(source: Source): Promise<FientaEvent[]> {
  if (!source.feed_url) return [];
  const res = await fetch(source.feed_url, {
    headers: { 'User-Agent': 'WanderAlt-Ingest/1.0 (https://wanderalt.app)' },
  });
  if (!res.ok) throw new Error(`Fienta HTTP ${res.status} for ${source.channel}`);
  const body = (await res.json()) as FientaResponse;
  const now = Date.now();
  return (body.events ?? []).filter(e => {
    if (!e.id || !e.title || !e.starts_at) return false;
    if (e.event_status && e.event_status !== 'scheduled') return false;
    // Drop gift cards and other "events" that span ~all year.
    const startMs = Date.parse(e.starts_at.replace(' ', 'T') + '+02:00');
    if (Number.isNaN(startMs)) return false;
    if (startMs < now - 86400_000) return false;  // already past
    // Filter long-running placeholder "events" (>180d) — usually gift cards.
    if (e.ends_at) {
      const endMs = Date.parse(e.ends_at.replace(' ', 'T') + '+02:00');
      if (!Number.isNaN(endMs) && (endMs - startMs) > 180 * 86400_000) return false;
    }
    return true;
  });
}

async function upsertEvent(source: Source, e: FientaEvent): Promise<'inserted'|'skipped'|'error'> {
  // Upsert by (channel, message_id) which is the unique key on staging_messages.
  const row = {
    source_id:  source.id,
    channel:    source.channel,
    message_id: e.id,
    text:       composeText(e),
    posted_at:  new Date(e.starts_at.replace(' ', 'T') + '+02:00').toISOString(),
    permalink:  e.url ?? `https://fienta.com/o/${source.channel}`,
    status:     'new',
  };
  const res = await rest('staging_messages', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body:   JSON.stringify(row),
  });
  if (!res.ok) {
    console.error(`staging insert failed for ${source.channel}#${e.id}: ${res.status}`);
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

async function logRun(stats: { inserted: number; skipped: number; rejected: number; error: string | null }) {
  await rest('ingest_log', {
    method: 'POST',
    body:   JSON.stringify({
      fn:          'ingest-fienta',
      status:      stats.error ? 'error' : 'ok',
      inserted:    stats.inserted,
      rejected:    stats.rejected,
      error:       stats.error,
      finished_at: new Date().toISOString(),
    }),
  }).catch(() => { /* ingest_log is optional — never fail the run on logging issues */ });
}

Deno.serve(async () => {
  const t0 = Date.now();
  let totalInserted = 0;
  let totalSkipped  = 0;
  let runError: string | null = null;

  try {
    const sourcesRes = await rest('sources?kind=eq.fienta&enabled=eq.true&select=id,channel,curator_handle,city,feed_url');
    if (!sourcesRes.ok) throw new Error(`sources fetch HTTP ${sourcesRes.status}`);
    const sources = (await sourcesRes.json()) as Source[];

    for (const src of sources) {
      try {
        const events = await fetchSourceEvents(src);
        for (const e of events) {
          const r = await upsertEvent(src, e);
          if (r === 'inserted') totalInserted++;
          else if (r === 'skipped') totalSkipped++;
        }
        await markSource(src.id);
        console.log(`[fienta] ${src.channel}: ${events.length} events processed`);
      } catch (err) {
        console.error(`[fienta] ${src.channel}:`, err.message);
        runError = err.message;
      }
    }
  } catch (err) {
    runError = err.message;
  }

  await logRun({ inserted: totalInserted, skipped: totalSkipped, rejected: 0, error: runError });

  return new Response(JSON.stringify({
    ok:        !runError,
    inserted:  totalInserted,
    skipped:   totalSkipped,
    error:     runError,
    latency_ms: Date.now() - t0,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status:  runError ? 500 : 200,
  });
});
