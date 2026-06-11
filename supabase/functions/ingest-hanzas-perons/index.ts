// ============================================================
// ingest-hanzas-perons  v5
// v5 (Jun 2026): bumpSeen() marks each still-listed pick's last_seen_at
//   for wa_reconcile_absent_picks (silent-cancellation detection).
// Scrapes the Hanzas Perons all-events page (Riga) and pushes events to
// staging_messages. message_id = slugToBigint(slug) (staging message_id is
// BIGINT). Hourly, idempotent.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVENTS_URL   = 'https://hanzasperons.lv/en/all-events/';
const CHANNEL      = 'hanzasperons';
const SOURCE_CITY  = 'riga';

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

// Best-effort: mark the matching pick as still-listed so wa_reconcile_absent_picks
// won't flag it as silently cancelled. Keyed on the single-event pick id
// (channel-message_id, matching process-staging). Never throws.
async function bumpSeen(messageId: number) {
  try {
    const pid = `${CHANNEL}-${messageId}`.toLowerCase();
    await rest(`picks?id=eq.${encodeURIComponent(pid)}&archived_at=is.null`, {
      method:  'PATCH',
      headers: { Prefer: 'return=minimal' },
      body:    JSON.stringify({ last_seen_at: new Date().toISOString() }),
    });
  } catch (_) { /* best-effort */ }
}

