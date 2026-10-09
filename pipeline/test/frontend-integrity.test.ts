import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function page() {
  const values = new Map<string, string>();
  const redirects = new Map<string, string>([['old-event', 'event'], ['old-place', 'place']]);
  const WA: Record<string, any> = {
    canonicalId: (id: string) => redirects.get(id) ?? id,
    Geo: { startMinutes: () => 19 * 60, distanceTo: () => null },
    Hours: { state: () => ({ known: true, open: true }), clock: (n: number) => `${Math.floor(n / 60)}:00` },
    UI: { esc: (s: unknown) => String(s ?? ''), safeUrl: (s: string) => s, keepFocus: (_: unknown, redraw: () => unknown) => redraw() },
  };
  const context = createContext({ window: { WA, addEventListener: () => {} }, localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }, CustomEvent: class {}, setTimeout, clearTimeout, AbortController, document: { addEventListener: () => {}, dispatchEvent: () => {} } });
  const load = (file: string) => runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context);
  return { WA, values, redirects, load, context };
}

function guide() {
  const p = page();
  const elements = new Map<string, any>();
  for (const id of ['list', 'kinds', 'summary', 'from', 'open-now']) elements.set(id, {
    innerHTML: '', setAttribute: () => {},
  });
  const listeners = new Map<string, (e?: any) => void>();
  p.context.document = { readyState: 'complete', getElementById: (id: string) => elements.get(id),
    addEventListener: (name: string, fn: (e?: any) => void) => listeners.set(name, fn), dispatchEvent: () => {} };
  p.context.location = { search: '', pathname: '/places.html' };
  p.context.history = { replaceState: () => {} };
  p.context.URLSearchParams = URLSearchParams;
  p.WA.Geo.currentLoc = () => null; p.WA.Geo.anchor = () => null;
  p.WA.Geo.walkMinutes = () => null;
  p.WA.Icon = Object.assign(() => '', { kind: () => '' });
  p.WA.Picto = Object.assign(() => '', { kind: () => '' });
  p.load('when.js'); p.load('render.js'); p.load('places.js');
  return { ...p, elements, render: () => listeners.get('wa:catalog-ready')!(),
    openNow: () => listeners.get('click')!({ target: { closest: (s: string) => s === '#open-now' ? {} : null } }) };
}

test('the Guide recommends only picked active places and Open now requires known hours', () => {
  const p = guide();
  p.WA.Hours.state = (hours: string | undefined) => ({ known: hours === '24/7', open: hours === '24/7' ? true : null });
  p.WA.venues = [
    { id: 'picked-open', name: 'Picked Open', kind: 'bookshop', picked: true, isVerified: true, openingHours: '24/7' },
    { id: 'picked-unknown', name: 'Picked Unknown', kind: 'bookshop', picked: true, isVerified: true },
    { id: 'not-picked', name: 'Not Picked', kind: 'bookshop', isVerified: true, openingHours: '24/7' },
    { id: 'closed', name: 'Closed', kind: 'bookshop', picked: true, isVerified: true, isClosed: true, openingHours: '24/7' },
  ];
  p.render();
  assert.match(p.elements.get('summary').innerHTML, /2 places/);
  assert.match(p.elements.get('list').innerHTML, /data-place="picked-open"/);
  assert.match(p.elements.get('list').innerHTML, /data-place="picked-unknown"/);
  assert.doesNotMatch(p.elements.get('list').innerHTML, /data-place="(?:not-picked|closed)"/);
  p.openNow();
  assert.match(p.elements.get('summary').innerHTML, /1 place/);
  assert.doesNotMatch(p.elements.get('list').innerHTML, /picked-unknown/);
});

test('Guide listing counts follow each refreshed catalogue, including name-only matches and removals', () => {
  const p = guide();
  p.WA.venues = [{ id: 'venue', name: 'Venue', kind: 'gallery', picked: true, isVerified: true }];
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  p.WA.catalog = [{ id: 'first', venueId: 'venue', venue: 'Venue', startsAt }];
  p.render();
  assert.match(p.elements.get('list').innerHTML, /1 listed/);
  p.WA.catalog = [...p.WA.catalog, { id: 'second', venue: ' Venue ', startsAt }];
  p.render();
  assert.match(p.elements.get('list').innerHTML, /2 listed/);
  p.WA.catalog = [];
  p.render();
  assert.doesNotMatch(p.elements.get('list').innerHTML, /\d+ listed/);
});

