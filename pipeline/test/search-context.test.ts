import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Real readers and predicates, shared by preview, full results and Map.
function search() {
  const now = Date.parse('2026-10-06T12:00:00Z');
  class Clock extends Date { constructor(value?: any) { super(value === undefined ? now : value); } static now() { return now; } }
  const store = new Map<string,string>();
  const storage = { getItem:(k:string) => store.get(k) || null, setItem:(k:string,v:string) => store.set(k,v), removeItem:(k:string) => store.delete(k) };
  const WA:any = { CITY:'tallinn', MOOD_RULES:{},
    Geo:{ currentLoc:() => null, distanceTo:(e:any) => e.distance ?? null, parseWithin:(x:any) => Number(x) || 0,
      withinFilter:(rows:any[],max:number) => rows.filter(e => e.distance != null && e.distance <= max),
      bySoonestThenDistance:() => (a:any,b:any) => String(a.startsAt).localeCompare(String(b.startsAt)), byDateThenSoonest:() => (a:any,b:any) => String(a.startsAt).localeCompare(String(b.startsAt)), startMinutes:() => 18 * 60 },
    Hours:{ cityNow:() => ({minutes:15 * 60}), state:(v:any) => ({open:v?.open,known:v?.open != null}) },
    Icon:() => '', Picto:{kind:() => ''}, Seen:{filter:(rows:any[]) => rows,count:() => 0},
  };
  const context = createContext({ window:{WA,addEventListener:() => {}}, Date:Clock, Intl, URL, URLSearchParams, localStorage:storage, sessionStorage:storage,
    location:{search:'',pathname:'/discover.html'}, addEventListener:() => {}, CustomEvent:class { constructor(_type:string) {} },
    document:{readyState:'loading',body:{dataset:{page:'programme'}},addEventListener:() => {},dispatchEvent:() => {}},
  });
  for (const file of ['ui-helpers.js','when.js','render.js','ask.js','moods.js','discovery-state.js','search-data.js']) {
    runInContext(readFileSync(new URL(`../../${file}`,import.meta.url),'utf8'),context);
  }
  WA.catalog = [
    {id:'jazz',title:'Jazz at Terminal',kind:'gig',tags:['jazz'],venue:'Terminal',neighborhood:'Kalamaja',startsAt:'2026-10-07T16:00:00Z',hasTime:true,priceMin:15,eventLanguages:['en'],distance:800,lat:59.44,lng:24.74},
    {id:'unknown',title:'Jazz improvisation',kind:'gig',tags:['jazz'],neighborhood:'Old Town',startsAt:'2026-10-07T17:00:00Z',hasTime:true,priceMin:null,eventLanguages:[],distance:null},
    {id:'film',title:'Free arthouse film',kind:'film',startsAt:'2026-10-06T17:00:00Z',hasTime:true,priceMin:0,eventLanguages:['en'],distance:900,lat:59.44,lng:24.75},
    {id:'workshop',title:'Printing workshop',kind:'workshop',startsAt:'2027-03-12T17:00:00Z',hasTime:true,priceMin:30},
    {id:'comedy',title:'Stand-up night',kind:'theatre',tags:['standup'],startsAt:'2026-10-09T17:00:00Z',hasTime:true,priceMin:12},
  ];
  WA.venues = [{id:'terminal',name:'Terminal',kind:'record store',open:true,picked:true,distance:800},
    {id:'open',name:'Open Books',kind:'bookshop',open:true,distance:500},
    {id:'closed',name:'Closed Books',kind:'bookshop',open:false,distance:600},
    {id:'unknown',name:'Unknown Books',kind:'bookshop',open:null,distance:700}];
  for (const v of WA.venues) v.openingHours={open:v.open};
  const create = (params = '') => WA.SearchData.create(params);
  const ids = (rows:any[]) => Array.from(rows,(e:any) => e.id);
  const reopen = (engine:any) => { const e=create(engine.params().toString()); e.query(e.state.q); return e; };
  return {WA,create,ids,reopen};
}

test('global search starts with all dates and does not inherit Now mood or ticket cap', () => {
  const p=search(); p.WA.Discovery.setDates({when:'tomorrow'}); p.WA.Moods.setPref({moods:['look'],subs:['film'],cap:0});
  const e=p.create(); e.query('');
  assert.deepEqual(p.ids(e.events()),['film','jazz','unknown','comedy','workshop']);
  assert.equal(e.state.taste,null); assert.equal(e.state.maxPrice,null);
  assert.equal(p.WA.Discovery.dates().when,'tomorrow');
});

