import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const tick = () => new Promise<void>(r => setImmediate(r));

function api() {
  const now = Date.parse('2026-09-30T22:01:00Z'); // Already October 1 in Tallinn.
  class Clock extends Date { constructor(value?: any) { super(value === undefined ? now : value); } }
  const stored = new Map<string, Response>();
  const calls: any[] = [];
  let output: any = { when: 'tonight', day: '', kinds: [], must: [], any: [] };
  const context = createContext({ Date: Clock, Intl, Request, Response, URL,
    caches: { default: { match: async (r: Request) => stored.get(r.url)?.clone(), put: async (r: Request, v: Response) => { stored.set(r.url, v); } } },
  });
  runInContext(source('functions/api/ask.js').replace('export async function', 'async function'), context);
  const request = async (today = '2026-09-30', extraEnv: any = {}, q = 'quiet+tonight') => {
    const waits: Promise<any>[] = [];
    const r = await context.onRequestGet({ request: new Request(`https://wanderalt.app/api/ask?q=${q}&today=${today}`, { headers: { 'sec-fetch-site': 'same-origin' } }),
      env: { AI: { run: async (_: string, p: any) => { calls.push(p); return { response: output }; } }, ...extraEnv }, waitUntil: (p: Promise<any>) => waits.push(p) });
    await Promise.all(waits); return r;
  };
  return { request, calls, stored, output: (v: any) => { output = v; } };
}

test('model filters use the Tallinn server date; caller dates cannot bypass the cache', async () => {
  const a = api();
  assert.equal((await a.request('2040-99-99')).status, 200);
  await a.request('1900-01-01');
  assert.equal(a.calls.length, 1);
  assert.match(a.calls[0].messages[0].content, /Today is 2026-10-01/);
  assert.match([...a.stored.keys()][0], /today=2026-10-01/);
  // Workers AI takes the JSON Schema directly, unlike the OpenRouter wrapper.
  assert.equal(a.calls[0].response_format.json_schema.type, 'object');
  assert.equal(a.calls[0].response_format.json_schema.properties.must.type, 'array');
});

test('invalid calendar dates and untrusted model fields cannot become authoritative filters', async () => {
  const a = api();
  a.output({ day: '2027-02-30', when: 'tonight', kinds: ['film', 'film', 'hacked'], free: 'true', english: 1, maxPrice: 9000,
    must: [{ malicious: true }, 'Kalamaja'], any: ['jazz', 'jazz'], note: '<script>alert(1)</script>!', url: 'javascript:bad' });
  const j = await (await a.request()).json();
  assert.equal(j.day, ''); assert.equal(j.when, 'tonight');
  assert.deepEqual(j.kinds, ['film']); assert.deepEqual(j.must, ['kalamaja']); assert.deepEqual(j.any, ['jazz']);
  assert.equal(j.free, false); assert.equal(j.english, false); assert.equal(j.maxPrice, null);
  assert.equal(j.url, undefined); assert.doesNotMatch(j.note, /[<>!]/);
});

test('malformed model responses fail without entering the cache', async () => {
  const a = api(); a.output([null]);
  assert.equal((await a.request()).status, 502); assert.equal(a.stored.size, 0);
});

test('search client cache changes at midnight and clears its timeout after a fetch failure', async () => {
  let today = '2026-09-30', calls = 0, cleared = 0;
  const WA: any = { when: { todayKey: () => today } };
  const context = createContext({ window: { WA }, AbortController,
    setTimeout: () => 1, clearTimeout: () => { cleared++; },
    fetch: async () => { calls++; if (calls === 3) throw new Error('offline'); return new Response(JSON.stringify({ day: today, kinds: [], must: [], any: [] })); },
  });
  runInContext(source('ask.js'), context);
  await WA.Ask.remote('on Friday'); await WA.Ask.remote('on Friday');
  assert.equal(calls, 1);
  today = '2026-10-01';
  assert.equal((await WA.Ask.remote('on Friday')).day, today);
  assert.equal(calls, 2);
  assert.equal(await WA.Ask.remote('another sentence'), null);
  assert.equal(cleared, 3);
});

test('weekdays in each search language resolve locally without model date arithmetic', () => {
  const WA: any = { when: { keyPlus: (n: number) => new Date(Date.UTC(2026, 8, 30 + n)).toISOString().slice(0, 10) } };
  runInContext(source('ask.js'), createContext({ window: { WA } }));
  for (const q of ['film on Friday', 'kino reedel', 'кино в пятницу']) {
    const p = WA.Ask.local(q);
    assert.equal(p.day, '2026-10-02'); assert.equal(p.when, '');
    assert.deepEqual(Array.from(p.kinds), ['film']); assert.equal(p.must.length, 0);
  }
});

