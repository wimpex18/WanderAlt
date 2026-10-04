import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facebookCheck, lookupFacebookPage, pageWebsite } from '../facebook-hours.ts';
import { fillHours } from '../hours-sources.ts';
import type { Place } from '../places.ts';

const cfg = { token: 't', businessId: 'b' };
const reply = (routes: Record<string, unknown>) => (async (url: string) => {
  const u = new URL(url);
  const key = `${u.pathname.replace(/^\/v[\d.]+\//, '')}?${u.searchParams.get('fields') ?? ''}`;
  const hit = Object.entries(routes).find(([k]) => key.startsWith(k));
  return new Response(JSON.stringify(hit ? hit[1] : { error: { code: 803, message: 'unknown' } }));
}) as unknown as typeof fetch;

test('a Page website is the venue’s own site, never another profile', () => {
  assert.equal(pageWebsite('www.fortbar.ee'), 'https://www.fortbar.ee/');
  assert.equal(pageWebsite('https://instagram.com/fort.bar https://fortbar.ee'), 'https://fortbar.ee/');
  assert.equal(pageWebsite('https://linktr.ee/fortbar'), null);
  assert.equal(pageWebsite(undefined), null);
});

test('one Page lookup gives hours, website, about and closure; a missing field falls back to hours', async () => {
  const r = await lookupFacebookPage('fort', cfg, reply({ 'fort?hours,website': { hours: { fri_1_open: '18:00', fri_1_close: '02:00' }, website: 'fortbar.ee', about: 'Live music bar.' } }));
  assert.deepEqual(r, { kind: 'found', hours: 'Fr 18:00-02:00', website: 'https://fortbar.ee/', about: 'Live music bar.', closed: false });
  let n = 0;
  const odd = (async (url: string) => (n++ ? new Response(JSON.stringify({ hours: { mon_1_open: '10:00', mon_1_close: '18:00' } })) : new Response(JSON.stringify({ error: { code: 100 } })))) as unknown as typeof fetch;
  assert.equal((await lookupFacebookPage('x', cfg, odd) as { hours: string }).hours, 'Mo 10:00-18:00');
  assert.equal((await lookupFacebookPage('x', cfg, reply({ 'x?': { error: { code: 10, message: 'needs Page Public Metadata Access' } } }))).kind, 'stop');
});

test('the Page fills a missing website and description, never one we hold', async () => {
  const a = { id: 'a', city: 'tallinn', name: 'A', aliases: [], facebook: 'https://www.facebook.com/venuea' } as Place;
  const b = { ...a, id: 'b', website: 'https://b.ee/', description: 'Own words.' } as Place;
  const facebook = async () => ({ kind: 'found' as const, hours: null, website: 'https://from-fb.ee/', about: 'From the Page.' });
  await fillHours([a, b], cfg, 30, { log: () => {}, facebook, html: async () => null });
  assert.deepEqual([a.website, a.website_source, a.description], ['https://from-fb.ee/', 'facebook', 'From the Page.']);
  assert.deepEqual([b.website, b.description], ['https://b.ee/', 'Own words.']);
});

test('the check says which step is missing', async () => {
  const lines = await facebookCheck(cfg, ['kanuti'], reply({
    'me?id,name': { id: '1', name: 'WanderAlt pipeline' },
    'me/permissions?': { data: [{ permission: 'pages_show_list', status: 'granted' }, { permission: 'pages_read_engagement', status: 'granted' }] },
    'me/accounts?': { data: [{ id: '99', name: 'WanderAlt' }] },
    '99?': { name: 'WanderAlt', website: 'https://wanderalt.app' },
    'kanuti?': { error: { code: 10, message: 'This endpoint requires the Page Public Metadata Access feature' } },
  }));
  assert.match(lines[0], /token: works/); assert.match(lines[1], /pages_read_engagement/);
  assert.match(lines[2], /our own Page WanderAlt: readable/); assert.match(lines[3], /venue Page kanuti: refused \(code 10\)/);
  assert.match(lines[4], /need Page Public Metadata Access/);
});
