import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bioHours } from '../bio-hours.ts';
import { writeHours } from '../site-hours.ts';

test('English day ranges and times', () => {
  assert.equal(bioHours('Record shop\nTue-Sat 12-19\nSun 12:00–16:00'), 'Tu,We,Th,Fr,Sa 12:00-19:00; Su 12:00-16:00');
  assert.equal(bioHours('Open Fri, Sat 8pm-4am'), 'Fr,Sa 20:00-04:00');
});

test('Estonian single letters and dotted times', () => {
  assert.equal(bioHours('Avatud E-R 10.00-18.00 | L 11-15'), 'Mo,Tu,We,Th,Fr 10:00-18:00; Sa 11:00-15:00');
});

test('midnight close and two ranges in a day', () => {
  assert.equal(bioHours('Wed-Thu 17-00'), 'We,Th 17:00-24:00');
  assert.equal(bioHours('Mon 10-13, 14-18'), 'Mo 10:00-13:00,14:00-18:00');
});

test('text that only looks like hours gives nothing', () => {
  assert.equal(bioHours('Since 2013. Craft beer, 20 taps, 14-22 years of fun'), null);
  assert.equal(bioHours('Daily specials, 12-14 euro lunch'), null);
  assert.equal(bioHours('By appointment only, ask in DM'), null);
  assert.equal(bioHours('Open 10-18'), null);
  assert.equal(bioHours(null), null);
  assert.equal(bioHours('Mon 10-10'), null);
});

test('writeHours refuses what the reader cannot evaluate', () => {
  assert.equal(writeHours(new Map([['Mo', ['25:00-26:00']]])), null);
  assert.equal(writeHours(new Map([['Mo', ['10:00-18:00']], ['Tu', ['10:00-18:00']]])), 'Mo,Tu 10:00-18:00');
});
