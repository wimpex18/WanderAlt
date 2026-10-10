import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editEnglish, englishHash, eventText, excerpt, refreshEnglish, validatedCopy, workSource, type EnglishInput } from '../english.ts';
import { Models, usage } from '../llm.ts';
import { eventRefreshFacts } from '../run.ts';
import { cityProfile } from '../cities.ts';

const tallinn = cityProfile('tallinn');

const event = (over: Partial<EnglishInput> = {}): EnglishInput => ({ id: 'jazz', title: 'Джаз', description: 'Джаз в Philly Joe’s.',
  venue_name: 'Philly Joe’s', kind: 'gig', url: null, language: 'ru', ...over });
const answer = (over = {}) => ({ id: 'jazz', title_en: 'Jazz', summary_en: 'A jazz gig at Philly Joe’s.', original_language: 'ru', event_languages: [], ...over });
const model = (read: (text: string) => unknown, budget = 10) => new Models([{ name: 'fixture', model: 'fixture', key: 'test',
  call: async (_system, user) => JSON.stringify(read(user)) }], budget);

test('Russian source copy does not establish performance language; exact bilingual evidence does', () => {
  const e = event();
  assert.deepEqual(validatedCopy(e, { text: e.description!, url: null }, answer(), tallinn)?.event_languages, []);
  const text = 'Etendus toimub nii eesti kui vene keeles. Estonian subtitles.';
  const copy = validatedCopy(e, { text, url: null }, answer({ event_languages: [
    { code: 'et', evidence: 'Etendus toimub nii eesti kui vene keeles.' },
    { code: 'ru', evidence: 'Etendus toimub nii eesti kui vene keeles.' },
    { code: 'en', evidence: 'In English' }, { code: 'et', evidence: 'Estonian subtitles.' },
  ] }), tallinn);
  assert.deepEqual(copy?.event_languages, ['et', 'ru']);
  const interpretation = validatedCopy(e, { text: 'The talk has interpretation in English.', url: null }, answer({ event_languages: [{ code: 'en', evidence: 'in English' }] }), tallinn);
  assert.deepEqual(interpretation?.event_languages, []);
  const wrongCode = validatedCopy(e, { text: 'Performed in Russian.', url: null }, answer({ event_languages: [{ code: 'en', evidence: 'Performed in Russian.' }] }), tallinn);
  assert.deepEqual(wrongCode?.event_languages, []);
  const nationality = validatedCopy(e, { text: 'A Russian artist presents her work.', url: null }, answer({ event_languages: [{ code: 'ru', evidence: 'A Russian artist presents her work.' }] }), tallinn);
  assert.deepEqual(nationality?.event_languages, []);
  assert.equal(validatedCopy(e, { text: 'An English announcement.', url: null, language: 'et' }, answer({ original_language: 'en' }), tallinn)?.original_language, 'en');
  const either = validatedCopy(event({ title: 'Exhibition Tour (in English)' }), { text: 'Tours are either in English or Estonian.', url: null }, answer({ event_languages: [
    { code: 'en', evidence: 'in English' }, { code: 'et', evidence: 'Tours are either in English or Estonian.' },
  ] }), tallinn);
  assert.deepEqual(either?.event_languages, ['en']);
});

test('invalid English output and duplicate/missing event answers stay pending, without leaking another event’s copy', async () => {
  assert.equal(validatedCopy(event(), { text: '', url: null }, answer({ title_en: 'Джаз' }), tallinn), null);
  assert.equal(validatedCopy(event(), { text: '', url: null }, answer({ summary_en: '' }), tallinn), null);
  assert.equal(validatedCopy(event(), { text: '', url: null }, answer({ title_en: 'Linastus Kai kinos: Night Child' }), tallinn), null);
  const copies = await editEnglish(model(() => ({ items: [answer(), answer(), { ...answer(), id: 'stranger' }] })), [event()], tallinn,
    async () => ({ text: 'Джаз.', url: null }));
  assert.equal(copies.size, 0);
});

