import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// ask.js is a browser script: load it into a bare context.
const context: any = createContext({ window: { WA: {} } });
runInContext(readFileSync(new URL('../../ask.js', import.meta.url), 'utf8'), context);
const places = (q: string) => { const p = context.window.WA.Ask.places(q); return { ...p, kinds: [...p.kinds] }; };

test('shop words ask for places and narrow the listings to them', () => {
  for (const q of ['vinyl shop', 'record store', 'Record Store', 'plaadipood', 'пластинки магазин', 'second-hand shop', 'bookshop', 'vintage']) {
    const p = places(q);
    assert.equal(p.show, true, q);
    assert.equal(p.only, true, q);
  }
  assert.deepEqual(places('vinyl shop').kinds, ['record store']);
  assert.deepEqual(places('bookshop').kinds, ['bookshop']);
});

test('a kind word shows places above the listings without hiding them', () => {
  for (const [q, kind] of [['records', 'record store'], ['books in english', 'bookshop'], ['bar', 'bar'], ['kino', 'cinema'], ['gallery opening', 'gallery']]) {
    const p = places(q);
    assert.deepEqual(p.kinds, [kind], q);
    assert.equal(p.show, true, q);
    assert.equal(p.only, false, q);
  }
});

test('a day or an event word is a question about listings, not places', () => {
  assert.equal(places('record store tonight').show, false);
  assert.equal(places('free jazz tonight').kinds.length, 0);
  assert.equal(places('vinyl fair').only, false);
  assert.equal(places('Terminal').show, false);   // a name: matched against place names, not kinds
});

test('the matcher is stateless across calls', () => {
  for (let i = 0; i < 4; i++) assert.deepEqual(places('record store').kinds, ['record store']);
});

test('a plan or an evening is asked for in plain words, in each search language', () => {
  for (const q of ['plan my Friday evening', 'what to do tonight', 'things to do in Kalamaja', 'a night out', 'план на вечер', 'õhtu plaan']) assert.equal(places(q).plan, true, q);
  for (const q of ['jazz this evening', 'free jazz tonight', 'vinyl shop', 'Kino Sõprus']) assert.equal(places(q).plan, false, q);
});

test('museums and craft beer are places too, in English, Estonian and Russian', () => {
  for (const [q, kind] of [['museum', 'museum'], ['muuseumid', 'museum'], ['музей', 'museum'], ['craft beer', 'taproom'], ['taproom', 'taproom'], ['õlu', 'taproom'], ['пиво', 'taproom']]) {
    const p = places(q);
    assert.ok(p.kinds.includes(kind), q);
    assert.equal(p.show, true, q);
  }
  assert.equal(places('craft beer tonight').show, false);   // a day makes it a question about listings
});
