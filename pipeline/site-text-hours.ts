// Opening hours a venue writes as plain text on its own site, for the many sites with no
// structured data: "Avatud / T–K, R–P / 10.00–18.00 / N / 10.00–20.00 / E / Suletud" on a
// homepage, "esmaspäev – neljapäev 9.00–20.00 / reede 9.00–südaöö …" on a visit page.
// Only the block right after a word that announces hours (opening hours, avatud,
// lahtiolekuajad, часы работы…) is read, line by line: a line of days with times, a line of
// days followed by a line of times, or days that are closed. The block ends at the first
// other line once hours have begun, so the café's hours under the museum's are not merged in.
// A week is kept only when every day is accounted for, open or said to be closed; a day the
// text leaves out would otherwise read as shut, unless the line that ends the block says the
// rest is by appointment or closed ("Muul ajal oleme avatud kokkuleppel"): those days are shut
// to a walk-in. Nothing is guessed and no model is asked.
import { bioHours } from './bio-hours.ts';
import { DAY_ORDER, writeHours } from './site-hours.ts';

export const HOURS_CUE = /(opening hours|open(?:ing)? times|we are open|\bopen\b|\bhours\b|avatud|lahtiolekuajad|lahti\b|töötame|часы работы|режим работы|открыто|мы открыты)/gi;
const CLOSED = /^(?:closed|suletud|kinni|закрыто|выходной)\.?$/i;
const TIMES = /^\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*-\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?(?:\s*(?:,|&|and)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*-\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)*$/i;
const MIDNIGHT = /(?<![\p{L}])(?:südaöö|südaööni|midnight|полночь|полуночи)(?![\p{L}])/giu;
const LINES_AFTER = 16, NOTES_BEFORE = 3;
/* The rest of the week is by appointment or closed: no walk-in hours on the days not named. */
const OTHERWISE = /(muul ajal|teistel päevadel|other (?:times|days)|otherwise|by appointment|kokkuleppel|в другое время|по договор[её]нности|по записи)/i;
/* A venue that opens only for what is on says so: "On event days, 6PM—2AM", "We are open on
   concert evenings", "avatud ürituste ajal". Such a place has no weekly hours to file. */
const EVENT_NIGHTS = /(on event (?:days|nights)|on concert (?:days|evenings|nights)|open (?:only )?(?:during|for) (?:events|concerts|shows|performances)|(?:hours|opening hours) (?:may )?(?:vary|depend) (?:according to|on) the (?:programme|program|events)|(?:avatud|lahti) (?:ainult )?(?:ürituste|kontsertide|etenduste|sündmuste) ajal|ürituste päevadel|kontsertide päevadel|открыт[оы]? (?:только )?(?:во время|в дни) (?:мероприятий|концертов))/i;

/** "Mo,Tu 10:00-18:00; Sa 11:00-16:00" back into days and their ranges. */
const read = (osm: string): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const part of osm.split(/;\s*/)) {
    const [days, times] = part.split(' ');
    for (const d of days.split(',')) out.set(d, [...(out.get(d) ?? []), ...times.split(',')]);
  }
  return out;
};
/** The days a line names when it names nothing else ("T–K, R–P", "Wednesday - Saturday", "E"). */
const dayList = (line: string): string[] | null => {
  if (/\d/.test(line)) return null;
  const h = bioHours(`${line} 10-11`);
  return h ? [...read(h).keys()] : null;
};

/** Hours from the first announced block that accounts for the whole week, or null. */
export function textHours(html: string): string | null {
  const lines = visibleText(html).replace(MIDNIGHT, '24.00').replace(/[–—−]/g, '-').split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    HOURS_CUE.lastIndex = 0;
    const cue = HOURS_CUE.exec(lines[i]);
    if (!cue) continue;
    const rest = lines[i].slice(cue.index + cue[0].length).replace(/^[\s:.-]+/, '');
    const block = [...(rest ? [rest] : []), ...lines.slice(i + 1, i + 1 + LINES_AFTER)];
    const week = new Map<string, string[]>(), closed = new Set<string>();
    let pending: string[] | null = null, begun = false, notes = 0, otherwise = false;
    for (const raw of block) {
      const line = raw.replace(/[:.]$/, '').trim();
      const both = /\d/.test(line) ? bioHours(line) : null;
      const days = dayList(line);
      const closedDays = /\s/.test(line) && CLOSED.test(line.split(/\s+/).pop() ?? '') ? dayList(line.replace(/\S+$/, '')) : null;
      if (both) { for (const [d, t] of read(both)) week.set(d, [...(week.get(d) ?? []), ...t]); pending = null; begun = true; }
      else if (closedDays) { closedDays.forEach(d => closed.add(d)); pending = null; begun = true; }
      else if (days) { pending = days; begun = true; }
      else if (pending && CLOSED.test(line)) { pending.forEach(d => closed.add(d)); pending = null; }
      else if (pending && TIMES.test(line)) {
        const h = bioHours(`${pending.map(d => ({ Mo: 'mon', Tu: 'tue', We: 'wed', Th: 'thu', Fr: 'fri', Sa: 'sat', Su: 'sun' } as Record<string, string>)[d]).join(',')} ${line}`);
        if (!h) break;
        for (const [d, t] of read(h)) week.set(d, [...(week.get(d) ?? []), ...t]);
        pending = null;
      } else if (begun || ++notes > NOTES_BEFORE) { otherwise = begun && OTHERWISE.test(line); break; }
    }
    if (week.size && otherwise) DAY_ORDER.filter(d => !week.has(d)).forEach(d => closed.add(d));
    if (week.size && DAY_ORDER.every(d => week.has(d) || closed.has(d))) {
      const kept = new Map([...week].filter(([d]) => !closed.has(d)));
      const h = writeHours(kept);
      if (h) return h;
    }
  }
  return null;
}

/** The venue says it opens only for its events (a club, a concert bar), in a line near a word
 *  about hours or on its own. */
export function eventNights(html: string): boolean {
  return EVENT_NIGHTS.test(visibleText(html).replace(/[–—−]/g, '-').replace(/\s+/g, ' '));
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', ndash: '–', mdash: '—', quot: '"', apos: "'", lt: '<', gt: '>' };

/** The text a reader sees: no scripts or styles, block ends and <br> as line breaks. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|tr|div|h\d|dd|dt|section|article|footer|header|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) => (e[0] === '#'
      ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTITIES[e.toLowerCase()] ?? m))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n[\s\n]*/g, '\n')
    .trim();
}

/** Up to `max` links on the same site that look like where a venue keeps its hours. */
export function hoursPages(html: string, base: string, max = 2): string[] {
  const host = (u: string) => { try { return new URL(u).hostname.split('.').slice(-2).join('.'); } catch { return ''; } };
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try { url = new URL(m[1], base).toString(); } catch { continue; }
    if (!/^https?:/.test(url) || host(url) !== host(base) || url === base || out.includes(url)) continue;
    const words = `${url} ${m[2].replace(/<[^>]+>/g, ' ')}`;
    if (/kontakt|contact|külastus|kulastus|visit|lahtiolek|opening|hours|koordinaadid|asukoht|location|find-us|find us|leia meid|контакт|часы/i.test(words)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}
