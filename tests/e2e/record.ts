/* npm run e2e:record: read the public catalogue once, as the pages ask for it,
   and keep the answers in tests/e2e/fixtures/supabase.json for the tests and
   the screenshot tool. Only Supabase REST reads with the public anon key are
   kept; every other outside request is stubbed as it is when replaying.

   The clock is frozen at the start of the recording, so the pages ask exactly
   what they will ask when replayed at that time. To keep the file small it holds
   English copy only and no listings after the coming weekend (Today, Tomorrow and
   Weekend are what the tests choose), except those a walk or the tests name. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { FIXTURE_FILE, ROOT, prepareContext, settle, startServer, type Fixture, type Meta, type Recorded } from './support/env.ts';

const PORT = Number(process.env.E2E_PORT) || 5393;
const WIDTHS = [390, 768, 1100, 1440];
const at = Math.floor(Date.now() / 60_000) * 60_000;
const day = (t: number | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date(t));
const today = day(at);

type Row = Record<string, any>;
const server = await startServer(PORT);
const browser: Browser = await chromium.launch();
const recorded = new Map<string, Recorded>();

const visit = async <T>(pathname: string, width: number, saved: string[] = [], inspect?: (page: Page) => Promise<T>) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/Tallinn', serviceWorkers: 'block' });
  const netState = await prepareContext(context, { record: true, at, saved });
  const page = await context.newPage();
  await page.goto(`${server.base}/${pathname}`);
  await settle(page);
  await page.waitForLoadState('networkidle');
  const result = inspect ? await inspect(page) : undefined;
  await context.close();
  for (const [k, v] of netState.recorded) recorded.set(k, v);
  for (const miss of netState.misses) console.warn(`Not recorded: ${miss}`);
  return result;
};

/* Now's left rail at 1440 px counts tonight's events per date and mood: the tests expect those counts. */
const railCounts = async (page: Page) => {
  const rail = page.getByRole('complementary', { name: 'Filters' });
  const read = async (group: string) => Object.fromEntries((await rail.getByRole('group', { name: group }).getByRole('button').allInnerTexts())
    .map(t => /^(.*\S)\s+(\d+)$/.exec(t.replace(/\s+/g, ' ').trim())).filter(m => m !== null).map(m => [m![1], Number(m![2])]));
  return { when: await read('When'), mood: await read('Mood') };
};

try {
  let walkHref: string | null = null;
  let counts: Awaited<ReturnType<typeof railCounts>> | undefined;
  for (const w of WIDTHS) {
    walkHref = (await visit('index.html', w, [], page => page.locator('a.home-walk__main').first().getAttribute('href', { timeout: 1000 }).catch(() => null))) || walkHref;
  }
  counts = await visit('index.html', 1440, [], railCounts);
  if (!walkHref) throw new Error('Now showed no walk at this time; record again later');
  const all = counts?.when.Today;
  const mood = Object.entries(counts?.mood || {}).find(([label, n]) => label !== 'All' && n > 0 && n !== all);
  if (!all || !counts?.when.Tomorrow || !counts?.when.Weekend || !mood) throw new Error(`Now's counts do not allow the date and mood checks: ${JSON.stringify(counts)}`);

  const listKey = [...recorded.keys()].find(k => k.startsWith('/rest/v1/picks?archived_at=is.null'));
  if (!listKey) throw new Error('The catalogue request was not seen');
  const picks = recorded.get(listKey)!.body as Row[];
  /* A timed event later today with a place, a picture and a known price, for the event page. */
  const tonight = picks.filter(p => p.starts_at && Date.parse(p.starts_at) > at && day(p.starts_at) === today && p.lat != null && p.venue_id && !p.flag)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || String(a.id).localeCompare(String(b.id)));
  const event = tonight.find(p => p.image_url && (p.price_min != null || p.is_free)) || tonight[0];
  if (!event) throw new Error('No timed event later today; record again earlier in the day');
  const second = tonight.find(p => p.id !== event.id && p.starts_at !== event.starts_at);
  if (!second) throw new Error('Only one timed event later today; record again earlier in the day');
  const meta: Meta = {
    eventId: event.id,
    eventTitle: event.title,
    walkHref,
    savedIds: [event.id, second.id],
    searchQuery: event.venue,
    counts: { today: all, tomorrow: counts.when.Tomorrow, weekend: counts.when.Weekend },
    mood: { label: mood[0], count: mood[1] },
  };

  for (const w of WIDTHS) {
    for (const p of [`detail.html?id=${encodeURIComponent(meta.eventId)}`, meta.walkHref, 'map.html', 'discover.html', 'places.html', 'profile.html', 'about.html']) await visit(p, w);
    await visit('saved.html', w, meta.savedIds);
  }

  /* Trim: nothing after the night of the coming Sunday unless a walk or this file names it, and English copy only. */
  const sunday = (7 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7;
  const horizon = day(at + (sunday + 1) * 86_400_000);
  const named = new Set<string>([meta.eventId, ...meta.savedIds]);
  for (const [k, v] of recorded) {
    if (k.startsWith('/rest/v1/routes?') && Array.isArray(v.body)) for (const r of v.body as Row[]) for (const s of r.stops || []) named.add(s.id);
  }
  const english = (row: Row) => Object.fromEntries(Object.entries(row).filter(([k]) => !/_(et|ru|uk)$/.test(k)));
  const responses: Record<string, Recorded> = {};
  for (const k of [...recorded.keys()].sort()) {
    const v = recorded.get(k)!;
    let body = v.body;
    if (Array.isArray(body)) {
      if (k === listKey) body = (body as Row[]).filter(r => !r.starts_at || day(r.starts_at) <= horizon || named.has(r.id));
      body = (body as Row[]).map(english);
    }
    responses[k] = { status: v.status, body };
  }

  const out: Fixture = { recordedAt: new Date(at).toISOString(), meta, responses };
  /* One row per line keeps the file readable and its diffs small. */
  const rows = (body: unknown) => Array.isArray(body) ? (body.length ? `[\n${body.map(r => '      ' + JSON.stringify(r)).join(',\n')}\n    ]` : '[]') : JSON.stringify(body);
  const text = `{\n  "recordedAt": ${JSON.stringify(out.recordedAt)},\n  "meta": ${JSON.stringify(out.meta, null, 2).replace(/\n/g, '\n  ')},\n  "responses": {\n`
    + Object.entries(responses).map(([k, v]) => `    ${JSON.stringify(k)}: { "status": ${v.status}, "body": ${rows(v.body)} }`).join(',\n')
    + '\n  }\n}\n';
  fs.mkdirSync(path.dirname(FIXTURE_FILE), { recursive: true });
  fs.writeFileSync(FIXTURE_FILE, text);
  const kb = Math.round(Buffer.byteLength(text) / 1024);
  console.log(`Recorded ${Object.keys(responses).length} answers at ${out.recordedAt} into ${path.relative(ROOT, FIXTURE_FILE)} (${kb} KB).`);
  console.log(`Event ${meta.eventId}, walk ${meta.walkHref}`);
} finally {
  await browser.close();
  server.stop();
}
