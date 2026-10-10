import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateEvents, oneShowPerItem, sameItemEvents, type ItemListing, type StoredEvent } from '../dedupe.ts';
import { reconcileEvents } from '../maintenance.ts';
import type { Db } from '../db.ts';

const event = (id: string, over: Partial<StoredEvent> = {}): StoredEvent => ({
  id, title: "Bush Hartshorn's workshop", place_id: 'elektron', starts_at: '2026-10-09T07:00:00Z', url: 'https://fienta.com/feedback',
  first_seen_at: '2026-09-30T12:00:00Z', status: 'published', has_time: true, ...over,
});
const listed = (item: number, single: boolean, ...ids: string[]): ItemListing[] => ids.map(event_id => ({ event_id, raw_item_id: item, single }));
const plan = (pairs: { duplicate: StoredEvent; canonical: StoredEvent }[]) => pairs.map(p => `${p.duplicate.id}>${p.canonical.id}`).sort();

test('only sources whose every item is one show count as one show per item', () => {
  assert.equal(oneShowPerItem('fienta'), true);
  assert.equal(oneShowPerItem('jsonld'), true);
  assert.equal(oneShowPerItem('wordpress'), true);           // Kultuurikatel: one post, one date
  assert.equal(oneShowPerItem('wordpress', 'kai'), false);   // a Kai film post carries every screening
  assert.equal(oneShowPerItem('html', 'vabalava'), false);   // its first item was the whole programme page
  for (const kind of ['html', 'telegram', 'instagram', 'rss']) assert.equal(oneShowPerItem(kind), false, kind);
});

test('a one-show item read again with a moved start joins its first row, wherever the start went', () => {
  const ten = event('ev_ten'), half12 = event('ev_half12', { starts_at: '2026-10-09T09:30:00Z', first_seen_at: '2026-10-06T18:00:00Z' });
  assert.deepEqual(plan(duplicateEvents('Europe/Tallinn', [half12, ten])), [], 'two and a half hours apart: not the same show by time alone');
  assert.deepEqual(plan(duplicateEvents('Europe/Tallinn', [half12, ten], new Set(), listed(623, true, 'ev_ten', 'ev_half12'))), ['ev_half12>ev_ten']);
  // Another day and another venue on the same page; a third reading joins the same row.
  const moved = event('ev_moved', { starts_at: '2026-10-24T12:00:00Z', place_id: 'sarle', first_seen_at: '2026-10-08T13:54:00Z' });
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [ten, half12, moved], listed(623, true, 'ev_ten', 'ev_half12', 'ev_moved'))),
    ['ev_half12>ev_ten', 'ev_moved>ev_ten']);
  // The item now names another show: not joined.
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [ten, event('ev_other', { title: 'Open studio evening', first_seen_at: '2026-10-06T18:00:00Z' })],
    listed(623, true, 'ev_ten', 'ev_other'))), []);
  // Another venue and another page is not one show, whatever the item.
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [ten, event('ev_far', { place_id: 'kanuti', url: 'https://other.example', first_seen_at: '2026-10-06T18:00:00Z' })],
    listed(623, true, 'ev_ten', 'ev_far'))), []);
});

test('a published listing is never folded into a rejected one; the canonical needs a place', () => {
  const rejected = event('ev_old', { status: 'rejected', place_id: 'rm-lounge' });
  const published = event('ev_new', { place_id: 'club-nine', starts_at: '2026-10-23T18:00:00Z', first_seen_at: '2026-10-03T20:11:00Z' });
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [rejected, published], listed(253, true, 'ev_old', 'ev_new'))), ['ev_old>ev_new']);
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [rejected, { ...published, status: 'rejected' }], listed(253, true, 'ev_old', 'ev_new'))), [],
    'two rejected rows stay as they are');
  const unplaced = event('ev_unplaced', { place_id: null });
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [unplaced, published], listed(253, true, 'ev_unplaced', 'ev_new'))), ['ev_unplaced>ev_new']);
});

