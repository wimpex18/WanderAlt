import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Models, type Lane } from '../llm.ts';
import { cityProfile } from '../cities.ts';
import {
  POSTER_NOTE, findQuote, ruleQuote, statesStart, checkPosterDate, settle, sameShow, judge, judgeAgreed, decideHeld, noteFor, heldBy, pageWindows,
  type Ask, type Fit, type Held, type DateCheck,
} from '../review-decider.ts';
import type { Db } from '../db.ts';

const tz = 'Europe/Tallinn';
const tallinn = cityProfile('tallinn');
const row = (over: Partial<Held> = {}): Held => ({
  id: 'ev_1', title: 'Madis Sikk Trio', venue_name: "Philly Joe's Jazz Club", address: null, description: null, url: null,
  starts_at: '2026-10-30T18:00:00.000Z', has_time: true, place_id: 'tallinn-philly-joe-s-jazz-club', status: 'review', status_note: 'borderline fit 0.50', relevance: 0.5, ...over,
});
const fit = (decision: 'publish' | 'reject', over: Partial<Fit> = {}): Fit => ({
  decision, reason: decision === 'publish' ? 'fits' : 'hobby', quote: 'Madis Sikk Trio', quote_in: 'title', why: 'x', engine: 'claude:test', ...over,
});
const lane = (answer: (user: string) => unknown): Lane => ({ name: 'claude', model: 'test', key: 'k', call: async (_s, user) => JSON.stringify(answer(user)) });
const ask = (over: Partial<Ask> = {}): Ask => ({
  ids: ['ev_1'], title: 'Sip & Paint Night', venue: 'Kartul', address: null, text: 'Paint along with a glass of wine; all materials included.', caption: null,
  page: null, page_url: null, venue_kind: 'bar', venue_picked: false, source: 'Fienta', held_by: 'rule: hobby class (sip & paint)', kind: 'workshop', ...over,
});

test('a quote counts only when it is the listing\'s own words, in the field it came from', () => {
  const fields = { title: 'Bardot', venue: 'Kino Sõprus', text: 'Intiimne pilguheit rahvusvahelise ikooni Brigitte Bardot ellu.' };
  assert.equal(findQuote(fields, 'Bardot'), 'title', 'a short title counts as a whole field');
  assert.equal(findQuote(fields, 'rahvusvahelise   ikooni Brigitte'), 'text', 'spacing and case may differ');
  assert.equal(findQuote(fields, 'An intimate look at an international icon'), null, 'a translation is not a quote');
  assert.equal(findQuote(fields, 'Bard'), null, 'a fragment of a word or field is not');
  assert.equal(findQuote(fields, 'Bardot Kino Sõprus'), null, 'a quote never joins fields');
  assert.equal(findQuote(fields, ''), null);
});

test('a rule\'s own match is found again in the title or venue and names the reason', () => {
  assert.deepEqual(ruleQuote('rule: hobby class (sip & paint)', '🌌 Paint the Starry Night — Sip & Paint experience', 'Morii'), { quote: 'sip & paint', quote_in: 'title', reason: 'hobby' });
  assert.deepEqual(ruleQuote('rule: restaurant venue (resto)', 'EMOTIONAL ESSENCE art tasting', 'R14 Resto'), { quote: 'resto', quote_in: 'venue', reason: 'dining' });
  assert.equal(ruleQuote('rule: children venue (noortekeskus)', 'Kokandus', 'Kristiine noortekeskus')?.reason, 'children');
  assert.equal(ruleQuote('rule: not a title (a sentence)', 'LOTTE.  Väikestele ja suurtele.', null)?.quote_in, 'title');
  assert.equal(ruleQuote('borderline fit 0.50', 'Anything', null), null);
  assert.equal(ruleQuote('rule: wellness (yoga)', 'A night of jazz', 'Uus Laine'), null, 'a match no longer there decides nothing');
});

