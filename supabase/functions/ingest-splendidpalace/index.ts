// ============================================================
// ingest-splendidpalace  v1
// Scrapes Splendid Palace (Riga) events from
// https://splendidpalace.lv/lv/pasakumi and pushes to
// staging_messages for process-staging to curate.
//
// HTML structure: server-rendered.
//   <a href="/lv/pasakumi/<slug>"><img><h3>Title</h3>…</a>
//   Date format: "Datums: DD.MM.YYYY", time: "HH:MM"
// Content is Latvian — Gemini handles it fine in process-staging.
//
// Dedup key: (channel, message_id) where message_id = slug.
// Schedule: added by migration (03:35 UTC daily).
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVENTS_URL   = 'https://splendidpalace.lv/lv/pasakumi';
const CHANNEL      = 'splendidpalace';
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

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

type SplendidEvent = {
  slug: string;
  url: string;
  title: string;
  dateText: string;  // "DD.MM.YYYY"
  timeText: string;  // "HH:MM"
  dateIso: string;
};

// Date format "18.05.2026", time "15:30". Latvia EEST = UTC+3 in summer.
function parseDateDMY(dateText: string, timeText: string): string {
  const dm = dateText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!dm) return new Date().toISOString();
  const [, day, month, year] = dm;
  const tm = timeText.match(/(\d{1,2}):(\d{2})/);
  const hour = tm ? tm[1].padStart(2, '0') : '00';
  const min  = tm ? tm[2] : '00';
  return new Date(`${year}-${month}-${day}T${hour}:${min}:00+03:00`).toISOString();
}

function parseListing(html: string): SplendidEvent[] {
  const events: SplendidEvent[] = [];
  const seen = new Set<string>();

  const linkRx = /href="(\/lv\/pasakumi\/([^"]+))"/g;
  let match;
  while ((match = linkRx.exec(html)) !== null) {
    const [, href, slug] = match;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    // Capture surrounding context: 300 chars before (for venue/time block)
    // and 600 chars after (for title, date).
    const from = Math.max(0, match.index - 300);
    const section = html.slice(from, match.index + 600);

    // Title inside <h3> near the link.
    const h3m = section.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const title = h3m ? stripTags(h3m[1]) : slug;

    // Date: first DD.MM.YYYY in section.
    const dateM = section.match(/\d{2}\.\d{2}\.\d{4}/);
    const dateText = dateM ? dateM[0] : '';

    // Time: first HH:MM (not part of date).
    const timeM = section.match(/\b\d{1,2}:\d{2}\b/);
    const timeText = timeM ? timeM[0] : '';

    events.push({
      slug,
      url: `https://splendidpalace.lv${href}`,
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
    }

    await markSource(sourceId);
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    console.error('[splendidpalace]', runError);
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
