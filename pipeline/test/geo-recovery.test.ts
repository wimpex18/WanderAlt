import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function geo(storage = new Map<string, string>(), anchors = new Map<string, string>()) {
  let requests = 0, success: any, failure: any;
  const WA: any = {};
  runInContext(readFileSync(new URL('../../geo.js', import.meta.url), 'utf8'), createContext({
    window: { WA }, localStorage: { getItem: (k: string) => anchors.get(k) || null, setItem: (k: string, v: string) => anchors.set(k, v), removeItem: (k: string) => anchors.delete(k) },
    sessionStorage: { getItem: (k: string) => storage.get(k) || null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
    document: { dispatchEvent: () => {} }, CustomEvent: class {},
    navigator: { geolocation: { getCurrentPosition: (ok: any, fail: any) => { requests++; success = ok; failure = fail; } } },
  }));
  return { api: WA.Geo, requests: () => requests, fail: (code: number) => failure({ code }),
    succeed: () => success({ coords: { latitude: 59.437, longitude: 24.745 } }) };
}

test('location timeout and unavailable errors permit a retry that can succeed', async () => {
  for (const code of [2, 3]) {
    const g = geo(); const first = g.api.userLoc();
    assert.equal(g.api.userLoc(), first, 'share an in-flight request');
    g.fail(code); assert.equal(await first, null); assert.equal(g.api.locationError(), code);
    const retry = g.api.userLoc(); assert.equal(g.requests(), 2);
    g.succeed(); assert.equal((await retry).lat, 59.437); assert.equal(g.api.locationError(), 0);
    await g.api.userLoc(); assert.equal(g.requests(), 2, 'reuse the successful position');
  }
});

test('permission denial is remembered so renders do not prompt again', async () => {
  const g = geo(); const first = g.api.userLoc(); g.fail(1);
  assert.equal(await first, null); assert.equal(g.api.locationError(), 1);
  assert.equal(await g.api.userLoc(), null); assert.equal(g.requests(), 1);
});

test('a recent device position survives page navigation without a new request', async () => {
  const storage = new Map<string, string>();
  const first = geo(storage); const request = first.api.userLoc(); first.succeed(); await request;
  const next = geo(storage);
  assert.equal(next.api.deviceLoc().lat, 59.437);
  assert.equal((await next.api.userLoc()).lng, 24.745);
  assert.equal(next.requests(), 0);
});

test('stale, future, corrupt and invalid cached positions never become a location', () => {
  for (const value of [
    JSON.stringify({ lat: 59, lng: 24, at: Date.now() - 300001 }),
    JSON.stringify({ lat: 59, lng: 24, at: Date.now() + 60000 }),
    JSON.stringify({ lat: null, lng: 24, at: Date.now() }),
    JSON.stringify({ lat: 99, lng: 24, at: Date.now() }),
    JSON.stringify({ lat: 59, lng: 999, at: Date.now() }), 'broken',
  ]) assert.equal(geo(new Map([['wa:position:v1', value]])).api.currentLoc(), null);
});

test('explicit device request bypasses the anchor, retaining it until success is confirmed', async () => {
  const anchors = new Map<string, string>();
  const g = geo(new Map(), anchors);
  g.api.setAnchor({ lat: 59.4342, lng: 24.7436, label: 'Tallinn' });
  await g.api.userLoc(); assert.equal(g.requests(), 0);
  const failed = g.api.userLoc(true); g.fail(3); await failed;
  assert.equal(g.api.anchor().label, 'Tallinn', 'failed lookup keeps the chosen starting place');
  const retry = g.api.userLoc(true); g.succeed(); await retry;
  g.api.setAnchor(null);
  assert.equal(g.api.currentLoc().lat, 59.437);
  assert.equal(anchors.size, 0);
});

test('blocked browser storage does not prevent using device location', async () => {
  const storage = { get: () => { throw new Error('blocked'); }, set: () => { throw new Error('blocked'); }, delete: () => {} };
  const g = geo(storage as any); const request = g.api.userLoc(); g.succeed();
  assert.equal((await request).lat, 59.437);
});

test('an explicit location tap retries after permission settings changed', async () => {
  const g = geo(); const denied = g.api.userLoc(true); g.fail(1); await denied;
  const retry = g.api.userLoc(true); assert.equal(g.requests(), 2); g.succeed();
  assert.equal((await retry).lat, 59.437);
});

test('walking times follow the streets: a third longer than the line, and a "within" limit is a street distance', () => {
  const g = geo().api;
  assert.equal(g.STREET, 1.33);
  assert.equal(g.walkMinutes(800), 13);          // 800 m apart is about 1,064 m on foot
  assert.equal(g.walkMinutes(20), 1);            // never 0
  assert.equal(g.minutesFor(800), 10);           // a street distance is not stretched again
  assert.equal(Math.round(g.onFoot(300)), 399);
  assert.equal(g.parseWithin('10'), 800);        // ten minutes on foot, along streets
  const from = { lat: 59.437, lng: 24.745 };
  const near = { id: 'near', lat: 59.437 + 550 / 111_195, lng: 24.745 };   // 550 m north: ~730 m on foot
  const far = { id: 'far', lat: 59.437 + 650 / 111_195, lng: 24.745 };     // 650 m north: ~865 m on foot
  assert.deepEqual(g.withinFilter([near, far], 800, from).map((x: any) => x.id), ['near']);
});
