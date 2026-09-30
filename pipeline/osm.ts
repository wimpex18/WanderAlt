import { UA } from './util.ts';

export interface OsmElement {
  type: string; id: number; lat?: number; lon?: number;
  center?: { lat: number; lon: number }; tags?: Record<string, string>;
}

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter'];

/** Sequential fallback only. A rate limit stops this run; no endpoint hopping. */
export async function overpass(query: string): Promise<OsmElement[]> {
  let last: unknown;
  for (const endpoint of ENDPOINTS) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(55_000),
      });
      if (!r.ok) throw Object.assign(new Error(`Overpass ${r.status} at ${new URL(endpoint).hostname}`), { status: r.status });
      const body = await r.json() as { elements?: OsmElement[]; remark?: string; osm3s?: { timestamp_osm_base?: string } };
      // Timeout replies can be HTTP 200 with an incomplete elements array.
      const base = Date.parse(body.osm3s?.timestamp_osm_base ?? '');
      if (body.remark || !Array.isArray(body.elements) || !Number.isFinite(base) || Date.now() - base > 48 * 3600_000) {
        throw new Error('Overpass returned incomplete or stale data');
      }
      return body.elements;
    } catch (e) {
      if ([429, 406].includes(Number((e as { status?: number }).status))) throw e;
      last = e;
    }
  }
  throw last;
}

/** Lifecycle tags about the venue, not a disused floor or building part. */
export function closureReason(tags: Record<string, string>, kind?: string | null): string | null {
  for (const key of ['disused', 'abandoned', 'demolished', 'razed', 'removed', 'destroyed', 'closed', 'permanently_closed']) {
    if (/^(yes|true|1)$/i.test(tags[key] ?? '')) return `${key}=${tags[key]}`;
  }
  const categories = kind && /record store|bookshop|thrift/.test(kind) ? ['shop']
    : kind === 'gallery' ? ['tourism', 'shop'] : kind === 'museum' ? ['tourism']
      : kind ? ['amenity'] : ['amenity', 'shop', 'tourism'];
  for (const prefix of ['disused', 'abandoned', 'demolished', 'razed', 'removed', 'destroyed', 'closed', 'was']) {
    for (const category of categories) {
      const key = `${prefix}:${category}`, v = tags[key];
      if (v && !/^(no|false|0)$/i.test(v)) return `${key}=${v}`;
    }
  }
  return null;
}
