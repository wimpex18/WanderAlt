import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, hoursWindow, timeIn } from '../model-hours.ts';
import { fillHours } from '../hours-sources.ts';
import { pickItem } from '../wikidata-near.ts';
import type { Place } from '../places.ts';
import type { Models } from '../llm.ts';

const text = 'Lahtiolekuajad\nkolmapäevast laupäevani kella 12-st 18-ni\npühapäeval 12.30–16\nmuul ajal suletud';
const day = (o: Record<string, string>) => ({ Mo: 'closed', Tu: 'closed', We: 'closed', Th: 'closed', Fr: 'closed', Sa: 'closed', Su: 'closed', ...o });

test('a time counts only when the text writes it, in any usual form', () => {
  assert.ok(timeIn(text, '12:00')); assert.ok(timeIn(text, '18:00')); assert.ok(timeIn(text, '12:30')); assert.ok(timeIn(text, '16:00'));
  assert.ok(!timeIn(text, '19:00')); assert.ok(!timeIn(text, '02:00'));
  assert.ok(timeIn('Fri 6pm till midnight', '18:00')); assert.ok(timeIn('Fri 6pm till midnight', '24:00'));
  assert.ok(!timeIn('open 10-18', '01:00'), 'the 1 in 18 is not one o’clock');
});

test('the model answer is kept only when the week is whole and every time is in the text', () => {
  assert.equal(checkAnswer(day({ We: '12:00-18:00', Th: '12:00-18:00', Fr: '12:00-18:00', Sa: '12:00-18:00', Su: '12:30-16:00' }), text),
    'We,Th,Fr,Sa 12:00-18:00; Su 12:30-16:00');
  assert.equal(checkAnswer(day({ We: '12:00-19:00' }), text), null, 'an invented closing time');
  assert.equal(checkAnswer(day({ We: '12:00-18:00', Mo: 'unknown' }), text), null, 'a day left unsaid');
  assert.equal(checkAnswer(day({}), text), null, 'shut all week is no answer');
  assert.equal(checkAnswer({ hours: 'We-Sa 12-18' }, text), null);
});

test('the window holds the lines around a word about hours, and nothing without a figure', () => {
  assert.match(hoursWindow('<p>Menu</p><h3>Lahtiolekuajad</h3><p>K–L 12–18</p>'), /Lahtiolekuajad\nK–L 12–18/);
  assert.equal(hoursWindow('<p>We are open to new ideas</p>'), '');
});

const place = (o: Partial<Place>): Place => ({ id: 'tallinn-x', city: 'tallinn', name: 'X', aliases: [], kind: 'bar', ...o } as Place);
const models = { ready: true } as unknown as Models;

test('a venue that opens only for its events is recorded so, with no hours and no model call', async () => {
  const p = place({ website: 'https://fort.ee/' });
  let asked = 0;
  await fillHours([p], null, 30, { log: () => {}, html: async () => '<h3>Working hours</h3><p>On event days, 6PM—2AM</p>', models, modelHours: async () => { asked++; return null; } });
  assert.deepEqual([p.opening_hours, p.hours_source, asked], [null, 'events', 0]);
});

test('the model reads what the rules could not, from the venue’s own text only', async () => {
  const p = place({ website: 'https://k.ee/' });
  const seen: string[] = [];
  await fillHours([p], null, 30, { log: () => {}, html: async () => `<p>Info</p><p>${text.replace(/\n/g, '</p><p>')}</p>`, models,
    modelHours: async (_m, _n, w) => { seen.push(w); return 'We,Th,Fr,Sa 12:00-18:00; Su 12:30-16:00'; } });
  assert.equal(p.hours_source, 'site'); assert.equal(p.opening_hours, 'We,Th,Fr,Sa 12:00-18:00; Su 12:30-16:00');
  assert.match(seen[0], /kolmapäevast laupäevani/);
});

test('without model lanes, or with no words about hours, the model is not asked', async () => {
  let asked = 0;
  const ask = async () => { asked++; return null; };
  await fillHours([place({ id: 'a', website: 'https://a.ee/' })], null, 30, { log: () => {}, html: async () => `<p>${text}</p>`, modelHours: ask });
  await fillHours([place({ id: 'b', website: 'https://b.ee/' })], null, 30, { log: () => {}, html: async () => '<p>Records and coffee</p>', models, modelHours: ask });
  assert.equal(asked, 0);
});

test('a Wikidata item near a place is taken only when exactly one names it', () => {
  const kumu = { name: 'KUMU', aliases: [] };
  assert.equal(pickItem(kumu, new Map([['Q919611', ['Kumu', 'Kumu kunstimuuseum']], ['Q1494058', ['Linnaring']]])), 'Q919611');
  assert.equal(pickItem({ name: 'Kiek In De Kök Fortifications Museum', aliases: [] }, new Map([['Q914562', ['Kiek in de Kök']]])), 'Q914562');
  assert.equal(pickItem(kumu, new Map([['Q1', ['Kumu']], ['Q2', ['Kumu Auditorium']]])), null, 'two items name it');
  assert.equal(pickItem(kumu, new Map([['Q3', ['Lasnamäe paljand']]])), null);
});
