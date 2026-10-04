import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNote, draftNotes, dueForNote, noteSource } from '../place-notes.ts';
import type { Place } from '../places.ts';
import type { Models } from '../llm.ts';

const terminal = { id: 'tallinn-terminal', city: 'tallinn', name: 'Terminal', aliases: [], kind: 'record store', neighborhood: 'Kalamaja', picked: true,
  description: 'Terminal Records&Bar on koht kust haarata pärastlõunane kohv, kuulata ja osta plaate, nautida kokteile, vaadata DJ-sid. Since 2019.' } as Place;
const src = noteSource(terminal);

test('a draft is kept only in the site’s voice and with nothing the place’s own words do not say', () => {
  assert.equal(checkNote('Record shop and bar in Kalamaja: coffee, vinyl, cocktails and DJs', src), 'Record shop and bar in Kalamaja: coffee, vinyl, cocktails and DJs.');
  assert.equal(checkNote('Record shop and bar, open since 2019.', src), 'Record shop and bar, open since 2019.');
  assert.equal(checkNote('Record shop and bar, open since 2015.', src), null, 'a year it does not state');
  assert.equal(checkNote('Record shop run by Marko in Kalamaja.', src), null, 'a name it does not state');
  assert.equal(checkNote('The best record shop in Kalamaja.', src), null, 'marketing');
  assert.equal(checkNote('Record shop to discover in Kalamaja.', src), null);
  assert.equal(checkNote('Vinyl and coffee in Kalamaja!', src), null);
  assert.equal(checkNote('Records.', src), null, 'too short to say anything');
});

test('only picked places with no note, asked again after a month', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  const ps = [terminal, { ...terminal, id: 'b', pick_note: 'Hand-written.' }, { ...terminal, id: 'c', picked: false },
    { ...terminal, id: 'd', note_checked_at: '2026-09-20T00:00:00Z' }, { ...terminal, id: 'e', note_checked_at: '2026-08-01T00:00:00Z' }] as Place[];
  assert.deepEqual(dueForNote(ps, now).map(p => p.id), ['tallinn-terminal', 'e']);
});

test('a kept draft is marked as the model’s; a refused one leaves no note but records the try', async () => {
  const answers = ['Record shop and bar in Kalamaja with coffee and DJs.', 'The most legendary bar in town!'];
  const models = { ready: true, ask: async () => ({ data: { note: answers.shift() }, engine: 'x' }) } as unknown as Models;
  const a = { ...terminal } as Place, b = { ...terminal, id: 'b' } as Place;
  await draftNotes([a, b], models, 10, { log: () => {} });
  assert.deepEqual([a.pick_note, a.pick_note_source], ['Record shop and bar in Kalamaja with coffee and DJs.', 'model']);
  assert.equal(b.pick_note, undefined); assert.ok(b.note_checked_at);
  assert.deepEqual(await draftNotes([{ ...terminal } as Place], null), []);
});
