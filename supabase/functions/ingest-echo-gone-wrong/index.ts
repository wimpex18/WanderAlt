// ============================================================
// ingest-echo-gone-wrong  v2
// v2 (Jun 2026): bumpSeen() marks each still-listed pick's last_seen_at
//   for wa_reconcile_absent_picks (silent-cancellation detection). NB:
//   this is a recent-items RSS feed, so items age off naturally; the
//   reconcile's web/fienta filter should be narrowed to exclude feed-
//   based sources before the enforce flip.
// Polls echogonewrong.com/feed/ (Baltic art press RSS) and pushes
// Riga-tagged items into staging_messages. Dedup key: hash of <guid>.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FEED_URL     = 'https://echogonewrong.com/feed/';
const CHANNEL      = 'echogonewrong';
const SOURCE_CITY  = 'riga';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/16.0 Safari/605.1.15';

const LATVIA_CATEGORIES = new Set([
  'Events in Latvia',
  'News from Latvia',
  'Calls from Latvia',
  'Photo / Video from Latvia',
]);

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

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function stripCdataTags(s: string): string {
  return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractTag(item: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = item.match(re);
  return m ? stripCdataTags(m[1]) : '';
}

function extractAllTags(item: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(item)) !== null) {
    out.push(stripCdataTags(m[1]));
  }
  return out;
}

type Item = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
  categories: string[];
};

function parseFeed(xml: string): Item[] {
  const items: Item[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];
    items.push({
      guid:        extractTag(raw, 'guid'),
      title:       decodeEntities(extractTag(raw, 'title')),
      link:        extractTag(raw, 'link'),
      pubDate:     extractTag(raw, 'pubDate'),
      description: stripHtml(extractTag(raw, 'description')),
      categories:  extractAllTags(raw, 'category').map(decodeEntities),
    });
  }
  return items;
}

function routesToRiga(item: Item): boolean {
  return item.categories.some(c => LATVIA_CATEGORIES.has(c));
}

function composeText(item: Item): string {
  const desc = item.description.length > 600
    ? item.description.slice(0, 600).trim() + '…'
    : item.description;
  return [
    item.title,
    desc,
    `Tags: ${item.categories.slice(0, 5).join(', ')}`,
    `Source: echogonewrong.com`,
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

async function upsertItem(
  sourceId: number,
  item: Item,
): Promise<'inserted' | 'skipped' | 'error'> {
  const key = item.guid || item.link;
  if (!key) return 'skipped';
  let posted_at: string;
  try {
    posted_at = new Date(item.pubDate).toISOString();
  } catch {
    posted_at = new Date().toISOString();
  }
  const mid = slugToBigint(key);
  const row = {
    source_id:  sourceId,
    channel:    CHANNEL,
    message_id: mid,
    text:       composeText(item),
    posted_at,
    permalink:  item.link || null,
    status:     'new',
  };
  const res = await rest('staging_messages', {
    method:  'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body:    JSON.stringify(row),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`staging insert failed ${key}: ${res.status} ${errBody.slice(0, 200)}`);
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

async function logRun(stats: { parsed: number; matched: number; inserted: number; skipped: number; errored: number; error: string | null }) {
  await rest('ingest_log', {
    method: 'POST',
    body:   JSON.stringify({
      fn:          'ingest-echo-gone-wrong',
      status:      stats.error || stats.errored ? 'error' : 'ok',
      inserted:    stats.inserted,
      rejected:    stats.errored,
      error:       stats.error,
      detail:      {
        parsed:    stats.parsed,
        matched:   stats.matched,
        skipped:   stats.skipped,
        errored:   stats.errored,
      },
      finished_at: new Date().toISOString(),
    }),
  }).catch(() => {});
}

Deno.serve(async () => {
  const t0 = Date.now();
  let totalParsed   = 0;
  let totalMatched  = 0;
  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalErrored  = 0;
  let runError: string | null = null;

  try {
    const sourceId = await getSourceId();
    if (!sourceId) throw new Error('echogonewrong source row not found');

    const res = await fetch(FEED_URL, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) throw new Error(`echogonewrong HTTP ${res.status}`);
    const xml = await res.text();

    const items = parseFeed(xml);
    totalParsed = items.length;

    for (const item of items) {
      if (!routesToRiga(item)) continue;
      totalMatched++;
      const r = await upsertItem(sourceId, item);
      if      (r === 'inserted') totalInserted++;
      else if (r === 'skipped')  totalSkipped++;
      else if (r === 'error')    totalErrored++;
    }

    await markSource(sourceId);
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    console.error('[echogonewrong]', runError);
  }

  await logRun({
    parsed:   totalParsed,
    matched:  totalMatched,
    inserted: totalInserted,
    skipped:  totalSkipped,
    errored:  totalErrored,
    error:    runError,
  });

  return new Response(JSON.stringify({
    ok:         !runError && totalErrored === 0,
    parsed:     totalParsed,
    matched:    totalMatched,
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
