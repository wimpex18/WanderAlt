import { test } from 'node:test';
import assert from 'node:assert/strict';
import { venueCoverage } from '../social-coverage.ts';
import { fillSourceLinks } from '../venue-source-facts.ts';
import type { Place } from '../places.ts';
import type { Source } from '../types.ts';

const place = (id: string, extra = {}) => ({ id, name: 'Heldeke!', city: 'tallinn', aliases: [], ...extra }) as Place;
test('coverage counts distinct profile identities and excludes merged or closed places', () => {
  const c = venueCoverage([place('a', { picked: true, instagram: 'https://instagram.com/venue/' }), place('b', { instagram: 'https://instagram.com/venue/' }), place('c', { picked: true }), place('d', { status: 'closed' }), place('e', { merged_into: 'a' })]);
  assert.equal(c.places, 3); assert.equal(c.instagram_handles, 1);
  assert.deepEqual(c.picked_without_instagram.map(p => p.id), ['c']);
});
test('source facts fill only an exact unmerged identity and preserve existing links', () => {
  const source: Source = { id: 'heldeke', kind: 'fienta', city: 'tallinn', url: 'https://fienta.com/', handle: '@heldeke_theatre.bar', label: 'Heldeke!', curated: true,
    config: { venue_id: 'a', venue_site: 'https://heldeke.ee/', venue_instagram: 'https://instagram.com/heldeke_theatre.bar/' } };
  const a = place('a', { website: 'https://heldeke.ee/checked' }), b = place('b');
  assert.deepEqual(fillSourceLinks([a, b], [source]), [a]);
  assert.equal(a.website, 'https://heldeke.ee/checked'); assert.equal(b.instagram, undefined);
  assert.deepEqual(fillSourceLinks([place('a', { merged_into: 'b' }), b], [source]), []);
  assert.deepEqual(fillSourceLinks([place('a'), b], [{ ...source, config: { venue_name: 'Heldeke!', venue_site: 'https://heldeke.ee/' } }]), []);
});
