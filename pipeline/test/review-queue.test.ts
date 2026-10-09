import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// review.js is a browser script: give it just enough of a page to define its helpers.
function queue() {
  const WA: any = { UI: { esc: (s: unknown) => String(s ?? ''), safeUrl: (u: string) => u }, Lang: { locale: () => 'en-GB', t: (s: string) => s } };
  const context = createContext({ window: { WA }, document: { addEventListener() {}, getElementById: () => null }, sessionStorage: { getItem: () => null } });
  runInContext(readFileSync(new URL('../../review.js', import.meta.url), 'utf8'), context);
  return WA.ReviewQueue;
}

test('the review queue groups held listings by why they wait, rules first', () => {
  const { reasonOf } = queue();
  assert.equal(reasonOf('rule: wellness (helirännak)').label, 'Wellness and spiritual');
  assert.equal(reasonOf('rule: restaurant venue (restoran)').label, 'At a restaurant');
  assert.equal(reasonOf('manual review: date and time read from Instagram poster').key, 'poster');
  assert.equal(reasonOf('borderline fit 0.45').key, 'borderline');
  assert.equal(reasonOf('trusted source, low fit 0.31').key, 'trusted-low');
  assert.equal(reasonOf(null).key, 'other');
  assert.ok(reasonOf('rule: mainstream (candlelight)').order < reasonOf('borderline fit 0.5').order);
});

test('one show on several dates is one decision; different venues stay apart', () => {
  const { groupsOf } = queue();
  const row = (id: string, title: string, venue: string, note: string) => ({ id, title, title_en: null, venue_name: venue, status_note: note, starts_at: '2026-10-10T16:00:00Z' });
  const groups = groupsOf([
    row('a', 'Sound Bath with Crystals', 'Üks Maja', 'rule: wellness (sound bath)'),
    row('b', 'Sound bath with crystals!', 'Üks Maja', 'rule: wellness (sound bath)'),
    row('c', 'Sound Bath with Crystals', 'Another Studio', 'rule: wellness (sound bath)'),
    row('d', 'Nocturne', 'Kanuti Gildi SAAL', 'borderline fit 0.5'),
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(groups.map((g: any) => g.key))), ['rule:wellness', 'borderline']);
  const shows = [...groups[0].shows.values()].map((l: any) => l.map((e: any) => e.id));
  assert.deepEqual(JSON.parse(JSON.stringify(shows)), [['a', 'b'], ['c']]);
});
