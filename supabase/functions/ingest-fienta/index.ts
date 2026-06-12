import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// ingest-fienta  v4
// v4 (Jun 2026): permanent per-channel diagnostics in ingest_log.detail —
//   { fetched, eligible, inserted, skipped, bumped } per source — to
//   diagnose + monitor the under-processing observed June 2026 (~2 of ~13
//   feed events getting last_seen bumped; live events false-flagged by the
//   absence reconcile). bumpSeen() now reports how many pick rows its
//   PATCH matched, so "bumped" is ground truth, not an assumption. Also
//   closes the low-yield blind spot from ROADMAP finding #3: a collapse
//   from fetched=13 to eligible=2 is now visible in the log row.
// v2 (Jun 2026): bumpSeen() marks each still-listed pick's last_seen_at
//   for wa_reconcile_absent_picks (silent-cancellation detection).
// Pulls Tallinn underground venue events from Fienta's JSON API and pushes
// them to staging_messages. Dedup key: (channel, message_id=event.id).
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

// Best-effort: mark the matching pick as still-listed so wa_reconcile_absent_picks
// won't flag it as silently cancelled. Keyed on the single-event pick id
// (channel-message_id, matching process-staging). Never throws.
// Returns the number of pick rows the PATCH matched (0 = no active pick with
// that id; -1 = request failed) so the run log can report real bump counts.
async function bumpSeen(channel: string, messageId: string | number): Promise<number> {
  try {
    const pid = `${channel}-${messageId}`.toLowerCase();
    const res = await rest(`picks?id=eq.${encodeURIComponent(pid)}&archived_at=is.null&select=id`, {
      method:  'PATCH',
      headers: { Prefer: 'return=representation' },
      body:    JSON.stringify({ last_seen_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      console.error(`bumpSeen ${pid}: HTTP ${res.status}`);
      return -1;
    }
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    console.error('bumpSeen threw:', e instanceof Error ? e.message : String(e));
    return -1;
  }
}

type FientaEvent = {
  id: number;
  title: string;
  starts_at: string;
  ends_at?: string;
  venue?: string;
  address?: string;
  description?: string;
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

type ChannelStats = {
  fetched: number;    // raw events in the feed body
  eligible: number;   // survived the future/scheduled/duration filter
  inserted: number;   // new staging rows
  skipped: number;    // already-staged (ignore-duplicates hit)
  errors: number;     // staging insert failures
  bumped: number;     // pick rows whose last_seen_at the PATCHes matched
};

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

function composeText(e: FientaEvent): string {
  const when  = e.starts_at?.slice(0, 16).replace(' ', ' · ');
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

async function fetchSourceEvents(source: Source): Promise<{ fetched: number; events: FientaEvent[] }> {
  if (!source.feed_url) return { fetched: 0, events: [] };
  const res = await fetch(source.feed_url, {
    headers: { 'User-Agent': 'WanderAlt-Ingest/1.0 (https://wanderalt.app)' },
  });
  if (!res.ok) throw new Error(`Fienta HTTP ${res.status} for ${source.channel}`);
  const body = (await res.json()) as FientaResponse;
  const all = body.events ?? [];
  const now = Date.now();
  const events = all.filter(e => {
    if (!e.id || !e.title || !e.starts_at) return false;
    if (e.event_status && e.event_status !== 'scheduled') return false;
    const startMs = Date.parse(e.starts_at.replace(' ', 'T') + '+02:00');
    if (Number.isNaN(startMs)) return false;
    if (startMs < now - 86400_000) return false;
    if (e.ends_at) {
      const endMs = Date.parse(e.ends_at.replace(' ', 'T') + '+02:00');
      if (!Number.isNaN(endMs) && (endMs - startMs) > 180 * 86400_000) return false;
    }
    return true;
  });
  return { fetched: all.length, events };
}

async function upsertEvent(source: Source, e: FientaEvent): Promise<{ r: 'inserted'|'skipped'|'error'; bumped: number }> {
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
    return { r: 'error', bumped: 0 };
  }
  const body = await res.json().catch(() => []);
  const bumped = await bumpSeen(source.channel, e.id);
  return { r: (Array.isArray(body) && body.length) ? 'inserted' : 'skipped', bumped: Math.max(0, bumped) };
}

async function markSource(sourceId: number) {
  await rest(`sources?id=eq.${sourceId}`, {
    method: 'PATCH',
    body:   JSON.stringify({ last_scraped_at: new Date().toISOString() }),
  });
}

async function logRun(stats: {
  inserted: number; skipped: number; rejected: number; error: string | null;
  channels: Record<string, ChannelStats>;
}) {
  await rest('ingest_log', {
    method: 'POST',
    body:   JSON.stringify({
      fn:          'ingest-fienta',
      status:      stats.error ? 'error' : 'ok',
      inserted:    stats.inserted,
      rejected:    stats.rejected,
      error:       stats.error,
      detail:      { channels: stats.channels },
      finished_at: new Date().toISOString(),
    }),
  }).catch(() => { /* ingest_log is optional */ });
}

Deno.serve(async () => {
  const t0 = Date.now();
  let totalInserted = 0;
  let totalSkipped  = 0;
  let runError: string | null = null;
  const channels: Record<string, ChannelStats> = {};

  try {
    const sourcesRes = await rest('sources?kind=eq.fienta&enabled=eq.true&select=id,channel,curator_handle,city,feed_url');
    if (!sourcesRes.ok) throw new Error(`sources fetch HTTP ${sourcesRes.status}`);
    const sources = (await sourcesRes.json()) as Source[];

    for (const src of sources) {
      const cs: ChannelStats = { fetched: 0, eligible: 0, inserted: 0, skipped: 0, errors: 0, bumped: 0 };
      channels[src.channel] = cs;
      try {
        const { fetched, events } = await fetchSourceEvents(src);
        cs.fetched  = fetched;
        cs.eligible = events.length;
        for (const e of events) {
          const { r, bumped } = await upsertEvent(src, e);
          cs.bumped += bumped;
          if (r === 'inserted')      { cs.inserted++; totalInserted++; }
          else if (r === 'skipped')  { cs.skipped++;  totalSkipped++; }
          else                       { cs.errors++; }
        }
        await markSource(src.id);
        console.log(`[fienta] ${src.channel}: fetched=${cs.fetched} eligible=${cs.eligible} inserted=${cs.inserted} skipped=${cs.skipped} bumped=${cs.bumped}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[fienta] ${src.channel}:`, msg);
        runError = msg;
      }
    }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
  }

  await logRun({ inserted: totalInserted, skipped: totalSkipped, rejected: 0, error: runError, channels });

  return new Response(JSON.stringify({
    ok:        !runError,
    inserted:  totalInserted,
    skipped:   totalSkipped,
    channels,
    error:     runError,
    latency_ms: Date.now() - t0,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status:  runError ? 500 : 200,
  });
});
