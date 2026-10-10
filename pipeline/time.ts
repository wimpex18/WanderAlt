// Wall-clock time in a city's zone (cities.ts `tz`) to an absolute instant, and an instant back to the
// city's calendar day. Sources print local times; the database stores timestamptz.

const formats = new Map<string, Intl.DateTimeFormat>();
const wallFormat = (tz: string) => {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formats.set(tz, f);
  }
  return f;
};

/** Minutes the zone is ahead of UTC at `date` (in Tallinn 120 or 180). */
export function zoneOffset(date: Date, tz: string): number {
  const p = Object.fromEntries(wallFormat(tz).formatToParts(date).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** '2026-10-03 19:00[:00]' or '2026-10-03T19:00' in the zone → ISO UTC. */
export function localToIso(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, hh = '0', mm = '0', ss = '0'] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss);
  let ts = wall - zoneOffset(new Date(wall), tz) * 60_000;
  const again = wall - zoneOffset(new Date(ts), tz) * 60_000;   // across a DST edge
  if (again !== ts) ts = again;
  return new Date(ts).toISOString();
}

/** Any ISO string: kept if it carries an offset, read as the zone's time if not. */
export function toIso(s: string | null | undefined, tz: string): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return localToIso(t.replace(/\.\d+$/, ''), tz);
}

const days = new Map<string, Intl.DateTimeFormat>();
/** 'YYYY-MM-DD' of an instant, on the zone's calendar. */
export function localDay(iso: string, tz: string): string {
  let f = days.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz }); days.set(tz, f); }
  return f.format(new Date(iso));
}

/** 'HH:MM' of an instant on the zone's clock. */
export function localClock(iso: string | number, tz: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}