function programme(search = '', venues: any[] = []) {
  const listeners = new Map<string, any>(), elements = new Map<string, any>(), timers = new Map<number, () => void>();
  let timerId = 0, release!: (p: any) => void;
  const list = [{ kind: 'film', free: true, eventLanguages: ['en'], priceMin: 0 }, { kind: 'gig', free: false, eventLanguages: [], priceMin: 20 }];
  const WA: any = { UI: { esc: (s: any) => String(s ?? '') }, Icon: () => '', Picto: { kind: () => '' },
    R: { previousVisit: () => null, live: () => list, real: () => true, matches: (_: any, word: string) => word === 'jazz', areaOf: (v: any) => v.area || '', AREA_LIST: ['Kalamaja','Old Town'], isFree: (e: any) => e.free,
      kindLabel: (s: string) => s, dayName: () => '', dateShort: (s:string) => s, dow: () => '', dom: () => '', isFollowed: () => false,
      openState: (v: any) => ({ open: v.open }) },
    when: { matches: () => true, isOnDate: () => true, todayKey: () => '2026-09-30', keyPlus: () => '2026-10-02' },
    Geo: { currentLoc: () => null, bySoonestThenDistance: () => () => 0, byDateThenSoonest: () => () => 0, startMinutes: () => 22 * 60 },
    Hours: { cityNow: () => ({ minutes: 12 * 60 }) }, Seen: { count: () => 0, filter: (rows: any[]) => rows }, venues,
  };
  WA.Discovery = { matchesDate: (e: any, s: any) => s.date ? WA.when.isOnDate(e, s.date) : WA.when.matches(e, s.when),
    validDate: (s:any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s };
  const location = { search, pathname: '/discover' };
  const context = createContext({ window: { WA, addEventListener: () => {} }, location,
    history: { replaceState: (_: any, __: any, url: string) => { location.search = url.startsWith('?') ? url : ''; } }, URLSearchParams, AbortController,
    requestAnimationFrame: () => 1, getComputedStyle: () => ({ position: 'static' }),
    setTimeout: (cb: () => void) => { timers.set(++timerId, cb); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    document: { readyState: 'loading', activeElement: null, documentElement: { style: { setProperty: () => {} } }, addEventListener: (n: string, cb: any) => listeners.set(n, cb),
      getElementById: (id: string) => { if (!elements.has(id)) elements.set(id, { style: {}, value: '', focus:() => {}, blur:() => {} }); return elements.get(id); } },
  });
  runInContext(source('ask.js'), context);
  WA.Ask.remote = () => new Promise(r => { release = r; });
  runInContext(source('search-data.js'), context);
  runInContext(source('programme.js'), context);
  const query = (q: string) => { context.document.getElementById('q').value = q; listeners.get('input')({ target: { id: 'q', value: q } }); };
  const start = () => listeners.get('submit')({ target:{ id:'search-form' }, preventDefault:() => {} });
  const click = (selector: string, data: any = {}) => listeners.get('click')({ target: { closest: (s: string) => s.split(',').map(s => s.trim()).includes(selector) ? { dataset: data } : null } });
  return { query, start, click, finish: (p: any) => release({ ...WA.Ask.empty(), ...p }), elements, location };
}

test('manual full results filters keep the same results and selected state after reopening their URL', () => {
  for (const toggle of ['free', 'english', 'hideSeen', 'followed']) {
    const p = programme(); p.query(''); p.click('[data-toggle]', { toggle });
    assert.ok(p.location.search, `${toggle} must have a shareable URL`);
    const fresh = programme(p.location.search); fresh.query('');
    assert.equal(fresh.elements.get('summary').innerHTML, p.elements.get('summary').innerHTML, toggle);
    assert.equal(fresh.elements.get('filter-count').textContent, '1', toggle);
    assert.equal(fresh.location.search, p.location.search, toggle);
  }
  const p = programme('?free=1&english=1&doors=21%3A00&price=20'); p.query('');
  assert.equal(p.elements.get('filter-count').textContent, '4');
  assert.match(p.elements.get('quick').innerHTML, /Remove Free/);
  assert.match(p.elements.get('quick').innerHTML, /Remove In English/);
  assert.match(p.elements.get('quick').innerHTML, /Up to €20/);
  const fresh = programme(p.location.search); fresh.query('');
  assert.equal(fresh.location.search, p.location.search);
});

test('malformed price and start-time URL filters are ignored', () => {
  for (const search of ['?price=-1&doors=25%3A00', '?price=Infinity', '?price=2000', '?price=abc']) {
    const p = programme(search); p.query('');
    assert.equal(p.elements.get('filter-count').textContent, '');
    assert.equal(p.location.search, '');
  }
});

test('impossible shared calendar dates never become full results selections', () => {
  for (const search of ['?date=2027-02-30', '?date=2026-13-01&to=2026-10-08']) {
    const p = programme(search); p.query('');
    assert.equal(p.elements.get('filter-count').textContent, '');
    assert.equal(p.location.search, '');
  }
  const valid = programme('?date=2026-10-08&to=2026-02-30'); valid.query('');
  assert.match(valid.location.search, /date=2026-10-08/);
  assert.doesNotMatch(valid.location.search, /to=/);
});

test('open-now shop searches exclude shut and unknown hours, including empty results', () => {
  const shops = [{ id: 'open', name: 'Open Books', kind: 'bookshop', open: true },
    { id: 'shut', name: 'Shut Books', kind: 'bookshop', open: false },
    { id: 'unknown', name: 'Unknown Books', kind: 'bookshop', open: null }];
  const p = programme('', shops); p.query('bookshops open now');
  assert.match(p.elements.get('summary').innerHTML, /1 place<\/strong>/);
  assert.doesNotMatch(p.elements.get('summary').innerHTML, /0 listings/);
  assert.match(p.elements.get('quick').innerHTML, /Remove Open now/);
  assert.doesNotMatch(p.elements.get('quick').innerHTML, /data-kind/, 'only place refinements should appear');
  const none = programme('', shops.slice(1)); none.query('bookshops open now');
  assert.match(none.elements.get('summary').innerHTML, /0 places/);
  const named = programme('', shops); named.query('Open Books open now');
  assert.match(named.elements.get('summary').innerHTML, /1 place<\/strong>/);
});

test('oversized queries are capped before rendering and writing the URL', () => {
  const p = programme(); p.query('x'.repeat(2000));
  assert.equal(new URLSearchParams(p.location.search).get('q')?.length, 140);
  assert.equal(p.elements.get('q').value.length, 140);
  const fresh = programme('?q=' + 'x'.repeat(2000)); fresh.query('x'.repeat(2000));
  assert.equal(new URLSearchParams(fresh.location.search).get('q')?.length, 140);
});

test('an in-flight model cannot undo Search the words or later manual filters', async () => {
  for (const selector of ['[data-act]', '[data-kind]']) {
    const p = programme(); p.query('something beautifully calm'); p.start();
    p.click(selector, selector === '[data-act]' ? { act: 'undo-read' } : { kind: 'film' });
    const before = p.elements.get('summary').innerHTML;
    p.finish({ kinds: ['gig'], note: 'Unwanted late answer' }); await tick();
    assert.equal(p.elements.get('summary').innerHTML, before);
    assert.doesNotMatch(p.elements.get('ask-note').innerHTML, /Unwanted/);
  }
});

test('model interpretation retains locally understood day, kind, free, language and price constraints', async () => {
  const p = programme(); p.query('free film tonight in English under 10 quiet'); p.start();
  p.finish({ when: 'tomorrow', day: '2026-10-02', kinds: ['gig'], maxPrice: 99, note: 'Paid gigs Friday' }); await tick();
  assert.match(p.elements.get('summary').innerHTML, /1 listing/);
  assert.match(p.elements.get('quick').innerHTML, /Remove Today/);
  assert.match(p.elements.get('quick').innerHTML, /Remove film/i);
  assert.match(p.elements.get('quick').innerHTML, /Remove Free/);
  assert.match(p.elements.get('quick').innerHTML, /Remove In English/);
  assert.match(p.elements.get('quick').innerHTML, /Up to €10/);
  assert.doesNotMatch(p.elements.get('ask-note').innerHTML, /Paid gigs Friday/);
});

test('changing away and back to the same text does not revive an obsolete model request', async () => {
  const p = programme(); p.query('something beautifully calm'); p.start();
  p.query('different words'); p.query('something beautifully calm');
  const before = p.elements.get('summary').innerHTML;
  p.finish({ kinds: ['gig'] }); await tick();
  assert.equal(p.elements.get('summary').innerHTML, before);
});

test('mandatory model place words cannot be relaxed into an OR search to manufacture results', async () => {
  const p = programme(); p.query('something beautifully calm'); p.start();
  p.finish({ must: ['kalamaja'], any: ['jazz'], note: 'In Kalamaja' }); await tick();
  assert.match(p.elements.get('summary').innerHTML, /0 listings/);
});

test('primary domain redirects work on Function routes and preserve query strings without looping', async () => {
  const context = createContext({ Request, Response, URL });
  runInContext(source('functions/_middleware.js').replace('export async function', 'async function'), context);
  for (const host of ['www.wanderalt.app', 'wanderalt.com', 'www.wanderalt.com']) {
    const r = await context.onRequest({ request: new Request(`https://${host}/detail?id=a%26b`), next: () => { throw new Error('Must redirect before serving'); } });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), 'https://wanderalt.app/detail?id=a%26b');
  }
  const r = await context.onRequest({ request: new Request('https://wanderalt.app/discover?q=jazz'), next: async () => new Response('asset') });
  assert.equal(r.status, 200); assert.equal(await r.text(), 'asset');
});

