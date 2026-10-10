import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TABLES, backupName, toPrune, readAll, pack, unpack, restoreTable } from '../backup.ts';
import { freshness, probes } from '../watch.ts';

test('file names sort by time and the newest twelve are kept', () => {
  assert.equal(backupName(new Date('2026-10-04T03:30:12Z')), 'wanderalt-2026-10-04-03-30.json.gz');
  const names = Array.from({ length: 15 }, (_, i) => `wanderalt-2026-09-${String(10 + i).padStart(2, '0')}-03-30.json.gz`).concat(['notes.txt']);
  assert.deepEqual(toPrune(names), names.slice(0, 3));
  assert.deepEqual(toPrune(names.slice(0, 5)), []);
});

test('a backup reads every table in key order, packs, unpacks and restores by key', async () => {
  const asked: string[] = [];
  const db = { all: async <T>(path: string) => { asked.push(path); return [{ id: 'a' }, { id: 'b' }] as T[]; } };
  const file = await readAll(db as never, { places: ['id'], bookmarks: ['user_id', 'pick_id'] });
  assert.deepEqual(asked, ['places?select=*&order=id', 'bookmarks?select=*&order=user_id,pick_id']);
  assert.deepEqual(file.counts, { places: 2, bookmarks: 2 });
  const again = unpack(pack(file));
  assert.deepEqual(again.tables.places, [{ id: 'a' }, { id: 'b' }]);
  const writes: [string, number, string][] = [];
  const up = { upsert: (t: string, rows: unknown[], on: string) => { writes.push([t, rows.length, on]); return null; } };
  assert.equal(await restoreTable(up as never, again, 'bookmarks', false), 2);
  assert.deepEqual(writes, []);
  assert.equal(await restoreTable(up as never, again, 'bookmarks', true), 2);
  assert.deepEqual(writes, [['bookmarks', 2, 'user_id,pick_id']]);
  await assert.rejects(restoreTable(up as never, again, 'social_tokens', true), /Unknown table/);
  assert.throws(() => unpack(new Uint8Array(pack({ version: 1, taken_at: '', counts: {}, tables: {} })).slice(0, 5)));
});

test('secrets and collectable data are not in the backup set', () => {
  for (const t of ['social_tokens', 'raw_items', 'going_counts']) assert.equal(t in BACKUP_TABLES, false, t);
  for (const t of ['places', 'follows', 'saved_lists', 'place_fact_flags', 'event_merge_log', 'review_decisions', 'place_checks']) assert.ok(t in BACKUP_TABLES, t);
});

test('the freshness check wants a successful run in the last 14 hours', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  assert.equal(freshness([{ finished_at: '2026-10-04T08:00:00Z', ok: true }], now), null);
  assert.match(freshness([{ finished_at: '2026-10-03T12:00:00Z', ok: true }, { finished_at: '2026-10-04T11:00:00Z', ok: false }], now)!.detail, /24\.0 hours/);
  assert.match(freshness([], now)!.detail, /no successful run/);
});

test('the probes name what is down', async () => {
  const up = (async (u: string) => new Response(u.endsWith('/') ? '<title>x</title>' : u.includes('/api/rest/') ? '[{"id":"a"}]' : '<urlset></urlset>')) as unknown as typeof fetch;
  assert.deepEqual(await probes(up, 'https://s.example'), []);
  const down = (async (u: string) => (u.includes('/api/rest/') ? new Response('x', { status: 502 }) : up(u))) as unknown as typeof fetch;
  const p = await probes(down, 'https://s.example');
  assert.equal(p.length, 1); assert.equal(p[0].what, 'data'); assert.match(p[0].detail, /HTTP 502/);
});