test('a date-only row and a timed row of one post on the same Tallinn day are one show', () => {
  // 22:00Z on 1 November is 2 November in Tallinn.
  const day = event('ev_day', { title: 'Viva Verdi', place_id: 'estonia', url: 'https://t.me/sigmundtells/2704', has_time: false,
    starts_at: '2026-11-01T22:00:00Z', first_seen_at: '2026-10-07T23:23:00Z' });
  const timed = event('ev_timed', { title: 'Viva Verdi', place_id: 'estonia', url: 'https://t.me/sigmundtells/2704',
    starts_at: '2026-11-02T17:00:00Z', first_seen_at: '2026-10-01T06:23:00Z' });
  assert.deepEqual(plan(duplicateEvents('Europe/Tallinn', [day, timed], new Set(), listed(642, false, 'ev_day', 'ev_timed'))), ['ev_day>ev_timed']);
  // The older, published row keeps its id even when it is the date-only one; merge_events gives it the time.
  const olderDay = { ...day, first_seen_at: '2026-09-30T00:00:00Z' };
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [olderDay, timed], listed(642, false, 'ev_day', 'ev_timed'))), ['ev_timed>ev_day']);
  // Another day is another show for a post.
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [{ ...day, starts_at: '2026-11-02T22:00:00Z' }, timed], listed(642, false, 'ev_day', 'ev_timed'))), []);
  // Two rows one reading made together are two listings.
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [{ ...day, first_seen_at: timed.first_seen_at }, timed], listed(642, false, 'ev_day', 'ev_timed'))), []);
});

test('a post listing several dates keeps every date', () => {
  const show = (id: string, starts_at: string, has_time = true) => event(id, { title: 'Kino under the bridge', place_id: 'kino', url: 'https://www.instagram.com/p/x/',
    starts_at, has_time, first_seen_at: id === 'ev_day10' ? '2026-10-06T00:00:00Z' : '2026-10-02T00:00:00Z' });
  const oct10 = show('ev_10', '2026-10-10T16:00:00Z'), oct17 = show('ev_17', '2026-10-17T16:00:00Z');
  assert.deepEqual(plan(duplicateEvents('Europe/Tallinn', [oct10, oct17], new Set(), listed(830, false, 'ev_10', 'ev_17'))), []);
  // A later date-only reading of the 10th joins the 10th only.
  const day10 = show('ev_day10', '2026-10-09T21:00:00Z', false);
  assert.deepEqual(plan(sameItemEvents('Europe/Tallinn', [oct10, oct17, day10], listed(830, false, 'ev_10', 'ev_17', 'ev_day10'))), ['ev_day10>ev_10']);
});

test('two sessions on one day stay two, and a date-only row beside them cannot choose between them', () => {
  const at = (id: string, starts_at: string, has_time = true, first_seen_at = '2026-09-30T05:51:00Z') =>
    event(id, { title: 'Draakonipesa "Talvevõlu"', place_id: 'vaba-lava', url: 'https://vabalava.ee/mangukava/', starts_at, has_time, first_seen_at });
  const morning = at('ev_0930', '2026-10-24T06:30:00Z'), noon = at('ev_1100', '2026-10-24T08:00:00Z', true, '2026-10-01T06:23:00Z');
  const day = at('ev_day', '2026-10-23T21:00:00Z', false, '2026-10-02T00:00:00Z');
  assert.deepEqual(plan(duplicateEvents('Europe/Tallinn', [morning, noon, day], new Set(), listed(463, false, 'ev_0930', 'ev_1100', 'ev_day'))), []);
  // A film's screenings in one Kai post are separate too, whatever their days.
  const kai = (id: string, starts_at: string) => event(id, { title: '"Edge of The Night"', place_id: 'kai', url: 'https://kai.center/en/movie/x', starts_at,
    first_seen_at: '2026-09-28T23:27:01Z' });
  assert.deepEqual(plan(duplicateEvents('Europe/Tallinn', [kai('ev_28', '2026-10-28T16:00:00Z'), kai('ev_01', '2026-11-01T16:00:00Z')], new Set(),
    listed(2135, oneShowPerItem('wordpress', 'kai'), 'ev_28', 'ev_01'))), []);
});

test('an undone pair stays separate, and the planner never makes a row both canonical and duplicate', () => {
  const ten = event('ev_ten'), half12 = event('ev_half12', { starts_at: '2026-10-09T09:30:00Z', first_seen_at: '2026-10-06T18:00:00Z' });
  assert.deepEqual(plan(duplicateEvents('Europe/Tallinn', [ten, half12], new Set(['ev_half12|ev_ten']), listed(623, true, 'ev_ten', 'ev_half12'))), []);
  // y2 joins y3 by place and time (another source); y3 is that pair's canonical, so it is not also folded into y1.
  const y1 = event('ev_y1'), y3 = event('ev_y3', { starts_at: '2026-10-09T09:30:00Z', first_seen_at: '2026-10-01T00:00:00Z' });
  const y2 = event('ev_y2', { starts_at: '2026-10-09T09:30:00Z', url: null, first_seen_at: '2026-10-02T00:00:00Z' });
  assert.deepEqual(plan(duplicateEvents('Europe/Tallinn', [y1, y2, y3], new Set(), listed(700, true, 'ev_y1', 'ev_y3'))), ['ev_y2>ev_y3']);
});