test('the model may say a search wants places or an evening, and only known kinds of place survive', async () => {
  const a = api();
  a.output({ intent: 'places', when: '', day: '', kinds: [], placeKinds: ['record store', 'casino', 'bar', 'bar'], free: false, english: false, openNow: 'yes', maxPrice: 0, must: [], any: ['vinyl'], note: 'Record shops' });
  const j = await (await a.request()).json();
  assert.equal(j.intent, 'places');
  assert.deepEqual(Array.from(j.placeKinds), ['record store', 'bar']);
  assert.equal(j.openNow, false);                        // only a real boolean counts
  a.output({ intent: 'party', kinds: [], placeKinds: 'bar', must: [], any: [] });
  const k = await (await a.request('2026-09-30', {}, 'another+question')).json();
  assert.equal(k.intent, 'listings');                    // an unknown intent is plain listings
  assert.deepEqual(Array.from(k.placeKinds), []);
  assert.equal(a.calls[0].response_format.json_schema.properties.intent.enum.length, 3);
});

test('fresh questions are capped a day when a KV namespace is bound, and a cached answer costs nothing', async () => {
  const a = api();
  const kv = new Map<string, string>();
  const env = { ASK_KV: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v); } }, ASK_DAILY_CAP: '2' };
  assert.equal((await a.request('2026-09-30', env, 'one+question')).status, 200);
  assert.equal((await a.request('2026-09-30', env, 'two+question')).status, 200);
  assert.equal((await a.request('2026-09-30', env, 'three+question')).status, 429);      // over the cap
  assert.equal((await a.request('2026-09-30', env, 'one+question')).status, 200);        // answered from the cache
  assert.equal(a.calls.length, 2);
  assert.equal([...kv.values()][0], '2');
});