test('Estonian evening and Russian event sentences do not require generic words to match a listing', () => {
  const p = page(); p.load('ask.js');
  const et = p.WA.Ask.local('täna õhtul tasuta kontsert');
  assert.equal(et.when, 'tonight'); assert.equal(et.free, true);
  assert.deepEqual(Array.from(et.kinds), ['gig']);
  assert.equal(et.must.length, 0);
  const ru = p.WA.Ask.local('завтра бесплатные мероприятия');
  assert.equal(ru.when, 'tomorrow'); assert.equal(ru.free, true);
  assert.equal(ru.must.length, 0);
  const jazz = p.WA.Ask.local('джаз сегодня вечером');
  assert.equal(jazz.must.length, 0);
  assert.deepEqual(Array.from(jazz.any), ['jazz']);
  const en = p.WA.Ask.local('free jazz tonight in Kalamaja');
  assert.deepEqual(Array.from(en.must), ['kalamaja']);
  assert.deepEqual(Array.from(en.any), ['jazz']);
});

test('saved aliases collapse without rewriting raw ids; undo and unsaving remain possible', () => {
  const p = page(); p.load('save-store.js'); p.load('bookmark.js'); p.load('lists.js');
  p.values.set('wanderalt:bookmarks:v1', JSON.stringify({ 'old-event': true, event: true, 'old-place': true }));
  p.values.set('wa:lists:v1', JSON.stringify({ list: { id: 'list', items: ['old-event', 'event', 'old-place'] } }));
  assert.equal(p.WA.Lists.listsFor('event').length, 1);
  p.WA.Lists.removeItem('list', 'event');
  assert.deepEqual(Array.from(p.WA.Lists.items('list')), ['old-place']);
  assert.deepEqual(Array.from(p.WA.Bookmarks.ids()).sort(), ['event', 'place']);
  assert.equal(JSON.parse(p.values.get('wanderalt:bookmarks:v1:sync:guest')!).data['old-event'], true);
  p.redirects.clear();
  assert.equal(p.WA.Bookmarks.ids().length, 3);
  p.redirects.set('old-event', 'event');
  p.WA.Bookmarks.set('event', false);
  assert.equal(p.WA.Bookmarks.get().event, undefined);
  assert.equal(JSON.parse(p.values.get('wanderalt:bookmarks:v1:sync:guest')!).data['old-event'], undefined);
});

test('ended, cancelled, postponed and date-only events never read On now; sold out can still be running', () => {
  const p = page(); p.load('when.js'); p.load('render.js');
  const now = Date.parse('2026-09-28T18:00:00Z');
  const e = { startsAt: '2026-09-28T16:00:00Z', endsAt: '2026-09-28T19:00:00Z' };
  assert.equal(p.WA.R.isLive(e, now), true);
  for (const flag of ['cancelled', 'postponed']) assert.equal(p.WA.R.isLive({ ...e, flag }, now), false);
  assert.equal(p.WA.R.isLive({ ...e, flag: 'sold_out' }, now), true);
  assert.equal(p.WA.R.isLive({ ...e, endsAt: '2026-09-28T17:59:00Z' }, now), false);
  assert.equal(p.WA.R.isLive({ startsAt: '2026-09-28T00:00:00Z' }, now), false);
  assert.equal(p.WA.R.openState({ isClosed: true, openingHours: '24/7' }).open, false);
  assert.equal(p.WA.R.openState({ isVerified: false, openingHours: '24/7' }).open, false);
  assert.equal(p.WA.R.openState({ isVerified: false, openingHours: '24/7' }).text, 'Status unverified');
  /* An end on another day than today carries its date; 2030 is never today. */
  assert.equal(p.WA.R.endClock({ endsAt: '2030-10-04T15:00:00Z' }), 'Fri 4 Oct · 18:00');
});

