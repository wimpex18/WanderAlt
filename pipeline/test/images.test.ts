import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHomepage, jsonLdLogo, ownLogoImg } from '../venues.ts';
import { posterFromPage, sameTitle, pagesFor } from '../posters.ts';

// The shape of Südalinna Teater's real page: its own logo in the header, and a
// ribbon of sponsors whose files sit on other hosts or under numbers.
const THEATRE = `<div class="logo"><img class="fgr" src="/_public/images/logod/logo-main.svg" width="224" alt="Vene Teater"></div>
  <div class="logos-ribbon"><a class="logo"><img src="https://www.blrt.ee/x/blrt-logo.svg" alt="BLRT"></a>
  <a class="logo"><img src="https://www.sudalinnateater.ee/storage/_core/2[1].svg" alt="Kultuuriministeerium"></a></div>`;

test('a venue logo is the site\'s own logo file, not a sponsor\'s', () => {
  assert.equal(ownLogoImg(THEATRE, 'https://www.sudalinnateater.ee/'), 'https://www.sudalinnateater.ee/_public/images/logod/logo-main.svg');
  assert.equal(ownLogoImg('<img src="https://cdn.other.example/logo.png">', 'https://venue.example/'), null);
  assert.equal(ownLogoImg('<img src="/img/sponsor-logo.png"><img src="/img/team.jpg">', 'https://venue.example/'), null);
  const d = fromHomepage(THEATRE, 'https://www.sudalinnateater.ee/', 'Südalinna Teater');
  assert.equal(d.image_source, 'logo');
  assert.equal(d.image_url, 'https://www.sudalinnateater.ee/_public/images/logod/logo-main.svg');
});

test('JSON-LD logo counts for an organisation, never for an event', () => {
  const org = `<script type="application/ld+json">{"@type":"TheaterGroup","logo":{"@type":"ImageObject","url":"/media/mark.svg"}}</script>`;
  assert.equal(jsonLdLogo(org, 'https://venue.example/'), 'https://venue.example/media/mark.svg');
  const ev = `<script type="application/ld+json">{"@type":"Event","name":"Gig","image":"/poster.jpg","logo":"/gig-logo.png"}</script>`;
  assert.equal(jsonLdLogo(ev, 'https://venue.example/'), null);
  assert.equal(jsonLdLogo(`<script type="application/ld+json">{"@type":"Organization","logo":"/img/sponsor-logo.png"}</script>`, 'https://venue.example/'), null);
});

const EV = { id: 'ev_1', title: 'Спектакль Cosmodolphins', starts_at: '2026-09-28T21:00:00Z' };

test('a poster comes only from a page that names this event', () => {
  const page = (title: string, image = 'https://www.sudalinnateater.ee/storage/images/cosmodolphins.png') =>
    `<meta property="og:title" content="${title}"><meta property="og:image" content="${image}">`;
  const url = 'https://www.sudalinnateater.ee/et/repertuaar/cosmodolphins/865';
  assert.deepEqual(posterFromPage(page('COSMODOLPHINS'), url, EV),
    { image_url: 'https://www.sudalinnateater.ee/storage/images/cosmodolphins.png', image_attr: 'Image from sudalinnateater.ee' });
  assert.equal(posterFromPage(page('Repertuaar'), url, EV), null);                        // another page
  assert.equal(posterFromPage(page('COSMODOLPHINS', '/img/logo.png'), url, EV), null);    // a logo is not a poster
  assert.equal(posterFromPage(page('COSMODOLPHINS', '/img/og-default.jpg'), url, EV), null);
  assert.equal(posterFromPage('<p>See domeen on müügil</p>' + page('COSMODOLPHINS'), url, EV), null);
});

test('a structured event must match on title; a series is told apart by day', () => {
  const ld = (...starts: string[]) => `<script type="application/ld+json">${JSON.stringify(starts.map((s, i) => ({ '@type': 'Event', name: 'Cosmodolphins', startDate: s, image: [`https://v.example/p${i}.jpg`] })))}</script>`;
  assert.equal(posterFromPage(ld('2026-09-29T00:00:00+03:00'), 'https://v.example/e/1', EV)?.image_url, 'https://v.example/p0.jpg');
  // one event page whose date lags the listing still shows the same show
  assert.equal(posterFromPage(ld('2026-10-05T19:00:00+03:00'), 'https://v.example/e/1', EV)?.image_url, 'https://v.example/p0.jpg');
  // a series page: the node for the day wins, no node for the day means no guess
  assert.equal(posterFromPage(ld('2026-10-05T19:00:00+03:00', '2026-09-29T00:00:00+03:00'), 'https://v.example/e/1', EV)?.image_url, 'https://v.example/p1.jpg');
  assert.equal(posterFromPage(ld('2026-10-05T19:00:00+03:00', '2026-10-06T19:00:00+03:00'), 'https://v.example/e/1', EV), null);
  // Fienta serves pictures through an extensionless proxy: the file is in the query
  const fienta = '<meta property="og:title" content="Cosmodolphins"><meta property="og:image" content="https://fienta.com/cf/img/?width=1200&file=/org/1/poster.jpg">';
  assert.ok(posterFromPage(fienta, 'https://fienta.com/et/cosmo', EV)?.image_url.includes('poster.jpg'));
});

test('titles and pages', () => {
  assert.equal(sameTitle('COSMODOLPHINS', 'Спектакль Cosmodolphins'), true);
  assert.equal(sameTitle('Live', 'Live music night'), false);
  assert.deepEqual(pagesFor({ ...EV, url: 'https://www.facebook.com/events/1/', ticket_url: 'https://fienta.com/x' }, ['javascript:alert(1)', 'https://t.me/x']),
    ['https://fienta.com/x']);
});

import { commonsUrl, siteIcon, placeFromOsm } from '../venues.ts';

test('a vector logo is asked for as a PNG; the site icon is a logo of last resort', () => {
  assert.match(commonsUrl('Some logo.svg'), /\/thumb\/.+\/Some_logo\.svg\/512px-Some_logo\.svg\.png$/);
  assert.match(commonsUrl('Photo.jpg'), /commons\/[0-9a-f]\/[0-9a-f]{2}\/Photo\.jpg$/);
  const head = '<link rel="icon" href="/f-32.png" sizes="32x32"><link rel="icon" href="/f-192.png" sizes="192x192"><link rel="apple-touch-icon" href="/touch.png">';
  assert.equal(siteIcon(head, 'https://venue.example/'), 'https://venue.example/f-192.png');
  assert.equal(siteIcon('<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/t.png" sizes="32x32">', 'https://venue.example/'), null);
  assert.equal(fromHomepage(head, 'https://venue.example/', 'X').image_source, 'logo');
});

test('OSM contact websites are read from more than one tag', () => {
  const p = placeFromOsm({ type: 'node', id: 1, lat: 59.4, lon: 24.7, tags: { name: 'Klubi', amenity: 'nightclub', 'operator:website': 'https://klubi.example' } }, 'tallinn');
  assert.equal(p?.website, 'https://klubi.example/');
});
