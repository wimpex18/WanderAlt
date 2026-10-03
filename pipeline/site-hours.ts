// Opening hours a venue publishes on its own homepage as schema.org structured data
// (`openingHoursSpecification` or `openingHours` in JSON-LD), turned into the
// OpenStreetMap syntax the site's reader understands. Only a string the reader accepts is
// returned; prose such as "avatud E–L 11.30–22.00" is not guessed at. OpenStreetMap's
// hours win: this fills a place that has none.
import { hoursAt } from './hours.ts';

const DAYS: Record<string, string> = { monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th', friday: 'Fr', saturday: 'Sa', sunday: 'Su' };
const ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const SHORT = /^(Mo|Tu|We|Th|Fr|Sa|Su)([,-](Mo|Tu|We|Th|Fr|Sa|Su))* \d{1,2}:\d{2}-\d{1,2}:\d{2}(,\d{1,2}:\d{2}-\d{1,2}:\d{2})*$/;

const hhmm = (v: unknown): string | null => {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v ?? '').trim());
  return m && +m[1] <= 24 && +m[2] < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};
const dayOf = (v: unknown): string | null => DAYS[String(v ?? '').split('/').pop()!.trim().toLowerCase()] ?? null;

function* nodes(x: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(x)) { for (const y of x) yield* nodes(y); return; }
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    yield o;
    for (const k of ['@graph', 'location', 'mainEntity']) if (o[k]) yield* nodes(o[k]);
  }
}

/** Hours from a page's JSON-LD, or null. */
export function siteHours(html: string): string | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (const raw of blocks) {
    let data: unknown;
    try { data = JSON.parse(raw.trim()); } catch { continue; }
    for (const n of nodes(data)) {
      const parts: string[] = [];
      const spec = n.openingHoursSpecification;
      if (spec) {
        const byTime = new Map<string, Set<string>>();
        for (const s of Array.isArray(spec) ? spec : [spec]) {
          const o = s as Record<string, unknown>;
          const opens = hhmm(o.opens), closes = hhmm(o.closes);
          if (!opens || !closes || opens === closes) continue;
          for (const d of (Array.isArray(o.dayOfWeek) ? o.dayOfWeek : [o.dayOfWeek]).map(dayOf)) {
            if (!d) continue;
            const key = `${opens}-${closes}`;
            byTime.set(key, (byTime.get(key) ?? new Set()).add(d));
          }
        }
        for (const [time, days] of byTime) parts.push(`${ORDER.filter(d => days.has(d)).join(',')} ${time}`);
      } else if (n.openingHours) {
        for (const s of (Array.isArray(n.openingHours) ? n.openingHours : [n.openingHours]).map(x => String(x).trim())) if (SHORT.test(s)) parts.push(s);
      }
      if (!parts.length) continue;
      const out = parts.join('; ');
      if (hoursAt(out, new Date()) !== 'unknown') return out;
    }
  }
  return null;
}