test('unverified and closed places never appear in shared recommendations, even with open hours', () => {
  const p = page(); p.load('render.js');
  p.WA.venues = [
    { id: 'open', isVerified: true },
    { id: 'unknown', isVerified: false },
    { id: 'closed', isClosed: true, isVerified: true },
  ];
  assert.deepEqual(Array.from(p.WA.R.places(), (v: any) => v.id), ['open']);
});

test('an event without a supplied time does not claim to run all day', () => {
  const p = page();
  p.WA.Geo.startMinutes = () => null;
  p.WA.Icon = Object.assign(() => '', { kind: () => '' });
  p.WA.Picto = { kind: () => '' };
  p.load('when.js'); p.load('render.js');
  const markup = p.WA.R.row({ id: 'untimed', title: 'Open Mic', kind: 'gig', startsAt: '2026-10-01T09:00:00Z' });
  assert.match(markup, /Time not listed/);
  assert.doesNotMatch(markup, /All day|wa-now/);
});

test('event pictures stay event-specific in the catalogue and direct details', async () => {
  const picks = [
    { id: 'artwork', city: 'tallinn', title: 'Own artwork', venue_id: 'venue', kind: 'gig', image_url: 'https://event.example/poster.jpg' },
    { id: 'no-artwork', city: 'tallinn', title: 'No artwork', venue_id: 'venue', kind: 'gig', image_url: null },
  ];
  const venues = [{ id: 'venue', city: 'tallinn', name: 'Venue', kind: 'club', image_url: 'https://venue.example/photo.jpg', image_source: 'website' }];
  const WA: Record<string, any> = {};
  let ready!: () => void;
  const loaded = new Promise<void>(resolve => { ready = resolve; });
  const context = createContext({ window: { WA }, location: { hostname: 'localhost' }, console,
    AbortController, setTimeout, clearTimeout, CustomEvent: class { type: string; constructor(type: string) { this.type = type; } },
    document: { readyState: 'complete', dispatchEvent: (e: any) => { if (e.type === 'wa:catalog-ready') ready(); } },
    fetch: async (url: string) => {
      const u = new URL(url);
      const rows = u.pathname.endsWith('/picks') ? picks : u.pathname.endsWith('/venues') ? venues : [];
      const id = u.searchParams.get('id')?.replace(/^eq\./, '');
      return { ok: true, json: async () => id ? rows.filter(r => r.id === id) : rows };
    },
  });
  runInContext(readFileSync(new URL('../../supabase.js', import.meta.url), 'utf8'), context);
  await loaded;
  assert.equal(WA.catalog[0].imageUrl, picks[0].image_url);
  assert.equal(WA.catalog[1].imageUrl, null);
  assert.equal(WA.venues[0].imageUrl, venues[0].image_url);
  assert.equal((await WA.byId('no-artwork')).e.imageUrl, null);
});

test('English titles and evidence languages reach every catalogue lookup; originals fetch only on demand', async () => {
  const paths: string[] = [];
  const pick = { id: 'jazz', city: 'tallinn', title: 'Jazz', original_title: 'Джаз', quote: 'A jazz gig.',
    teaser: 'Джаз в клубе.', original_language: 'ru', title_language: 'ru', event_languages: [],
    original_excerpt: 'Джаз в клубе. Полный текст.', original_url: 'https://event.example/jazz' };
  const WA: Record<string, any> = {};
  let ready!: () => void;
  const loaded = new Promise<void>(r => { ready = r; });
  const context = createContext({ window: { WA }, location: { hostname: 'localhost' }, console,
    AbortController, setTimeout, clearTimeout, CustomEvent: class { type: string; constructor(type: string) { this.type = type; } },
    document: { readyState: 'complete', dispatchEvent: (e: any) => { if (e.type === 'wa:catalog-ready') ready(); } },
    fetch: async (url: string) => {
      const u = new URL(url); paths.push(u.search);
      return { ok: true, json: async () => u.pathname.endsWith('/picks') ? [pick] : [] };
    },
  });
  runInContext(readFileSync(new URL('../../supabase.js', import.meta.url), 'utf8'), context);
  await loaded;
  const e = WA.catalog[0];
  assert.equal(e.title, 'Jazz'); assert.equal(e.originalTitle, 'Джаз'); assert.equal(e.quote, 'A jazz gig.');
  assert.equal(e.originalLanguage, 'ru'); assert.equal(e.eventLanguages.length, 0);
  assert.equal(e.descriptionFull, false);
  assert.equal((await WA.byId('jazz')).e.title, 'Jazz');
  assert.equal(paths.some(p => /select=\*|select=description/.test(p)), false);
  assert.equal(paths.some(p => p.includes('original_excerpt')), false);
  await WA.originalDescription(e);
  assert.equal(e.description, pick.original_excerpt);
  assert.equal(e.originalUrl, pick.original_url);
  assert.equal(e.descriptionFull, true);
  const after = paths.length;
  await WA.originalDescription(e); assert.equal(paths.length, after);
});

