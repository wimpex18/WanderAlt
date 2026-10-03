import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteHours } from '../site-hours.ts';

const page = (json: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head></html>`;

test('openingHoursSpecification becomes OpenStreetMap syntax, days grouped by time', () => {
  const h = siteHours(page({ '@type': 'Museum', openingHoursSpecification: [
    { dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday'], opens: '11:00', closes: '18:00' },
    { dayOfWeek: 'https://schema.org/Friday', opens: '11:00:00', closes: '20:00:00' },
  ] }));
  assert.equal(h, 'Tu,We,Th 11:00-18:00; Fr 11:00-20:00');
});

test('hours inside @graph and a short openingHours string are read', () => {
  assert.equal(siteHours(page({ '@graph': [{ '@type': 'WebSite' }, { '@type': 'BarOrPub', openingHours: ['Mo-Fr 16:00-23:00', 'Sa 14:00-02:00'] }] })), 'Mo-Fr 16:00-23:00; Sa 14:00-02:00');
});

test('prose, empty and broken data give nothing', () => {
  assert.equal(siteHours(page({ openingHours: 'avatud E–L 11.30–22.00' })), null);
  assert.equal(siteHours(page({ openingHoursSpecification: [{ dayOfWeek: 'Monday', opens: '00:00', closes: '00:00' }] })), null);
  assert.equal(siteHours('<script type="application/ld+json">{oops</script>'), null);
  assert.equal(siteHours('<p>Open daily 10-18</p>'), null);
});
