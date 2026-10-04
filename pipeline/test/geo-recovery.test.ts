import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function geo() {
  let requests = 0, success: any, failure: any;
  const WA: any = {};
  runInContext(readFileSync(new URL('../../geo.js', import.meta.url), 'utf8'), createContext({
    window: { WA }, localStorage: { getItem: () => null },
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