test('English-language filtering uses performance evidence, not an English announcement tag', () => {
  const p = page(); p.load('render.js');
  p.WA.R.interests.set(['english']);
  assert.equal(p.WA.R.interests.matches({ kind: 'theatre', tags: ['english'], eventLanguages: [] }), false);
  assert.equal(p.WA.R.interests.matches({ kind: 'theatre', tags: [], eventLanguages: ['en'] }), true);
});

test('a failed original-description request stays retryable and does not cache the teaser as complete', async () => {
  const pick = { id: 'jazz', city: 'tallinn', title: 'Jazz', teaser: 'Короткий текст.' };
  const WA: Record<string, any> = {};
  let ready!: () => void;
  let originals = 0;
  const loaded = new Promise<void>(r => { ready = r; });
  const context = createContext({ window: { WA }, location: { hostname: 'localhost' }, console,
    AbortController, setTimeout, clearTimeout, CustomEvent: class { type: string; constructor(type: string) { this.type = type; } },
    document: { readyState: 'complete', dispatchEvent: (e: any) => { if (e.type === 'wa:catalog-ready') ready(); } },
    fetch: async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.get('select')?.includes('original_excerpt')) {
        if (++originals === 1) throw new Error('Network unavailable');
        return { ok: true, json: async () => [{ original_excerpt: 'Полный исходный текст.', original_language: 'ru' }] };
      }
      return { ok: true, json: async () => u.pathname.endsWith('/picks') ? [pick] : [] };
    },
  });
  runInContext(readFileSync(new URL('../../supabase.js', import.meta.url), 'utf8'), context);
  await loaded;
  const e = WA.catalog[0];
  assert.equal(await WA.originalDescription(e), false);
  assert.equal(e.descriptionFull, false);
  assert.equal(e.originalLoadFailed, true);
  assert.equal(e.description, pick.teaser);
  assert.equal(await WA.originalDescription(e), true);
  assert.equal(e.description, 'Полный исходный текст.');
  assert.equal(e.descriptionFull, true);
  assert.equal(e.originalLoadFailed, false);
  assert.equal(originals, 2);
});

test('detail saves preserve source disclosure and button focus; alias unsave Undo restores list membership', () => {
  const handlers = new Map<string, Function>();
  let marked = true, inList = true, undo: Function | undefined;
  const attrs = new Map<string,string>(), listLabel = { textContent:'Trip' };
  const button = { innerHTML:'Saved', setAttribute: (k:string, v:string) => attrs.set(k,v) };
  const main = { set innerHTML(_:string) { throw Error('Saving must not redraw the detail page'); } };
  const WA = {
    canonicalId: () => 'event', _catalogAll: [{ id:'event' }], Icon: () => '<svg></svg>',
    Bookmarks: { get: () => marked ? { event:true } : {}, set: (id:string, on:boolean) => {
      assert.equal(id,'event'); marked = on; if (!on) inList = false;
    } },
    Lists: { listsFor: () => inList ? [{ id:'trip', name:'Trip' }] : [], add: (id:string, entry:string) => {
      assert.equal(id,'trip'); assert.equal(entry,'event'); inList = true;
    } },
    Toast: { show: (_:string, __:string, u:Function) => { undo = u; } },
  };
  const document = { readyState:'loading', activeElement:button,
    addEventListener: (n:string, fn:Function) => handlers.set(n,fn),
    getElementById: (id:string) => id === 'save' ? button : id === 'addlist' ? { querySelector: () => listLabel } : id === 'main' ? main : null,
  };
  runInContext(readFileSync(new URL('../../detail.js',import.meta.url),'utf8'), createContext({ window:{ WA }, document,
    location:{ search:'?id=old-event' }, URLSearchParams }));
  handlers.get('click')!({ target:{ closest:(s:string) => s === '#save' ? button : null } });
  assert.equal(marked,false); assert.equal(attrs.get('aria-pressed'),'false');
  assert.equal(listLabel.textContent,'List'); assert.equal(document.activeElement,button);
  undo!();
  assert.equal(marked,true); assert.equal(inList,true); assert.equal(listLabel.textContent,'Trip');
  assert.equal(attrs.get('aria-pressed'),'true'); assert.equal(document.activeElement,button);
});