test('named places return separate event and place groups with the same matches after reopening', () => {
  const p=search(), e=p.create(); e.query('Terminal');
  assert.deepEqual(p.ids(e.events()),['jazz']); assert.deepEqual(p.ids(e.places()),['terminal']);
  const map=p.reopen(e); assert.deepEqual(p.ids(map.events()),p.ids(e.events())); assert.deepEqual(p.ids(map.places()),p.ids(e.places()));
});

test('English, Estonian, Russian and Ukrainian jazz queries use the same local dates and facts', () => {
  const p=search();
  for (const q of ['jazz tomorrow','jazz homme','джаз завтра']) {
    const e=p.create(); e.query(q); assert.deepEqual(p.ids(e.events()),['jazz','unknown'],q);
    assert.equal(e.state.when,'tomorrow');
  }
});

test('clearing a shared query removes its automatic day, kind and budget', () => {
  const p=search(), e=p.create(); e.query('jazz tomorrow under 20');
  const reopened=p.reopen(e); reopened.query('');
  assert.equal(reopened.state.when,'all'); assert.equal(reopened.state.kinds.size,0); assert.equal(reopened.state.maxPrice,null);
  assert.equal(reopened.events().length,5);
});

test('manual day, kind and price overrides survive refresh and the Map round trip', () => {
  const p=search(), e=p.create(); e.query('jazz tomorrow under 20');
  e.state.when='all'; e.state.day='2026-10-07'; e.override('when');
  e.state.kinds.clear(); e.override('kind'); e.state.maxPrice=null; e.override('price');
  const returned=p.reopen(e);
  assert.equal(returned.state.day,'2026-10-07'); assert.equal(returned.state.kinds.size,0); assert.equal(returned.state.maxPrice,null);
  assert.deepEqual(p.ids(returned.events()),p.ids(e.events()));
  returned.query(''); assert.equal(returned.state.day,'2026-10-07');
});

test('price caps retain unknown prices; free, English and distance require known matching facts', () => {
  const p=search(), e=p.create(); e.query('jazz tomorrow under 20');
  assert.deepEqual(p.ids(e.events()),['jazz','unknown']);
  e.state.english=true; e.override('english'); assert.deepEqual(p.ids(e.events()),['jazz']);
  e.state.english=false; e.state.within=1000; assert.deepEqual(p.ids(e.events()),['jazz']);
  e.state.within=0; e.state.free=true; e.override('free'); assert.deepEqual(p.ids(e.events()),[]);
});

test('open-now place results omit closed and unknown hours, with an explicit override preserved', () => {
  const p=search(), e=p.create(); e.query('bookshops open now');
  assert.deepEqual(p.ids(e.places()),['open']); assert.deepEqual(p.ids(e.events()),[]);
  e.state.placeOpen=false; assert.equal(p.reopen(e).places().length,3);
});

test('future workshops and tag-based comedy are reachable independently of today', () => {
  const p=search(), e=p.create('?cat=workshop'); e.query(''); assert.deepEqual(p.ids(e.events()),['workshop']);
  e.state.kinds=new Set(['comedy']); assert.deepEqual(p.ids(e.events()),['comedy']);
});

test('typing stays local; a submitted model reading remains identical after reopening and can be undone', async () => {
  const p=search(), e=p.create(); let calls=0;
  p.WA.Ask.remote=async () => { calls++; return {...p.WA.Ask.empty(),must:['terminal'],any:['jazz'],kinds:['gig']}; };
  e.query('calm jazz tomorrow'); e.query('calm jazz tomorrow'); assert.equal(calls,0);
  await e.enhance(); assert.equal(calls,1); assert.deepEqual(p.ids(e.events()),['jazz']);
  const returned=p.reopen(e); assert.deepEqual(p.ids(returned.events()),['jazz']);
  returned.undo(); assert.equal(returned.state.when,'all'); assert.equal(returned.state.kinds.size,0);
  const literal=p.reopen(returned); assert.equal(literal.state.read,null); assert.equal(literal.state.when,'all');
});

test('invalid external readings are ignored without injecting structure into the engine', () => {
  const p=search();
  const hostile=p.create('?q=Terminal&time=__proto__&doors=constructor&override=__proto__,toString'); hostile.query('Terminal');
  assert.equal(hostile.state.when,'all'); assert.equal(hostile.state.doors,'any'); assert.equal(hostile.state.overrides.size,0);
  assert.deepEqual(p.ids(hostile.events()),['jazz']);
  for (const value of ['{"__proto__":{"polluted":true}}','[{},[],[],true,null]','[[],[],[],true,{"when":"hacked"}]']) {
    const e=p.create('?q=Terminal&reading='+encodeURIComponent(value)); e.query('Terminal');
    assert.equal(e.state.model,null); assert.deepEqual(p.ids(e.events()),['jazz']);
  }
});
