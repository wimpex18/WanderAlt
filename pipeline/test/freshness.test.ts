import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

/** render.js and when.js in a bare page, for the event page's "Checked" line. */
function render() {
  const WA: Record<string, any> = { UI: { esc: (s: unknown) => String(s ?? ''), safeUrl: (s: string) => s } };
  const context = createContext({ window: { WA, addEventListener: () => {} }, Intl,
    localStorage: { getItem: () => null, setItem: () => {} }, document: { addEventListener: () => {} } });
  runInContext(source('when.js'), context);
  runInContext(source('render.js'), context);
  return WA.R as { checkedLabel: (iso: unknown, now?: number) => string };
}

test('the Checked line: just now, whole minutes, whole hours, then the date; nothing when unknown', () => {
  const R = render();
  const now = Date.parse('2026-10-09T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const min = 60_000, h = 60 * min;
  assert.equal(R.checkedLabel(ago(0), now), 'Checked just now');
  assert.equal(R.checkedLabel(ago(5 * min - 1000), now), 'Checked just now');
  assert.equal(R.checkedLabel(ago(5 * min), now), 'Checked 5 min ago');
  assert.equal(R.checkedLabel(ago(59 * min + 59_000), now), 'Checked 59 min ago');
  assert.equal(R.checkedLabel(ago(h), now), 'Checked 1 h ago');
  assert.equal(R.checkedLabel(ago(2 * h + 50 * min), now), 'Checked 2 h ago');     // whole hours, never rounded up to fresher
  assert.equal(R.checkedLabel(ago(24 * h - 1000), now), 'Checked 23 h ago');
  /* Past a day the date as the page prints dates, on Tallinn's calendar: 21:30 UTC is 00:30 the next day there. */
  assert.equal(R.checkedLabel('2026-10-07T21:30:00Z', now), 'Checked Thu 8 Oct');
  assert.equal(R.checkedLabel(ago(40 * h), now), 'Checked Wed 7 Oct');              // old is shown as it is, with no other claim
  /* A server clock a little ahead of this device is still just now; far ahead, a date and no span. */
  assert.equal(R.checkedLabel(new Date(now + 3 * min).toISOString(), now), 'Checked just now');
  assert.equal(R.checkedLabel(new Date(now + 2 * h).toISOString(), now), 'Checked Fri 9 Oct');
  for (const unknown of [null, undefined, '', 'not a date']) assert.equal(R.checkedLabel(unknown, now), '');
});

function lang(code: string) {
  const window: any = { WA: {} };
  const context = createContext({ window, Intl, console, navigator: { languages: [code], language: code },
    localStorage: { getItem: () => null, setItem() {} }, document: { readyState: 'loading', addEventListener() {}, documentElement: {} } });
  for (const f of ['lang/et.js', 'lang/ru.js', 'lang/uk.js', 'i18n.js']) runInContext(source(f), context);
  return window.WA.Lang as { t: (s: string) => string };
}

test('the Checked line reads in every interface language, with Russian and Ukrainian plural forms', () => {
  const ru = lang('ru'), uk = lang('uk'), et = lang('et');
  assert.equal(ru.t('Checked just now'), 'Проверено только что');
  assert.deepEqual([5, 21, 22, 45].map(n => ru.t(`Checked ${n} min ago`)),
    ['Проверено 5 минут назад', 'Проверено 21 минуту назад', 'Проверено 22 минуты назад', 'Проверено 45 минут назад']);
  assert.deepEqual([1, 2, 5, 21].map(n => ru.t(`Checked ${n} h ago`)),
    ['Проверено 1 час назад', 'Проверено 2 часа назад', 'Проверено 5 часов назад', 'Проверено 21 час назад']);
  assert.deepEqual([1, 3, 11].map(n => uk.t(`Checked ${n} h ago`)),
    ['Перевірено 1 годину тому', 'Перевірено 3 години тому', 'Перевірено 11 годин тому']);
  assert.equal(uk.t('Checked 7 min ago'), 'Перевірено 7 хвилин тому');
  assert.equal(et.t('Checked 3 h ago'), 'Kontrollitud 3 h tagasi');
  assert.equal(ru.t('Checked Пт 9 окт.'), 'Проверено Пт 9 окт.');                    // the page prints the date in the language already
  assert.equal(et.t('Checked R 9 okt'), 'Kontrollitud R 9 okt');
});

/** supabase.js on localhost (reads go straight to Supabase), with a fake network. */
async function catalogue(provenance: (u: URL) => Promise<unknown[]>) {
  const pick = { id: 'jazz', city: 'tallinn', title: 'Jazz', last_seen_at: '2026-10-05T09:00:00+00:00' };
  const asked: string[] = [];
  const WA: Record<string, any> = {};
  let ready!: () => void;
  const loaded = new Promise<void>(r => { ready = r; });
  const context = createContext({ window: { WA }, location: { hostname: 'localhost' }, console,
    AbortController, setTimeout, clearTimeout, CustomEvent: class { type: string; constructor(type: string) { this.type = type; } },
    document: { readyState: 'complete', dispatchEvent: (e: any) => { if (e.type === 'wa:catalog-ready') ready(); } },
    fetch: async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/event_sources')) {
        asked.push(u.search);
        const rows = await provenance(u);
        return { ok: true, headers: { get: () => null }, json: async () => rows };
      }
      return { ok: true, headers: { get: () => null }, json: async () => u.pathname.endsWith('/picks') ? [pick] : [] };
    },
  });
  runInContext(source('supabase.js'), context);
  await loaded;
  return { WA, asked, e: WA.catalog[0] };
}

