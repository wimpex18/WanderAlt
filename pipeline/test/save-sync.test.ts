import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
const tick = () => new Promise(r => setImmediate(r));
function app(values = new Map<string, string>()) {
  const listeners = new Map<string, Function[]>();
  const on = (name: string, cb: Function) => listeners.set(name, [...(listeners.get(name) || []), cb]);
  const emit = (name: string, event?: unknown) => (listeners.get(name) || []).forEach(cb => cb(event));
  const requests: {path: string; method: string; body: any; user: string}[] = [];
  const clouds = new Map<string, {bookmarks: Map<string, boolean>; lists: Map<string, any>; items: Map<string, string[]>}>();
  const WA: any = { BASE_URL: 'https://fixture', Auth: { session: null,
    getAuthHeaders: () => ({ Authorization: WA.Auth.session.user_id }), isSignedIn: () => !!WA.Auth.session } };
  let fail = false, pause: (() => Promise<void>) | undefined;
  const fetcher = async (url: string, opts: any) => {
    const u = new URL(url), table = u.pathname.split('/').pop()!, user = opts.headers.Authorization;
    const method = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : undefined;
    requests.push({path: table, method, body, user});
    if (pause) await pause();
    if (fail) return new Response('', { status: 503 });
    if (!clouds.has(user)) clouds.set(user, {bookmarks: new Map(), lists: new Map(), items: new Map()});
    const cloud = clouds.get(user)!;
    const id = (key: string) => u.searchParams.get(key)?.slice(3) || '';
    if (method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      rows.forEach(row => {
        assert.equal(row.user_id, user, 'writes have their captured owner');
        if (table === 'bookmarks') cloud.bookmarks.set(row.pick_id, true);
        if (table === 'saved_lists') cloud.lists.set(row.id, row);
        if (table === 'saved_list_items') cloud.items.set(row.list_id, [...new Set([...(cloud.items.get(row.list_id) || []), row.pick_id])]);
      });
      return new Response(null, {status: 201});
    }
    if (method === 'DELETE') {
      if (table === 'bookmarks') cloud.bookmarks.delete(id('pick_id'));
      if (table === 'saved_lists') cloud.lists.delete(id('id'));
      if (table === 'saved_list_items') cloud.items.set(id('list_id'), id('pick_id') ? (cloud.items.get(id('list_id')) || []).filter(x => x !== id('pick_id')) : []);
      return new Response(null, {status: 204});
    }
    if (table === 'bookmarks') return Response.json([...cloud.bookmarks.keys()].map(pick_id => ({pick_id})));
    if (table === 'saved_lists') return Response.json([...cloud.lists.values()]);
    return Response.json([...cloud.items].flatMap(([list_id, items]) => !id('list_id') || list_id === id('list_id') ? items.map(pick_id => ({list_id, pick_id})) : []));
  };
  const context = createContext({window: {WA, addEventListener: on}, document: {addEventListener: on, dispatchEvent: (e: any) => emit(e.type)},
    CustomEvent: class {type: string; constructor(type: string) {this.type = type;}}, localStorage: {getItem: (k: string) => values.get(k) || null,
      setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k)},
    fetch: fetcher, AbortController, setTimeout, clearTimeout, console });
  for (const f of ['save-store.js','bookmark.js','lists.js']) runInContext(readFileSync(new URL(`../../${f}`, import.meta.url),'utf8'), context);
  const login = (user: string | null) => { WA.Auth.session = user ? {user_id: user} : null; emit(user ? 'wa:signed-in' : 'wa:signed-out'); };
  const sync = async () => { await tick(); await Promise.all([WA.Bookmarks.syncFromCloud(), WA.Lists.syncFromCloud()]); await tick(); };
  return {WA, values, requests, clouds, login, sync, emit, fail: (v: boolean) => {fail = v;}, pause: (cb?: () => Promise<void>) => {pause = cb;}};
}

test('guest saves and list names/items upload once; the next account and signed-out guest stay separate', async () => {
  const a = app(); a.WA.Bookmarks.set('bookshop', true);
  const id = a.WA.Lists.create('Saturday'); a.WA.Lists.add(id, 'bookshop');
  a.login('alice'); await a.sync();
  assert.equal(a.clouds.get('alice')!.bookmarks.has('bookshop'), true);
  assert.equal(a.clouds.get('alice')!.lists.get(id).name, 'Saturday');
  assert.deepEqual(a.clouds.get('alice')!.items.get(id), ['bookshop']);
  a.login(null); assert.equal(a.WA.Bookmarks.ids().length, 0); assert.equal(a.WA.Lists.all().length, 0);
  a.login('bob'); await a.sync(); assert.equal(a.WA.Bookmarks.ids().length, 0); assert.equal(a.WA.Lists.all().length, 0);
  a.login('alice'); await a.sync(); assert.equal(a.WA.Lists.byId(id).name, 'Saturday');
});

test('failed unsaves survive reload and do not return from cloud; online retries removes them and list items', async () => {
  const a = app(); a.login('alice'); a.WA.Bookmarks.set('gig', true);
  const id = a.WA.Lists.create('Night'); a.WA.Lists.add(id, 'gig'); await a.sync();
  a.fail(true); a.WA.Bookmarks.set('gig', false); await a.sync();
  assert.equal(a.WA.Bookmarks.get().gig, undefined); assert.equal(a.WA.Bookmarks.pendingSync(), 1);
  const b = app(a.values); b.fail(true); b.login('alice'); await b.sync();
  assert.equal(b.WA.Bookmarks.get().gig, undefined); assert.equal(b.WA.Lists.items(id).length, 0);
  b.clouds.set('alice', a.clouds.get('alice')!); b.fail(false); b.emit('online'); await b.sync();
  assert.equal(b.clouds.get('alice')!.bookmarks.has('gig'), false);
  assert.equal(b.clouds.get('alice')!.items.get(id)!.length, 0);
  assert.equal(b.WA.Bookmarks.pendingSync(), 0);
  b.WA.Lists.remove(id); await b.sync(); assert.equal(b.clouds.get('alice')!.lists.has(id), false);
});

test('a second device removal replaces acknowledged saves; delayed replies cannot cross accounts', async () => {
  const a = app(); a.login('alice'); a.WA.Bookmarks.set('gig', true); await a.sync();
  a.clouds.get('alice')!.bookmarks.delete('gig'); await a.sync(); assert.equal(a.WA.Bookmarks.get().gig, undefined);
  let release!: () => void; const gate = new Promise<void>(r => {release = r;});
  a.pause(() => gate); a.WA.Bookmarks.set('private', true); await tick();
  a.login('bob'); assert.equal(a.WA.Bookmarks.ids().length, 0);
  a.pause(); release(); await a.sync(); assert.equal(a.WA.Bookmarks.ids().length, 0);
  assert.equal(a.requests.some(r => r.user === 'bob' && r.body?.pick_id === 'private'), false);
});

test('an edit during an in-flight write is sent after that write, including rapid unsave/resave', async () => {
  const a = app(); a.login('alice'); await a.sync();
  let release!: () => void; const gate = new Promise<void>(r => {release = r;});
  a.pause(() => gate); a.WA.Bookmarks.set('gig', true); await tick();
  a.WA.Bookmarks.set('gig', false); a.pause(); release(); await a.sync();
  assert.equal(a.clouds.get('alice')!.bookmarks.has('gig'), false);
  assert.equal(a.WA.Bookmarks.get().gig, undefined);
  a.WA.Bookmarks.set('gig', true); await a.sync(); assert.equal(a.clouds.get('alice')!.bookmarks.has('gig'), true);
});