test('sheets follow the visual viewport so the keyboard never covers a field or its button', () => {
  const props = new Map<string, string>();
  const listeners: Record<string, () => void> = {};
  const vv = { height: 800, offsetTop: 0, addEventListener: (e: string, f: () => void) => { listeners[e] = f; } };
  const root = { style: { setProperty: (k: string, v: string) => props.set(k, v), removeProperty: (k: string) => props.delete(k) } };
  const context = createContext({ window: { WA: {}, visualViewport: vv, innerHeight: 800 }, document: { documentElement: root, addEventListener: () => {}, querySelectorAll: () => [], readyState: 'complete' } });
  runInContext(readFileSync(new URL('../../ui-helpers.js', import.meta.url), 'utf8'), context);
  vv.height = 480; listeners.resize();                    // keyboard up
  assert.equal(props.get('--vv-h'), '480px');
  assert.equal(props.get('--vv-top'), '0px');
  vv.height = 800; listeners.resize();                    // keyboard down
  assert.equal(props.has('--vv-h'), false);
  const css = readFileSync(new URL('../../wa.css', import.meta.url), 'utf8');
  assert.match(css, /\.wa-sheet \{[^}]*height: var\(--vv-h, 100%\)/);
});

test('the name sheets get their suggestions from Lists', () => {
  const p = page(); p.load('save-store.js'); p.load('lists.js');
  assert.match(String(p.WA.Lists.suggestions()), /data-suggest="Saturday night"/);
});

test('the entrance gate opens at page start and closes after the first listings, or after five seconds', () => {
  for (const fire of [true, false]) {
    const attrs = new Set<string>(); const timers: Array<[number, () => void]> = []; const listeners: Record<string, () => void> = {};
    const root = { setAttribute: (k: string) => attrs.add(k), removeAttribute: (k: string) => attrs.delete(k), hasAttribute: (k: string) => attrs.has(k) };
    const context = createContext({
      matchMedia: () => ({ matches: false }), navigator: {},
      setTimeout: (f: () => void, ms: number) => { timers.push([ms, f]); return 0; },
      document: { documentElement: root, querySelectorAll: () => [], addEventListener: (e: string, f: () => void) => { listeners[e] = f; } },
      window: { addEventListener: () => {} }, addEventListener: () => {},
    });
    runInContext(readFileSync(new URL('../../view-transition.js', import.meta.url), 'utf8'), context);
    assert.equal(attrs.has('data-enter'), true);
    if (fire) { listeners['wa:catalog-ready'](); timers.filter(([ms]) => ms === 1200).forEach(([, f]) => f()); }
    else timers.filter(([ms]) => ms === 5000).forEach(([, f]) => f());
    assert.equal(attrs.has('data-enter'), false);
  }
  const reduced = new Set<string>();
  const ctx = createContext({ matchMedia: () => ({ matches: true }), navigator: {}, setTimeout: () => 0,
    document: { documentElement: { setAttribute: (k: string) => reduced.add(k), removeAttribute: () => {} }, querySelectorAll: () => [], addEventListener: () => {} }, window: { addEventListener: () => {} }, addEventListener: () => {} });
  runInContext(readFileSync(new URL('../../view-transition.js', import.meta.url), 'utf8'), ctx);
  assert.equal(reduced.size, 0);
});