test('Checked is the latest time a source listed the event, asked once, and never guessed when the answer fails', async () => {
  let fail = true;
  const c = await catalogue(async () => { if (fail) throw new Error('offline'); return [{ last_seen_at: '2026-10-09T06:17:00+00:00' }]; });
  assert.equal(c.e.lastSeenAt, '2026-10-05T09:00:00+00:00');
  assert.equal(await c.WA.checkedAt(c.e), null);                   // failed: nothing said, not the older row time
  assert.equal(c.e.checkedAt, undefined);
  fail = false;
  const [a, b] = [c.WA.checkedAt(c.e), c.WA.checkedAt(c.e)];
  assert.equal(await a, '2026-10-09T06:17:00.000Z'); assert.equal(await b, '2026-10-09T06:17:00.000Z');
  assert.equal(c.asked.length, 2);                                  // one retry, shared by both callers
  await c.WA.checkedAt(c.e); assert.equal(c.asked.length, 2);
  const q = new URLSearchParams(c.asked[1]);
  assert.equal(q.get('event_id'), 'eq.jazz'); assert.equal(q.get('select'), 'last_seen_at'); assert.equal(q.get('limit'), '1');
  /* No provenance row readable: the listing's own read time stands; a provenance row older than it does not win. */
  const none = await catalogue(async () => []);
  assert.equal(await none.WA.checkedAt(none.e), '2026-10-05T09:00:00.000Z');
  const older = await catalogue(async () => [{ last_seen_at: '2026-10-01T00:00:00+00:00' }]);
  assert.equal(await older.WA.checkedAt(older.e), '2026-10-05T09:00:00.000Z');
});

test('the edge cache serves event_sources reads like the other public tables', async () => {
  const file = '../../functions/api/rest/[table].js';
  const { onRequestGet } = await import(file) as { onRequestGet: (c: unknown) => Promise<Response> };
  const store = new Map<string, Response>();
  (globalThis as any).caches = { default: { match: async (k: Request) => store.get(k.url)?.clone(), put: async (k: Request, r: Response) => { store.set(k.url, r); } } };
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (u: string) => { calls.push(String(u)); return new Response('[{"last_seen_at":"2026-10-09T06:17:00+00:00"}]'); }) as typeof fetch;
  try {
    const r = await onRequestGet({ request: new Request('https://wanderalt.app/api/rest/event_sources?event_id=eq.jazz&select=last_seen_at&limit=1'),
      params: { table: 'event_sources' }, waitUntil: () => {} });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control')!, /s-maxage=300/);
    assert.match(calls[0], /\/rest\/v1\/event_sources\?event_id=eq\.jazz&select=last_seen_at&limit=1$/);
  } finally { globalThis.fetch = realFetch; }
});
