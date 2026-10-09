import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Page lifetimes share storage, not JS closures. Real calendar/mood/render code.
function page(store = new Map<string, string>(), search = '', blocked = false, navigation = 'navigate', pageName = 'tonight') {
  let now = Date.parse('2026-10-06T12:00:00Z');
  class Clock extends Date {
    constructor(value?: string | number) { super(value === undefined ? now : value); }
    static now() { return now; }
  }
  const handlers = new Map<string, Function[]>();
  const on = (name: string, fn: Function) => handlers.set(name, [...(handlers.get(name) || []), fn]);
  const fire = (name: string, value = {}) => handlers.get(name)?.forEach(fn => fn(value));
  const storage = {
    getItem: (key: string) => { if (blocked) throw Error('blocked'); return store.get(key) || null; },
    setItem: (key: string, value: string) => { if (blocked) throw Error('blocked'); store.set(key, value); },
    removeItem: (key: string) => { if (blocked) throw Error('blocked'); store.delete(key); },
  };
  const WA: Record<string, any> = {
    CITY: 'tallinn', MOOD_RULES: {},
    Geo: { currentLoc: () => null, distanceTo: () => null, startMinutes: (e: { startsAt?: string }) => {
      if (!e.startsAt) return null;
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Tallinn', hour:'numeric', minute:'numeric', hourCycle:'h23' }).format(new Date(e.startsAt)).split(':').map(Number);
      return parts[0] * 60 + parts[1];
    } },
    Hours: { cityNow: () => ({ minutes: 15 * 60 }), clock: () => '18:00', state: () => ({ known:false }) },
    Icon: Object.assign(() => '', { kind: () => '' }), Picto: { kind: () => '<svg></svg>' },
  };
  const location = { search, pathname: '/index.html', hash: '#list', origin: 'https://wanderalt.app' };
  let written = '';
  const window = { WA, addEventListener: on };
  const context = createContext({ window, Date: Clock, Intl, URL, URLSearchParams, location,
    history: { replaceState: (_: unknown, __: string, value: string) => { written = value; } },
    document: { readyState: 'loading', body: { dataset:{ page:pageName } }, addEventListener: on, dispatchEvent: (e: { type: string }) => fire(e.type, e) },
    performance: { getEntriesByType: () => [{ type:navigation }] },
    addEventListener: on, localStorage: storage, sessionStorage: storage,
    CustomEvent: class { type: string; detail: unknown; constructor(type: string, options?: { detail?: unknown }) { this.type = type; this.detail = options?.detail; } },
  });
  for (const file of ['ui-helpers.js', 'when.js', 'render.js', 'moods.js', 'discovery-state.js']) {
    runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context);
  }
  return { WA, store, fire, location, context, url: () => written, clock: (value: string) => { now = Date.parse(value); } };
}

