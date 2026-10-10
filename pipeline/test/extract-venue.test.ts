import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../cities.ts';
import { Models, extractEvents, inSource, latinise } from '../llm.ts';

test('a venue or address the model gives must come from the text, as written or in Latin letters', () => {
  assert.equal(inSource('Estonia Theatre', 'Балет «Вива Верди» в театре «Эстония» 12.10'), 'Estonia Theatre');
  assert.equal(inSource("Philly Joe's Jazz Club", "Концерт в Philly Joe's 21.10"), "Philly Joe's Jazz Club");
  assert.equal(inSource('Kanuti Gildi SAAL', 'Kohtume Kanuti Gildi SAALis'), 'Kanuti Gildi SAAL');
  assert.equal(inSource('Telliskivi Creative City', 'An evening at the market'), null, 'a name the text does not hold');
  assert.equal(inSource('Kino', 'Film tonight'), null, 'a kind of place alone must appear whole');
  assert.equal(inSource('Pikk 20', 'Kanuti Gildi SAAL, Pikk 20'), 'Pikk 20');
  assert.equal(inSource('Pikk 21', 'Kanuti Gildi SAAL, Pikk 20'), null, 'a house number is the source\'s or nothing');
  assert.equal(inSource(null, 'anything'), null);
  assert.equal(latinise('Эстония'), 'estonija');
});

test('extractEvents keeps the venue it can find in the post and drops one it cannot', async () => {
  const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const lane = { name: 'fixture', model: 'm', key: 'k', call: async () => JSON.stringify({ events: [
    { title: 'Viva Verdi', start: `${day} 19:00`, end: null, venue: 'Estonia Theatre', address: null, price: null, url: null, language: 'ru', excerpt: 'Балет в театре «Эстония»', state: 'scheduled' },
    { title: 'Afterparty', start: `${day} 23:00`, end: null, venue: 'Club Hollywood', address: 'Vana-Posti 8', price: null, url: null, language: 'ru', excerpt: 'Афтерпати', state: 'scheduled' },
  ] }) };
  const found = await extractEvents(new Models([lane], 5), { text: '12.10 в 19:00 — балет «Вива Верди» в театре «Эстония». Потом афтерпати.', source: 'Sigmund Tells (sigmundtells)', postedAt: new Date().toISOString(), city: CITIES.tallinn });
  assert.deepEqual(found.map(c => [c.title, c.venue_name, c.address ?? null]), [['Viva Verdi', 'Estonia Theatre', null], ['Afterparty', null, null]]);
});
