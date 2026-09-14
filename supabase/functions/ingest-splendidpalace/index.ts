// ============================================================
// ingest-splendidpalace
// Scrapes Splendid Palace (Riga) events from https://splendidpalace.lv/lv/pasakumi
// into staging_messages with a structured payload.
// Dedup key: (channel, message_id) where message_id = cyrb53(slug).
// bumpSeen() marks still-listed picks for wa_reconcile_absent_picks.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVENTS_URL   = 'https://www.splendidpalace.lv/lv/pasakumi';
const CHANNEL      = 'splendidpalace';
const SOURCE_CITY  = 'riga';

/* Slug -> bigint (staging_messages.message_id is BIGINT). Same hash
   hel-linkedevents uses. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

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

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    /* Numeric entities too: the listings carry &#039; in titles like
       "Vivaldi&#039;s Four Seasons", and a half-decoded title is visible
       in the product. */
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, ' ').trim();
}

type SplendidEvent = {
  slug: string;
  url: string;
  title: string;
  dateText: string;
  timeText: string;
  /* null when the source's date text could not be parsed. */
  dateIso: string | null;
};

/* Returns null when the listing's date cannot be read: an unknown date
   stays unknown rather than becoming "starts right now". (posted_at keeps
   its own now() fallback: that one really is a scrape-adjacent field.) */
function parseDateDMY(dateText: string, timeText: string): string | null {
  const dm = dateText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!dm) return null;
  const [, day, month, year] = dm;
  const tm = timeText.match(/(\d{1,2}):(\d{2})/);
  const hour = tm ? tm[1].padStart(2, '0') : '00';
  const min  = tm ? tm[2] : '00';
  return new Date(`${year}-${month}-${day}T${hour}:${min}:00+03:00`).toISOString();
}

/* The card is self-delimiting, so split on it and read named fields:
     <div class="movie-card">
       data-event-card="/lv/pasakumi/<slug>"
       <div class="… movie-card__title">Title</div>
       Datums:</span><span> 17.09.2026</span>
       …<br> 19:00 */
function parseListing(html: string): SplendidEvent[] {
  const events: SplendidEvent[] = [];
  const seen = new Set<string>();

  for (const seg of html.split(/<div class="movie-card">/).slice(1)) {
    const slugM = seg.match(/data-event-card="\/lv\/pasakumi\/([^"]+)"/)
               || seg.match(/href="\/lv\/pasakumi\/([^"#]+)"/);
    if (!slugM) continue;
    const slug = slugM[1];
    if (seen.has(slug)) continue;
    seen.add(slug);

    const titleM = seg.match(/class="[^"]*movie-card__title[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const title  = titleM ? stripTags(titleM[1]) : slug;

    /* The labelled "Datums:" field first — the bare date also appears in
       the hover overlay, and reading the label keeps us on the real one. */
    const dateM = seg.match(/Datums:<\/span><span>\s*(\d{2}\.\d{2}\.\d{4})/)
               || seg.match(/(\d{2}\.\d{2}\.\d{4})/);
    const dateText = dateM ? dateM[1] : '';

    const timeM = seg.match(/<br>\s*(\d{1,2}:\d{2})/) || seg.match(/\b(\d{1,2}:\d{2})\b/);
    const timeText = timeM ? timeM[1] : '';

    events.push({
      slug,
      url: `https://www.splendidpalace.lv/lv/pasakumi/${slug}`,
      title,
      dateText,
      timeText,
      dateIso: parseDateDMY(dateText, timeText),
    });
  }

  return events;
}

function composeText(e: SplendidEvent): string {
  const when = [e.dateText, e.timeText].filter(Boolean).join(' ');
  return [
    e.title,
    when ? `When: ${when}` : '',
    `Venue: Splendid Palace`,
  ].filter(Boolean).join('\n');
}

async function getSourceId(): Promise<number | null> {
  const res = await rest(`sources?channel=eq.${CHANNEL}&city=eq.${SOURCE_CITY}&select=id`);
  if (!res.ok) return null;
  const rows = (await res.json()) as { id: number }[];
  return rows[0]?.id ?? null;
}

async function upsertEvent(
  sourceId: number,
  e: SplendidEvent,
): Promise<'inserted' | 'skipped' | 'error'> {
  const row = {
    source_id:  sourceId,
    channel:    CHANNEL,
    message_id: cyrb53(e.slug),
    text:       composeText(e),
    /* Also a cinema — the title is the film. */
    payload: {
      source:     'splendidpalace',
      starts_at:  e.dateIso || null,
      ticket_url: e.url,
      entities:   [{ name: e.title, role: 'film' }],
    },
    posted_at:  e.dateIso || new Date().toISOString(),
    permalink:  e.url,
    status:     'new',
  };
  const res = await rest('staging_messages?on_conflict=channel,message_id', {
    method:  'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body:    JSON.stringify(row),
  });
  if (!res.ok) {
    console.error(`staging insert failed ${e.slug}: ${res.status}`);
    return 'error';
  }
  const body = await res.json().catch(() => []);
  await bumpSeen(String(cyrb53(e.slug)));
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
      fn:          'ingest-splendidpalace',
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
  let totalErrors   = 0;
  let runError: string | null = null;

  try {
    const sourceId = await getSourceId();
    if (!sourceId) throw new Error('splendidpalace source row not found in sources table');

    const res = await fetch(EVENTS_URL, {
      headers: { 'User-Agent': 'WanderAlt-Ingest/1.0 (https://wanderalt.app)' },
    });
    if (!res.ok) throw new Error(`Splendid Palace HTTP ${res.status}`);
    const html = await res.text();

    const events = parseListing(html);
    console.log(`[splendidpalace] parsed ${events.length} events`);

    const now = Date.now();
    for (const e of events) {
      if (e.dateIso && new Date(e.dateIso).getTime() < now - 86400_000) {
        totalSkipped++;
        continue;
      }
      const r = await upsertEvent(sourceId, e);
      if (r === 'inserted') totalInserted++;
      else if (r === 'skipped') totalSkipped++;
      /* 'error' is counted, never dropped. */
      else totalErrors++;
    }

    await markSource(sourceId);
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    console.error('[splendidpalace]', runError);
  }

  /* Zero yield with events on the page is a failure, not a quiet success.
     Report it as 'warn' so wa_ingest_zero_yield_check sees it. */
  const zeroYield = !runError && totalInserted === 0 && totalSkipped === 0;
  await logRun({
    inserted: totalInserted,
    skipped:  totalSkipped,
    error:    runError ?? (totalErrors ? `${totalErrors} staging upserts failed` :
                          (zeroYield ? 'zero yield: nothing parsed or nothing accepted' : null)),
  });

  return new Response(JSON.stringify({
    ok:         !runError && !totalErrors,
    inserted:   totalInserted,
    skipped:    totalSkipped,
    errors:     totalErrors,
    zero_yield: zeroYield,
    error:      runError,
    latency_ms: Date.now() - t0,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status:  runError ? 500 : 200,
  });
});
