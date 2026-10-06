import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Page lifetimes share storage, not JS closures. Real calendar/mood/render code.
function page(store = new Map<string, string>(), search = '', blocked = false) {
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
    Hours: { cityNow: () => ({ minutes: 15 * 60 }), clock: () => '18:00' },
    Icon: Object.assign(() => '', { kind: () => '' }), Picto: { kind: () => '<svg></svg>' },
  };
  const location = { search, pathname: '/index.html', hash: '#list', origin: 'https://wanderalt.app' };
  let written = '';
  const window = { WA, addEventListener: on };
  const context = createContext({ window, Date: Clock, Intl, URL, URLSearchParams, location,
    history: { replaceState: (_: unknown, __: string, value: string) => { written = value; } },
    document: { readyState: 'loading', addEventListener: on, dispatchEvent: (e: { type: string }) => fire(e.type) },
    addEventListener: on, localStorage: storage, sessionStorage: storage,
    CustomEvent: class { type: string; constructor(type: string) { this.type = type; } },
  });
  for (const file of ['ui-helpers.js', 'when.js', 'render.js', 'moods.js', 'discovery-state.js']) {
    runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context);
  }
  return { WA, store, fire, location, url: () => written, clock: (value: string) => { now = Date.parse(value); } };
}

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
});

test('date ranges include overlapping runs and overnight shows, with inclusive date-only ends and DST', () => {
  const p = page(), D = p.WA.Discovery;
  const single = { date:'2026-10-09' };
  assert.equal(D.matchesDate({ startsAt:'2026-10-08T20:00:00Z', endsAt:'2026-10-08T23:30:00Z' }, single), true);
  // 21:00Z is midnight in Tallinn before the clock change.
  assert.equal(D.matchesDate({ startsAt:'2026-10-08T18:00:00Z', endsAt:'2026-10-08T21:00:00Z' }, single), false);
  assert.equal(D.matchesDate({ startsAt:'2026-10-01T00:00:00Z', endsAt:'2026-10-09T00:00:00Z' }, single), true);
  assert.equal(D.matchesDate({ startsAt:'2026-10-07T09:00:00Z', endsAt:'2026-10-12T09:00:00Z' }, { date:'2026-10-08', to:'2026-10-10' }), true);
  assert.equal(D.matchesDate({ startsAt:'2026-10-11T09:00:00Z' }, { date:'2026-10-08', to:'2026-10-10' }), false);
  p.clock('2026-10-24T20:00:00Z');
  assert.equal(Array.from(D.range({ when:'tomorrow' })).join(','), '2026-10-25,2026-10-25');
  assert.equal(D.matchesDate({ startsAt:'2026-10-25T21:30:00Z' }, { when:'tomorrow' }), true);
  assert.equal(D.matchesDate({ startsAt:'2026-10-25T22:00:00Z' }, { when:'tomorrow' }), false);
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
  assert.equal(D.matchesPlace({ kind:'cinema' }), true);
  const q = D.params();
  assert.equal(q.get('moods'), 'look'); assert.equal(q.get('subs'), 'film'); assert.equal(q.get('price'), '0');
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
