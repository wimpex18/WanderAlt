import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushChanges, pushTonight, tonightEvents, composeChanges, composeWeekly, matchesFollow, unsubscribeUrl, weeklyEvents, type EventRow } from '../digest-core.ts';

const now = new Date('2026-10-01T12:00:00Z');
const ev = (o: Partial<EventRow>): EventRow => ({ id: 'ev_1', title: 'Night', venue: 'Kino Sõprus', venue_id: 'tallinn-kino-soprus',
  handle: '@kino', starts_at: '2026-10-03T16:00:00Z', time: '19:00', flag: null, ...o });

test('follows match by place id or source handle, never by a venue name', () => {
  const f = new Set(['place:tallinn-a', 'src:kino']);
  assert.equal(matchesFollow(f, { venue_id: 'tallinn-a', handle: null }), true);
  assert.equal(matchesFollow(f, { venue_id: 'tallinn-b', handle: '@Kino' }), true);
  assert.equal(matchesFollow(f, { venue_id: 'tallinn-b', handle: '@other' }), false);
  assert.equal(matchesFollow(new Set(['place:Same Name']), { venue_id: null, handle: null }), false);
});

test('the weekly list is the next seven days at followed places, soonest first, without cancelled events', () => {
  const f = new Set(['place:tallinn-kino-soprus']);
  const list = weeklyEvents(f, [
    ev({ id: 'late', starts_at: '2026-10-05T16:00:00Z' }),
    ev({ id: 'soon', starts_at: '2026-10-02T16:00:00Z' }),
    ev({ id: 'past', starts_at: '2026-09-30T16:00:00Z' }),
    ev({ id: 'far', starts_at: '2026-10-09T16:00:00Z' }),
    ev({ id: 'off', flag: 'cancelled' }),
    ev({ id: 'elsewhere', venue_id: 'tallinn-x', handle: '@x' }),
  ], now);
  assert.deepEqual(list.map(e => e.id), ['soon', 'late']);
});

test('nothing to say means no mail', () => {
  assert.equal(composeWeekly([], 'tok'), null);
  assert.equal(composeChanges([], 'tok'), null);
});

test('every mail carries the one-click unsubscribe and escapes listing text', () => {
  const token = '0a1b2c3d-0000-4000-8000-000000000000';
  const m = composeWeekly([ev({ title: '<img src=x onerror=alert(1)> & Co' })], token)!;
  assert.match(m.subject, /^1 thing this week/);
  assert.ok(m.text.includes(unsubscribeUrl(token)) && m.html.includes(unsubscribeUrl(token)));
  assert.ok(!m.html.includes('<img'));
  assert.match(m.html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; Co/);
  const c = composeChanges([ev({ flag: 'postponed' })], token)!;
  assert.match(c.text, /Postponed/); assert.match(c.subject, /has changed/);
});

test('a saved search follow matches by kind, free entry and language, the way follow.js reads it', () => {
  const f = new Set(['search:kind=club,gig&free=1']);
  assert.equal(matchesFollow(f, ev({ kind: 'gig', is_free: true })), true);
  assert.equal(matchesFollow(f, ev({ kind: 'gig', is_free: false, price_min: 0 })), true);
  assert.equal(matchesFollow(f, ev({ kind: 'gig', is_free: false, price_min: 10 })), false);
  assert.equal(matchesFollow(f, ev({ kind: 'film', is_free: true })), false);
  assert.equal(matchesFollow(new Set(['search:english=1']), ev({ event_languages: ['en', 'et'] })), true);
  assert.equal(matchesFollow(new Set(['search:']), ev({ kind: 'gig' })), false);   // an empty search never matches everything
});

test('push notes: one change names the event, several are counted; tonight lists only what starts before midnight', () => {
  assert.equal(pushChanges([]), null); assert.equal(pushTonight([]), null);
  const one = pushChanges([ev({ id: 'ev_9', title: 'Gig', flag: 'cancelled' })])!;
  assert.equal(one.title, 'Cancelled: Gig'); assert.equal(one.url, '/detail.html?id=ev_9');
  assert.match(pushChanges([ev({ flag: 'postponed' }), ev({ id: 'b', flag: 'postponed' })])!.title, /^2 of your events/);
  const f = new Set(['place:tallinn-kino-soprus']);
  const list = tonightEvents(f, [ev({ id: 'a', starts_at: '2026-10-01T16:00:00Z' }), ev({ id: 'b', starts_at: '2026-10-02T16:00:00Z' })],
    now, new Date('2026-10-01T20:59:59Z'));
  assert.deepEqual(list.map(e => e.id), ['a']);
  assert.match(pushTonight(list)!.title, /^Tonight: /);
});
