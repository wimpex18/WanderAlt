import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillHours, dueForHours } from '../hours-sources.ts';
import { facebookPage, hoursFromGraph } from '../facebook-hours.ts';
import type { Place } from '../places.ts';

const cfg = { token: 't', businessId: 'b' };
const place = (o: Partial<Place>): Place => ({ id: 'tallinn-x', city: 'tallinn', name: 'X', aliases: [], kind: 'bar', ...o } as Place);
const quiet = { log: () => {} };

test('a place gets hours from its site first and says so', async () => {
  const p = place({ website: 'https://x.ee', instagram: 'https://www.instagram.com/x' });
  let asked = 0;
  const html = async () => '<script type="application/ld+json">{"openingHours":["Mo-Fr 10:00-18:00"]}</script>';
  await fillHours([p], cfg, 30, { ...quiet, html, bio: async () => { asked++; return { kind: 'none', reason: 'x' }; } });
  assert.equal(p.opening_hours, 'Mo-Fr 10:00-18:00'); assert.equal(p.hours_source, 'site'); assert.equal(asked, 0);
});

test('falls through to Facebook, then to the Instagram bio', async () => {
  const fbOnly = place({ id: 'a', facebook: 'https://www.facebook.com/venuea' });
  const igOnly = place({ id: 'b', facebook: 'https://www.facebook.com/venueb', instagram: 'https://www.instagram.com/venueb' });
  const fb = async (page: string) => page === 'venuea' ? { kind: 'found' as const, hours: 'Tu-Sa 12:00-20:00' } : { kind: 'none' as const, reason: 'no hours' };
  const bio = async () => ({ kind: 'found' as const, username: 'venueb', biography: 'Records\nWed-Sun 14-19' });
  await fillHours([fbOnly, igOnly], cfg, 30, { ...quiet, facebook: fb, bio });
  assert.deepEqual([fbOnly.hours_source, fbOnly.opening_hours], ['facebook', 'Tu-Sa 12:00-20:00']);
  assert.deepEqual([igOnly.hours_source, igOnly.opening_hours], ['instagram', 'We,Th,Fr,Sa,Su 14:00-19:00']);
});

test('a refused token ends that source for the run; places are still marked as looked at', async () => {
  const ps = [place({ id: 'a', facebook: 'https://www.facebook.com/venuea' }), place({ id: 'b', facebook: 'https://www.facebook.com/venueb' })];
  let calls = 0;
  await fillHours(ps, cfg, 30, { ...quiet, facebook: async () => { calls++; return { kind: 'stop', reason: 'code 10' }; } });
  assert.equal(calls, 1);
  assert.ok(ps.every(p => p.hours_checked_at && !p.opening_hours));
});

test('without Meta secrets only the site is tried', async () => {
  const p = place({ instagram: 'https://www.instagram.com/x' });
  await fillHours([p], null, 30, { ...quiet, bio: async () => { throw new Error('should not be called'); } });
  assert.ok(p.hours_checked_at); assert.equal(p.opening_hours, undefined);
});

test('due order: picked first, never one looked at in the last fortnight, none that already have hours', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const ps = [
    place({ id: 'plain', website: 'https://p.ee' }),
    place({ id: 'picked', website: 'https://q.ee', picked: true }),
    place({ id: 'recent', website: 'https://r.ee', picked: true, hours_checked_at: '2026-09-28T00:00:00Z' }),
    place({ id: 'old', website: 'https://s.ee', hours_checked_at: '2026-08-01T00:00:00Z' }),
    place({ id: 'has', website: 'https://t.ee', opening_hours: 'Mo 10:00-12:00' }),
    place({ id: 'nolinks' }),
  ];
  assert.deepEqual(dueForHours(ps, now).map(p => p.id), ['picked', 'plain', 'old']);
});

test('Facebook links and Graph hours', () => {
  assert.equal(facebookPage('https://www.facebook.com/tubakas'), 'tubakas');
  assert.equal(facebookPage('https://www.facebook.com/profile.php?id=123456'), '123456');
  assert.equal(facebookPage('https://www.facebook.com/events/123'), null);
  assert.equal(hoursFromGraph({ tue_1_open: '12:00', tue_1_close: '20:00', wed_1_open: '12:00', wed_1_close: '20:00', fri_1_open: '18:00', fri_1_close: '00:00' }), 'Tu,We 12:00-20:00; Fr 18:00-24:00');
  assert.equal(hoursFromGraph({}), null);
});
