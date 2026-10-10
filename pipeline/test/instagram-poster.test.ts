import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, eventRefreshFacts } from '../run.ts';
import type { Models } from '../llm.ts';
import type { Source, Candidate } from '../types.ts';

test('poster extraction remains pending without vision, then uses fresh artwork only as evidence and requires review', async () => {
  const old = { token: process.env.INSTAGRAM_ACCESS_TOKEN, id: process.env.INSTAGRAM_BUSINESS_ID };
  process.env.INSTAGRAM_ACCESS_TOKEN = 'test'; process.env.INSTAGRAM_BUSINESS_ID = '1';
  try {
    const source = { kind: 'instagram', config: {}, label: 'Instagram' } as Source;
    const item = { external_id: 'ig:poster:ABC', url: 'https://www.instagram.com/p/ABC/', payload: { handle: 'poster', venue_name: 'Venue', text: '', poster_available: true } };
    const models = { ready: true, neuronBudget: 2400 } as Models;
    assert.equal(await read(item, source, models, { canTranscribe: false }), null);
    const found = await read(item, source, models, { canTranscribe: true,
      posts: async () => ({ kind: 'found', posts: [{ caption: null, timestamp: '', permalink: item.url, mediaType: 'IMAGE', imageUrl: 'https://s.cdninstagram.com/fresh.jpg' }] }),
      transcribe: async url => { assert.match(url, /fresh.jpg/); return 'Live band 6 October 2026 20:00 Venue'; },
      extract: async (_m, p) => { assert.deepEqual(p.images, []); assert.match(p.text, /20:00/); return [{ title: 'Live band', starts_at: '2026-10-06T20:00:00+03:00', has_time: true, engine: 'test', image_url: 'https://wrong.test/' } as Candidate]; },
    });
    assert.match(found![0].review_note!, /^poster: /); assert.equal(found![0].image_url, null); assert.equal(found![0].venue_name, 'Venue');
    assert.deepEqual(eventRefreshFacts({ id: 'existing', starts_at: 'possibly-wrong', title: 'Possibly wrong', status_note: found![0].review_note, last_seen_at: 'now' }), { id: 'existing', last_seen_at: 'now' });
  } finally {
    if (old.token === undefined) delete process.env.INSTAGRAM_ACCESS_TOKEN; else process.env.INSTAGRAM_ACCESS_TOKEN = old.token;
    if (old.id === undefined) delete process.env.INSTAGRAM_BUSINESS_ID; else process.env.INSTAGRAM_BUSINESS_ID = old.id;
  }
});
