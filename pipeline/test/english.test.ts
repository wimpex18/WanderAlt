import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editEnglish, englishHash, eventText, excerpt, refreshEnglish, validatedCopy, workSource, type EnglishInput } from '../english.ts';
import { Models, usage } from '../llm.ts';
import { eventRefreshFacts } from '../run.ts';

const event = (over: Partial<EnglishInput> = {}): EnglishInput => ({ id: 'jazz', title: 'Джаз', description: 'Джаз в Philly Joe’s.',
  venue_name: 'Philly Joe’s', kind: 'gig', url: null, language: 'ru', ...over });
const answer = (over = {}) => ({ id: 'jazz', title_en: 'Jazz', summary_en: 'A jazz gig at Philly Joe’s.', original_language: 'ru', event_languages: [], ...over });
const model = (read: (text: string) => unknown, budget = 10) => new Models([{ name: 'fixture', model: 'fixture', key: 'test',
  call: async (_system, user) => JSON.stringify(read(user)) }], budget);

test('Russian source copy does not establish performance language; exact bilingual evidence does', () => {
  const e = event();
  assert.deepEqual(validatedCopy(e, { text: e.description!, url: null }, answer())?.event_languages, []);
  const text = 'Etendus toimub nii eesti kui vene keeles. Estonian subtitles.';
  const copy = validatedCopy(e, { text, url: null }, answer({ event_languages: [
    { code: 'et', evidence: 'Etendus toimub nii eesti kui vene keeles.' },
    { code: 'ru', evidence: 'Etendus toimub nii eesti kui vene keeles.' },
    { code: 'en', evidence: 'In English' }, { code: 'et', evidence: 'Estonian subtitles.' },
  ] }));
  assert.deepEqual(copy?.event_languages, ['et', 'ru']);
  const interpretation = validatedCopy(e, { text: 'The talk has interpretation in English.', url: null }, answer({ event_languages: [{ code: 'en', evidence: 'in English' }] }));
  assert.deepEqual(interpretation?.event_languages, []);
  const wrongCode = validatedCopy(e, { text: 'Performed in Russian.', url: null }, answer({ event_languages: [{ code: 'en', evidence: 'Performed in Russian.' }] }));
  assert.deepEqual(wrongCode?.event_languages, []);
  const nationality = validatedCopy(e, { text: 'A Russian artist presents her work.', url: null }, answer({ event_languages: [{ code: 'ru', evidence: 'A Russian artist presents her work.' }] }));
  assert.deepEqual(nationality?.event_languages, []);
  assert.equal(validatedCopy(e, { text: 'An English announcement.', url: null, language: 'et' }, answer({ original_language: 'en' }))?.original_language, 'en');
  const either = validatedCopy(event({ title: 'Exhibition Tour (in English)' }), { text: 'Tours are either in English or Estonian.', url: null }, answer({ event_languages: [
    { code: 'en', evidence: 'in English' }, { code: 'et', evidence: 'Tours are either in English or Estonian.' },
  ] }));
  assert.deepEqual(either?.event_languages, ['en']);
});

test('invalid English output and duplicate/missing event answers stay pending, without leaking another event’s copy', async () => {
  assert.equal(validatedCopy(event(), { text: '', url: null }, answer({ title_en: 'Джаз' })), null);
  assert.equal(validatedCopy(event(), { text: '', url: null }, answer({ summary_en: '' })), null);
  assert.equal(validatedCopy(event(), { text: '', url: null }, answer({ title_en: 'Linastus Kai kinos: Night Child' })), null);
  const copies = await editEnglish(model(() => ({ items: [answer(), answer(), { ...answer(), id: 'stranger' }] })), [event()],
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
  assert.equal(await refreshEnglish(db, model(() => ({ items: [] }))), 0);
  assert.equal(patches.length, 0);
  assert.equal(await refreshEnglish(db, model(() => ({ items: [answer()] }))), 1);
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
