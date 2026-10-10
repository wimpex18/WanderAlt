import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateDecision, pairDecision, withoutRoom, hallOf, NEAR, FAR } from '../place-checks.ts';
import { quoteIn, mentions, windowsAround, jsonLdLocations, plusCode, osmNamed, profileLinks, type Evidence } from '../place-evidence.ts';
import { cityProfile, inCity } from '../cities.ts';
import type { Place } from '../places.ts';

const tallinn = cityProfile('tallinn');
const linnahall = { lat: 59.4466, lng: 24.7536 };
const east = (m: number) => ({ lat: linnahall.lat, lng: linnahall.lng + m / (111_320 * Math.cos(linnahall.lat * Math.PI / 180)) });
const ev = (host: string, at: { lat: number; lng: number }, more: Partial<Evidence> = {}): Evidence => ({ source: 'page', host, ...at, ...more });
const place = (id: string, name: string, at?: { lat: number; lng: number }): Place => ({ id, city: 'tallinn', name, aliases: [], lat: at?.lat ?? null, lng: at?.lng ?? null });

test('a place is located only where two independent sources agree, and never against a third', () => {
  const two = locateDecision([ev('openstreetmap.org', linnahall, { source: 'osm' }), ev('fienta.com (organiser a1)', east(60))]);
  assert.equal(two.answer, 'located');
  if (two.answer) assert.equal(two.at.source, 'osm', 'coordinates come from the most exact agreeing source');

  // One organiser's many shows are one witness, however many pages repeat it.
  const one = locateDecision([ev('fienta.com (organiser a1)', linnahall), ev('fienta.com (organiser a1)', east(10))]);
  assert.equal(one.answer, null);

  // Two organisers on the same ticket shop are two witnesses.
  assert.equal(locateDecision([ev('fienta.com (organiser a1)', linnahall), ev('fienta.com (organiser b2)', east(40))]).answer, 'located');

  // Agreement too far apart is not agreement.
  assert.equal(locateDecision([ev('openstreetmap.org', linnahall, { source: 'osm' }), ev('fienta.com', east(NEAR + 50))]).answer, null);

  // A third source far away holds the answer back.
  const against = locateDecision([ev('openstreetmap.org', linnahall, { source: 'osm' }), ev('fienta.com', east(30)), ev('piletilevi.ee', east(FAR + 500))]);
  assert.equal(against.answer, null);
  if (!against.answer) assert.match(against.why, /disagree/);
});

test('OpenStreetMap alone locates a place only as the city\'s one venue with that exact name, unopposed', () => {
  assert.equal(locateDecision([ev('openstreetmap.org', linnahall, { source: 'osm', exact: true })]).answer, 'located');
  assert.equal(locateDecision([ev('openstreetmap.org', linnahall, { source: 'osm', exact: false })]).answer, null);
  assert.equal(locateDecision([ev('openstreetmap.org', linnahall, { source: 'osm', exact: true }), ev('fienta.com', east(2000))]).answer, null);
  assert.equal(locateDecision([]).answer, null);
});

test('two places are merged on one OpenStreetMap identity or a verified "same" with matching geography; a hall stays its own place', () => {
  const a = place('a', 'Klaassaal', linnahall), b = place('b', 'Tallinna Lauluväljak Klaassaal', east(30));
  const osm = (id: string) => ev('openstreetmap.org', linnahall, { source: 'osm', osm_id: id, exact: true });
  assert.equal(pairDecision(a, b, osm('way/1'), osm('way/1'), []).answer, 'merged');
  assert.equal(pairDecision(a, b, osm('way/1'), osm('way/2'), []).answer, 'separate');

  const said = (relation: Evidence['relation']) => [{ source: 'site' as const, host: 'venue.ee', relation, quote: 'Klaassaal is the Song Festival Grounds glass hall' }];
  assert.equal(pairDecision(a, b, null, null, said('same')).answer, 'merged');
  assert.equal(pairDecision(a, b, null, null, said('part')).answer, 'separate');
  assert.equal(pairDecision(a, b, null, null, said('other')).answer, 'separate');
  // "Same", but a kilometre apart: the sources contradict each other, so it waits.
  assert.equal(pairDecision(a, place('b', 'Klaassaal Tallinn', east(1000)), null, null, said('same')).answer, null);
  assert.equal(pairDecision(a, b, null, null, [...said('same'), ...said('other')]).answer, null);
  assert.equal(pairDecision(a, b, null, null, []).answer, null);

  // The name says it: "Mustpeade maja Valge saal" is a hall of "Mustpeade maja".
  assert.equal(pairDecision(place('m', 'Mustpeade maja'), place('v', 'Mustpeade maja Valge saal'), null, null, []).answer, 'separate');
  assert.equal(hallOf('Mustpeade maja Valge saal', 'Mustpeade maja'), true);
  assert.equal(hallOf('Kanuti Gildi SAAL', 'Kanuti Gildi'), true);
  // "Bar" ends this venue's own name; it does not make two places.
  assert.equal(hallOf('Heldeke Theatre and Bar', 'Heldeke'), false);
});