test('maintenance reads each live row\'s source item and leaves out undone pairs (dry run)', async () => {
  const rows = [event('ev_ten'), event('ev_half12', { starts_at: '2026-10-09T09:30:00Z', first_seen_at: '2026-10-06T18:00:00Z' }),
    event('ev_post_a', { title: 'Viva Verdi', has_time: false, starts_at: '2026-11-01T22:00:00Z', first_seen_at: '2026-10-07T00:00:00Z' }),
    event('ev_post_b', { title: 'Viva Verdi', starts_at: '2026-11-02T17:00:00Z', first_seen_at: '2026-10-01T00:00:00Z' })];
  const asked: string[] = [];
  const reply = (path: string): unknown[] => {
    if (path.startsWith('events?')) return rows;
    if (path.startsWith('event_merge_log?')) return [{ duplicate_id: 'ev_post_a', canonical_id: 'ev_post_b' }];
    if (path.startsWith('sources?')) return [{ id: 'fienta', kind: 'fienta', config: {} }, { id: 'tg', kind: 'telegram', config: {} },
      { id: 'kai', kind: 'wordpress', config: { shape: 'kai' } }];
    if (path.startsWith('event_sources?')) return [
      { event_id: 'ev_archived', raw_item_id: 623, source_id: 'fienta' },
      { event_id: 'ev_half12', raw_item_id: 623, source_id: 'fienta' }, { event_id: 'ev_ten', raw_item_id: 623, source_id: 'fienta' },
      { event_id: 'ev_post_a', raw_item_id: 642, source_id: 'tg' }, { event_id: 'ev_post_b', raw_item_id: 642, source_id: 'tg' }];
    throw new Error(path);
  };
  const db = { all: async <T>(path: string) => { asked.push(path); return reply(path) as T[]; },
    req: async () => { throw new Error('a dry run writes nothing'); } } as unknown as Db;
  assert.deepEqual(plan(await reconcileEvents(db, 'tallinn', true)), ['ev_half12>ev_ten']);
  assert.ok(asked.includes('event_sources?raw_item_id=not.is.null&select=event_id,raw_item_id,source_id&order=event_id.asc,source_id.asc'));
});

test('a date-only copy of a show another source lists with its time joins the timed row, only when that is one start', async () => {
  const { dateOnlyJoins } = await import('../dedupe.ts');
  const ev = (id: string, title: string, starts_at: string, has_time: boolean, status = 'published', place_id: string | null = 'p-vonkrahl') =>
    ({ id, title, place_id, starts_at, url: null, first_seen_at: '2026-10-01T00:00:00Z', status, has_time });
  const pantheon = ev('ev_d', 'Pantheon', '2026-10-11T21:00:00Z', false);          // 12.10 in Tallinn, no time
  const timed = ev('ev_t', 'Pantheon / Viimast korda!', '2026-10-12T16:00:00Z', true);
  assert.deepEqual(dateOnlyJoins('Europe/Tallinn', [pantheon, timed]).map(p => [p.duplicate.id, p.canonical.id]), [['ev_d', 'ev_t']]);
  // Two timed starts that day are two sessions: the date-only row could be either.
  assert.equal(dateOnlyJoins('Europe/Tallinn', [pantheon, timed, ev('ev_t2', 'Pantheon', '2026-10-12T13:00:00Z', true)]).length, 0);
  // Another day, another place, another show, or a pair a person undid: nothing.
  assert.equal(dateOnlyJoins('Europe/Tallinn', [pantheon, { ...timed, starts_at: '2026-10-13T16:00:00Z' }]).length, 0);
  assert.equal(dateOnlyJoins('Europe/Tallinn', [pantheon, { ...timed, place_id: 'p-other' }]).length, 0);
  assert.equal(dateOnlyJoins('Europe/Tallinn', [pantheon, { ...timed, title: 'Meedium' }]).length, 0);
  assert.equal(dateOnlyJoins('Europe/Tallinn', [pantheon, timed], new Set(['ev_d|ev_t'])).length, 0);
  // A published listing never joins an unpublished one.
  assert.equal(dateOnlyJoins('Europe/Tallinn', [pantheon, { ...timed, status: 'review' }]).length, 0);
  // Two distinctive words are enough across languages.
  const tg = ev('ev_ru', 'Международный джаз-проект Toms Rudzinskis', '2026-10-21T21:00:00Z', false, 'rejected', 'p-philly');
  const club = ev('ev_club', 'Toms Rudzinskis “ABYSS” (LV-DK-DE-UA)', '2026-10-22T17:00:00Z', true, 'published', 'p-philly');
  assert.deepEqual(dateOnlyJoins('Europe/Tallinn', [tg, club]).map(p => p.canonical.id), ['ev_club']);
});
