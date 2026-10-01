import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';

const text = readFileSync(new URL('../../supabase/functions/calendar-feed/index.ts', import.meta.url), 'utf8');
function feed(rows: any[]) {
  let handler!: (r: Request) => Promise<Response>;
  let query = '';
  const context = createContext({ Request, Response, URL, Date, Intl, TextEncoder,
    Deno: { env: { get: (n: string) => n === 'SUPABASE_URL' ? 'https://public.example' : 'public-key' }, serve: (cb: typeof handler) => { handler = cb; } },
    fetch: async (url: string) => { query = url; return Response.json(rows); },
  });
  runInContext(stripTypeScriptTypes(text.replace(/^import[^\n]+\n/, '')), context);
  return { request: (search = 'city=tallinn') => handler(new Request(`https://public.example/calendar-feed?${search}`)), query: () => query };
}
const event = { id: 'retained', starts_at: '2026-10-08T16:00:00Z', ends_at: null, time: '19:00', title: 'Title', venue: 'Venue', neighborhood: 'Area', quote: '', handle: '@source' };

test('calendar cancellations retain their UID and are never announced as confirmed performances', async () => {
  const f = feed([{ ...event, flag: 'cancelled' }, { ...event, id: 'postponed', flag: 'postponed' }]);
  const s = await (await f.request()).text();
  assert.match(s, /UID:retained@wanderalt.app\r\n/); assert.match(s, /STATUS:CANCELLED/); assert.match(s, /STATUS:TENTATIVE/);
  assert.match(f.query(), /select=[^&]*flag/);
});

test('calendar text cannot inject properties through bare CR, CRLF or LF', async () => {
  const s = await (await feed([{ ...event, title: 'Show\rSTATUS:CANCELLED\r\nBEGIN:VEVENT\nInjected' }]).request()).text();
  assert.equal(s.split('BEGIN:VEVENT\r\n').length - 1, 1);
  assert.equal(s.split('\r\nSTATUS:CANCELLED').length - 1, 0);
  assert.match(s.replace(/\r\n /g, ''), /SUMMARY:Show\\nSTATUS:CANCELLED\\nBEGIN:VEVENT\\nInjected/);
});

test('UTF-8 calendar lines fold to 75 octets without losing international text', async () => {
  const title = 'Öö džäss 🎶 '.repeat(25);
  const s = await (await feed([{ ...event, title }]).request()).text();
  assert.ok(s.endsWith('\r\n'));
  assert.ok(s.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
  assert.ok(s.replace(/\r\n /g, '').includes(`SUMMARY:${title}\r\n`));
  assert.ok(!s.includes('�'));
});

test('the deployed single-event download stays single-event, validates ids and distinguishes absence', async () => {
  const id = 'ev_16ede39bec4bf8bc', f = feed([{ ...event, id }]);
  const r = await f.request(`id=${id}&handle=@unrelated`);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition')!, /attachment/);
  assert.match(await r.text(), /METHOD:PUBLISH/);
  assert.match(f.query(), /id=eq.ev_16ede39bec4bf8bc/); assert.doesNotMatch(f.query(), /handle=eq/);
  assert.equal((await f.request('id=malformed')).status, 400);
  assert.equal((await feed([]).request(`id=${id}`)).status, 404);
});

test('a venue calendar filters by place id, validates it and names the calendar after the venue', async () => {
  const f = feed([event]);
  const s = await (await f.request('city=tallinn&place=tallinn-kino-soprus')).text();
  assert.match(f.query(), /venue_id=eq.tallinn-kino-soprus/);
  assert.match(s, /X-WR-CALNAME:WanderAlt — Venue/);
  assert.equal((await feed([]).request('city=tallinn&place=a%26b')).status, 400);
});