test('a room\'s name gives its venue; a short leftover is not a venue name', () => {
  assert.equal(withoutRoom('Tallinna Linnahall main entrance', tallinn), 'tallinna linnahall');
  assert.equal(withoutRoom('Telliskivi Creative City\'s Gallery', tallinn), 'telliskivi creative citys');
  assert.equal(withoutRoom('Kai Kino', tallinn), 'kai');   // checks.ts asks for two words or five letters before using it
  assert.equal(withoutRoom('Fotografiska Tallinn', tallinn), null);
});

test('plus codes from ticket shops are read against the city\'s centre', () => {
  const p = plusCode('CQW3+JC Tallinn, Tallinn', tallinn.centre)!;
  assert.ok(Math.abs(p.lat - 59.44656) < 1e-4 && Math.abs(p.lng - 24.75356) < 1e-4);
  assert.deepEqual(plusCode('9GF6CQW3+JC', [0, 0]), p);
  assert.ok(inCity(tallinn, p.lat, p.lng));
  assert.equal(plusCode('Mere pst 20, Tallinn', tallinn.centre), null);
});

test('a page\'s JSON-LD gives its event\'s venue, address, pin and organiser', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"MusicEvent","name":"Show",
    "organizer":{"@type":"Organization","name":"Tallinna Arhitektuuribiennaal TAB"},
    "location":{"@type":"Place","name":"Tallinna Linnahall","address":{"@type":"PostalAddress","streetAddress":"Mere pst 20","addressLocality":"Tallinn"},
    "geo":{"@type":"GeoCoordinates","latitude":59.4466,"longitude":24.7536}}}]}</script>
    <script type="application/ld+json">{ broken </script>`;
  assert.deepEqual(jsonLdLocations(html), [{ name: 'Tallinna Linnahall', address: 'Mere pst 20, Tallinn', lat: 59.4466, lng: 24.7536, organizer: 'Tallinna Arhitektuuribiennaal TAB' }]);
});

test('a model\'s quote counts only when it is really on the page, and names are matched as whole words', () => {
  const page = 'Saalid\nKanuti Gildi SAAL, Pikk 20\nPüha  Vaimu SAAL asub Pühavaimu 2 kirikus.\nKeldrisaal';
  assert.equal(quoteIn(page, 'Püha Vaimu SAAL asub Pühavaimu 2 kirikus'), true);
  assert.equal(quoteIn(page, 'puha vaimu saal asub puhavaimu 2 kirikus'), true, 'case and accents may differ');
  assert.equal(quoteIn(page, 'Püha Vaimu SAAL asub Pikk 20'), false);
  assert.equal(quoteIn(page, 'SAAL'), false, 'too short to show anything');
  assert.equal(mentions(page, 'Püha Vaimu SAAL'), true);
  assert.equal(mentions(page, 'Vaimu'), true);
  assert.equal(mentions(page, 'Vai'), false);
  assert.equal(windowsAround(page, 'Keldrisaal', 1).length, 1);
});

test('OpenStreetMap names match any recorded name, with the city\'s own name ignored at the start', () => {
  assert.equal(osmNamed(['Linnahall'], 'Tallinna Linnahall', tallinn), true);
  assert.equal(osmNamed(['Telliskivi Loomelinnak', 'Telliskivi Creative City'], 'Telliskivi Creative City', tallinn), true);
  assert.equal(osmNamed(['Linnahall'], 'Linnahalli kohvik', tallinn), false);
});

test('a page\'s Instagram and Facebook links are read as handles, share buttons ignored', () => {
  const links = profileLinks('<a href="https://www.instagram.com/kanutigildisaal_/">IG</a><a href="https://instagram.com/p/abc">post</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a><a href="https://facebook.com/KanutiGildiSAAL">FB</a>');
  assert.deepEqual(links, { instagram: ['kanutigildisaal_'], facebook: ['kanutigildisaal'] });
});

test('a venue source\'s accounts are checked against what the venue\'s own site links', async () => {
  const { compareAccounts, siteOf } = await import('../source-check.ts');
  const saal = { id: 'saal', city: 'tallinn', kind: 'html', url: 'https://saal.ee/en/program/', handle: '@kanutigildisaal', label: 'SAAL', curated: true,
    config: { venue_site: 'https://saal.ee/', venue_instagram: 'https://www.instagram.com/kanutigildisaal_' } } as any;
  const found = compareAccounts(saal, { instagram: ['kanutigildisaal_'], facebook: [] }, 'https://saal.ee/');
  assert.deepEqual(found.map(f => [f.field, f.ours]), [['handle', 'kanutigildisaal']]);
  // A site that links no Instagram says nothing against the handle.
  assert.deepEqual(compareAccounts(saal, { instagram: [], facebook: [] }, 'https://saal.ee/'), []);
  // A ticket shop's handle is its own, not a venue's.
  assert.deepEqual(compareAccounts({ ...saal, kind: 'fienta', handle: '@fienta' }, { instagram: ['x'], facebook: [] }, ''), []);
  assert.equal(siteOf({ ...saal, config: {} }), 'https://saal.ee/');
});

test('one page is one witness: its JSON-LD and a model reading of its text do not agree with each other', () => {
  const url = 'https://fienta.com/et/sarabande-immersive-musical-roleplay-experience';
  const same = locateDecision([ev('fienta.com (organiser 9400c8d8)', linnahall, { url }), ev('fienta.com', east(20), { source: 'site', url })]);
  assert.equal(same.answer, null);
  assert.equal(locateDecision([ev('fienta.com (organiser 9400c8d8)', linnahall, { url }), ev('openstreetmap.org', east(20), { source: 'osm' })]).answer, 'located');
});

test('two records settle a pair: one venue\'s names at the address both give, or different names on different streets', async () => {
  const { nameVariant, addressInName } = await import('../place-checks.ts');
  const at = (id: string, name: string, address: string | null, website: string | null = null) => ({ ...place(id, name, linnahall), address, website });
  assert.match(nameVariant(at('a', 'Heldeke!', null), at('b', 'Heldeke! - Theatre and Bar', null)) ?? '', /kind of place/);
  assert.match(nameVariant(at('a', 'Legendaarne Raadio', null), at('b', 'Legendaarne Raadiobaar', null)) ?? '', /glued/);
  assert.match(nameVariant(at('a', 'Hipodroomi Ratas&Kohv', null), at('b', 'Ratas&Kohv Hipodroomi', null)) ?? '', /same words/);
  assert.match(nameVariant(at('a', 'Klaassaal', null), at('b', 'Tallinna Lauluväljak/Klaassaal', null)) ?? '', /slash/);
  assert.equal(nameVariant(at('a', 'T1 Venue', null), at('b', 'T1 Venue & Cinamon Cinema', null)), null, 'another business under one roof');
  assert.equal(nameVariant(at('a', 'Apollo', null), at('b', 'Apollo Kids', null)), null);

  const merged = pairDecision(at('a', 'RM Lounge', 'Parda 8, 10151 Tallinn'), at('b', 'RM Lounge & event venue', 'Parda tänav 8, 10151 Tallinn'), null, null, []);
  assert.equal(merged.answer, 'merged');
  // Different websites are two businesses, whatever the names.
  assert.equal(pairDecision(at('a', 'Apollo', 'Hobujaama 5', 'https://www.apollo.ee/'), at('b', 'Apollo kino', 'Hobujaama 5', 'https://www.apollokino.ee/'), null, null, []).answer, null);
  // Another address is not one venue.
  assert.equal(pairDecision(at('a', 'RM Lounge', 'Parda 8'), at('b', 'RM Lounge & event venue', 'Parda 10'), null, null, []).answer, null);
  assert.equal(pairDecision(at('a', 'Raamatukaru', 'Kuninga 2, Tallinn'), at('b', 'Raamatukoi', 'Harju 1, Tallinn'), null, null, []).answer, 'separate');
  // A room keeps its own place.
  assert.equal(pairDecision(at('a', 'Mustpeade Maja', 'Pikk 26'), at('b', 'Mustpeade Maja Valge saal', 'Pikk 26'), null, null, []).answer, 'separate');
  assert.equal(pairDecision(at('a', 'Telliskivi Creative City', 'Telliskivi 60a'), at('b', "Telliskivi Creative City's Gallery", null), null, null, []).answer, 'separate');
  assert.equal(hallOf("Telliskivi Creative City's Gallery", 'Telliskivi Creative City'), true);
  assert.equal(hallOf('Kinos saal', 'Kino'), false, 'a possessive needs its apostrophe');
  // Different sites under names that are not one venue's: two businesses under one roof.
  const t1 = pairDecision(at('a', 'T1 Venue', 'Peterburi tee 2', 'https://t1venue.ee/'), at('b', 'T1 Venue & Cinamon Cinema', 'Peterburi tee 2', 'https://cinamonkino.com/'), null, null, []);
  assert.equal(t1.answer, 'separate');
  assert.equal(pairDecision(at('a', 'T1 Venue', 'Peterburi tee 2', 'https://t1venue.ee/'), at('b', 'T1 Venue & Cinamon Cinema', 'Peterburi tee 2', null), null, null, []).answer, null, 'one site says nothing');
  // Each record's own OpenStreetMap object: two objects under two names are two venues, one name is one venue drawn twice.
  const osmAt = (id: string, name: string, osm: string) => ({ ...at(id, name, 'Estonia pst 9'), osm_id: osm });
  assert.equal(pairDecision(osmAt('a', 'Apollo', 'way/777840782'), osmAt('b', 'Apollo Kids', 'way/777840783'), null, null, []).answer, 'separate');
  assert.notEqual(pairDecision(osmAt('a', 'Apollo', 'way/1'), osmAt('b', 'Apollo', 'way/2'), null, null, []).answer, 'separate');
  assert.equal(pairDecision(osmAt('a', 'Apollo', 'way/1'), osmAt('b', 'Apollo Kids', 'way/1'), null, null, []).answer, null);

  // A site's "same" counts only from a passage naming both, the shorter name on its own too.
  const { namesBoth } = await import('../place-checks.ts');
  assert.equal(namesBoth('Sakala 3 Teatrimaja on etenduskunstide keskus. Teatrimaja rendib ruume.', 'Teatrimaja', 'Sakala 3 Teatrimaja'), true);
  assert.equal(namesBoth('Sakala 3 Teatrimaja on etenduskunstide keskus.', 'Teatrimaja', 'Sakala 3 Teatrimaja'), false);
  assert.equal(namesBoth('Apollo kino (https://www.apollokino.ee/) Vapiano', 'Apollo', 'Apollo Kino'), false);

  assert.equal(addressInName('Sakala 3 Teatrimaja'), 'Sakala 3');
  assert.equal(addressInName('Manufaktuuri 7/2'), 'Manufaktuuri 7/2');
  assert.equal(addressInName('Hall 2'), null);
  assert.equal(addressInName('Studio Gallery K28'), null);
});

test('a pair left behind by a merge takes its canonical pair\'s answer, or waits with it', async () => {
  const { supersededPairs } = await import('../place-checks.ts');
  const merged = new Map([['apollo-kino-3', 'apollo-kino-solaris'], ['loomelinnak', 'telliskivi'], ['old-a', 'new-a']]);
  const reviews = [{ place_a: 'apollo-4', place_b: 'apollo-kino-solaris', state: 'separate' }, { place_a: 'telliskivi', place_b: 'vivistop', state: 'pending' }];
  const out = supersededPairs([
    { place_a: 'apollo-4', place_b: 'apollo-kino-3' },     // its canonical pair was settled: separate
    { place_a: 'loomelinnak', place_b: 'vivistop' },       // its canonical pair is still open: waits
    { place_a: 'new-a', place_b: 'old-a' },                // both sides are one place now
    { place_a: 'x', place_b: 'y' },                        // nothing merged: untouched
  ], reviews, merged);
  assert.deepEqual(out.map(r => [r.place_a, r.place_b, r.state]), [['apollo-4', 'apollo-kino-3', 'separate'], ['new-a', 'old-a', 'merged']]);
});
