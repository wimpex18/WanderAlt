import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Place } from '../places.ts';
import { checkWebsite, dueWebsites, homepageEvidence } from '../place-verification.ts';
import { verifyPlaces } from '../maintenance.ts';
import type { Db } from '../db.ts';

const now = '2026-09-29T12:00:00Z';
const venue = (over: Partial<Place> = {}): Place => ({ id: 'venue', city: 'tallinn', name: 'Test Venue',
  aliases: ['test venue'], website: 'https://venue.example/', status: 'active', ...over });
const event = (over: Record<string, unknown> = {}) => ({ '@type': 'MusicEvent', startDate: '2026-10-01T19:00:00+03:00',
  location: { '@type': 'Place', name: 'Test Venue' }, ...over });
const html = (data: unknown = {}, text = 'Test Venue') => `<h1>${text}</h1><script type="application/ld+json">${JSON.stringify(data)}</script>`;
const evidence = (data: unknown = {}, text?: string) => homepageEvidence(venue(), html(data, text), venue().website!, now);

test('only recent dated own-site events at this exact venue verify activity', () => {
  assert.equal(evidence({ '@graph': [event()] }).state, 'verified');
  assert.equal(homepageEvidence(venue({ name: 'D3', aliases: ['d3'] }), html(event({ location: { name: 'D3' } }), 'D3'), venue().website!, now).state, 'verified');
  assert.equal(homepageEvidence(venue({ name: 'D3', aliases: ['d3'] }), html(event({ location: { name: 'D3' } }), 'D30'), venue().website!, now).state, 'review');
  assert.equal(evidence(event({ startDate: '2026-09-05' })).state, 'verified');
  assert.equal(evidence(event({ startDate: '2026-08-01' })).state, 'unverified');
  assert.equal(evidence(event({ startDate: '2027-06-01' })).state, 'unverified');
  assert.equal(evidence(event({ startDate: undefined })).state, 'unverified');
  assert.equal(evidence(event({ location: { name: 'Another Venue' }, organizer: { name: 'Test Venue' } })).state, 'unverified');
  for (const state of ['EventCancelled', 'EventPostponed']) {
    assert.equal(evidence(event({ eventStatus: `https://schema.org/${state}` })).state, 'unverified');
  }
});

test('HTTP success, undated hours, footer years and old promotion are not operating evidence', () => {
  assert.equal(evidence({ '@type': 'NightClub', name: 'Test Venue', openingHours: '24/7' }, 'Test Venue. Open every day. Copyright 2026.').state, 'unverified');
  assert.equal(homepageEvidence(venue(), '<h1>Test Venue</h1><script type="application/ld+json">broken</script>', venue().website!, now).state, 'unverified');
  assert.equal(homepageEvidence(venue(), html(event(), 'Another business'), venue().website!, now).state, 'review');
  assert.equal(homepageEvidence(venue(), html(event()), 'https://other.example/', now).state, 'review');
  assert.equal(evidence({}, 'Test Venue. This domain is for sale.').state, 'review');
});

test('explicit own-site closure in English, Estonian and Russian needs review, not automatic deletion', () => {
  for (const text of ['Test Venue permanently closed.', 'Test Venue on lõplikult suletud.', 'Test Venue навсегда закрыт.']) {
    const result = evidence(event(), text);
    assert.equal(result.state, 'review', text);
    assert.match(result.note, /closure/);
  }
});

test('weekly homepage checks rotate, cap at ten distinct hosts and respect manual review and closure', () => {
  const rows = Array.from({ length: 20 }, (_, i) => venue({ id: String(i).padStart(2, '0'), website: `https://site${i}.example/` }));
  assert.equal(dueWebsites(rows, Date.parse(now), 50).length, 10);
  const excluded = [
    venue({ status: 'closed' }), venue({ status: 'hidden' }), venue({ merged_into: 'another' }),
    venue({ website: 'broken URL' }),
    venue({ website_checked_at: '2026-09-28T12:00:00Z' }),
    venue({ verification_source: 'manual', verification_state: 'review' }),
    venue({ verification_source: 'manual', verification_state: 'verified', verified_at: '2026-09-01T12:00:00Z' }),
  ];
  assert.equal(dueWebsites(excluded, Date.parse(now)).length, 0);
  assert.equal(dueWebsites([venue({ id: 'b' }), venue({ id: 'a', website: 'https://www.venue.example/elsewhere' })], Date.parse(now)).length, 1);
  assert.equal(dueWebsites([venue({ verification_source: 'manual', verification_state: 'verified', verified_at: '2026-01-01' })], Date.parse(now)).length, 1);
});

test('homepage requests are bounded and never retry rate limits or accept non-HTML evidence', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async () => { calls++; return new Response('', { status: 429 }); }) as typeof fetch;
    await assert.rejects(checkWebsite(venue(), now), /429/);
    assert.equal(calls, 1);
    globalThis.fetch = (async () => new Response('{}', { headers: { 'content-type': 'application/json' } })) as typeof fetch;
    await assert.rejects(checkWebsite(venue(), now), /not HTML/);
    globalThis.fetch = (async () => new Response('x'.repeat(400_001), { headers: { 'content-type': 'text/html' } })) as typeof fetch;
    await assert.rejects(checkWebsite(venue(), now), /size limit/);
    globalThis.fetch = (async () => new Response(html(event()), { headers: { 'content-type': 'text/html' } })) as typeof fetch;
    assert.equal((await checkWebsite(venue(), now)).state, 'verified');
  } finally { globalThis.fetch = original; }
});

test('website outages preserve verification; failed database writes fail maintenance', async () => {
  const original = globalThis.fetch;
  const patches: Record<string, unknown>[] = [];
  const db = { req: async (_method: string, path: string) => {
    if (path === 'rpc/verify_event_places') return 0;
    throw new Error('Database write failed');
  }, all: async () => [venue()], patch: async (_path: string, patch: Record<string, unknown>) => { patches.push(patch); } } as unknown as Db;
  try {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
    await verifyPlaces(db, 'tallinn');
    assert.deepEqual(Object.keys(patches[0]), ['website_checked_at']);
    globalThis.fetch = (async () => new Response(html(event()), { headers: { 'content-type': 'text/html' } })) as typeof fetch;
    await assert.rejects(verifyPlaces(db, 'tallinn'), /Database write failed/);
    assert.equal(patches.length, 1);
  } finally { globalThis.fetch = original; }
});