test('an exhausted Workers allocation and no usable fallback stop the editorial queue', () => {
  const before = usage.neurons;
  try {
    usage.neurons = 10;
    const m = new Models([{ name: 'workers-ai', model: 'fixture', key: 'test', call: async () => '{}' }], 10, 5);
    assert.equal(m.ready, false); assert.equal(m.calls, 0);
  } finally { usage.neurons = before; }
});

test('event source fetching identifies the exact event, rejects programmes and leaves contact details out', () => {
  const page = '<h1>Jazz</h1><main><nav>Other shows</nav><h1>Jazz</h1><p>Trio with piano and bass.</p></main>';
  assert.equal(eventText(page, 'Jazz'), null); // two headings: ambiguous
  assert.equal(eventText('<main><h1>Jazz</h1><p>Trio with piano and bass.</p><footer>Other shows</footer></main>', 'Jazz'), 'Jazz\nTrio with piano and bass.');
  assert.equal(eventText('<main><h1>Programme</h1><p>Jazz at 19:00</p></main>', 'Jazz'), null);
  assert.equal(eventText('<main><h1>Sõda (War)</h1><p>Synopsis.</p></main>', 'Sõda'), 'Sõda (War)\nSynopsis.');
  const film = [{ '@type': 'Movie', name: 'Film', description: 'Its own synopsis.' },
    { '@type': 'ScreeningEvent', name: 'Film' }, { '@type': 'ScreeningEvent', name: 'Film' }];
  assert.equal(eventText(`<script type="application/ld+json">${JSON.stringify(film)}</script><h1>Film</h1>`, 'Film'), 'Film\nIts own synopsis.');
  assert.equal(eventText('<main><h1>Jazz</h1><p>A piano trio.</p><section class="related"><h2>Other events</h2><p>A rock concert.</p></section></main>', 'Jazz'), 'Jazz\nA piano trio.');
  const nodes = [{ '@type': 'MusicEvent', name: 'Jazz', description: '<p>A trio. Contact test@example.com</p>' },
    { '@type': 'MusicEvent', name: 'Rock', description: 'Unrelated' }];
  const text = eventText(`<script type="application/ld+json">${JSON.stringify(nodes)}</script>`, 'Jazz');
  assert.match(text!, /A trio/); assert.doesNotMatch(text!, /example.com|Unrelated/);
  assert.equal(eventText(`<script type="application/ld+json">${JSON.stringify(nodes)}</script><main><h1>Unlisted</h1>Unrelated</main>`, 'Unlisted'), null);
});

test('a checkout follows only its own schema-linked film page, even when another film has the same name', () => {
  const nodes = [
    { '@type': 'ScreeningEvent', '@id': 'https://cinema.example/checkout/1#screening', name: 'Film', workPresented: { '@id': 'movie-1' } },
    { '@type': 'Movie', '@id': 'movie-1', name: 'Film', url: 'https://cinema.example/film/1' },
    { '@type': 'Movie', '@id': 'movie-2', name: 'Film', url: 'https://cinema.example/film/2' },
  ];
  const html = `<script type="application/ld+json">${JSON.stringify(nodes)}</script>`;
  assert.deepEqual(workSource(html, 'https://cinema.example/checkout/1', 'Film'), { url: 'https://cinema.example/film/1', title: 'Film' });
  assert.equal(workSource(html, 'https://cinema.example/checkout/unknown', 'Film'), null);
  assert.equal(workSource(html, 'https://cinema.example/checkout/1', 'Other film'), null);
});

test('English editing resumes by input hash, even after a batch returns no copy; refresh never erases saved English', async () => {
  const cached = event({ id: 'cached' }); cached.english_input_hash = englishHash(cached);
  const waiting = event();
  const rows = [cached, waiting]; const patches: Record<string, unknown>[] = [];
  const db = { all: async <T>() => rows as T[], patch: async (_path: string, values: unknown) => { patches.push(values as Record<string, unknown>); } };
  assert.equal(await refreshEnglish(db, model(() => ({ items: [] })), 'tallinn'), 0);
  assert.equal(patches.length, 0);
  assert.equal(await refreshEnglish(db, model(() => ({ items: [answer()] })), 'tallinn'), 1);
  assert.equal(patches[0].english_input_hash, englishHash(waiting));
  assert.notEqual(englishHash(waiting), englishHash({ ...waiting, description: 'Changed source' }));
  assert.equal('status' in patches[0], false);
  assert.equal('image_url' in patches[0], false);
  const refresh = eventRefreshFacts({ engine: 'jsonld+model', title_en: null, summary_en: 'Unreviewed', title: 'Updated source' });
  assert.equal('title_en' in refresh, false); assert.equal('summary_en' in refresh, false);
});