test('a run that began before today and has not ended is its own Running group, with its dates in the rail', () => {
  const p = page();
  p.WA.Icon = Object.assign(() => '', { kind: () => '' }); p.WA.Picto = Object.assign(() => '', { kind: () => '' });
  p.WA.UI.price = () => ''; p.WA.UI.guard = (s: string) => s;
  p.WA.Geo.startMinutes = () => null;                     // no stated time, as for an exhibition
  p.load('when.js');
  const today = p.WA.when.todayKey();
  const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 3600000 + n * 86400000).toISOString();   // midnight in Tallinn: a date, no stated time
  p.load('render.js');
  const run = { id: 'ev_run', title: 'An exhibition', kind: 'exhibition', startsAt: day(-2), endsAt: day(2) };
  const gone = { id: 'ev_gone', title: 'Over', kind: 'gig', startsAt: day(-2), endsAt: day(-1) };
  const next = { id: 'ev_next', title: 'Next', kind: 'gig', startsAt: day(1) };
  const html = String(p.WA.R.grouped([run, next], {}));
  assert.equal((html.match(/wa-day__name/g) || []).length, 2);          // Running, tomorrow: no heading for the day it started
  assert.match(html, /Running/);
  assert.ok(html.indexOf('An exhibition') < html.indexOf('Next'));
  assert.match(html, / to /);
  assert.equal(String(p.WA.R.grouped([gone], {})).includes(' to '), false);
});

test('a date-only run is still on all of its last day, and ends when that day does', () => {
  const p = page(); p.WA.Geo.startMinutes = () => null; p.load('when.js');
  const today = p.WA.when.todayKey();
  const midnight = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 3600000 + n * 86400000).toISOString();   // local midnight, Tallinn
  const run = { startsAt: midnight(-4), endsAt: midnight(0) };      // its last day is today
  assert.equal(p.WA.when.hasEnded(run, Date.parse(midnight(0)) + 10 * 3600000), false);
  assert.equal(p.WA.when.hasEnded(run, Date.parse(midnight(1)) + 3600000), true);
});

test('the Home Screen nudge appears once, ever, after about 75 seconds of looking at a listing page', () => {
  const store = new Map<string, string>(); const session = new Map<string, string>();
  let tickers: Array<() => void> = []; let appended = 0;
  const make = (page: string) => {
    tickers = []; appended = 0;
    const el = () => ({ className: '', setAttribute() {}, querySelector: () => ({ addEventListener() {}, set textContent(_v: string) {} }), set innerHTML(_v: string) {}, classList: { add() {} }, remove() {} });
    const context = createContext({
      navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 },
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      sessionStorage: { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => session.set(k, v) },
      matchMedia: () => ({ matches: false }), Intl, CustomEvent: class {},
      setInterval: (f: () => void) => { tickers.push(f); return tickers.length; }, clearInterval: () => {}, setTimeout: () => 0,
      addEventListener: () => {}, window: { WA: { Auth: {}, Follows: { keys: () => [] } }, addEventListener: () => {}, matchMedia: () => ({ matches: false }) },
      document: { readyState: 'complete', visibilityState: 'visible', body: { dataset: { page }, appendChild: () => { appended++; } }, activeElement: null, querySelector: () => null, createElement: el, addEventListener: () => {}, dispatchEvent: () => {} },
    });
    runInContext(readFileSync(new URL('../../install.js', import.meta.url), 'utf8'), context);
  };
  make('tonight');
  for (let i = 0; i < 14; i++) tickers.forEach(f => f());      // 70 s
  assert.equal(appended, 0);
  tickers.forEach(f => f());                                      // 75 s
  assert.equal(appended, 1);
  session.clear(); make('tonight');                               // a later visit
  for (let i = 0; i < 30; i++) tickers.forEach(f => f());
  assert.equal(appended, 0);
});

