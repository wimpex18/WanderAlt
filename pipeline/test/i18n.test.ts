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
  for (const f of ['lang/et.js', 'lang/ru.js', 'lang/uk.js', 'i18n.js']) runInContext(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'), context);
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
  assert.equal(Lang.t('Club · Old Town · 5 listed'), 'Клуб · Old Town · 5 событий');
  assert.equal(Lang.t('  Search  '), '  Поиск  ');                   // whitespace kept
  assert.equal(Lang.t('Save: Festival'), 'Сохранить: Festival');
  assert.equal(Lang.t('Saved: Festival'), 'Сохранено: Festival');
  assert.equal(Lang.t('Remove Festival from saved'), 'Убрать Festival из сохранённого');
  assert.equal(Lang.t('New since last visit'), 'Новое с прошлого визита');
});

test('short helpers cover all interface languages; geographic and source names stay literal', () => {
  const helpers = ['New since last visit', 'Choose a nearby venue', 'Walks start here', 'Using your location',
    'Choose a starting point', 'Starting point', 'Clear for device location', 'Show walking times',
    'Unknown prices included', 'Dates use Tallinn time', 'Hours shown for now', 'Your saves carry over',
    'No selection means all', 'Continue with Google', 'Shapes your walks', 'Follow from venue pages', 'Within 10 minutes’ walk', '3 opened or saved'];
  for (const lang of ['en', 'et', 'ru', 'uk']) {
    const { Lang } = load(lang);
    for (const helper of helpers) {
      const translated = Lang.t(helper);
      if (lang !== 'en') assert.notEqual(translated, helper, `${lang}: ${helper}`);
      assert.ok(translated.split(/\s+/).length <= 4, `${lang}: ${translated}`);
    }
    for (const name of ['Old Town', 'City centre', 'Kalamaja', 'Telliskivi', 'Põhja-Tallinn']) assert.equal(Lang.t(name), name);
    assert.ok(Lang.t('Also in Kalamaja:').includes('Kalamaja'));
    assert.ok(Lang.t('Following Festival').includes('Festival'));
    assert.ok(Lang.t('Add Festival to your calendar').includes('Festival'));
    assert.ok(Lang.t('Language: Українська').includes('Українська'));
    if (lang !== 'en') {
      assert.notEqual(Lang.t('since 20:15'), 'since 20:15');
      assert.notEqual(Lang.t('Show 632 listings'), 'Show 632 listings');
      assert.notEqual(Lang.t('3 here, zoom in'), '3 here, zoom in');
      assert.notEqual(Lang.t('11 min walk from where you are'), '11 min walk from where you are');
      assert.notEqual(Lang.t('cached 3 days ago'), 'cached 3 days ago');
      assert.notEqual(Lang.t('Not saved: arbitrary diagnostic'), 'Not saved: arbitrary diagnostic');
      assert.ok(Lang.t('Not saved: arbitrary diagnostic').endsWith('arbitrary diagnostic'));
    }
  }
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

test('the tables are well formed: all languages agree, placeholders kept, no markup, plural forms complete', () => {
  const { dict } = load('et');
  const ru = load('ru').dict.ru, et = dict.et;
  assert.deepEqual(Object.keys(et.exact).sort(), Object.keys(ru.exact).sort());
  assert.equal(et.patterns.length, ru.patterns.length);
  const uk = load('uk').dict.uk;
  assert.deepEqual(Object.keys(et.exact).sort(), Object.keys(uk.exact).sort());
  assert.equal(et.patterns.length, uk.patterns.length);
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
  et.patterns.forEach(([src, dst]: [string, string], i: number) => {
    const forms = typeof ru.patterns[i][1] === 'string' ? [ru.patterns[i][1]] : Object.values(ru.patterns[i][1]) as string[];
    assert.equal(ru.patterns[i][0], src);
    assert.equal(holes(dst), holes(src), `et ${src}`);
    for (const f of forms) assert.equal(holes(f), holes(src), `ru ${src}`);
    assert.equal(uk.patterns[i][0], src);
    for (const f of typeof uk.patterns[i][1] === 'string' ? [uk.patterns[i][1]] : Object.values(uk.patterns[i][1]) as string[]) assert.equal(holes(f), holes(src), `uk ${src}`);
    if (typeof ru.patterns[i][1] !== 'string') assert.deepEqual(Object.keys(ru.patterns[i][1]).sort(), ['few', 'many', 'one', 'other']);
  });
  for (const t of [et.exact, ru.exact, uk.exact]) for (const [k, v] of Object.entries(t) as [string, string][]) {
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

test('hot switching restores English originals, updates dates and keeps drafts without navigation', () => {
  const listeners = new Map<string, Function[]>(), storage = new Map<string, string>();
  const element = (skip = false) => ({ nodeType: 1, matches: () => skip, closest: () => skip ? {} : null,
    attrs: { 'aria-label': 'Search' } as Record<string,string>, hasAttribute(name: string) { return name in this.attrs; },
    getAttribute(name: string) { return this.attrs[name]; }, setAttribute(name: string, value: string) { this.attrs[name] = value; } });
  const parent = element(), excluded = element(true);
  const text = { nodeType: 3, data: 'Open now', parentElement: parent };
  const venue = { nodeType: 3, data: 'Festival', parentElement: excluded };
  const feedParent = { ...element(), closest:(s:string) => s.split(',').some(x => x.trim() === '.wa-feed__title') ? {} : null };
  const feedTitle = { nodeType:3, data:'Festival', parentElement:feedParent };
  const field = { id: 'draft', value: 'my unfinished search', checked: true, selectionStart: 3, selectionEnd: 6,
    focus() {}, setSelectionRange(a: number, b: number) { this.selectionStart = a; this.selectionEnd = b; } };
  const fold = { id: 'fold', open: true };
  let replaced = '', observed = 0, scrolled: number[] = [];
  const document = { readyState: 'loading', documentElement: { lang: '' }, body: parent, title: 'You', activeElement: field,
    querySelector: () => null,
    querySelectorAll: (s: string) => s.startsWith('input') ? [field] : [fold],
    getElementById: (id: string) => id === field.id ? field : fold,
    addEventListener(name: string, fn: Function) { listeners.set(name, [...(listeners.get(name) || []), fn]); },
    dispatchEvent(e: any) { for (const f of listeners.get(e.type) || []) f(e); },
    createTreeWalker() { const nodes = [text, venue, feedTitle]; return { nextNode: () => nodes.shift() }; } };
  const window: any = { WA: {}, scrollX: 0, scrollY: 200, scrollTo: (...xy: number[]) => { scrolled = xy; } };
  const context = createContext({ window, document, navigator: { languages: ['en'] }, Intl, URL, URLSearchParams,
    location: { href: 'https://wanderalt.app/profile?lang=en&keep=yes#taste', search: '?lang=en&keep=yes' },
    history: { state: {}, replaceState(_s: any, _t: string, url: string) { replaced = url; } },
    localStorage: { getItem: (k: string) => storage.get(k) || null, setItem: (k: string, v: string) => storage.set(k,v) },
    NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    MutationObserver: class { observe() { observed++; } disconnect() {} },
    CustomEvent: class { type: string; constructor(type: string) { this.type = type; } }, requestAnimationFrame: (f: Function) => f() });
  for (const file of ['lang/et.js', 'lang/ru.js', 'lang/uk.js', 'i18n.js']) runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context);
  document.dispatchEvent({ type: 'DOMContentLoaded' });
  document.addEventListener('wa:language-changed', () => { field.value = ''; field.checked = false; fold.open = false; });
  for (const lang of ['ru','et','uk','en']) {
    window.WA.Lang.set(lang);
    assert.equal(text.data, window.WA.Lang.t('Open now'));
    assert.equal(parent.attrs['aria-label'], window.WA.Lang.t('Search'));
    assert.equal(document.title, window.WA.Lang.t('You'));
    assert.equal(venue.data, 'Festival');
    assert.equal(feedTitle.data, 'Festival');
    assert.equal(field.value, 'my unfinished search'); assert.equal(field.checked, true);
    assert.equal(field.selectionStart, 3); assert.equal(field.selectionEnd, 6); assert.equal(fold.open, true);
    assert.deepEqual(scrolled, [0,200]);
    assert.equal(document.documentElement.lang, lang);
    assert.equal(storage.get('wa:lang:v1'), lang);
  }
  assert.equal(replaced, 'https://wanderalt.app/profile?keep=yes#taste');
  assert.equal(observed, 5);
  assert.equal(window.WA.Lang.days()[1], 'Mon');
  window.WA.Lang.set('ru'); const ru = window.WA.Lang.days()[1];
  window.WA.Lang.set('et'); assert.notEqual(window.WA.Lang.days()[1], ru);
  // Newly authored English must replace the old original, even while Russian is selected.
  text.data = 'Saved'; window.WA.Lang.set('en'); assert.equal(text.data, 'Saved');
});