test('long original text ends at a readable boundary and never exceeds the public excerpt limit', () => {
  const text = 'A sentence about the performance.\n'.repeat(150);
  const shortened = excerpt(text);
  assert.ok(shortened.length <= 2000); assert.ok(shortened.endsWith('…'));
  assert.equal(excerpt('Short source text.'), 'Short source text.');
});

import { tidyTitle, untranslatedTitle } from '../english.ts';
import { localToIso } from '../time.ts';
const tallinnToIso = (local: string) => localToIso(local, tallinn.tz);

test("English titles lose this event's own date, time, venue and city, and a repeated half", () => {
  const at = (local: string, venue_name: string | null = null) => ({ venue_name, starts_at: tallinnToIso(local) });
  assert.equal(tidyTitle('Telliskivi Comedy Club Comedy Night 19:00', at('2026-10-09 19:00', 'Fonoteek'), tallinn), 'Telliskivi Comedy Club Comedy Night');
  assert.equal(tidyTitle('Telliskivi Komöödiaklubi English Comedy Showcase 10.10.2026', at('2026-10-10 18:00', 'Fonoteek'), tallinn), 'Telliskivi Komöödiaklubi English Comedy Showcase');
  assert.equal(tidyTitle('DnD – Wednesday 14.10.2026 @The _Workshop', at('2026-10-14 18:30', 'Drink and Draw Tallinn / The Workshop'), tallinn), 'DnD');
  assert.equal(tidyTitle('DnD – Wednesday 14 Oct 2026 @ The _Workshop', at('2026-10-14 18:30', 'Drink and Draw Tallinn / The Workshop'), tallinn), 'DnD');
  assert.equal(tidyTitle('Rock Friday: ROCKSHOCK + NIGHT FLIES @ The Krypt, Tallinn', at('2026-10-09 21:00', 'The Krypt Spooky Bar & Stage'), tallinn), 'Rock Friday: ROCKSHOCK + NIGHT FLIES');
  assert.equal(tidyTitle('10.10 • 𝐃𝐨𝐨𝐦𝐞𝐝 𝐒𝐚𝐭𝐮𝐫𝐝𝐚𝐲: TAAK @ The Krypt, Tallinn 🦇', at('2026-10-10 21:00', 'The Krypt Spooky Bar & Stage'), tallinn), 'Doomed Saturday: TAAK');
  assert.equal(tidyTitle('Art Class 10.10', at('2026-10-10 11:00', 'LovePaint.eu'), tallinn), 'Art Class');
  assert.equal(tidyTitle('Komöödiaõhtu 09.10.2026 kell 19:00', at('2026-10-09 19:00'), tallinn), 'Komöödiaõhtu');
  assert.equal(tidyTitle('“Pie for Grandma” / “Pie for Grandma” - eccentric clowning', at('2026-10-09 19:00'), tallinn), '“Pie for Grandma” - eccentric clowning');
  assert.equal(tidyTitle('COSMODROME • 16.10 🚀 | KAI', at('2026-10-16 22:00', 'KAI Estonia'), tallinn), 'COSMODROME');
  assert.equal(tidyTitle('EIII (LV) + V4R1 (EE) | 17.10 Uus Laine', at('2026-10-17 19:00', 'Uus Laine'), tallinn), 'EIII (LV) + V4R1 (EE)');
  assert.equal(tidyTitle('Antonio Tensuro Trio @ Von Krahl', at('2026-10-24 19:00', 'Von Krahli teater'), tallinn), 'Antonio Tensuro Trio');
  assert.equal(tidyTitle('WHOMADEWHO @ TALLINN, ESTONIA', at('2026-10-23 23:00', 'Tallinn Cruise Terminal'), tallinn), 'WHOMADEWHO');
  assert.equal(tidyTitle('Jazz Night on October 10th, 2026', at('2026-10-10 20:00'), tallinn), 'Jazz Night');
});

