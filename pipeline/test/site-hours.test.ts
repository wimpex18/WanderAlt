import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteHours } from '../site-hours.ts';
import { textHours, hoursPages, visibleText, eventNights } from '../site-text-hours.ts';

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

// Hours written out as text on a venue's own pages (site-text-hours.ts).

test('text hours: days and times on separate lines, a closed day, the block ends at the next thing', () => {
  const kumu = '<div><p>Avatud</p><p>T&ndash;K, R&ndash;P</p><p>10.00&ndash;18.00</p><p>N</p><p>10.00&ndash;20.00</p><p>E</p><p>Suletud</p><p>!</p><p>Piletid</p></div>';
  assert.equal(textHours(kumu), 'Tu,We,Fr,Sa,Su 10:00-18:00; Th 10:00-20:00');
});

test('text hours: "until midnight" is read, and a café listed under the museum is not merged in', () => {
  const page = `<h2>Lahtiolekuajad</h2><p>Riigipühadel võivad lahtiolekuajad erineda.</p><h3>Muuseum</h3>
    <p>esmaspäev – neljapäev 9.00–20.00</p><p>reede 9.00–südaöö</p><p>laupäev 10.00–20.00</p><p>pühapäev 10.00–18.00</p>
    <h3>Kohvik</h3><p>esmaspäev – reede 8.30–20.00</p><p>laupäev 9.00–20.00</p><p>pühapäev 9.00–18.00</p>`;
  assert.equal(textHours(page), 'Mo,Tu,We,Th 09:00-20:00; Fr 09:00-24:00; Sa 10:00-20:00; Su 10:00-18:00');
});

test('text hours: a week with days left unsaid is not kept, and nothing is read without a cue', () => {
  assert.equal(textHours('<p>Open during the exhibitions:</p><p>Wednesday - Saturday 12 - 18</p><p>Tickets at the door</p>'), null, 'Mon, Tue and Sun unsaid');
  assert.equal(textHours('<p>Programme</p><p>Fri 20-23</p><p>Sat 21-04</p>'), null);
  assert.equal(textHours('<p>Opening hours: Mon-Sun 12-22</p>'), 'Mo,Tu,We,Th,Fr,Sa,Su 12:00-22:00');
  assert.equal(textHours('<p>Avatud homme - 10:00.</p><p>Külastusinfo</p>'), null);
  assert.equal(textHours('<script>var x="Opening hours: Mon-Sun 12-22"</script>'), null, 'scripts are not text');
});

test('text hours: days not named are shut when the text says the rest is by appointment', () => {
  // Studio Gallery K28, as its homepage writes it.
  assert.equal(textHours('<p>Galerii on avatud näituste ajal:</p><p>K,N,R, L 12 - 18</p><p>Muul ajal oleme avatud kokkuleppel</p>'), 'We,Th,Fr,Sa 12:00-18:00');
  assert.equal(textHours('<p>Open during the exhibitions:</p><p>Wednesday - Saturday 12 - 18</p><p>Open also by appointment</p>'), 'We,Th,Fr,Sa 12:00-18:00');
});

test('event nights: a venue that opens only for its events says so', () => {
  assert.equal(eventNights('<h3>Working hours</h3><p>On event days, 6PM—2AM</p>'), true);
  assert.equal(eventNights('<p>We are open on concert evenings. Opening hours may vary according to the programme.</p>'), true);
  assert.equal(eventNights('<p>Avatud ürituste ajal</p>'), true);
  assert.equal(eventNights('<p>Open Tue-Sat 12-20. Events most Fridays.</p>'), false);
});

test('hours pages: contact and visit links on the same site, two at most', () => {
  const html = '<a href="/et/kontakt">Kontakt</a><a href="https://other.ee/contact">Contact</a><a href="/events">Events</a><a href="https://tallinn.x.com/kulastusinfo">Külastusinfo</a><a href="/hours">Hours</a>';
  assert.deepEqual(hoursPages(html, 'https://www.x.com/'), ['https://www.x.com/et/kontakt', 'https://tallinn.x.com/kulastusinfo']);
  assert.equal(visibleText('a&nbsp;b<br>c &amp; d'), 'a b\nc & d');
});
