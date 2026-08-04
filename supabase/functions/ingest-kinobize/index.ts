// ============================================================
// ingest-kinobize  v5
// v5 (Aug 2026): parseDateText returns null when the date text cannot be
//   read. The old tail was `return now.toISOString()`, so any
//   unrecognised date string became "starts right now" — six picks
//   landed sharing a starts_at of 2026-07-27 14:56:34.766 because that
//   is when this ran. when.js now derives "on tonight" from starts_at,
//   so a fabricated one would put a film on the Tonight list on its
//   scrape day. Unknown stays unknown.
// v4 (Jul 2026): writes staging_messages.payload — the structured half
//   of the row. See the payload contract in process-staging.
// v3 (Jul 2026): staging_messages POST was missing
//   ?on_conflict=channel,message_id, so repeat listings 409'd instead
//   of being silently ignored.
// v2 (Jun 2026): bumpSeen() marks each still-listed pick's last_seen_at
//   for wa_reconcile_absent_picks (silent-cancellation detection).
// Scrapes Kino Bize (art-house cinema, Riga) film schedule from
// https://kinobize.lv/en/repertoire and pushes films to staging_messages.
// Dedup key: (channel, message_id) where message_id = slug-id.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVENTS_URL   = 'https://www.kinobize.lv/en/repertoire/all-screenings';
const CHANNEL      = 'kinobize';
const SOURCE_CITY  = 'riga';

/* Slug -> bigint. staging_messages.message_id is a BIGINT column, and this
   function used to pass the URL slug (a string) straight into it. PostgREST
   rejected every non-numeric slug, upsertEvent returned 'error', and the
   run loop counted only 'inserted' and 'skipped' — so the function reported
   ok with zeros, forever. Same hash hel-linkedevents already uses; keeping
   one implementation rather than inventing a second. */
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

type KinoBizeEvent = {
  id: string;
  slug: string;
  url: string;
  title: string;
  category: string;
  dateText: string;
  /* null when the source's date text could not be parsed. */
  dateIso: string | null;
};

/* The listing prints a day as "Thursday, 06.08." with NO year, so the
   year has to be inferred. Anything more than a month behind today is
   read as next year — a cinema repertoire never lists the deep past, and
   that is the only way 06.01. can mean January of next year rather than
   seven months ago. Returns null if the day is unreadable; unknown stays
   unknown rather than becoming "starts right now", which is what the old
   `return now.toISOString()` tail did (two picks landed sharing a
   starts_at of 2026-07-27 14:56:34.766 — the moment of the scrape). */
function isoFromDayAndClock(day: number, month: number, clock: string): string | null {
  if (!day || !month) return null;
  const tm = clock.match(/(\d{1,2}):(\d{2})/);
  const hh = tm ? tm[1].padStart(2, '0') : '00';
  const mm = tm ? tm[2] : '00';
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${hh}:${mm}:00+03:00`);
  if (Number.isNaN(candidate.getTime())) return null;
  if (candidate.getTime() < now.getTime() - 31 * 86400_000) year += 1;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${hh}:${mm}:00+03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* v6: rewritten against the site's current markup.
   The old parser split on <li> and expected one film per <li> with a
   combined "06.08. 18:00" date-and-time string. The schedule is now
   grouped BY DAY — one <li> per day holding many .movie blocks, the day
   in <p class="day">, each screening's time in its own <p class="clock">.
   So the combined regex matched nothing, every dateText came back empty,
   and the old now() fallback stamped the scrape time on all of them.

     <li><p class="day">Thursday, 06.08.</p>
       <div class="movie" …>
         <p class="clock">18:00</p>
         <a href="/en/repertoire/films/<slug>/<id>"><p class="movie-title">Title</p></a>

   One row per film at its earliest upcoming screening, which keeps the
   existing (channel, cyrb53(slug)) dedup key intact. Verified against
   the live page: 7 films, 0 slug-titles, 0 missing times. */
function parseListing(html: string): KinoBizeEvent[] {
  const events: KinoBizeEvent[] = [];
  const seen = new Set<string>();

  const dayRx = /<p class="day">([^<]*?)<\/p>([\s\S]*?)(?=<p class="day">|$)/g;
  let dayMatch;
  while ((dayMatch = dayRx.exec(html)) !== null) {
    const dm = stripTags(dayMatch[1]).match(/(\d{1,2})\.(\d{1,2})\./);
    if (!dm) continue;
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10);

    for (const mv of dayMatch[2].split(/<div class="movie"/).slice(1)) {
      const linkM = mv.match(/href="(\/en\/repertoire\/([^/"]+)\/([^/"]+)\/(\d+))"/);
      if (!linkM) continue;
      const [, href, category, slug, id] = linkM;
      if (seen.has(id)) continue;
      seen.add(id);

      const titleM = mv.match(/<p class="movie-title">([\s\S]*?)<\/p>/);
      const title  = titleM ? (stripTags(titleM[1]) || slug) : slug;

      const clockM  = mv.match(/<p class="clock">\s*(\d{1,2}:\d{2})/);
      const clock   = clockM ? clockM[1] : '';
      const dateText = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}. ${clock}`.trim();
      const dateIso  = isoFromDayAndClock(day, month, clock);

      events.push({
        id,
        slug: `${slug}-${id}`,
        url: `https://www.kinobize.lv${href}`,
        title,
        category,
        dateText,
        dateIso,
      });
    }
  }

  return events;
}

function composeText(e: KinoBizeEvent): string {
  return [
    e.title,
    e.dateText ? `When: ${e.dateText}` : '',
    `Venue: Kino Bize`,
    e.category ? `Category: ${e.category}` : '',
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
  e: KinoBizeEvent,
): Promise<'inserted' | 'skipped' | 'error'> {
  const row = {
    source_id:  sourceId,
    channel:    CHANNEL,
    message_id: cyrb53(e.slug),
    text:       composeText(e),
    /* A cinema listing: the title IS a film, which is what resolve-links
       looks up on Wikidata (and through it IMDb/TMDB). */
    payload: {
      source:     'kinobize',
      starts_at:  e.dateIso || null,
      ticket_url: e.url,
      categories: e.category ? [e.category] : null,
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
      fn:          'ingest-kinobize',
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
    if (!sourceId) throw new Error('kinobize source row not found in sources table');

    const res = await fetch(EVENTS_URL, {
      headers: { 'User-Agent': 'WanderAlt-Ingest/1.0 (https://wanderalt.app)' },
    });
    if (!res.ok) throw new Error(`Kino Bize HTTP ${res.status}`);
    const html = await res.text();

    const events = parseListing(html);
    console.log(`[kinobize] parsed ${events.length} events from repertoire`);

    const now = Date.now();
    for (const e of events) {
      if (e.dateIso && new Date(e.dateIso).getTime() < now - 86400_000) {
        totalSkipped++;
        continue;
      }
      const r = await upsertEvent(sourceId, e);
      if (r === 'inserted') totalInserted++;
      else if (r === 'skipped') totalSkipped++;
      /* 'error' used to fall through both branches, which is how a fully
         broken ingest reported ok with zeros for 47 consecutive runs. */
      else totalErrors++;
    }

    await markSource(sourceId);
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    console.error('[kinobize]', runError);
  }

  /* Zero yield with events on the page is a failure, not a quiet success —
     it is exactly what hid the bigint/slug bug. Report it as 'warn' so
     wa_ingest_zero_yield_check and a human both see it. */
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