test('a date and time count as stated only together, next to the show\'s name', () => {
  const start = '2026-10-24T17:00:00.000Z';   // 20:00 in Tallinn
  assert.ok(statesStart('Altairea Takeover – Electronic Live Jam\nL 24.10 kell 20', 'Altairea Takeover – Electronic Live Jam', start, true, tz));
  assert.ok(statesStart('Saturday, October 24, 2026 · 8:00 PM\nAltairea Takeover', 'Altairea Takeover', start, true, tz));
  assert.ok(statesStart('24 октября в 20:00 — Altairea Takeover', 'Altairea Takeover', start, true, tz));
  assert.equal(statesStart('Altairea Takeover on 24.10!', 'Altairea Takeover', start, true, tz), null, 'a date without its time');
  assert.equal(statesStart('Altairea Takeover 25.10 kell 20:00', 'Altairea Takeover', start, true, tz), null, 'another day');
  assert.equal(statesStart('24.10 kell 20:00 Funk Jam', 'Altairea Takeover', start, true, tz), null, 'another show');
  assert.equal(statesStart('Altairea Takeover 24.10 kell 21:00', 'Altairea Takeover', start, true, tz), null, 'another time');
  assert.ok(statesStart('Juba 22. oktoobril algab Üle Heli festival', 'ÜLE HELI FESTIVAL 2026', '2026-10-21T21:00:00.000Z', false, tz), 'a date-only listing needs only its date');
  assert.equal(statesStart('5 марта Üle Heli festival', 'ÜLE HELI FESTIVAL 2026', '2026-05-04T21:00:00.000Z', false, tz), null, 'March is not May');
  assert.equal(statesStart('Juba 5. detsembril kohtume Põhjalas jõuluturul', 'JÕULUD & TURG', '2026-12-04T22:00:00.000Z', false, tz), null, 'a passage that does not name the show');
  assert.equal(statesStart('Kokandus 20.10 15:00', 'Kokandus', '2026-10-20T12:00:00.000Z', true, tz)?.includes('15:00'), true);
});