// A small element model: innerHTML is parsed into tags so the selectors Now
// uses (#id, .class, [attr], [attr="v"], tag) resolve against real markup.
function dom(doc: any) {
  const classes = (value = '') => {
    const set = new Set(value.split(/\s+/).filter(Boolean));
    return { toggle:(c: string, on?: boolean) => { if (on ?? !set.has(c)) set.add(c); else set.delete(c); }, add:(c: string) => set.add(c),
      remove:(c: string) => set.delete(c), contains:(c: string) => set.has(c) };
  };
  const one = (n: any, sel: string) => Array.from(sel.matchAll(/([#.]?[\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)).every(([, simple, attr, value]) => {
    if (attr) return value === undefined ? n.attrs.has(attr) : n.attrs.get(attr) === value;
    if (simple.startsWith('#')) return n.attrs.get('id') === simple.slice(1);
    if (simple.startsWith('.')) return n.classList.contains(simple.slice(1));
    return n.tag === simple;
  });
  const matches = (n: any, sel: string) => sel.split(',').some(part => one(n, part.trim()));
  const element = (tag = 'div', attrs = new Map<string, string>(), lenient = false): any => {
    let html = '', nodes: any[] = [];
    const self: any = { tag, attrs, textContent:'', isConnected:true, hidden:false, type:'', offsetWidth:100,
      style:{ setProperty() {} }, classList:classes(attrs.get('class')),
      get dataset() { return Object.fromEntries([...attrs].filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), v])); },
      set className(v: string) { attrs.set('class', v); self.classList = classes(v); }, get className() { return attrs.get('class') || ''; },
      setAttribute:(k: string, v: unknown) => attrs.set(k, String(v)), getAttribute:(k: string) => attrs.get(k) ?? null,
      addEventListener() {}, replaceWith() {}, focus() { doc.activeElement = self; },
      getBoundingClientRect:() => ({ left:0, right:0, top:0, bottom:0, width:0, height:0 }),
      set innerHTML(v: string) {
        html = v;
        nodes = Array.from(v.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g), ([, t, a]) => element(t, new Map(Array.from(a.matchAll(/([\w-]+)(?:="([^"]*)")?/g), ([, k, val]) => [k, val ?? ''])), true));
      },
      get innerHTML() { return html; },
      get lastElementChild() { return nodes[nodes.length - 1] || element(); },
      querySelectorAll:(sel: string) => nodes.filter(n => matches(n, sel)),
      querySelector:(sel: string) => nodes.find(n => matches(n, sel)) || (lenient && /^[a-z]+$/.test(sel) ? element() : null),
      contains:(n: any) => n === self || nodes.includes(n),
    };
    return self;
  };
  return element;
}

// Load the real Now, date and taste modules; stub only layout, rows and the When key.
function home(search = '', setup: (p: ReturnType<typeof page>) => void = () => {}) {
  const p = page(new Map(), search);
  let focus = '', written = '';
  const document = p.context.document;
  const element = dom(document);
  const elements = new Map<string, any>();
  for (const id of ['hero-title', 'home-acts', 'home-moods', 'home-main', 'home-side', 'since', 'home-browse-slot']) elements.set(id, element());
  const made: any[] = [];
  document.documentElement = { lang:'en' };
  document.createElement = (tag: string) => { const e = element(tag); made.push(e); return e; };
  document.getElementById = (id: string) => elements.get(id);
  document.querySelector = () => null;
  document.querySelectorAll = (selector: string) => selector.includes('wa-rows > li') || selector.includes('home-places > li')
    ? Array.from(elements.get('home-main').innerHTML.matchAll(/<li data-row="([^"]+)"/g), (m: any) => ({ querySelector:() => ({ focus:() => { focus = m[1]; } }) })) : [];
  p.context.history.replaceState = (_: unknown, __: string, value: string) => {
    written = value;
    const url = new URL(value, p.location.origin);
    p.location.search = url.search; p.location.hash = url.hash;
  };
  p.context.matchMedia = () => ({ matches:false, addEventListener:() => {} });
  p.context.HTMLDialogElement = class {};
  p.context.setInterval = () => 0;
  p.WA.Picto = Object.assign((name: string) => `<span class="wa-picto" data-picto="${name}"></span>`, { kind: () => '<svg></svg>' });
  p.WA.Geo.byDateThenSoonest = () => (a: any, b: any) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id);
  p.WA.Geo.anchor = () => null;
  p.WA.Route = { plan:() => [], loadStored:() => {} };
  runInContext(readFileSync(new URL('../../discovery-controls.js', import.meta.url), 'utf8'), p.context);
  p.WA.R.row = (e: any, o: any = {}) => `<li data-row="${e.id}" data-started="${!!o.started}"><a href="detail.html?id=${e.id}">${e.title}</a></li>`;
  p.WA.R.placeRow = (v: any, o: any = {}) => `<li data-row="${v.id}" data-pick-label="${o.pickLabel}"><a href="detail.html?place=${v.id}">${v.name}</a></li>`;
  const events = (n: number, date: string) => Array.from({ length:n }, (_, i) => ({ id:`${date}-${String(i).padStart(2,'0')}`,
    title:`Listing ${i}`, kind:'gig', startsAt:`${date}T15:00:00Z`, priceMin:i % 2 ? 15 : 0 }));
  p.WA.catalog = [...events(81, '2026-10-06'), ...events(37, '2026-10-07')];
  p.WA.venues = Array.from({ length:44 }, (_, i) => ({ id:`place-${i}`, name:`Place ${i}`, kind:'bookshop', picked:true }));
  setup(p);
  runInContext(readFileSync(new URL('../../home.js', import.meta.url), 'utf8'), p.context);
  p.fire('wa:catalog-ready');
  const click = (selector: string, dataset = {}) => p.fire('click', { target: { closest:(s: string) => s === selector ? { dataset, closest:() => null } : null } });
  const html = () => elements.get('home-main').innerHTML;
  return { ...p, click, url:() => written, focus:() => focus, html, elements,
    browse:() => made.find(e => e.className === 'home-browse'), rail:() => made.find(e => e.className.includes('home-moods')),
    heads:() => Array.from(html().matchAll(/wa-day__name">([^<]+)</g), (m: any) => m[1]),
    rows:() => Array.from(html().matchAll(/<li data-row="([^"]+)"/g), (m: any) => m[1]) };
}

test('Now shows 25 matching events and expands until exhausted, retaining order and focusing the next batch', () => {
  const p = home();
  assert.equal(p.rows().length, 25);
  assert.match(p.html(), /Show 25 more/);
  const first = p.rows();
  p.click('[data-day-all]');
  assert.equal(p.rows().length, 50);
  assert.deepEqual(p.rows().slice(0,25), first);
  assert.equal(p.focus(), p.rows()[25]);
  assert.match(p.url(), /shown=50/);
  p.click('[data-day-all]');
  assert.equal(p.rows().length, 75);
  assert.equal(p.focus(), p.rows()[50]);
  assert.match(p.html(), /Show 6 more/);
  p.click('[data-day-all]');
  assert.equal(p.rows().length, 81);
  assert.equal(new Set(p.rows()).size, 81);
  assert.doesNotMatch(p.html(), /data-day-all/);
  assert.deepEqual(p.heads(), ['Later today']); // 18:00 starts, read at 15:00
});

test('tonight reads as a timeline: on now (latest first), soon, later until 05:00, then undated and called-off entries', () => {
  const p = home('?when=tonight', (p) => {
    p.clock('2026-10-06T20:30:00Z'); // Tue 23:30 in Tallinn
    p.WA.Hours.cityNow = () => ({ minutes: 23 * 60 + 30 });
    p.WA.catalog = [
      { id:'gig-22', title:'Gig', kind:'gig', startsAt:'2026-10-06T19:00:00Z' },
      { id:'club-23', title:'Club', kind:'club', startsAt:'2026-10-06T20:00:00Z' },
      { id:'gig-0030', title:'Late gig', kind:'gig', startsAt:'2026-10-06T21:30:00Z' },
      { id:'club-0230', title:'Late club', kind:'club', startsAt:'2026-10-06T23:30:00Z' },
      { id:'wed-1900', title:'Tomorrow', kind:'gig', startsAt:'2026-10-07T16:00:00Z' },
      { id:'show', title:'Show', kind:'exhibition', startsAt:'2026-10-05T21:00:00Z' },
      { id:'off', title:'Off', kind:'gig', startsAt:'2026-10-06T21:15:00Z', flag:'cancelled' },
    ];
  });
  assert.deepEqual(p.heads(), ['On now', 'Starting soon', 'Later tonight', 'Also today', 'Cancelled or postponed']);
  assert.deepEqual(p.rows(), ['club-23', 'gig-22', 'gig-0030', 'club-0230', 'show', 'off']);
  assert.match(p.html(), /data-row="club-23" data-started="true"/);
  assert.match(p.html(), /data-row="gig-0030" data-started="false"/);
  assert.equal(p.elements.get('hero-title').textContent, 'Still going');
});

test('on now leads with what can still be joined; sessions already under way are listed last', () => {
  const p = home('?when=tonight', (p) => {
    p.clock('2026-10-06T17:00:00Z'); // Tue 20:00 in Tallinn
    p.WA.Hours.cityNow = () => ({ minutes: 20 * 60 });
    p.WA.catalog = [
      { id:'film-1930', title:'Film', kind:'film', startsAt:'2026-10-06T16:30:00Z' },
      { id:'film-1950', title:'Film just begun', kind:'film', startsAt:'2026-10-06T16:50:00Z' },
      { id:'course', title:'Three-day course', kind:'workshop', startsAt:'2026-10-05T07:00:00Z', endsAt:'2026-10-06T19:00:00Z' },
      { id:'opening', title:'Opening', kind:'exhibition', startsAt:'2026-10-06T15:00:00Z' },
      { id:'gig-1900', title:'Gig', kind:'gig', startsAt:'2026-10-06T16:00:00Z' },
      { id:'later', title:'Later', kind:'gig', startsAt:'2026-10-06T19:00:00Z' },
    ];
  });
  const heads = p.heads();
  assert.equal(heads[0], 'On now');
  assert.equal(heads.at(-1), 'Already under way');
  const rows = p.rows();
  assert.deepEqual(rows.slice(0, 3), ['film-1950', 'gig-1900', 'opening']);   // latest start first
  assert.deepEqual(rows.slice(-1), ['film-1930']);
  assert.ok(rows.indexOf('later') < rows.indexOf('film-1930'));
});

test('When changes regroup by night, reset expansion and keep one When key', () => {
  const p = home('?shown=50&when=tonight');
  assert.equal(p.rows().length, 50);
  const key = p.browse().querySelector('.home-browse__end').querySelector('[data-when-open]');
  assert.ok(key);
  p.WA.Discovery.setDates({ when:'tomorrow' });
  assert.equal(p.rows().length, 25);
  assert.deepEqual(p.heads(), ['Tomorrow']);
  assert.doesNotMatch(p.url(), /shown=/);
  assert.equal(p.browse().querySelector('.home-browse__end').querySelector('[data-when-open]'), key);
  assert.equal(key.classList.contains('is-set'), true);
  p.click('[data-view]', { view:'places' });
  assert.equal(p.browse().querySelector('.home-browse__end').innerHTML, '');
});

test('the mood rail picks one mood at a time, keeps price and that mood\'s own subs, and All clears', () => {
  const p = home();
  const pressed = () => p.rail().querySelectorAll('[data-mood-pick]').filter((b: any) => b.getAttribute('aria-pressed') === 'true').map((b: any) => b.dataset.moodPick);
  assert.deepEqual(pressed(), ['']);
  p.click('[data-mood-pick]', { moodPick:'listen' });
  assert.deepEqual(JSON.parse(JSON.stringify(p.WA.Moods.pref())), { moods:['listen'], subs:[], cap:null });
  assert.deepEqual(pressed(), ['listen']);
  p.WA.Moods.setPref({ moods:['listen', 'browse'], subs:['jazz', 'books'], cap:20 });
  assert.equal(p.rail().querySelector('[data-filter-open]').classList.contains('is-set'), true);
  p.click('[data-mood-pick]', { moodPick:'listen' });
  assert.deepEqual(JSON.parse(JSON.stringify(p.WA.Moods.pref())), { moods:['listen'], subs:['jazz'], cap:20 });
  p.click('[data-mood-pick]', { moodPick:'listen' });
  assert.deepEqual(JSON.parse(JSON.stringify(p.WA.Moods.pref())), { moods:[], subs:[], cap:20 });
  p.WA.Moods.setPref({ moods:['browse'], subs:[], cap:null });
  p.click('[data-mood-pick]', { moodPick:'' });
  assert.deepEqual(p.WA.Moods.pref().moods.length, 0);
});

test('empty results clear the price and mood together while keeping the chosen day', () => {
  const p = home('?when=tomorrow', p => {
    p.WA.Moods.setPref({ moods:[], subs:[], cap:0 });
    p.WA.catalog = [{ id:'paid', title:'Paid tomorrow', kind:'gig', startsAt:'2026-10-07T15:00:00Z', priceMin:10 }];
  });
  assert.equal(p.rows().length, 0);
  assert.match(p.html(), /Clear filters/);
  assert.doesNotMatch(p.html(), /Nothing for this mood|data-mood-pick/);
  p.click('[data-discovery-clear]');
  assert.deepEqual(JSON.parse(JSON.stringify(p.WA.Moods.pref())), { moods:[], subs:[], cap:null });
  assert.equal(p.WA.Discovery.dates().when,'tomorrow');
  assert.deepEqual(p.rows(),['paid']);
});

test('an unavailable catalogue offers retry instead of claiming the night has no events', () => {
  const p = home('', p => { p.WA.catalog = []; p.WA.DATA_LIVE = false; });
  assert.match(p.html(), /We can&#39;t reach the listings right now\.|We can’t reach the listings right now\.|We can't reach the listings right now\./);
  assert.match(p.html(), /Try again/);
  assert.doesNotMatch(p.html(), /Nothing else listed tonight|No listings match/);
});

// Real shared date-sheet controller, with native dialog/form behavior stubbed.
function dateSheet() {
  const p = page();
  let current: any = null, focused = false;
  const form = { id:'discovery-form', elements:{ date:{ value:'', min:'' }, range:{ checked:false }, to:{ value:'', min:'', disabled:true, required:false } } };
  const end = { hidden:true };
  const document = p.context.document;
  document.body.append = (node: any) => { current = node; };
  document.querySelector = () => null;
  document.createElement = () => {
    const handlers = new Map<string, Function>();
    return { dataset:{}, innerHTML:'', open:false, setAttribute() {},
      addEventListener:(name: string,fn: Function) => handlers.set(name,fn),
      querySelector:(selector: string) => selector === '#discovery-end' ? end : form,
      showModal() {
        this.open = true;
        for (const name of ['date','to'] as const) {
          const attrs = this.innerHTML.match(new RegExp(`<input[^>]+name="${name}"[^>]+>`))![0];
          form.elements[name].value = attrs.match(/value="([^"]*)"/)![1];
          form.elements[name].min = attrs.match(/min="([^"]*)"/)![1];
        }
        form.elements.range.checked = /name="range" checked/.test(this.innerHTML);
        end.hidden = !form.elements.range.checked;
      },
      close() { this.open = false; handlers.get('close')?.(); }, remove() {},
    };
  };
  runInContext(readFileSync(new URL('../../discovery-controls.js',import.meta.url),'utf8'),p.context);
  const button = { isConnected:true, focus:() => { focused = true; } };
  return { ...p, form, end, open:(options?: any) => p.WA.DiscoveryControls.openDates(button,options), sheet:() => current,
    cancel:() => current.close(), focus:() => focused,
    change:() => p.fire('change'), submit:() => p.fire('submit',{target:form,preventDefault() {}}) };
}

test('custom date sheet keeps edits as a draft, prefills ranges and restores focus after cancellation', () => {
  const p = dateSheet(); p.WA.Discovery.setDates({date:'2026-10-08',to:'2026-10-10'});
  p.open();
  assert.equal(p.form.elements.date.value,'2026-10-08');
  assert.equal(p.form.elements.to.value,'2026-10-10');
  assert.equal(p.form.elements.range.checked,true);
  assert.doesNotMatch(p.sheet().innerHTML,/data-date-preset|Dates use Tallinn time/);
  p.form.elements.date.value = '2026-10-09';
  p.change();
  assert.equal(p.form.elements.to.min,'2026-10-09');
  assert.equal(p.WA.Discovery.dates().date,'2026-10-08');
  p.cancel();
  assert.equal(p.WA.Discovery.dates().date,'2026-10-08');
  assert.equal(p.focus(),true);
});

test('date-sheet apply rejects past/reversed ranges; turning range off applies only the first date', () => {
  const p = dateSheet(); p.open();
  p.form.elements.range.checked = true; p.change();
  assert.equal(p.end.hidden,false);
  assert.equal(p.form.elements.to.disabled,false);
  for (const [date,to] of [['2026-10-05','2026-10-09'],['2026-10-09','2026-10-08'],['2026-10-09','']]) {
    p.form.elements.date.value = date; p.form.elements.to.value = to; p.submit();
    assert.equal(p.sheet().open,true);
    assert.equal(p.WA.Discovery.dates().when,'tonight');
  }
  p.form.elements.date.value = '2026-10-09';
  p.form.elements.range.checked = false; p.change(); p.submit();
  assert.equal(p.end.hidden,true);
  assert.equal(p.form.elements.to.disabled,true);
  assert.equal(p.WA.Discovery.dates().date,'2026-10-09');
  assert.equal(p.WA.Discovery.dates().to,'');
  assert.equal(p.sheet().open,false);
});

test('the same date picker applies independent search dates and preserves manual overrides on the Map round trip', () => {
  const p = dateSheet();
  p.WA.Geo.bySoonestThenDistance = () => () => 0;
  p.WA.Geo.byDateThenSoonest = () => () => 0;
  for (const file of ['ask.js','search-data.js']) runInContext(readFileSync(new URL(`../../${file}`,import.meta.url),'utf8'),p.context);
  const engine = p.WA.SearchData.create('?q=jazz%20tomorrow'); engine.query(engine.state.q);
  p.WA.Discovery.setDates({when:'weekend'});
  p.open({ dates:{when:engine.state.when,date:engine.state.day,to:engine.state.dayTo}, apply:(value: any) => {
    engine.state.when = 'all'; engine.state.day = value.date; engine.state.dayTo = value.to; engine.override('when');
  } });
  assert.equal(p.form.elements.date.value,'2026-10-07'); // search Tomorrow, not Now Weekend
  p.form.elements.date.value = '2026-10-08'; p.form.elements.to.value = '2026-10-10';
  p.form.elements.range.checked = true; p.change(); p.submit();
  assert.equal(p.WA.Discovery.dates().when,'weekend');
  const returned = p.WA.SearchData.create(engine.params().toString()); returned.query(returned.state.q);
  assert.equal(returned.state.day,'2026-10-08');
  assert.equal(returned.state.dayTo,'2026-10-10');
  assert.equal(returned.state.overrides.has('when'),true);
});

test('Now restores expanded events on reload and cached Back navigation; new dates and taste reset expansion', () => {
  const p = home('?shown=50&when=tonight');
  assert.equal(p.rows().length, 50);
  p.fire('pageshow', { persisted:true });
  assert.equal(p.rows().length, 50);
  assert.match(p.url(), /shown=50/);
  p.WA.Discovery.setDates({ when:'tomorrow' }); p.WA.Discovery.writeURL();
  assert.equal(p.rows().length, 25);
  assert.match(p.url(), /when=tomorrow/);
  assert.match(p.url(), /#list$/);
  assert.doesNotMatch(p.url(), /shown=/);
  p.click('[data-day-all]');
  assert.equal(p.rows().length, 37);
  p.WA.Moods.setPref({ moods:[], subs:[], cap:0 });
  assert.equal(p.rows().length, 19); // only free events, not the previous day's entries
  assert.doesNotMatch(p.url(), /shown=/);
  assert.doesNotMatch(p.html(), /data-day-all/);
});

test('Now places use the same batches and history contract; switching view resets expansion; no repeated Picked label', () => {
  const p = home('?view=places&shown=50');
  assert.equal(p.rows().length, 44);
  assert.match(p.html(), /data-pick-label="false"/);
  p.fire('pageshow', { persisted:true });
  assert.equal(p.rows().length, 44);
  p.click('[data-view]', { view:'events' });
  assert.equal(p.rows().length, 25);
  assert.doesNotMatch(p.url(), /shown=|view=places/);
  p.click('[data-day-all]');
  p.click('[data-view]', { view:'places' });
  assert.equal(p.rows().length, 25);
  assert.match(p.html(), /Show 19 more/);
  p.click('[data-day-all]');
  assert.equal(p.rows().length, 44);
  assert.equal(p.focus(), p.rows()[25]);
  assert.equal(new URL(p.url(), p.location.origin).searchParams.get('view'), 'places');
});

test('invalid feed expansion parameters start at 25 and keep unrelated URL context', () => {
  for (const shown of ['-1', '5', '26', 'Infinity', '9007199254741000', 'bad']) {
    const p = home(`?shown=${shown}&when=tomorrow&lang=et`);
    assert.equal(p.rows().length, 25);
    assert.match(p.url(), /when=tomorrow/);
    assert.match(p.url(), /lang=et/);
    assert.doesNotMatch(p.url(), /shown=/);
  }
});

test('Now → Map → Now preserves range, narrowed mood, cap and nearest intent; URLs override dates', () => {
  const first = page();
  first.WA.Moods.setPref({ moods:['look'], subs:['film'], cap:20 });
  first.WA.Discovery.setDates({ date:'2026-10-08', to:'2026-10-10' });
  first.WA.Discovery.setNear(true);
  const map = page(first.store);
  assert.equal(map.WA.Discovery.dates().to, '2026-10-10');
  assert.equal(map.WA.Moods.pref().subs[0], 'film');
  assert.equal(map.WA.Moods.pref().cap, 20);
  assert.equal(map.WA.Discovery.nearOn(), false); // no coordinates, no false selected control
  map.WA.Geo.currentLoc = () => ({ lat:59.4, lng:24.7 });
  assert.equal(map.WA.Discovery.nearOn(), true);
  map.WA.Discovery.setDates({ when:'tomorrow' });
  map.WA.Moods.setPref({ moods:['listen'], subs:['jazz'], cap:0 });
  map.WA.Discovery.setNear(false);
  first.fire('pageshow', { persisted:true });
  assert.equal(first.WA.Discovery.dates().when, 'tomorrow');
  assert.match(first.url(), /when=tomorrow/);
  assert.equal(first.WA.Moods.pref().subs[0], 'jazz');
  assert.equal(first.WA.Moods.pref().cap, 0);
  assert.equal(first.WA.Discovery.nearOn(), false);
  const linked = page(first.store, '?date=2026-10-12&to=2026-10-13&view=places');
  assert.equal(linked.WA.Discovery.dates().date, '2026-10-12');
  linked.WA.Discovery.writeURL();
  assert.match(linked.url(), /view=places/);
  assert.match(linked.url(), /date=2026-10-12/);
  assert.match(linked.url(), /#list$/);
});

test('history reloads use the latest discovery dates; new links override them and full results stays independent', () => {
  const start = page();
  start.WA.Discovery.setDates({ when:'tonight' });
  const returned = page(start.store, '?when=tomorrow', false, 'back_forward');
  assert.equal(returned.WA.Discovery.dates().when, 'tonight');
  assert.match(returned.url(), /when=tonight/);
  const reloaded = page(start.store, new URL(returned.url(), 'https://wanderalt.app').search, false, 'reload');
  assert.equal(reloaded.WA.Discovery.dates().when, 'tonight');
  const search = page(start.store, '?time=weekend&date=2026-10-12', false, 'navigate', 'programme');
  assert.equal(search.WA.Discovery.dates().when, 'tonight');
  assert.equal(search.WA.Discovery.dates().date, '');
  assert.equal(page(start.store, '?when=tomorrow').WA.Discovery.dates().when, 'tomorrow');
  const noContext = page(new Map(), '?date=2026-10-12', false, 'back_forward');
  assert.equal(noContext.WA.Discovery.dates().date, '2026-10-12');
});

test('bad calendar keys, reversed ranges, midnight expiry and blocked storage recover', () => {
  const p = page(); const D = p.WA.Discovery;
  for (const key of ['2026-02-30', '2026-13-01', 'not a date', '2026-1-01']) assert.equal(D.validDate(key), false);
  assert.equal(D.validDate('2028-02-29'), true);
  D.setDates({ date:'2026-10-05' }); assert.equal(D.dates().date, '');
  D.setDates({ date:'2026-10-08', to:'2026-10-07' }); assert.equal(D.dates().to, '');
  D.fromQuery(new URLSearchParams('date=2026-02-30')); assert.equal(D.dates().date, '2026-10-08');
  p.clock('2026-10-06T22:00:00Z'); // next Tallinn calendar day
  assert.equal(D.dates().date, '2026-10-08');
  p.clock('2026-10-09T12:00:00Z'); assert.equal(D.dates().date, '');
  const relative = page(); relative.WA.Discovery.setDates({ when:'tomorrow' });
  relative.clock('2026-10-07T12:00:00Z'); assert.equal(relative.WA.Discovery.dates().when, 'tonight');
  const trip = page(); trip.WA.Discovery.setDates({ date:'2026-10-08', to:'2026-10-10' });
  trip.clock('2026-10-09T12:00:00Z');
  assert.equal(trip.WA.Discovery.dates().date, '2026-10-09'); assert.equal(trip.WA.Discovery.dates().to, '2026-10-10');
  const corrupt = page(new Map([['wa:discovery:v1','{'], ['wa:mood:v1','null']]));
  assert.equal(corrupt.WA.Discovery.dates().when, 'tonight');
  const privatePage = page(new Map(), '', true);
  privatePage.WA.Discovery.setDates({ date:'2026-10-09' });
  privatePage.WA.Moods.setPref({ moods:['look'], cap:20 });
  assert.equal(privatePage.WA.Discovery.dates().date, '2026-10-09');
  assert.equal(privatePage.WA.Moods.pref().cap, 20);
  privatePage.clock('2026-10-07T12:00:00Z');
  assert.equal(privatePage.WA.Discovery.dates().date, '2026-10-09');
});

test('date ranges include overlapping runs and overnight shows, with inclusive date-only ends and DST', () => {
  const p = page(), D = p.WA.Discovery;
  const single = { date:'2026-10-09' };
  // 23:00–02:30 belongs to the night of the 8th, not to the 9th as well.
  assert.equal(D.matchesDate({ startsAt:'2026-10-08T20:00:00Z', endsAt:'2026-10-08T23:30:00Z' }, single), false);
  assert.equal(D.matchesDate({ startsAt:'2026-10-08T20:00:00Z', endsAt:'2026-10-08T23:30:00Z' }, { date:'2026-10-08' }), true);
  // 21:00Z is midnight in Tallinn before the clock change.
  assert.equal(D.matchesDate({ startsAt:'2026-10-08T18:00:00Z', endsAt:'2026-10-08T21:00:00Z' }, single), false);
  // A date-only run (local midnights) includes its last day; a 03:00 end closes the night before.
  assert.equal(D.matchesDate({ startsAt:'2026-09-30T21:00:00Z', endsAt:'2026-10-08T21:00:00Z' }, single), true);
  assert.equal(D.matchesDate({ startsAt:'2026-10-01T00:00:00Z', endsAt:'2026-10-09T00:00:00Z' }, single), false);
  assert.equal(D.matchesDate({ startsAt:'2026-10-07T09:00:00Z', endsAt:'2026-10-12T09:00:00Z' }, { date:'2026-10-08', to:'2026-10-10' }), true);
  assert.equal(D.matchesDate({ startsAt:'2026-10-11T09:00:00Z' }, { date:'2026-10-08', to:'2026-10-10' }), false);
  p.clock('2026-10-24T20:00:00Z');
  assert.equal(Array.from(D.range({ when:'tomorrow' })).join(','), '2026-10-25,2026-10-25');
  assert.equal(D.matchesDate({ startsAt:'2026-10-25T21:30:00Z' }, { when:'tomorrow' }), true);
  assert.equal(D.matchesDate({ startsAt:'2026-10-25T22:00:00Z' }, { when:'tomorrow' }), false);
});

test('a night runs to 05:00: late starts belong to the evening before and Tomorrow means the coming evening', () => {
  const p = page(), D = p.WA.Discovery, W = p.WA.when;
  p.clock('2026-10-09T20:30:00Z'); // Fri 23:30 in Tallinn
  const club = { startsAt:'2026-10-09T22:00:00Z', kind:'club' }; // Sat 01:00
  assert.equal(W.nightKey(club), '2026-10-09');
  assert.equal(D.matchesDate(club, { when:'tonight' }), true);
  assert.equal(D.matchesDate(club, { when:'tomorrow' }), false);
  assert.equal(D.matchesDate({ startsAt:'2026-10-10T03:00:00Z', kind:'market' }, { when:'tomorrow' }), true); // Sat 06:00 keeps its day
  const allNight = { startsAt:'2026-10-09T20:00:00Z', endsAt:'2026-10-10T03:00:00Z', kind:'club' }; // Fri 23:00 – Sat 06:00
  assert.equal(D.matchesDate(allNight, { date:'2026-10-09' }), true);
  assert.equal(D.matchesDate(allNight, { date:'2026-10-10' }), false);
  p.clock('2026-10-09T21:30:00Z'); // Sat 00:30, still Friday night
  assert.equal(W.nightToday(), '2026-10-09');
  assert.deepEqual([...D.range({ when:'tonight' })], ['2026-10-09', '2026-10-09']);
  assert.deepEqual([...D.range({ when:'tomorrow' })], ['2026-10-10', '2026-10-10']);
  assert.deepEqual([...D.range({ when:'weekend' })], ['2026-10-09', '2026-10-11']);
  const party = { startsAt:'2026-10-09T20:00:00Z', kind:'club' }; // 23:00, no end listed
  const gig = { startsAt:'2026-10-09T18:00:00Z', kind:'gig' };    // 21:00, no end listed
  assert.equal(W.hasEnded(party), false);
  assert.equal(W.hasEnded(gig), true);
  assert.equal(D.matchesDate(party, { when:'tonight' }), true);
  p.clock('2026-10-10T02:30:00Z'); // Sat 05:30: the new day has begun
  assert.equal(W.nightToday(), '2026-10-10');
});

test('a stated midnight start is the evening before, a bare date keeps its day, and 01:00–04:00 is one night', () => {
  const p = page(), D = p.WA.Discovery, W = p.WA.when;
  p.clock('2026-10-09T20:30:00Z'); // Fri 23:30 in Tallinn
  const midnight = { startsAt:'2026-10-09T21:00:00Z', time:'00:00', kind:'club' }; // Sat 00:00, stated
  assert.equal(W.statedMinutes(midnight), 0);
  assert.equal(D.matchesDate(midnight, { when:'tonight' }), true);
  assert.equal(D.matchesDate(midnight, { when:'tomorrow' }), false);
  const dateOnly = { startsAt:'2026-10-09T21:00:00Z', time:null, kind:'market' }; // Saturday, no time
  assert.equal(W.statedMinutes(dateOnly), null);
  assert.equal(D.matchesDate(dateOnly, { when:'tonight' }), false);
  assert.equal(D.matchesDate(dateOnly, { when:'tomorrow' }), true);
  const early = { startsAt:'2026-10-09T22:00:00Z', endsAt:'2026-10-10T01:00:00Z', kind:'club' }; // Sat 01:00–04:00
  assert.equal(W.nightEndKey(early), '2026-10-09');
  assert.equal(D.matchesDate(early, { date:'2026-10-09' }), true);
  assert.equal(D.matchesDate(early, { date:'2026-10-10' }), false);
});

test('compact rows say Price not listed when asked, so a capped list keeps its caveat', () => {
  const p = page();
  assert.match(p.WA.R.row({ id:'gig', title:'Gig', kind:'gig' }, { unknownPrice:true }), /Price not listed/);
  assert.doesNotMatch(p.WA.R.row({ id:'gig', title:'Gig', kind:'gig' }), /Price not listed/);
  assert.match(p.WA.R.row({ id:'free', title:'Free', kind:'gig', isFree:true }, { unknownPrice:true }), /wa-free">Free/);
});

test('the When key names its preset, applies presets directly and marks a non-default choice', () => {
  const p = page();
  p.context.HTMLDialogElement = class {};
  runInContext(readFileSync(new URL('../../discovery-controls.js', import.meta.url), 'utf8'), p.context);
  p.WA.Icon = () => '';
  assert.match(p.WA.DiscoveryControls.dateKey(), /data-when-open[^>]*>[^]*<span>Today<\/span>/);
  assert.doesNotMatch(p.WA.DiscoveryControls.dateKey(), /is-set/);
  p.fire('click', { target:{ closest:(s: string) => s === '[data-when-pick]' ? { dataset:{ whenPick:'weekend' } } : null } });
  assert.equal(p.WA.Discovery.dates().when, 'weekend');
  assert.match(p.url(), /when=weekend/);
  assert.match(p.WA.DiscoveryControls.dateKey(), /is-set[^]*<span>Weekend<\/span>/);
});

test('ticket caps keep unknown prices explicitly, while mood and submood remain authoritative', () => {
  const p = page(), D = p.WA.Discovery;
  p.WA.Moods.setPref({ moods:['look'], subs:['film'], cap:20 });
  assert.equal(D.matchesEvent({ kind:'film', priceMin:21 }), false);
  assert.equal(D.matchesEvent({ kind:'film', priceMin:null }), true);
  assert.equal(D.matchesEvent({ kind:'film', isFree:true, priceMin:99 }), true);
  assert.equal(D.matchesEvent({ kind:'gig', priceMin:10 }), false);
  p.WA.Moods.setPref({ moods:['look'], subs:['film'], cap:0 });
  assert.equal(D.matchesEvent({ kind:'film', priceMin:1 }), false);
  assert.equal(D.matchesEvent({ kind:'film', priceMin:0 }), true);
  assert.equal(D.matchesEvent({ kind:'film', priceMin:null }), false);
  assert.equal(D.matchesEvent({ kind:'film', isFree:true }), true);
  assert.equal(D.matchesPlace({ kind:'cinema' }), true);
});

test('image-first feed preserves categories, provenance and missing facts; hostile fields remain text', () => {
  const p = page();
  const markup = p.WA.R.feedItem({ id:'film', title:'<img src=x onerror=alert(1)>', kind:'film',
    tags:['arthouse'], venue:'<script>place</script>', neighborhood:'Kalamaja',
    imageUrl:'javascript:alert(1)', permalink:'javascript:alert(1)', handle:'evil" onclick="x',
    startsAt:'2026-10-07T00:00:00Z' }, { day:true });
  assert.match(markup, /Film/); assert.match(markup, /Arthouse/);
  assert.match(markup, /Price not listed/); assert.match(markup, /Time not listed/);
  assert.match(markup, /is-missing/); assert.match(markup, /&lt;img/); assert.match(markup, /@evil&quot;/);
  assert.match(markup, /data-notranslate>&lt;script&gt;place&lt;\/script&gt;/);
  assert.match(markup, /data-notranslate>Kalamaja<\/span>/);
  assert.doesNotMatch(markup, /src="javascript:|<script>|onclick="|<a[^>]*<button/);
  const withPhoto = p.WA.R.feedItem({ id:'safe', title:'Safe', kind:'film', imageUrl:'https://images.example/film.jpg', permalink:'https://source.example/event' });
  assert.match(withPhoto, /width="640" height="360" loading="lazy"/);
  assert.match(withPhoto, /Source<\/span> · source.example/);
  assert.ok(withPhoto.indexOf('wa-feed__art') < withPhoto.indexOf('wa-feed__title'));
  const withVenue = p.WA.R.feedItem({ id:'venue', kind:'film', venueImageUrl:'https://images.example/venue.jpg' });
  assert.match(withVenue, /Venue image/);
  const classes = new Set(['wa-feed__art', 'is-logo', 'tone-film']);
  const box = { classList: { [Symbol.iterator]:() => classes.values(), remove:(c:string) => classes.delete(c), add:(c:string) => classes.add(c) },
    matches:(selector:string) => selector === '.wa-feed__art' };
  const img = { tagName:'IMG', closest:(selector:string) => selector.includes('.wa-feed__art') ? box : null, outerHTML:'' };
  p.fire('error', { target:img });
  assert.equal(classes.has('is-failed'), true);
  assert.equal(classes.has('is-missing'), false); // preserve the loaded layout's photo size
  assert.equal(classes.has('is-logo'), false);
  assert.equal(classes.has('tone-film'), false);
  assert.equal(img.outerHTML, '<svg></svg>');
});

test('all-day discovery feeds say Today while compact evening headings retain Tonight', () => {
  const p = page();
  const listings = [{ id:'day', title:'Daytime film', kind:'film', startsAt:'2026-10-06T12:00:00Z', hasTime:true }];
  assert.match(p.WA.R.grouped(listings, { feed:true }), /wa-day__name">Today</);
  assert.match(p.WA.R.grouped(listings), /wa-day__name">Tonight</);
});

test('saved event and place removal actions are siblings of their navigation links', () => {
  const p = page();
  for (const markup of [p.WA.R.row({ id:'event', title:'<Festival>', kind:'film' }, { drop:true }),
    p.WA.R.placeRow({ id:'place', name:'<Terminal>', kind:'bar' }, { drop:true })]) {
    assert.match(markup, /<\/a><button[^>]+data-unsave=/);
    assert.doesNotMatch(markup, /<a\b[^]*?<button[^]*?<\/a>/);
    assert.match(markup, /aria-label="Remove &lt;/);
  }
  const picked = p.WA.R.placeRow({ id:'picked', name:'Festival', kind:'bar', picked:true });
  assert.match(picked, /wa-place__name">Festival<\/span> <span class="wa-place__pick">Picked/);
});


test('a temporary Map search context never replaces Now dates in shared storage', () => {
  const now=page(); now.WA.Discovery.setDates({when:'tonight'});
  const before=now.store.get('wa:discovery:v1');
  const map=page(now.store,'?context=search&q=jazz&time=tomorrow&date=2026-10-12',false,'navigate','map');
  assert.equal(map.WA.Discovery.dates().when,'tonight');
  assert.equal(now.store.get('wa:discovery:v1'),before);
  assert.equal(map.url(),'');
});
