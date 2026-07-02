import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// calendar-feed  v1 — subscribable ICS feed (July 2026)
// The no-push retention primitive from docs/market-scan-jul26.md:
// "put the curator in your calendar." Serves text/calendar built
// from active DATED picks — per city and optionally per curator.
//
// GET ?city=tallinn[&handle=@sigmundtells]
//
// Date semantics mirror share.js's client-side .ics builder:
// "Tonight" → today, weekday name → next such weekday (today
// included), floating local time, default 19:00, 2h duration.
// Calendar apps re-fetch on their own schedule (TTL hints below),
// so the feed stays current with zero pushes and zero crons.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_CITIES = new Set(['tallinn', 'helsinki', 'riga', 'vilnius']);
const DAY_INDEX: Record<string, number> =
  { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

interface PickRow {
  id: string; title: string; venue: string; neighborhood: string;
  quote: string; handle: string; day: string | null; time: string | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function nextDateFor(day: string, time: string | null): Date {
  const now  = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (day.toLowerCase() !== 'tonight') {
    const want = DAY_INDEX[day.slice(0, 3).toLowerCase()];
    if (want != null) {
      base.setDate(base.getDate() + ((want - base.getDay() + 7) % 7));
    }
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(time || '');
  base.setHours(m ? +m[1] : 19, m ? +m[2] : 0, 0, 0);
  return base;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const fmtLocal = (d: Date) =>
  `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;
const fmtUtc = (d: Date) =>
  `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
const esc = (s: string) =>
  String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

Deno.serve(async (req: Request) => {
  const u      = new URL(req.url);
  const city   = (u.searchParams.get('city') || 'tallinn').toLowerCase();
  const handle = (u.searchParams.get('handle') || '').trim();
  if (!ALLOWED_CITIES.has(city)) {
    return new Response('unknown city', { status: 400 });
  }

  let url =
    `${SUPABASE_URL}/rest/v1/picks?city=eq.${encodeURIComponent(city)}` +
    `&archived_at=is.null&day=not.is.null&pending_review=not.is.true` +
    `&select=id,title,venue,neighborhood,quote,handle,day,time&limit=100`;
  if (handle) url += `&handle=eq.${encodeURIComponent(handle)}`;

  const r = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) return new Response('upstream error', { status: 502 });
  const picks = await r.json() as PickRow[];

  const calName = handle
    ? `WanderAlt — ${handle}`
    : `WanderAlt — ${cap(city)}`;
  const now = new Date();

  const events = picks
    .filter(p => p.day)
    .map(p => {
      const start = nextDateFor(p.day!, p.time);
      const end   = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const loc   = [p.venue, p.neighborhood].filter(Boolean).join(', ');
      const link  = `https://wanderalt.app/venue.html?id=${encodeURIComponent(p.id)}`;
      const desc  = [p.quote ? `"${p.quote}"` : '', p.handle ? `via ${p.handle}` : '', link]
        .filter(Boolean).join('\n');
      return [
        'BEGIN:VEVENT',
        `UID:${esc(p.id)}@wanderalt.app`,
        `DTSTAMP:${fmtUtc(now)}`,
        `DTSTART:${fmtLocal(start)}`,
        `DTEND:${fmtLocal(end)}`,
        `SUMMARY:${esc(p.title)}`,
        loc  ? `LOCATION:${esc(loc)}`     : '',
        desc ? `DESCRIPTION:${esc(desc)}` : '',
        `URL:${esc(link)}`,
        'END:VEVENT',
      ].filter(Boolean).join('\r\n');
    });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WanderAlt//calendar-feed//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-CALDESC:Curator-vouched picks. A human chose every event here.',
    'X-PUBLISHED-TTL:PT12H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(ics, {
    headers: {
      'Content-Type':                'text/calendar; charset=utf-8',
      'Content-Disposition':         `inline; filename="wanderalt-${handle ? handle.replace(/[^a-z0-9]/gi, '') : city}.ics"`,
      'Cache-Control':               'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