function between(html: string, open: string, close: string): string {
  const start = html.indexOf(open);
  if (start < 0) return '';
  const from = start + open.length;
  const end = html.indexOf(close, from);
  return end < 0 ? '' : html.slice(from, end).trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function slugToBigint(slug: string): number {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < slug.length; i++) {
    h ^= BigInt(slug.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return Number(h & 0x1fffffffffffffn);
}

type HanzasEvent = {
  slug: string;
  url: string;
  weekday: string;
  month: string;
  day: string;
  title: string;
  imageUrl: string;
  doors: string;
  price: string;
};

function parseListingPage(html: string): HanzasEvent[] {
  const sortStart = html.indexOf('events-sort__items');
  if (sortStart < 0) return [];
  const eventsHtml = html.slice(sortStart);

  const events: HanzasEvent[] = [];
  const cards = eventsHtml.split('<div class="events-item">');
  for (let i = 1; i < cards.length; i++) {
    const cardHtml = cards[i];

    const bodyHref = cardHtml.match(
      /<a\s+href="(https?:\/\/hanzasperons\.lv\/(?:en\/)?event\/[^"]+)"\s+class="events-item__body/
    );
    if (!bodyHref) continue;
    const url = bodyHref[1];
    const slugMatch = url.match(/\/event\/([^/]+)\//);
    if (!slugMatch) continue;
    const slug = slugMatch[1];

    const title = stripTags(
      between(cardHtml, 'class="events-item__heading">', '</div>')
    );
    if (!title) continue;

    const imgMatch = cardHtml.match(
      /events-item__image[\s\S]*?background-image:\s*url\('([^']+)'\)/
    );
    const imageUrl = imgMatch?.[1] ?? '';

    const dateStart = cardHtml.indexOf('class="event-date">');
    const dateBlock = dateStart >= 0
      ? cardHtml.slice(dateStart, dateStart + 400)
      : '';
    const dateSpans: string[] = [];
    const spanRe = /<span>([^<]+)<\/span>/g;
    let m: RegExpExecArray | null;
    while ((m = spanRe.exec(dateBlock)) !== null && dateSpans.length < 2) {
      dateSpans.push(m[1].trim());
    }
    const dayMatch = dateBlock.match(/<div>(\d{1,2})<\/div>/);
    const weekday = (dateSpans[0] ?? '').replace(/\.+$/, '');
    const month   = (dateSpans[1] ?? '').replace(/\.+$/, '');
    const day     = dayMatch?.[1] ?? '';

    const doorsMatch = cardHtml.match(/property="doors">([^<]+)</);
    const priceMatch = cardHtml.match(/property="price">([^<]+)</);
    const doors = doorsMatch ? stripTags(doorsMatch[1]) : '';
    const price = priceMatch ? stripTags(priceMatch[1]) : '';

    events.push({ slug, url, weekday, month, day, title, imageUrl, doors, price });
  }
  return events;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseEventDate(month: string, day: string): Date | null {
  const monKey = month.slice(0, 3);
  if (!(monKey in MONTHS) || !day) return null;
  const m = MONTHS[monKey];
  const d = parseInt(day, 10);
  if (isNaN(d) || d < 1 || d > 31) return null;
  const year = new Date().getFullYear();
  const date = new Date(year, m, d);
  if (Date.now() - date.getTime() > 7 * 86_400_000) date.setFullYear(year + 1);
  return date;
}

function composeText(e: HanzasEvent, when: Date | null): string {
  const whenStr = when
    ? when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
    : [e.weekday, e.month, e.day].filter(Boolean).join(' ');
  return [
    e.title,
    `When: ${whenStr}`,
    'Venue: Hanzas Perons',
    e.doors,
    e.price,
  ].filter(Boolean).join('\n');
}

async function getSourceId(): Promise<number | null> {
  const res = await rest(
    `sources?channel=eq.${CHANNEL}&city=eq.${SOURCE_CITY}&select=id`
  );
  if (!res.ok) return null;
  const rows = await res.json() as { id: number }[];
  return rows[0]?.id ?? null;
}

async function upsertEvent(
  sourceId: number,
  e: HanzasEvent,
  when: Date | null,
): Promise<'inserted' | 'skipped' | 'error'> {
  const mid = slugToBigint(e.slug);
  const row = {
    source_id:  sourceId,
    channel:    CHANNEL,
    message_id: mid,
    text:       composeText(e, when),
    posted_at:  (when ?? new Date()).toISOString(),
    permalink:  e.url,
    status:     'new',
  };
  const res = await rest('staging_messages', {
    method:  'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body:    JSON.stringify(row),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`staging insert failed ${e.slug}: ${res.status} ${errBody.slice(0, 200)}`);
    return 'error';
  }
  const body = await res.json().catch(() => []);
  await bumpSeen(mid);
  return Array.isArray(body) && body.length ? 'inserted' : 'skipped';
}

async function markSource(sourceId: number) {
  await rest(`sources?id=eq.${sourceId}`, {
    method: 'PATCH',
    body:   JSON.stringify({ last_scraped_at: new Date().toISOString() }),
  }).catch(() => {});
}

async function logRun(stats: { inserted: number; skipped: number; error: string | null; parsed: number; errored: number }) {
  await rest('ingest_log', {
    method: 'POST',
    body:   JSON.stringify({
      fn:          'ingest-hanzas-perons',
      status:      stats.error || stats.errored ? 'error' : 'ok',
      inserted:    stats.inserted,
      rejected:    stats.errored,
      error:       stats.error,
      detail:      { parsed: stats.parsed, skipped: stats.skipped, errored: stats.errored },
      finished_at: new Date().toISOString(),
    }),
  }).catch(() => {});
}

Deno.serve(async () => {
  const t0 = Date.now();
  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalErrored  = 0;
  let totalParsed   = 0;
  let runError: string | null = null;

  try {
    const sourceId = await getSourceId();
    if (!sourceId) throw new Error('hanzasperons source row not found');

    const res = await fetch(EVENTS_URL, {
      headers: { 'User-Agent': 'WanderAlt-Ingest/1.0 (https://wanderalt.app)' },
    });
    if (!res.ok) throw new Error(`Hanzas Perons HTTP ${res.status}`);
    const html = await res.text();

    const events = parseListingPage(html);
    totalParsed = events.length;

    const now = Date.now();
    for (const e of events) {
      const d = parseEventDate(e.month, e.day);
      if (d && d.getTime() < now - 86_400_000) {
        totalSkipped++;
        continue;
      }
      const r = await upsertEvent(sourceId, e, d);
      if (r === 'inserted')      totalInserted++;
      else if (r === 'skipped')  totalSkipped++;
      else if (r === 'error')    totalErrored++;
    }

    await markSource(sourceId);
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    console.error('[hanzas-perons]', runError);
  }

  await logRun({
    inserted: totalInserted, skipped: totalSkipped, errored: totalErrored,
    error: runError, parsed: totalParsed,
  });

  return new Response(JSON.stringify({
    ok:         !runError && totalErrored === 0,
    parsed:     totalParsed,
    inserted:   totalInserted,
    skipped:    totalSkipped,
    errored:    totalErrored,
    error:      runError,
    latency_ms: Date.now() - t0,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status:  runError ? 500 : 200,
  });
});