test('inline icons on the static pages are named and match icons.js', async () => {
  const { execFileSync } = await import('node:child_process');
  const { readdirSync, readFileSync: read } = await import('node:fs');
  const root = new URL('../../', import.meta.url);
  for (const f of readdirSync(root).filter(x => x.endsWith('.html'))) {
    const html = read(new URL(f, root), 'utf8');
    for (const m of html.matchAll(/<svg class="wa-ic[^"]*"[^>]*>/g)) assert.match(m[0], /data-ic="[a-z0-9]+"/, `${f}: ${m[0]}`);
  }
  execFileSync(process.execPath, [new URL('../../.scripts/sync-icons.js', import.meta.url).pathname, '--check']);
});

test('the tab bar has four tabs on every page and no empty slot', () => {
  const css = readFileSync(new URL('../../wa.css', import.meta.url), 'utf8');
  assert.match(css, /\.wa-tabbar \{[^}]*grid-auto-flow: column/);
  for (const f of ['index.html', 'map.html', 'saved.html', 'places.html', 'discover.html', 'profile.html', 'detail.html', 'route.html', 'source.html', 'about.html', '404.html']) {
    const html = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.equal((html.match(/class="wa-tabbar__item"/g) || []).length, 4, f);
  }
});

test('compact rows keep small pictures and Saved shows three lists a row; desktop sizes stay', () => {
  const css = readFileSync(new URL('../../wa.css', import.meta.url), 'utf8');
  const phone = css.slice(css.lastIndexOf('@media (max-width: 767px)'));
  assert.match(phone, /\.wa-row__thumb \{ width: 56px; height: 56px;/);
  assert.match(phone, /\.wa-place__glyph, \.home-places \.wa-place__glyph \{ width: 48px; height: 48px;/);
  assert.match(phone, /\.wa-lists \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.wa-row__thumb \{ width: 120px; height: 90px; \}/, 'desktop rows keep their picture');
});

test('pictures are asked for at about their drawn size, and keep the original to fall back to', () => {
  const context = createContext({ window: { WA: {} }, location: { origin: 'https://wanderalt.app' }, URL,
    document: { documentElement: { style: { setProperty() {}, removeProperty() {} } }, addEventListener: () => {}, querySelectorAll: () => [], readyState: 'complete' } });
  runInContext(readFileSync(new URL('../../ui-helpers.js', import.meta.url), 'utf8'), context);
  const UI = (context as any).window.WA.UI;
  const fienta = 'https://fienta.com/cf/img/?width=1070&format=jpeg&gcs=true&file=/org/9174/QcZSdMwoL8KrWoC.jpg';
  assert.equal(UI.sized(fienta, 160), 'https://fienta.com/cf/img/?width=160&format=jpeg&gcs=true&file=/org/9174/QcZSdMwoL8KrWoC.jpg');
  assert.equal(UI.sized('https://fienta.com/cf/img/?width=120&file=/a.jpg', 160), 'https://fienta.com/cf/img/?width=120&file=/a.jpg');   // never larger
  // Commons serves fixed widths only: the next one up, and SVGs as PNG.
  assert.equal(UI.sized('https://upload.wikimedia.org/wikipedia/commons/a/a0/Fotografiska_2019.jpg', 160),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Fotografiska_2019.jpg/250px-Fotografiska_2019.jpg');
  assert.equal(UI.sized('http://upload.wikimedia.org/wikipedia/commons/b/bd/Logo.svg', 100),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Logo.svg/120px-Logo.svg.png');
  assert.equal(UI.sized('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/X.jpg/1280px-X.jpg', 300),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/X.jpg/330px-X.jpg');
  assert.equal(UI.sized('https://shop.wordpress.com/wp-content/uploads/logo.png?w=192', 160), 'https://shop.wordpress.com/wp-content/uploads/logo.png?w=160');
  assert.equal(UI.sized('https://venue.example/photo.jpg', 160), 'https://venue.example/photo.jpg');
  assert.equal(UI.sized('javascript:alert(1)', 160), '');
  assert.equal(UI.imgAttrs('https://venue.example/a.jpg', 160), 'src="https://venue.example/a.jpg"');
  assert.equal(UI.imgAttrs('https://fienta.com/cf/img/?width=1070&file=/a.jpg', 160),
    'src="https://fienta.com/cf/img/?width=160&amp;file=/a.jpg" data-full="https://fienta.com/cf/img/?width=1070&amp;file=/a.jpg"');
});
