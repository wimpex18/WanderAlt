// Walking between two places. The estimate is geo.js's: 1.28 times the straight line plus 40 m,
// at 80 m a minute. The walks the pipeline stores are routed instead, leg by leg, on OpenStreetMap
// footways by the FOSSGIS OSRM server (routing.openstreetmap.de, foot profile), so a stored walk
// reads like a map app's. Its usage policy asks for an identified client, at most one request a
// second and no bulk use: this asks once per walk, a few dozen times a run at most, and any
// failure leaves the estimate. Each leg also keeps the path it found, simplified to a few metres and
// encoded as a polyline (precision 6), so a page can draw the walk along the streets.

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

// ── Paths ─────────────────────────────────────────────────────

/** Google's encoded polyline at precision 6, as OSRM writes it with geometries=polyline6. */
export function decodePolyline(s: string, precision = 6): Point[] {
  const f = 10 ** precision, out: Point[] = [];
  let i = 0, lat = 0, lng = 0;
  const next = () => {
    let shift = 0, result = 0, b: number;
    do { b = s.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < s.length + 1);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) { lat += next(); lng += next(); out.push({ lat: lat / f, lng: lng / f }); }
  return out;
}
export function encodePolyline(points: Point[], precision = 6): string {
  const f = 10 ** precision;
  let out = '', pLat = 0, pLng = 0;
  const put = (v: number) => { let x = v < 0 ? ~(v << 1) : v << 1; while (x >= 0x20) { out += String.fromCharCode((0x20 | (x & 0x1f)) + 63); x >>= 5; } out += String.fromCharCode(x + 63); };
  for (const p of points) {
    const lat = Math.round(p.lat * f), lng = Math.round(p.lng * f);
    put(lat - pLat); put(lng - pLng); pLat = lat; pLng = lng;
  }
  return out;
}
/** Fewer points along the same line: Douglas–Peucker within `tolerance` metres, ends kept. */
export function simplify(points: Point[], tolerance = 4): Point[] {
  if (points.length < 3) return points;
  const k = Math.cos(points[0].lat * Math.PI / 180), m = 111_320;
  const off = (p: Point, a: Point, b: Point) => {
    const ax = a.lng * k * m, ay = a.lat * m, bx = b.lng * k * m - ax, by = b.lat * m - ay, px = p.lng * k * m - ax, py = p.lat * m - ay;
    const len = bx * bx + by * by, t = len ? Math.max(0, Math.min(1, (px * bx + py * by) / len)) : 0;
    return Math.hypot(px - t * bx, py - t * by);
  };
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1, at = -1;
    for (let i = a + 1; i < b; i++) { const d = off(points[i], points[a], points[b]); if (d > far) { far = d; at = i; } }
    if (far > tolerance) { keep[at] = true; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

export interface Leg { metres: number | null; path: string | null }

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
  private readonly seen = new Map<string, Leg[] | null>();

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
    return (await this.route(points))?.map(l => l.metres) ?? null;
  }

  /** Each leg's street metres and simplified path; a leg whose metres are not believable has neither. */
  async route(points: Point[]): Promise<Leg[] | null> {
    if (points.length < 2 || points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) return null;
    const coords = points.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    if (this.seen.has(coords)) return this.seen.get(coords) ?? null;
    if (!this.open) return null;
    const pause = this.last + this.gapMs - this.clock();
    if (pause > 0) await this.wait(pause);
    this.last = this.clock();
    this.requests++;
    let out: Leg[] | null = null;
    try {
      const r = await this.fetchFn(`${this.base}/route/v1/foot/${coords}?overview=false&steps=true&geometries=polyline6`, {
        headers: { 'user-agent': UA, accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const body = await r.json() as { code?: unknown; routes?: { legs?: { distance?: unknown; steps?: { geometry?: unknown }[] }[] }[] };
      const legs = body?.code === 'Ok' ? body.routes?.[0]?.legs : undefined;
      if (!Array.isArray(legs) || legs.length !== points.length - 1) throw new Error(`no route (${String(body?.code ?? 'no answer')})`);
      out = legs.map((leg, i) => {
        const d = Number(leg?.distance), line = lineMetres(points[i], points[i + 1]);
        if (!(Number.isFinite(d) && d >= line - 100 && d <= line * 4 + 500)) return { metres: null, path: null };
        return { metres: d, path: legPath(leg?.steps, points[i], points[i + 1]) };
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

/** A leg's steps joined into one simplified line, or null when it does not run from one stop to the next
 *  (each end within 150 m of its stop: the router snaps a stop to the nearest footway). */
function legPath(steps: { geometry?: unknown }[] | undefined, from: Point, to: Point): string | null {
  if (!Array.isArray(steps)) return null;
  const points: Point[] = [];
  for (const st of steps) {
    if (typeof st?.geometry !== 'string') return null;
    for (const p of decodePolyline(st.geometry)) {
      const last = points[points.length - 1];
      if (!last || last.lat !== p.lat || last.lng !== p.lng) points.push(p);
    }
  }
  if (points.length < 2 || lineMetres(points[0], from) > 150 || lineMetres(points[points.length - 1], to) > 150) return null;
  const line = simplify(points, 4);
  return line.length <= 400 ? encodePolyline(line) : null;
}
