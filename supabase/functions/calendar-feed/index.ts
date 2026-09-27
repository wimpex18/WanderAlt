import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// calendar-feed — subscribable ICS feed
// Serves text/calendar built from published upcoming events, per city
// and optionally filtered to one source. About prints the URL.
//
// GET ?city=tallinn[&handle=@sigmundtells]   the next 30 days, subscribable
// GET ?id=ev_…                              one event, for "Add to calendar"
//
// verify_jwt stays FALSE and must: a calendar app subscribes to this URL
// with no Authorization header. It reads with the anon key, so RLS hides
// every event that is not published, and it writes nothing.
//
// Times are the events' own starts_at/ends_at in UTC. An event without a
// time is an all-day entry; one without an end lasts two hours.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

const ALLOWED_CITIES = new Set(['tallinn']);

interface PickRow {
  id: string; title: string; venue: string; neighborhood: string;
  quote: string; handle: string; time: string | null;
  starts_at: string; ends_at: string | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const p2 = (n: number) => String(n).padStart(2, '0');
/* The calendar date in Tallinn, for all-day entries. */
const fmtDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(d).replace(/-/g, '');
const fmtUtc = (d: Date) =>
  `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
const esc = (s: string) =>
  String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

Deno.serve(async (req: Request) => {
  const u      = new URL(req.url);
  const city   = (u.searchParams.get('city') || 'tallinn').toLowerCase();
  const handle = (u.searchParams.get('handle') || '').trim();
  const one    = (u.searchParams.get('id') || '').trim();
  if (one && !/^ev_[0-9a-f]{16}$/.test(one)) {
    return new Response('unknown event', { status: 400 });
  }
  if (!ALLOWED_CITIES.has(city)) {
    return new Response('unknown city', { status: 400 });
  }

  let url = one
    ? `${SUPABASE_URL}/rest/v1/picks?id=eq.${one}&select=id,title,venue,neighborhood,quote,handle,time,starts_at,ends_at&limit=1`
    : `${SUPABASE_URL}/rest/v1/picks?city=eq.${encodeURIComponent(city)}` +
    `&archived_at=is.null&starts_at=lt.${new Date(Date.now() + 30 * 86_400_000).toISOString()}` +
    `&select=id,title,venue,neighborhood,quote,handle,time,starts_at,ends_at&order=starts_at.asc&limit=300`;
  if (handle && !one) url += `&handle=eq.${encodeURIComponent(handle)}`;

  const r = await fetch(url, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!r.ok) return new Response('upstream error', { status: 502 });
  const picks = await r.json() as PickRow[];

  if (one && !picks.length) return new Response('unknown event', { status: 404 });

  const calName = one ? `WanderAlt — ${picks[0].title}` : handle
    ? `WanderAlt — ${handle}`
    : `WanderAlt — ${cap(city)}`;
  const now = new Date();

  const events = picks
    .map(p => {
      const start = new Date(p.starts_at);
      const end   = p.ends_at ? new Date(p.ends_at) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const allDay = !p.time;
      const loc   = [p.venue, p.neighborhood].filter(Boolean).join(', ');
      /* detail.html directly: a calendar entry outlives a redirect rule. */
      const link  = `https://wanderalt.app/detail.html?id=${encodeURIComponent(p.id)}`;
      /* The sentence is not quoted; the handle rides along as provenance. */
      const desc  = [p.quote || '', p.handle ? `via ${p.handle}` : '', link]
        .filter(Boolean).join('\n');
      return [
        'BEGIN:VEVENT',
        `UID:${esc(p.id)}@wanderalt.app`,
        `DTSTAMP:${fmtUtc(now)}`,
        allDay ? `DTSTART;VALUE=DATE:${fmtDay(start)}` : `DTSTART:${fmtUtc(start)}`,
        allDay ? '' : `DTEND:${fmtUtc(end)}`,
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
    `X-WR-CALDESC:${esc(`What's on in ${cap(city)} over the next 30 days, read from venue programmes and local feeds.`)}`,
    ...(one ? ['METHOD:PUBLISH'] : ['X-PUBLISHED-TTL:PT12H', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H']),
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(ics, {
    headers: {
      'Content-Type':                'text/calendar; charset=utf-8',
      'Content-Disposition':         one
        ? `attachment; filename="wanderalt-${one}.ics"`
        : `inline; filename="wanderalt-${handle ? handle.replace(/[^a-z0-9]/gi, '') : city}.ics"`,
      'Cache-Control':               'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
