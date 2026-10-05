import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLocal, checkNote, localizeEvents, localHash, type LocalInput } from '../localize.ts';
import type { Models } from '../llm.ts';

const et: LocalInput = { id: 'e1', title: 'Hommikutund – Tiina Mölder', title_en: 'Morning Class – Tiina Mölder', summary_en: 'A morning movement class led by Tiina Mölder.',
  language: 'et', original_language: 'et', original_excerpt: 'Liikumishooaja hommikutund, juhendab Tiina Mölder.', description: null };
const answer = {
  title_et: 'Translated back', summary_et: 'Liikumishooaja hommikutund, mida juhendab Tiina Mölder.',
  title_ru: 'Утренний класс – Tiina Mölder', summary_ru: 'Утреннее занятие по движению, которое ведёт Tiina Mölder.',
  title_uk: 'Ранкове заняття – Tiina Mölder', summary_uk: 'Ранкове заняття з руху, яке веде Tiina Mölder.',
};

test('an Estonian listing keeps its own title in Estonian; the others are written from the original', () => {
  const c = checkLocal(et, answer)!;
  assert.equal(c.title_et, 'Hommikutund – Tiina Mölder', 'never Estonian → English → Estonian');
  assert.equal(c.title_ru, 'Утренний класс – Tiina Mölder');
  assert.equal(c.summary_uk, 'Ранкове заняття з руху, яке веде Tiina Mölder.');
  assert.equal(c.local_input_hash, localHash(et));
});

test('the wrong script or the wrong Cyrillic language is dropped, the rest kept', () => {
  const c = checkLocal(et, { ...answer, summary_et: 'Утреннее занятие по движению.', summary_uk: 'Утреннее занятие по движению, которое ведёт Tiina Mölder.' })!;
  assert.equal(c.summary_et, null, 'Estonian in Cyrillic');
  assert.equal(c.summary_uk, null, 'Russian passed off as Ukrainian');
  assert.ok(c.summary_ru);
  assert.equal(checkLocal(et, { ...answer, title_uk: '' }), null, 'a missing title is no answer');
  assert.equal(checkLocal(et, { ...answer, summary_ru: 'Лучшее занятие года!', summary_et: '', summary_uk: '' }), null);
});

test('a Russian or Ukrainian title stays as the venue wrote it in that language', () => {
  const ru = { ...et, title: 'Концерт: Сансара', language: 'ru', original_language: 'ru' };
  assert.equal(checkLocal(ru, answer)!.title_ru, 'Концерт: Сансара');
  const uk = { ...et, title: 'Вечір поезії', language: 'uk', original_language: 'uk' };
  assert.equal(checkLocal(uk, answer)!.title_uk, 'Вечір поезії');
});

test('a translated note keeps every number and its script', () => {
  const en = '24 taps of Põhjala beer at Noblessner.';
  assert.ok(checkNote(en, '24 kraani Põhjala õllega Noblessneris.', '24 крана пива Põhjala в Noblessner.', '24 крани пива Põhjala у Noblessner.'));
  assert.equal(checkNote(en, 'Kraanid Põhjala õllega Noblessneris.', '24 крана пива Põhjala в Noblessner.', '24 крани пива Põhjala у Noblessner.'), null, 'a number lost');
  assert.equal(checkNote(en, '24 kraani Põhjala õllega.', '24 крана пива Põhjala.', '24 крана пива Põhjala, это лучшее.'), null, 'Russian as Ukrainian');
});

test('one call per batch; answers matched by id, unknown ids ignored', async () => {
  const models = { ready: true, ask: async () => ({ data: { items: [{ id: 'e1', ...answer }, { id: 'zz', ...answer }] }, engine: 'x' }) } as unknown as Models;
  const out = await localizeEvents(models, [et]);
  assert.deepEqual([...out.keys()], ['e1']);
});

test('a batch cut off is split and tried again, not lost', async () => {
  const { refreshLocal } = await import('../localize.ts');
  const evs = [1, 2, 3, 4].map(n => ({ ...et, id: `e${n}` }));
  const sizes: number[] = [];
  const models = { ready: true, calls: 0, ask: async (_s: string, user: string) => {
    const items = JSON.parse(user) as { id: string }[]; sizes.push(items.length);
    if (items.length > 2) throw new Error('answer cut off at max_tokens');
    return { data: { items: items.map(i => ({ id: i.id, ...answer })) }, engine: 'x' };
  } } as unknown as Models;
  const patched: string[] = [];
  const db = { all: async (q: string) => (q.startsWith('places') ? [] : evs), patch: async (q: string) => { patched.push(q); } };
  const n = await refreshLocal(db as never, models);
  assert.equal(n, 4); assert.deepEqual(sizes, [4, 2, 2]);
});
