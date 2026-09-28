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
    UI: { esc: (s: unknown) => String(s ?? ''), safeUrl: (s: string) => s },
  };
  const context = createContext({ window: { WA }, localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }, CustomEvent: class {}, document: { addEventListener: () => {}, dispatchEvent: () => {} } });
  const load = (file: string) => runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context);
  return { WA, values, redirects, load };
}

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

test('saved and going aliases collapse without rewriting raw ids; undo and unsaving remain possible', async () => {
  const p = page(); p.load('bookmark.js'); p.load('going.js'); p.load('lists.js');
  p.values.set('wanderalt:bookmarks:v1', JSON.stringify({ 'old-event': true, event: true, 'old-place': true }));
  p.values.set('wa:going:v1', JSON.stringify({ 'old-event': 1, event: 2 }));
  p.values.set('wa:lists:v1', JSON.stringify({ list: { id: 'list', items: ['old-event', 'event', 'old-place'] } }));
  assert.equal(p.WA.Lists.listsFor('event').length, 1);
  p.WA.Lists.removeItem('list', 'event');
  assert.deepEqual(Array.from(p.WA.Lists.items('list')), ['old-place']);
  assert.deepEqual(Array.from(p.WA.Bookmarks.ids()).sort(), ['event', 'place']);
  assert.deepEqual(Array.from(p.WA.Going.ids()), ['event']);
  assert.equal(p.WA.Going.has('old-event'), true);
  assert.equal(JSON.parse(p.values.get('wanderalt:bookmarks:v1')!)['old-event'], true);
  p.redirects.clear();
  assert.equal(p.WA.Bookmarks.ids().length, 3);
  assert.equal(p.WA.Going.ids().length, 2);
  p.redirects.set('old-event', 'event');
  p.WA.Bookmarks.set('event', false); await p.WA.Going.set('event', false);
  assert.equal(p.WA.Bookmarks.get().event, undefined);
  assert.equal(p.WA.Going.has('old-event'), false);
  assert.equal(JSON.parse(p.values.get('wanderalt:bookmarks:v1')!)['old-event'], undefined);
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
  assert.equal(p.WA.R.endClock({ endsAt: '2026-10-04T15:00:00Z' }), 'Sun 4 Oct · 18:00');
});