test('a poster\'s date is confirmed by the caption, another source\'s own record or the venue\'s site, and a show listed already is not listed twice', () => {
  const r = row({ title: 'Toms Rudzinskis “ABYSS” (LV-DK-DE-UA)', starts_at: '2026-10-22T17:00:00.000Z', status_note: POSTER_NOTE });
  const none = { caption: 'Oktoobrikuu muusikaline programm Philly Joe\'s jazziklubis', others: [], twins: [] };
  assert.equal(checkPosterDate(r, tz, none).confirmed, false);
  const site = checkPosterDate(r, tz, { ...none, site: [{ url: 'https://www.phillyjoes.com/programme/toms-rudzinskis-abyss', text: 'Toms Rudzinskis “ABYSS” (LV-DK-DE-UA)\nThursday, October 22, 2026\n8:00 PM\n20:00' }] });
  assert.equal(site.confirmed, true);
  assert.match(site.by!, /venue's own site \(phillyjoes\.com\)/);
  const source = { id: 'saal', label: 'Kanuti Gildi SAAL', kind: 'html' as const, curated: true, config: {}, url: '', handle: '', city: 'tallinn' };
  const reread = checkPosterDate(r, tz, { ...none, others: [{ source, raw: null, candidates: [{ title: 'Toms Rudzinskis ABYSS', starts_at: r.starts_at, has_time: true, engine: 'saal' }] }] });
  assert.equal(reread.by, 'Kanuti Gildi SAAL');
  const elsewhen = checkPosterDate(r, tz, { ...none, others: [{ source, raw: null, candidates: [{ title: 'Toms Rudzinskis ABYSS', starts_at: '2026-10-22T18:00:00.000Z', has_time: true, engine: 'saal' }] }] });
  assert.equal(elsewhen.confirmed, false, 'another source at another time confirms nothing');
  const twin = { id: 'ev_2', title: 'Toms Rudzinskis ABYSS concert', place_id: r.place_id, venue_name: null, starts_at: '2026-10-21T21:00:00.000Z', has_time: false, status: 'published', status_note: 'fit 0.90' };
  assert.deepEqual(checkPosterDate(r, tz, { ...none, twins: [twin] }).twin, { id: 'ev_2', status: 'published' });
  assert.equal(checkPosterDate(r, tz, { ...none, twins: [{ ...twin, status_note: POSTER_NOTE }] }).twin, undefined, 'another poster reading is no second witness');
});

test('settling: what a decision rests on, and what it never does', () => {
  // A fit decides; its quote and reason travel with it.
  assert.deepEqual([settle(row(), fit('reject'), null, 0).status, settle(row(), fit('reject'), null, 0).reason], ['rejected', 'hobby']);
  assert.equal(settle(row(), fit('publish'), null, 0).status, 'published');
  // A poster's date: published only once confirmed; otherwise out, looked at again later.
  const poster = row({ status_note: POSTER_NOTE });
  const unconfirmed = settle(poster, fit('publish'), { confirmed: false, by: null, quote: null, quote_in: null }, 0);
  assert.deepEqual([unconfirmed.status, unconfirmed.reason, noteFor(unconfirmed)], ['rejected', 'poster-date', 'auto reject: date only on a poster']);
  const confirmed: DateCheck = { confirmed: true, by: "the venue's own site (phillyjoes.com)", quote: 'Madis Sikk Trio 30.10 20:00', quote_in: 'source' };
  assert.match(settle(poster, fit('publish'), confirmed, 0).why, /confirmed by the venue's own site/);
  assert.equal(settle(poster, fit('publish'), { ...confirmed, confirmed: false, twin: { id: 'ev_9', status: 'published' } }, 0).reason, 'duplicate');
  // A sentence or a credit in place of a title is never published, whatever a model says.
  assert.equal(settle(row({ title: 'VAT Teatri ja Vaba Lava koostööprojekt.', status_note: 'rule: not a title (koostööprojekt)' }), fit('publish'), null, 0).status, 'rejected');
  // No checked answer: a rule decides on its own match after three runs; a doubtful score waits.
  const rule = row({ title: 'Sip & Paint Night', status_note: 'rule: hobby class (sip & paint)' });
  assert.equal(settle(rule, null, null, 0).quote, null);
  assert.deepEqual([settle(rule, null, null, 2).status, settle(rule, null, null, 2).quote], ['rejected', 'sip & paint']);
  assert.deepEqual([settle(row(), null, null, 9).status, settle(row(), null, null, 9).quote], ['review', null]);
  assert.equal(heldBy('trusted source, low fit 0.20').label, 'from a trusted programme, but a model scored its fit 0.20 of 1');
});

test('two rows of one show: the same place and day, close starts unless one has no time, titles that agree', () => {
  const a = row({ title: 'Международный джаз-проект Toms Rudzinskis', starts_at: '2026-10-21T21:00:00.000Z', has_time: false });
  const b = row({ id: 'ev_2', title: 'Toms Rudzinskis “ABYSS” (LV-DK-DE-UA)', starts_at: '2026-10-22T17:00:00.000Z' });
  assert.ok(sameShow(a, b, tz));
  assert.ok(!sameShow(row({ title: 'Hope', starts_at: '2026-10-22T14:00:00.000Z' }), row({ id: 'ev_3', title: 'Hope', starts_at: '2026-10-22T17:00:00.000Z' }), tz), 'two screenings are two sessions');
  assert.ok(!sameShow(b, { ...b, place_id: 'tallinn-uus-laine' }, tz));
  assert.ok(!sameShow(row({ title: 'Jazz Night', has_time: false }), row({ id: 'ev_4', title: 'Blues Night' }), tz), 'kind words alone are not one show');
});

test('a page\'s passages about this date: where a programme lists it under its town', () => {
  const page = 'Tallinn\nSalme tn 12\nNarva\nLinda 2, 20309 Narva\nSügissonaat\nOsalised\nEtendused\nNarva\nSügissonaat\nE 12.10\n19:00\nSuur saal\nKülalisetendus';
  const w = pageWindows(page, 'Sügissonaat', '2026-10-12T16:00:00.000Z', tz)!;
  assert.match(w, /Etendused\nNarva\nSügissonaat\nE 12\.10/);
  assert.doesNotMatch(w, /Linda 2/, 'the menu\'s addresses are not about this date');
  assert.equal(pageWindows(page, 'Sügissonaat', '2026-11-12T16:00:00.000Z', tz, false), null);
});

test('only checked answers are kept: the quote must be in that listing, and the reason must match the decision', async () => {
  const asks = [ask(), ask({ ids: ['ev_2'], title: 'Bardot', venue: 'Kino Sõprus', text: 'Dokumentaalfilm Brigitte Bardot elust.' }), ask({ ids: ['ev_3'], title: 'Hope' }), ask({ ids: ['ev_4'], title: 'Laulupidu' })];
  const models = new Models([lane(() => ({ items: [
    { i: 0, decision: 'reject', reason: 'hobby', quote: 'Sip & Paint', why: 'A hobby class.' },
    { i: 1, decision: 'publish', reason: 'fits', quote: 'Dokumentaalfilm Brigitte Bardot elust', why: 'A documentary.' },
    { i: 2, decision: 'publish', reason: 'fits', quote: 'a film about hope', why: 'Invented.' },
    { i: 3, decision: 'publish', reason: 'mainstream', quote: 'Laulupidu', why: 'Inconsistent.' },
  ] }))], 5);
  const out = await judge(models, tallinn, asks);
  assert.deepEqual([...out.keys()], [0, 1]);
  assert.equal(out.get(1)!.quote_in, 'text');
});

test('a listing is settled only by two agreeing answers; a split is broken by a third', async () => {
  let call = 0;
  const answers = [
    { items: [{ i: 0, decision: 'reject', reason: 'hobby', quote: 'Sip & Paint', why: '1' }, { i: 1, decision: 'publish', reason: 'fits', quote: 'Hope', why: '1' }] },
    // The second pass reads the listings in reverse order: 0 is Hope, 1 is Sip & Paint.
    { items: [{ i: 0, decision: 'reject', reason: 'mainstream', quote: 'Hope', why: '2' }, { i: 1, decision: 'reject', reason: 'hobby', quote: 'Sip & Paint', why: '2' }] },
    { items: [{ i: 0, decision: 'publish', reason: 'fits', quote: 'Hope', why: '3' }] },
  ];
  const models = new Models([lane(() => answers[call++])], 10);
  const out = await judgeAgreed(models, tallinn, [ask(), ask({ ids: ['ev_2'], title: 'Hope', text: null })]);
  assert.equal(call, 3);
  assert.deepEqual([out.get(0)!.decision, out.get(0)!.why], ['reject', '1']);
  assert.deepEqual([out.get(1)!.decision, out.get(1)!.votes], ['publish', ['publish:fits', 'reject:mainstream', 'publish:fits']]);
});

test('the decider reads only held rows nobody decided, and applies each decision from the state it read', async () => {
  const reads: string[] = [], rpcs: Record<string, unknown>[] = [], patches: string[] = [];
  const held = [row({ id: 'ev_1', title: 'Sip & Paint Night', venue_name: 'Kartul', place_id: null, status_note: 'rule: hobby class (sip & paint)' })];
  const db = {
    all: async (path: string) => { reads.push(path); return path.startsWith('events?') && path.includes('status=eq.review') ? held : []; },
    select: async (path: string) => { reads.push(path); return []; },
    patch: async (path: string) => { patches.push(path); return null; },
    req: async (_m: string, path: string, body: Record<string, unknown>) => { if (path === 'rpc/apply_review_decision') rpcs.push(body); return 1; },
  } as unknown as Db;
  const models = new Models([lane(() => ({ items: [{ i: 0, decision: 'reject', reason: 'hobby', quote: 'Sip & Paint', why: 'A hobby class.' }] }))], 10);
  const out = await decideHeld(db, 'tallinn', models, { pages: { get: async () => null } as never });
  assert.equal(out.length, 1);
  for (const r of reads.filter(p => p.startsWith('events?city='))) assert.match(r, /status_note\.not\.like\.manual\*/);
  assert.equal(patches.length, 1, 'the legacy poster label is renamed, nothing else is patched directly');
  assert.match(patches[0], /status_note=eq\.manual%20review%3A%20date%20and%20time%20read%20from%20Instagram%20poster/);
  assert.deepEqual(rpcs.map(b => [b.p_event, b.p_before_status, b.p_before_note, b.p_status, b.p_note]),
    [['ev_1', 'review', 'rule: hobby class (sip & paint)', 'rejected', 'auto reject: a hobby class']]);
  assert.equal((rpcs[0].p_decision as { quote: string }).quote, 'Sip & Paint');

  // A dry run decides the same and writes nothing.
  rpcs.length = 0; patches.length = 0;
  await decideHeld(db, 'tallinn', models, { dry: true, pages: { get: async () => null } as never });
  assert.deepEqual([rpcs.length, patches.length], [0, 0]);
});

test('a second look at listings published on a fit score: once each, a reject takes it down, a publish is noted', async () => {
  const rpcs: Record<string, unknown>[] = [];
  const out = (id: string, title: string, note = 'fit 0.80') => row({ id, title, venue_name: 'Somewhere', place_id: null, status: 'published', status_note: note });
  const audited = [out('ev_a', 'Viva Verdi'), out('ev_b', 'Laine Live: Human Natures'), out('ev_c', 'Asked before'), out('ev_d', 'Gave up on'), out('ev_e', 'Over the cap')];
  const db = {
    all: async (path: string) => (path.includes('status=eq.published') && path.includes('status_note=like.fit') ? audited : []),
    select: async (path: string) => (path.startsWith('review_decisions') ? [
      { event_id: 'ev_c', outcome: 'published', reason: 'fits', evidence: {} },
      ...['1', '2', '3'].map(() => ({ event_id: 'ev_d', outcome: 'waits', reason: 'unclear', evidence: {} })),
    ] : []),
    patch: async () => null,
    req: async (_m: string, path: string, body: Record<string, unknown>) => { if (path === 'rpc/apply_review_decision') rpcs.push(body); return 1; },
  } as unknown as Db;
  const asked: string[] = [];
  const models = new Models([lane(user => {
    const items = JSON.parse(user) as { i: number; title: string }[];
    asked.push(...items.map(x => x.title));
    return { items: items.map(x => (x.title === 'Viva Verdi'
      ? { i: x.i, decision: 'reject', reason: 'hobby', quote: 'Viva Verdi', why: 'A class.' }
      : { i: x.i, decision: 'publish', reason: 'fits', quote: x.title, why: 'An indie gig.' })) };
  })], 20);
  await decideHeld(db, 'tallinn', models, { audit: 2, pages: { get: async () => null } as never });
  assert.deepEqual([...new Set(asked)].sort(), ['Laine Live: Human Natures', 'Viva Verdi'], 'once each, three waits are enough, and the cap holds');
  assert.deepEqual(rpcs.map(b => [b.p_event, b.p_before_status, b.p_status, b.p_note]).sort(),
    [['ev_a', 'published', 'rejected', 'auto reject: a hobby class'], ['ev_b', 'published', 'published', 'auto publish: kept after a second look']]);
});

test('a second look takes a listing down only on a clear reject; a split or "unclear" keeps it', async () => {
  const { audited } = await import('../review-decider.ts');
  const r = row({ id: 'ev_k', title: 'Doctor Zhivago, part three', status: 'published', status_note: 'fit 0.70' });
  const hobby = fit('reject', { reason: 'hobby', votes: ['reject:hobby', 'reject:hobby'] });
  assert.equal(audited(r, settle(r, hobby, null, 0), hobby).status, 'rejected');
  // Taste does not take a published listing down, however sure.
  const taste = fit('reject', { reason: 'mainstream', votes: ['reject:mainstream', 'reject:mainstream'] });
  assert.equal(audited(r, settle(r, taste, null, 0), taste).status, 'published');
  assert.equal(settle(row(), taste, null, 0).status, 'rejected', 'a held listing is still rejected for it');
  const split = fit('reject', { reason: 'hobby', votes: ['publish:fits', 'reject:hobby', 'reject:hobby'] });
  const kept = audited(r, settle(r, split, null, 0), split);
  assert.deepEqual([kept.status, kept.reason, kept.quote], ['published', 'kept', 'Doctor Zhivago, part three']);
  assert.match(kept.why, /did not agree/);
  const unclear = fit('reject', { reason: 'unclear', votes: ['reject:unclear', 'reject:unclear'] });
  assert.equal(audited(r, settle(r, unclear, null, 0), unclear).status, 'published');
  assert.equal(noteFor(kept), 'auto publish: kept after a second look');
});
