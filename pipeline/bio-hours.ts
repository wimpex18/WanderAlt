// Estonian, English and Russian are read (days, "daily", "from–to").
// Opening hours that a venue writes into its Instagram bio or Facebook "about" text, when a
// line says plainly which days and which times: "Tue-Sat 14-22", "Avatud E-R 10.00-18.00",
// "Fri, Sat 8pm-4am". Anything that is not that shape (a tagline with a year in it, "by
// appointment", an hour with no day) is left alone. The result is checked by the site's own
// reader through writeHours before it is kept.
import { writeHours } from './site-hours.ts';

const EN: Record<string, string> = { mon: 'Mo', monday: 'Mo', tue: 'Tu', tues: 'Tu', tuesday: 'Tu', wed: 'We', weds: 'We', wednesday: 'We',
  thu: 'Th', thur: 'Th', thurs: 'Th', thursday: 'Th', fri: 'Fr', friday: 'Fr', sat: 'Sa', saturday: 'Sa', sun: 'Su', sunday: 'Su' };
const ET: Record<string, string> = { e: 'Mo', t: 'Tu', k: 'We', n: 'Th', r: 'Fr', l: 'Sa', p: 'Su', esmaspäev: 'Mo', teisipäev: 'Tu', kolmapäev: 'We',
  neljapäev: 'Th', reede: 'Fr', laupäev: 'Sa', pühapäev: 'Su' };
const RU: Record<string, string> = { пн: 'Mo', пон: 'Mo', понедельник: 'Mo', вт: 'Tu', втор: 'Tu', вторник: 'Tu', ср: 'We', сре: 'We', среда: 'We',
  чт: 'Th', чет: 'Th', четверг: 'Th', пт: 'Fr', пят: 'Fr', пятница: 'Fr', сб: 'Sa', суб: 'Sa', суббота: 'Sa', вс: 'Su', воскр: 'Su', воскресенье: 'Su' };
const ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const DAY = '(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|esmaspäev|teisipäev|kolmapäev|neljapäev|reede|laupäev|pühapäev|[etknrlp]|понедельник|пон|пн|вторник|втор|вт|среда|сре|ср|четверг|чет|чт|пятница|пят|пт|суббота|суб|сб|воскресенье|воскр|вс)';
const TIME = '\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?';
const RANGE = `${TIME}\\s*-\\s*${TIME}`;
const SEGMENT = new RegExp(`^(?:open(?:ing hours)?|avatud|lahtiolekuajad|открыто|часы работы|режим работы|график работы)?\\s*:?\\s*((?:${DAY}|daily|every ?day|iga päev|ежедневно|каждый день)(?:\\s*(?:-|,|&|and|и)\\s*${DAY})*)\\s*:?\\s*(?:(?:с|from|alates)\\s+)?((?:${RANGE})(?:\\s*(?:,|&|and)\\s*${RANGE})*)$`, 'i');

function clock(raw: string): string | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = +m[1]; const min = m[2] ? +m[2] : 0;
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0); }
  if (min > 59 || h > 24 || (h === 24 && min)) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
const open24 = (h: string) => (h === '00:00' ? '24:00' : h);

function days(spec: string): string[] | null {
  if (/daily|every|iga|ежедн|каждый/i.test(spec)) return [...ORDER];
  const parts = spec.toLowerCase().replace(/\s+/g, '').split(/(-|,|&|and|и)/).filter(Boolean);
  const out: string[] = [];
  let prev: string | null = null, range = false;
  for (const x of parts) {
    if (x === '-') { range = true; continue; }
    if (x === ',' || x === '&' || x === 'and' || x === 'и') continue;
    const code = EN[x] ?? ET[x] ?? RU[x];
    if (!code) return null;
    if (range && prev) {
      const a = ORDER.indexOf(prev), b = ORDER.indexOf(code);
      for (let i = a; ; i = (i + 1) % 7) { if (!out.includes(ORDER[i])) out.push(ORDER[i]); if (i === b) break; }
      range = false;
    } else if (!out.includes(code)) out.push(code);
    prev = code;
  }
  return out;
}

/** OpenStreetMap-syntax hours from free text, or null. */
export function bioHours(text: string | null | undefined): string | null {
  if (!text) return null;
  const lines = text.normalize('NFC').replace(/[–—−]/g, '-').replace(/(?<![\p{L}])(to|till|until|kuni|до|по)(?![\p{L}])/giu, '-').split(/[\n|•·;]+/)
    .map(l => l.replace(/[^\p{L}\p{N}:.,&\- ]/gu, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const byDay = new Map<string, string[]>();
  for (const line of lines) {
    // A line is split once more where a new day list starts after a time ("Wed 17-22 Fri 17-23").
    for (const chunk of line.split(/(?<=\d(?:am|pm)?)(?:\s*,\s*|\s+)(?=(?:open |avatud |открыто )?(?:[etknrlp](?=\s+\d|\s*-\s*[etknrlp]\s+\d)|mon|tue|wed|thu|fri|sat|sun|esmasp|teisip|kolmap|neljap|reede|laup|pühap|пн|вт|ср|чт|пт|сб|вс|пон|вто|сре|чет|пят|суб|вос))/i)) {
      const m = SEGMENT.exec(chunk.trim());
      if (!m) continue;
      const d = days(m[1]);
      if (!d?.length) continue;
      const times: string[] = [];
      for (const r of m[2].split(/\s*(?:,|&|and)\s*/i)) {
        const [a, b] = r.split(/\s*-\s*/);
        const open = clock(a ?? ''), close = clock(b ?? '');
        if (!open || !close || open === close) { times.length = 0; break; }
        times.push(`${open}-${open24(close)}`);
      }
      if (!times.length) continue;
      for (const day of d) byDay.set(day, [...new Set([...(byDay.get(day) ?? []), ...times])]);
    }
  }
  return byDay.size ? writeHours(byDay) : null;
}
