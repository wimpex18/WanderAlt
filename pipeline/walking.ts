// Walking between two places. The estimate is geo.js's: 1.28 times the straight line plus 40 m,
// at 80 m a minute. The walks the pipeline stores are routed instead, leg by leg, on OpenStreetMap
// footways by the FOSSGIS OSRM server (routing.openstreetmap.de, foot profile), so a stored walk
// reads like a map app's. Its usage policy asks for an identified client, at most one request a
// second and no bulk use: this asks once per walk, a few dozen times a run at most, and any
// failure leaves the estimate.

import { UA, sleep } from './util.ts';

// Keep these in step with geo.js: one walking pace and one estimate.
export const WALK_M_PER_MIN = 80, STREET = 1.28, STREET_ADD = 40;

export interface Point { lat: number; lng: number }

export const lineMetres = (a: Point, b: Point): number => {
  const r = 6371000, k = Math.PI / 180, dLat = (b.lat - a.lat) * k, dLng = (b.lng - a.lng) * k;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
};
/** Minutes on foot for two points this far apart in a straight line (geo.js walkMinutes). */
export const estimateMinutes = (line: number): number => Math.max(1, Math.round((line * STREET + STREET_ADD) / WALK_M_PER_MIN));
/** Minutes for a distance already measured along the streets, at the same pace. */
export const streetMinutes = (metres: number): number => Math.max(1, Math.round(metres / WALK_M_PER_MIN));

export const FOOT_ROUTER = 'https://routing.openstreetmap.de/routed-foot';

export interface RouterOptions {
  /** Requests a run may make; past it, every walk keeps the estimate. */
  cap?: number;
  /** The least time between two requests. */
  gapMs?: number;
  timeoutMs?: number;
  base?: string;
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<unknown>;
  clock?: () => number;
}

/** Street metres for each leg of a walk, from a foot router, or null where it cannot say. */
export class FootRouter {
  requests = 0;
  failures = 0;
  private readonly cap: number;
  private readonly gapMs: number;
  private readonly timeoutMs: number;
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly wait: (ms: number) => Promise<unknown>;
  private readonly clock: () => number;
  private last = -Infinity;
  private failedInARow = 0;
  private readonly seen = new Map<string, (number | null)[] | null>();

  constructor(o: RouterOptions = {}) {
    this.cap = o.cap ?? 40;
    this.gapMs = o.gapMs ?? 1100;
    this.timeoutMs = o.timeoutMs ?? 10_000;
    this.base = o.base ?? FOOT_ROUTER;
    this.fetchFn = o.fetch ?? fetch;
    this.wait = o.wait ?? sleep;
    this.clock = o.clock ?? Date.now;
  }

  /** Whether another request may go out: under the cap, and the server has not failed three times running. */
  get open(): boolean { return this.requests < this.cap && this.failedInARow < 3; }

  /** Street metres of each leg through these points, in order; null for the whole walk when the router
   *  is not asked or does not answer, and null for one leg whose answer is not believable (shorter than
   *  the straight line allows, or a detour of several times it: a point snapped to the wrong street). */
  async legs(points: Point[]): Promise<(number | null)[] | null> {
    if (points.length < 2 || points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) return null;
    const coords = points.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    if (this.seen.has(coords)) return this.seen.get(coords) ?? null;
    if (!this.open) return null;
    const pause = this.last + this.gapMs - this.clock();
    if (pause > 0) await this.wait(pause);
    this.last = this.clock();
    this.requests++;
    let out: (number | null)[] | null = null;
    try {
      const r = await this.fetchFn(`${this.base}/route/v1/foot/${coords}?overview=false&steps=false`, {
        headers: { 'user-agent': UA, accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const body = await r.json() as { code?: unknown; routes?: { legs?: { distance?: unknown }[] }[] };
      const legs = body?.code === 'Ok' ? body.routes?.[0]?.legs : undefined;
      if (!Array.isArray(legs) || legs.length !== points.length - 1) throw new Error(`no route (${String(body?.code ?? 'no answer')})`);
      out = legs.map((leg, i) => {
        const d = Number(leg?.distance), line = lineMetres(points[i], points[i + 1]);
        return Number.isFinite(d) && d >= line - 100 && d <= line * 4 + 500 ? d : null;
      });
      this.failedInARow = 0;
    } catch (e) {
      this.failures++;
      this.failedInARow++;
      console.warn(`[walking] no foot route (${(e as Error).message}); the estimate stands`);
    }
    this.seen.set(coords, out);
    return out;
  }
}