test('titles keep dates that belong to them, other venues, other days, and are never cut to nothing', () => {
  const at = (local: string, venue_name: string | null = 'Kino Sõprus') => ({ venue_name, starts_at: tallinnToIso(local) });
  for (const title of ['1984', '2001: A Space Odyssey', "Summer of '69", 'Live 2.0', 'Tea with Bach / Tee Bachiga'])
    assert.equal(tidyTitle(title, at('2026-10-10 19:00'), tallinn), title);
  assert.equal(tidyTitle('Remembering 9.11', at('2026-10-09 19:00'), tallinn), 'Remembering 9.11');        // not this event's date
  assert.equal(tidyTitle('Comedy Night 18:00', at('2026-10-09 19:00'), tallinn), 'Comedy Night 18:00');    // not its start
  assert.equal(tidyTitle('Black Sunday 18.10', at('2026-10-18 19:00'), tallinn), 'Black Sunday');          // a weekday in the title stays
  assert.equal(tidyTitle('Pottery Course | ADO Studio at Põhjala Factory', at('2026-10-08 18:00', 'Põhjala tehas'), tallinn), 'Pottery Course | ADO Studio at Põhjala Factory');
  assert.equal(tidyTitle('Make Immigrants Great Again | English Comedy in Estonia', at('2026-10-22 19:00'), tallinn), 'Make Immigrants Great Again | English Comedy in Estonia');
  assert.equal(tidyTitle('10.10', at('2026-10-10 19:00'), tallinn), '10.10');
  assert.equal(tidyTitle('Kino Sõprus @ Tallinn', at('2026-10-10 19:00'), tallinn), 'Kino Sõprus');
  assert.equal(tidyTitle('Art Class 10.10', {}, tallinn), 'Art Class 10.10');                                   // no start, no date to recognise
});

test('Estonian format words are caught inside compounds and capitals, and the saved copy is tidied', () => {
  assert.equal(untranslatedTitle('Telliskivi Komöödiaklubi KOMÖÖDIAÕHTU'), true);
  assert.equal(untranslatedTitle('Jõulukontsert'), true);
  assert.equal(untranslatedTitle('Telliskivi Komöödiaklubi English Comedy Showcase'), false);   // an organiser's name stays
  assert.equal(validatedCopy(event(), { text: '', url: null }, answer({ title_en: 'Telliskivi Komöödiaklubi KOMÖÖDIAÕHTU 10.10.2026' }), tallinn), null);
  const timed = event({ venue_name: 'Philly Joe’s', starts_at: tallinnToIso('2026-10-09 19:00') });
  assert.equal(validatedCopy(timed, { text: '', url: null }, answer({ title_en: 'Jazz 19:00 @ Philly Joe’s' }), tallinn)?.title_en, 'Jazz');
  assert.equal(englishHash(timed), englishHash(event({ venue_name: 'Philly Joe’s' })));         // the start is no input to the copy
});

test('saved English titles are tidied without a model, and an untranslated one is due again', async () => {
  const done = event({ id: 'done', title_en: 'Art Class 10.10', venue_name: 'LovePaint.eu', starts_at: tallinnToIso('2026-10-10 11:00') });
  done.english_input_hash = englishHash(done);
  const estonian = event({ id: 'estonian', title_en: 'Telliskivi Komöödiaklubi KOMÖÖDIAÕHTU', starts_at: tallinnToIso('2026-10-10 20:00') });
  estonian.english_input_hash = englishHash(estonian);
  const patches: [string, Record<string, unknown>][] = [];
  const asked: string[] = [];
  const db = { all: async <T>() => [done, estonian] as T[], patch: async (path: string, values: unknown) => { patches.push([path, values as Record<string, unknown>]); } };
  await refreshEnglish(db, model(user => { asked.push(...JSON.parse(user).map((e: { id: string }) => e.id)); return { items: [] }; }), 'tallinn');
  assert.deepEqual(patches, [['events?id=eq.done', { title_en: 'Art Class' }]]);
  assert.deepEqual(asked, ['estonian']);
});
