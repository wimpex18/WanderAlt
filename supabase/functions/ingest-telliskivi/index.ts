// ============================================================
// ingest-telliskivi  v3
// v3 (Jun 2026): bumpSeen() marks each still-listed pick's
//   last_seen_at so wa_reconcile_absent_picks can detect silent
//   source-side cancellations. Best-effort; never blocks ingest.
// Scrapes the Telliskivi Creative City events listing page and
// pushes events to staging_messages for process-staging.
//
// Source: https://telliskivi.cc/en/events/
// Dedup key: (channel, message_id) where message_id = URL slug.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVENTS_URL   = 'https://telliskivi.cc/en/events/';
const CHANNEL      = 'telliskivi';
const SOURCE_CITY  = 'tallinn';

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

// Best-effort: mark the matching pick as still-listed so the absence reconcile
// (wa_reconcile_absent_picks) won't flag it as silently cancelled. Keyed on the
// single-event pick id (channel-message_id, matching process-staging). Never
// throws — it must not block ingest.
async function bumpSeen(messageId: string) {
  try {
    const pid = `${CHANNEL}-${messageId}`.toLowerCase();
    await rest(`picks?id=eq.${encodeURIComponent(pid)}&archived_at=is.null`, {
      method:  'PATCH',
      headers: { Prefer: 'return=minimal' },
      body:    JSON.stringify({ last_seen_at: new Date().toISOString() }),
    });
  } catch (_) { /* best-effort */ }
}

// ── Minimal HTML string parser ────────────────────────────────
function between(html: string, open: string, close: string): string {
  const start = html.indexOf(open);
  if (start < 0) return '';
  const from = start + open.length;
  const end = html.indexOf(close, from);
  return end < 0 ? '' : html.slice(from, end).trim();
}

function allBetween(html: string, open: string, close: string): string[] {
  const results: string[] = [];
  let pos = 0;
  while (true) {
    const start = html.indexOf(open, pos);
    if (start < 0) break;
    const from = start + open.length;
    const end = html.indexOf(close, from);
    if (end < 0) break;
    results.push(html.slice(from, end).trim());
    pos = end + close.length;
  }
  return results;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

type TelliskiviEvent = {
  slug: string;
  url: string;
  date: string;
  title: string;
  category: string;
  venue: string;
};

function parseListingPage(html: string): TelliskiviEvent[] {
  const jsEventsStart = html.indexOf('class="js-events"');
  if (jsEventsStart < 0) return [];
  const eventsHtml = html.slice(jsEventsStart);

  const events: TelliskiviEvent[] = [];
  const cards = eventsHtml.split('<div class="card ');
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];

    const urlMatch = card.match(/href="(https?:\/\/telliskivi\.cc\/en\/events\/[^"]+)"/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    const slugMatch = url.match(/\/events\/([^/]+)\//);
    if (!slugMatch) continue;
    const slug = slugMatch[1];

    const dateStr = stripTags(between(card, 'card__timestamp-date">', '</span>'));
    const dayStr  = stripTags(between(card, 'card__timestamp-day">',  '</span>'));
    const date = [dateStr, dayStr].filter(Boolean).join(' ');

    const title = stripTags(between(card, 'card__title">', '</h3>'));
    if (!title) continue;

    const metaItems = allBetween(card, 'card__meta-item', '</div>')
      .map(raw => stripTags(raw.replace(/^[^>]*>/, '')));
    const category = metaItems[0] ?? '';
    const venue    = metaItems[1] ?? 'Telliskivi Creative City';

    events.push({ slug, url, date, title, category, venue });
  }
  return events;
}

function parseEventDate(dateStr: string): Date | null {
  const m = dateStr.match(/(\w+)\s+(\d+)/);
  if (!m) return null;
  const months: Record<string, number> = {
    Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
    Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
  };
  const month = months[m[1]];
  if (month === undefined) return null;
  const day = parseInt(m[2], 10);
  const year = new Date().getFullYear();
  const d = new Date(year, month, day);
  if (Date.now() - d.getTime() > 7 * 86400_000) d.setFullYear(year + 1);
  return d;
}

function composeText(e: TelliskiviEvent): string {
  return [
    e.title,
    e.date ? `When: ${e.date}` : '',
    e.venue ? `Venue: ${e.venue}` : '',
    e.category ? `Category: ${e.category}` : '',
  ].filter(Boolean).join('\n');
}

async function getSourceId(): Promise<number | null> {
  const res = await rest(`sources?channel=eq.${CHANNEL}&city=eq.${SOURCE_CITY}&select=id`);
  if (!res.ok) return null;
  const rows = await res.json() as { id: number }[];
  return rows[0]?.id ?? null;
}

async function upsertEvent(
  sourceId: number,
  e: TelliskiviEvent,
): Promise<'inserted' | 'skipped' | 'error'> {
  const row = {
    source_id:  sourceId,
    channel:    CHANNEL,
    message_id: e.slug,
    text:       composeText(e),
    posted_at:  parseEventDate(e.date)?.toISOString() ?? new Date().toISOString(),
    permalink:  e.url,
    status:     'new',
  };
  const res = await rest('staging_messages', {
    method:  'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body:    JSON.stringify(row),
  });
  if (!res.ok) {
    console.error(`staging insert failed ${e.slug}: ${res.status}`);
    return 'error';
  }
  const body = await res.json().catch(() => []);
  await bumpSeen(e.slug);
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
      fn:          'ingest-telliskivi',
      status:      stats.error ? 'error' : 'ok',
      inserted:    stats.inserted,
      rejected:    0,
      error:       stats.error,
      finished_at: new Date().toISOString(),
    }),
  }).catch(() => {});
}

Deno.serve(async () => {
  const t0 = Date.now();
  let totalInserted = 0;
  let totalSkipped  = 0;
  let runError: string | null = null;

  try {
    const sourceId = await getSourceId();
    if (!sourceId) throw new Error('telliskivi source row not found in sources table');

    const res = await fetch(EVENTS_URL, {
      headers: { 'User-Agent': 'WanderAlt-Ingest/1.0 (https://wanderalt.app)' },
    });
    if (!res.ok) throw new Error(`Telliskivi HTTP ${res.status}`);
    const html = await res.text();

    const events = parseListingPage(html);
    console.log(`[telliskivi] parsed ${events.length} events from listing`);

    const now = Date.now();
    for (const e of events) {
      const d = parseEventDate(e.date);
      if (d && d.getTime() < now - 86400_000) {
        totalSkipped++;
        continue;
      }
      const r = await upsertEvent(sourceId, e);
      if (r === 'inserted') totalInserted++;
      else if (r === 'skipped') totalSkipped++;
    }

    await markSource(sourceId);
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    console.error('[telliskivi]', runError);
  }

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