test('place controls change the actual result set and an open-now override survives reopening', () => {
  const shops=[{id:'open',name:'Open Books',kind:'bookshop',open:true},{id:'shut',name:'Shut Books',kind:'bookshop',open:false}];
  const p=programme('',shops); p.query('bookshops open now');
  assert.equal(p.elements.get('prog-title').textContent,'Places'); assert.equal(p.elements.get('to-map').hidden,false);
  p.click('[data-place-open]');
  assert.match(p.elements.get('summary').innerHTML,/2 places/);
  assert.equal(new URLSearchParams(p.location.search).get('open'),'0');
  const reopened=programme(p.location.search,shops); reopened.query('bookshops open now');
  assert.match(reopened.elements.get('summary').innerHTML,/2 places/);
  reopened.click('[data-area]',{area:'No matches'});
  assert.match(reopened.elements.get('summary').innerHTML,/0 places/);
  reopened.click('[data-act]',{act:'clear-place-filters'});
  assert.match(reopened.elements.get('summary').innerHTML,/2 places/);
  reopened.query(''); assert.equal(reopened.elements.get('prog-title').textContent,'All events'); assert.equal(reopened.elements.get('to-map').hidden,false);
});

test('a named open-now search never includes closed places; open now alone offers all open places', () => {
  const venues=[{id:'r',name:'Raamatukoi',kind:'bookshop',open:false},{id:'v',name:'Vinyl',kind:'record store',open:true}];
  const p=programme('',venues); p.query('Raamatukoi open now'); assert.match(p.elements.get('summary').innerHTML,/0 places/);
  p.query('open now'); assert.match(p.elements.get('summary').innerHTML,/1 place<\/strong>/);
});

test('an explicit Anywhere override survives a query naming an area', () => {
  const venues=[{id:'k',name:'Books K',kind:'bookshop',area:'Kalamaja',open:true},{id:'o',name:'Books O',kind:'bookshop',area:'Old Town',open:true}];
  const p=programme('',venues); p.query('bookshops in Kalamaja'); assert.match(p.elements.get('summary').innerHTML,/1 place<\/strong>/);
  p.click('[data-area]',{area:''}); assert.match(p.elements.get('summary').innerHTML,/2 places/);
  const url=p.location.search; assert.equal(new URLSearchParams(url).get('area'),'any');
  const reopened=programme(url,venues); reopened.query('bookshops in Kalamaja'); assert.match(reopened.elements.get('summary').innerHTML,/2 places/);
});
