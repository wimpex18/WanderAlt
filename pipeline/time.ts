// Tallinn wall-clock time to an absolute instant. Sources print local
// times; the database stores timestamptz.

export const TZ = 'Europe/Tallinn';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Minutes Tallinn is ahead of UTC at `date` (120 or 180). */
export function tallinnOffset(date: Date): number {
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** '2026-10-03 19:00[:00]' or '2026-10-03T19:00' in Tallinn → ISO UTC. */
export function tallinnToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, hh = '0', mm = '0', ss = '0'] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss);
  let ts = wall - tallinnOffset(new Date(wall)) * 60_000;
  const again = wall - tallinnOffset(new Date(ts)) * 60_000;   // across a DST edge
  if (again !== ts) ts = again;
  return new Date(ts).toISOString();
}

/** Any ISO string: kept if it carries an offset, read as Tallinn time if not. */
export function toIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return tallinnToIso(t.replace(/\.\d+$/, ''));
}

/** 'YYYY-MM-DD' of an instant, on Tallinn's calendar. */
export function tallinnDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
}
