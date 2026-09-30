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

import { commonsUrl, declaredIcons, placeFromOsm, homeLinkImg, cargoHomeLogo, pickLogo, facebookPage, facebookPicture } from '../venues.ts';
import { imageSize, usableSize } from '../imageprobe.ts';

test('a vector logo is asked for as a PNG; the site icon is a logo of last resort', () => {
  assert.match(commonsUrl('Some logo.svg'), /\/thumb\/.+\/Some_logo\.svg\/512px-Some_logo\.svg\.png$/);
  assert.match(commonsUrl('Photo.jpg'), /commons\/[0-9a-f]\/[0-9a-f]{2}\/Photo\.jpg$/);
  const head = '<link rel="icon" href="/f-32.png" sizes="32x32"><link rel="icon" href="/f-192.png" sizes="192x192"><link rel="apple-touch-icon" href="/touch.png">';
  assert.deepEqual(declaredIcons(head, 'https://venue.example/'), ['https://venue.example/f-192.png', 'https://venue.example/touch.png', 'https://venue.example/f-32.png']);
  assert.equal(fromHomepage(head, 'https://venue.example/', 'X').image_source, 'logo');
});

test('OSM contact websites are read from more than one tag', () => {
  const p = placeFromOsm({ type: 'node', id: 1, lat: 59.4, lon: 24.7, tags: { name: 'Klubi', amenity: 'nightclub', 'operator:website': 'https://klubi.example' } }, 'tallinn');
  assert.equal(p?.website, 'https://klubi.example/');
});

import { chunkText, Models } from '../llm.ts';

test('a long page is read in parts, cut at line breaks, nothing dropped', () => {
  assert.deepEqual(chunkText('short'), ['short']);
  const text = Array.from({ length: 30 }, (_, i) => `line ${i} ${'x'.repeat(500)}`).join('\n');
  const parts = chunkText(text, 4000);
  assert.ok(parts.length > 1 && parts.every(p => p.length <= 4000));
  assert.equal(parts.join('\n'), text);
  assert.equal(chunkText('y'.repeat(9000), 4000).join('').length, 9000);
});

test('a used-up daily allocation is not retried or waited for', async () => {
  let calls = 0;
  const quota = Object.assign(new Error('429 {"errors":[{"message":"you have used up your daily free allocation of 10,000 neurons","code":4006}]}'), { status: 429 });
  const m = new Models([
    { name: 'workers-ai', model: 'a', key: 'k', call: async () => { calls++; throw quota; } },
    { name: 'openrouter', model: 'b', key: 'k', call: async () => '{"ok":true}' },
  ], 10, 5000);
  const t0 = Date.now();
  assert.equal((await m.ask('s', 'u', {})).engine, 'openrouter:b');
  await m.ask('s', 'u', {});
  assert.equal(calls, 1);                       // asked once, then skipped
  assert.ok(Date.now() - t0 < 2000);            // no 20 s waits
});

test('the logo in the header link to the homepage counts; a sponsor ribbon does not', () => {
  const site = 'https://venue.example/';
  const header = '<header><a href="/" class="brand"><img src="/media/mark.png" alt="Venue"></a></header><footer><a href="https://sponsor.example/"><img src="/media/sponsor.png"></a></footer>';
  assert.equal(homeLinkImg(header, site), 'https://venue.example/media/mark.png');
  assert.equal(homeLinkImg('<a href="https://sponsor.example/"><img src="/x.png"></a>', site), null);
  assert.equal(homeLinkImg('<a href="/tickets"><img src="/x.png"></a>', site), null);
  assert.equal(homeLinkImg('<a href="/"><img src="/img/sponsor-logo.png"></a>', site), null);
  assert.equal(homeLinkImg('<a href="/"><img data-src="//cdn.example/logo-wide.png" alt="x"></a>', site), 'https://cdn.example/logo-wide.png');
});

test('a Cargo site\'s logo is the media item that links home', () => {
  const html = String.raw`freight.cargo.site {"content":"\u003ccolumn-unit slot=\"0\">\u003cmedia-item animate=\"5\" class=\"linked\" hash=\"T2595851025356290867978134038983\" href=\"home\" rel=\"history\">\u003c/media-item>"} {"display_name":"214x.png","name":"214x.png","hash":"T2595851025356290867978134038983","width":2382}`;
  assert.equal(cargoHomeLogo(html), 'https://freight.cargo.site/w/600/q/75/i/T2595851025356290867978134038983/214x.png');
  assert.equal(cargoHomeLogo('<media-item hash="T1" href="about">'), null);
  assert.equal(cargoHomeLogo('<a href="/">no cargo here</a>'), null);
});

test('image sizes are read from the file header, and only real marks pass', async () => {
  const png = (w: number, h: number) => { const b = new Uint8Array(24); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
  const ico = (w: number) => { const b = new Uint8Array(22); b.set([0, 0, 1, 0, 1, 0, w, w]); return b; };
  assert.deepEqual(imageSize(png(300, 200)), { width: 300, height: 200 });
  assert.deepEqual(imageSize(ico(182)), { width: 182, height: 182 });
  assert.equal(imageSize(ico(16))!.width, 16);
  assert.equal(imageSize(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))!.vector, true);
  assert.equal(imageSize(new TextEncoder().encode('hello')), null);
  assert.equal(usableSize({ width: 182, height: 182 }, 128), true);
  assert.equal(usableSize({ width: 32, height: 32 }, 128), false);
  assert.equal(usableSize({ width: 1200, height: 200 }, 48), true);         // a wide wordmark
  assert.equal(usableSize({ width: 2000, height: 100 }, 48), false);        // a strip
  const sizes: Record<string, { width: number; height: number } | null> = { 'https://a/f.ico': { width: 16, height: 16 }, 'https://a/t.png': { width: 180, height: 180 }, 'https://a/gone.png': null };
  const probe = async (u: string) => sizes[u] ?? null;
  assert.equal(await pickLogo([{ url: 'https://a/f.ico', weak: true, icon: true }, { url: 'https://a/t.png', weak: true, icon: true }], probe as never), 'https://a/t.png');
  assert.equal(await pickLogo([{ url: 'https://www.tallinn.ee/themes/main_site/logo.svg', weak: false }], probe as never), null);   // the city's mark
  assert.equal(await pickLogo([{ url: 'https://a/gone.png', weak: true }], probe as never), null);      // unreadable weak candidate
  assert.equal(await pickLogo([{ url: 'https://a/gone.png', weak: false }], probe as never), 'https://a/gone.png');
});

test('a Facebook page picture only for a page link, never a silhouette', async () => {
  assert.equal(facebookPage('https://www.facebook.com/uuslaine'), 'uuslaine');
  assert.equal(facebookPage('https://www.facebook.com/events/123'), null);
  assert.equal(facebookPage('https://www.facebook.com/profile.php?id=5'), null);
  assert.equal(facebookPage('https://evil.example/uuslaine'), null);
  const reply = (data: unknown) => (async () => new Response(JSON.stringify({ data }))) as typeof fetch;
  assert.equal(await facebookPicture('uuslaine', reply({ is_silhouette: false, width: 200, height: 200 })), 'https://graph.facebook.com/uuslaine/picture?type=large');
  assert.equal(await facebookPicture('uuslaine', reply({ is_silhouette: true, width: 200, height: 200 })), null);
  assert.equal(await facebookPicture('uuslaine', reply({ is_silhouette: false, width: 50, height: 50 })), null);
  assert.equal(await facebookPicture('nosuch', (async () => new Response('{}', { status: 400 })) as typeof fetch), null);
});
