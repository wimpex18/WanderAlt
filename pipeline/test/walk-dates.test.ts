import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';
function world(now = '2026-10-04T08:00:00Z', hours = '24/7') {
  class Clock extends Date { constructor(value?: string | number) { super(value ?? now); } static now() { return Date.parse(now); } }
  const places = ['books','vinyl'].map((id, i) => ({id, name: id, kind: i ? 'record store' : 'bookshop', openingHours: hours, lat:59.44, lng:24.74, picked:true}));
  const event = {id:'gig', title:'Gig', kind:'gig', startsAt:'2026-10-05T16:00:00Z', lat:59.44, lng:24.74};
  const WA: any = {UI:{esc:(x: any) => String(x)}, Icon:()=>'', catalog:[event], _venuesAll:places, Geo:{
    currentLoc:()=>null, coordsFor:(x: any)=>x, distanceTo:()=>0, walkMinutes:()=>0, format:()=>'', startMinutes:()=>19*60},
    R:{kindLabel:(x: any)=>x, areaOf:()=>'', isFree:()=>false, isOff:()=>false},
  };
  const ctx = createContext({window:{WA}, Date:Clock, Intl});
  for (const file of ['when.js','hours.js','route.js']) runInContext(readFileSync(new URL(`../../${file}`,import.meta.url),'utf8'), ctx);
  return WA;
}
test('a tomorrow walk keeps its day and hours in its link and on a later device', () => {
  const a = world(); const walk = a.Route.fromURL('place:books:720,place:vinyl:760', '2026-10-05');
  assert.equal(walk.day,'2026-10-05'); assert.equal(walk.off,1);
  const q = new URL(a.Route.href(walk),'https://fixture').searchParams;
  const b = world('2026-10-05T06:00:00Z');
  const reopened = b.Route.fromURL(q.get('s'),q.get('d'));
  assert.equal(reopened.day,'2026-10-05'); assert.equal(reopened.stops[0].minute,720); assert.equal(reopened.off,0);
  assert.match(a.Route.card(walk), /d=2026-10-05/);
});
test('expired dates, impossible dates, duplicate stops and times out of order are refused', () => {
  const {Route} = world();
  for (const d of ['2026-10-03','2026-02-30','2026-10-50','tomorrow','2026-10-05<script>','2027-10-04',''])
    assert.equal(Route.fromURL('place:books:720,place:vinyl:760', d),null,d);
  for (const s of ['place:books:720,place:books:760','place:books:760,place:vinyl:720','place:books:9999,place:vinyl:9999'])
    assert.equal(Route.fromURL(s,'2026-10-05'),null,s);
  assert.equal(Route.fromURL('place:books:600,place:vinyl:620','2026-10-04'),null,'already started');
});
test('event links require their actual day; older event links recover it and cancelled shows are refused', () => {
  const a=world(); const s='place:books:1080,event:gig:1140';
  assert.equal(a.Route.fromURL(s,'2026-10-04'),null);
  assert.equal(a.Route.fromURL(s,null).day,'2026-10-05');
  a.R.isOff=()=>true; assert.equal(a.Route.fromURL(s,'2026-10-05'),null);
});
test('arrival hours use the Tallinn date and clock across autumn DST and after midnight', () => {
  const a=world('2026-10-24T09:00:00Z','Su 10:00-11:00');
  assert.ok(a.Route.fromURL('place:books:600,place:vinyl:610','2026-10-25'));
  assert.equal(a.Route.fromURL('place:books:600,place:vinyl:610','2026-10-24'),null);
  const b=world('2026-10-04T08:00:00Z','Mo 00:00-02:00');
  assert.ok(b.Route.fromURL('place:books:1450,place:vinyl:1480','2026-10-04'));
});
