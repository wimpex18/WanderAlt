import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

/** Load the dictionaries and i18n.js for one language into a bare context (no DOM: the page walk never starts). */
function load(lang: string) {
  const window: any = { WA: {} };
  const context: any = createContext({
    window, Intl, console,
    navigator: { languages: [lang], language: lang },
    localStorage: { getItem: () => null, setItem() {} },
    document: { readyState: 'loading', addEventListener() {}, documentElement: {} },
  });
  for (const f of ['lang/et.js', 'lang/ru.js', 'i18n.js']) runInContext(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'), context);
  return window.WA as { Lang: { t: (s: string, v?: Record<string, unknown>) => string; current: () => string; days: () => string[]; months: () => string[]; locale: () => string }; dict: any };
}

test('English is the source: nothing changes, and the names are the fixed ones', () => {
  const { Lang } = load('en');
  assert.equal(Lang.current(), 'en');
  assert.equal(Lang.t('Open now'), 'Open now');
  assert.deepEqual([...Lang.days()], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.equal(Lang.months()[8], 'Sep');
});

test('Russian: exact phrases, patterns with plural forms, typed placeholders and dot-separated pieces', () => {
  const { Lang } = load('ru');
  assert.equal(Lang.current(), 'ru');
  assert.equal(Lang.t('Open now'), 'Открыто сейчас');
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25, 54].map(n => Lang.t(`${n} listed`)),
    ['1 событие', '2 события', '5 событий', '11 событий', '21 событие', '22 события', '25 событий', '54 события']);
  assert.deepEqual([1, 2, 5].map(n => Lang.t(`${n} places`)), ['1 место', '2 места', '5 мест']);
  assert.equal(Lang.t('{n} min walk', { n: 7 }), '7 мин пешком');
  assert.equal(Lang.t('Open till 04:00'), 'Открыто до 04:00');
  assert.equal(Lang.t('· nearest first · 10 open now'), '· сначала ближайшие · открыто сейчас: 10');
  assert.equal(Lang.t('Club · Old Town · 5 listed'), 'Клуб · Старый город · 5 событий');
  assert.equal(Lang.t('  Search  '), '  Поиск  ');                   // whitespace kept
});

test('Estonian uses one form for a number', () => {
  const { Lang } = load('et');
  assert.equal(Lang.t('54 places'), '54 kohta');
  assert.equal(Lang.t('till 23:59'), 'kuni 23:59');
  assert.equal(Lang.t('Now'), 'Praegu');
  assert.equal(Lang.locale(), 'et-EE');
});

test('a placeholder is typed: "till {t}" does not swallow a sentence, text that is not ours stays as it was', () => {
  const { Lang } = load('ru');
  assert.equal(Lang.t('till death do us part'), 'till death do us part');
  assert.equal(Lang.t('Jazz at Philly Joe’s'), 'Jazz at Philly Joe’s');
  assert.equal(Lang.t('to the sea'), 'to the sea');
  assert.equal(Lang.t(''), '');
});

test('the tables are well formed: same phrases for both languages, placeholders kept, no markup, plural forms complete', () => {
  const { dict } = load('et');
  const ru = load('ru').dict.ru, et = dict.et;
  assert.deepEqual(Object.keys(et.exact).sort(), Object.keys(ru.exact).sort());
  assert.equal(et.patterns.length, ru.patterns.length);
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
  et.patterns.forEach(([src, dst]: [string, string], i: number) => {
    const forms = typeof ru.patterns[i][1] === 'string' ? [ru.patterns[i][1]] : Object.values(ru.patterns[i][1]) as string[];
    assert.equal(ru.patterns[i][0], src);
    assert.equal(holes(dst), holes(src), `et ${src}`);
    for (const f of forms) assert.equal(holes(f), holes(src), `ru ${src}`);
    if (typeof ru.patterns[i][1] !== 'string') assert.deepEqual(Object.keys(ru.patterns[i][1]).sort(), ['few', 'many', 'one', 'other']);
  });
  for (const t of [et.exact, ru.exact]) for (const [k, v] of Object.entries(t) as [string, string][]) {
    assert.doesNotMatch(v, /<\/?[a-z]/i, k);                // text, never markup
    assert.equal(v, v.trim(), k);
    assert.ok(v.length > 0, k);
  }
  for (const [k, v] of Object.entries(ru.exact) as [string, string][]) {
    if (/[A-Za-z]{4,}/.test(k) && !/^(Instagram|Facebook|Google|Kalamaja|Telliskivi|Kopli|Noblessner|Tallinn|Pirita|Kristiine|Lasnamäe|Mustamäe|Nõmme|OpenStreetMap|Põhja-Tallinna?|Pelgulinn.*|Rotermann.*|Folk|Metal|Rock|Punk|Indie|House|Ambient|Noise|Drag|Queer|Stand-up|Open mic|Karaoke|Hip-hop|Vabaduse väljak)$/.test(k)) {
      assert.match(v, /[А-Яа-яЁё]/, `Russian value for "${k}" has no Cyrillic`);
    }
  }
});
