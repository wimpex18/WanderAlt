// ============================================================
// ingest-kinobize  v1
// Scrapes Kino Bize (art-house cinema, Riga) film schedule from
// https://kinobize.lv/en/repertoire and pushes films to
// staging_messages for process-staging to curate.
//
// Source: server-side rendered HTML — no AJAX needed.
// Dedup key: (channel, message_id) where message_id = slug-id.
// Schedule: added by migration (03:30 UTC daily).
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVENTS_URL   = 'https://kinobize.lv/en/repertoire';
const CHANNEL      = 'kinobize';
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
    .replace(/\s+/g, ' ').trim();
}

type KinoBizeEvent = {
  id: string;
  slug: string;      // "title-slug-id" — dedup key
  url: string;
  title: string;
  category: string;
  dateText: string;  // raw date string for editorial context
  dateIso: string;
};

// Dates arrive as "Tomorrow 11:00", "Today 14:00", or "Monday, 18.05. 20:30".
// Latvia is EEST (UTC+3) in summer, EET (UTC+2) in winter.
function parseDateText(dateText: string): string {
  const now = new Date();

  const tomorrowM = dateText.match(/^Tomorrow\s+(\d+):(\d+)/i);
  if (tomorrowM) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1,
                       parseInt(tomorrowM[1]), parseInt(tomorrowM[2]));
    return d.toISOString();
  }

  const todayM = dateText.match(/^Today\s+(\d+):(\d+)/i);
  if (todayM) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                       parseInt(todayM[1]), parseInt(todayM[2]));
    return d.toISOString();
  }

  // "Monday, 18.05. 20:30" or just "18.05. 20:30"
  const absM = dateText.match(/(\d+)\.(\d+)\.\s*(\d+):(\d+)/);
  if (absM) {
    const [, day, month, hour, min] = absM;
    const year = now.getFullYear();
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour}:${min}:00+03:00`;
    return new Date(iso).toISOString();
  }

  return now.toISOString();
}

function parseListing(html: string): KinoBizeEvent[] {
  const events: KinoBizeEvent[] = [];
  const seen = new Set<string>();

  // Each <li> is one film card with 1-N screening times.
  const liParts = html.split(/<li[\s>]/);
  for (const li of liParts.slice(1)) {
    // Film detail link: /en/repertoire/<category>/<slug>/<id>
    const linkM = li.match(/href="(\/en\/repertoire\/([^/"]+)\/([^/"]+)\/(\d+))"/);
    if (!linkM) continue;
    const [, href, category, slug, id] = linkM;
    if (seen.has(id)) continue;
    seen.add(id);

    // Title: first text node inside the film anchor.
    // Anchor may contain English + Latvian title on separate lines.
    const anchorRx = new RegExp(href.replace(/\//g, '\\/') + '"[^>]*>([\\s\\S]*?)<\\/a>');
    const anchorM = li.match(anchorRx);
    const rawTitle = anchorM ? stripTags(anchorM[1]) : slug;
    // Take only the first logical line (English title).
    const title = rawTitle.split(/\n|\r|  +/)[0].trim() || slug;

    // First date/time string in this card.
    const dateM = li.match(/(Tomorrow|Today)\s+\d+:\d+/i) ||
                  li.match(/\w+,\s*\d+\.\d+\.\s*\d+:\d+/) ||
                  li.match(/\d+\.\d+\.\s*\d+:\d+/);
    const dateText = dateM ? dateM[0] : '';
    const dateIso  = parseDateText(dateText);

    events.push({
      id,
      slug: `${slug}-${id}`,
      url: `https://kinobize.lv${href}`,
      title,
      category,
      dateText,
      dateIso,
    });
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
    message_id: e.slug,
    text:       composeText(e),
    posted_at:  e.dateIso || new Date().toISOString(),
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
    }

    await markSource(sourceId);
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    console.error('[kinobize]', runError);
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
