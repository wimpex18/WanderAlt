import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withEasyAlone, EASY_ALONE_TAG } from '../easy.ts';

const tag = (title: string, venue?: string) => withEasyAlone(['indie'], title, venue).includes(EASY_ALONE_TAG);

test('formats built for people on their own are marked, from the title or the venue', () => {
  for (const t of ['No Stress Chess @Heldeke', "Uus Laine's Legendary Quiz: October (Belt Championship)", 'Loop: Yarn Society knitting club in Sept/Oct',
    'Under the Full Moon – Sip & Paint Experience', 'Friend Making Movie Night', 'Open Mic', 'Viktoriin Kalamajas', 'Board games night']) assert.ok(tag(t), t);
  assert.ok(tag('DnD - Wednesday 7.10.2026 @The _Workshop', 'Drink and Draw Tallinn / The Workshop'));
});

test('adult-themed listings and ones built for a group or a couple are never marked, however the format is worded', () => {
  for (const t of ['Make Friends: kink and consent evening', 'A Lover\'s Touch: Wheel of Consent workshop', 'Naked Quiz night', 'Sauna Social + Bar @Heldeke', 'Dating quiz night', 'Her Inner World — A Girls’ Night Sip & Paint Experience', 'Couples quiz', 'Team building: board games']) assert.equal(tag(t), false, t);
});

test('ordinary listings are left alone, and the tag goes first without repeating or crowding', () => {
  assert.equal(tag('Andres Roots 30th Stage Anniversary'), false);
  assert.deepEqual(withEasyAlone(['a', 'b', 'c', 'd'], 'Pub quiz'), [EASY_ALONE_TAG, 'a', 'b', 'c', 'd']);
  assert.deepEqual(withEasyAlone([EASY_ALONE_TAG, 'a'], 'Pub quiz'), [EASY_ALONE_TAG, 'a']);
  assert.deepEqual(withEasyAlone(['a'], 'Murdja'), ['a']);
});
