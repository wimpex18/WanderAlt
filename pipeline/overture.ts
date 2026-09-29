// Websites and social profiles for places that have none, from Overture
// Maps' places theme (free, open, worldwide: CDLA Permissive 2.0). A record
// counts as the same venue only when it is within 75 m, in a cultural or
// nightlife category, not closed, and its name and ours share every
// distinctive word (inflected forms included). Two records with different
// websites are no answer. Nothing is searched by name alone.
//
// Reading the parquet files needs the DuckDB CLI on the PATH; without it
// the step is skipped (CI installs it, see .github/workflows/pipeline.yml).

import { spawnSync } from 'node:child_process';
import type { Place } from './places.ts';
import { core, metres } from './place-match.ts';
import { overlap } from './dedupe.ts';
import { UA, httpUrl } from './util.ts';
import { socialUrl } from './venues.ts';

export interface OvertureRow {
  name: string;
  category: string | null;
  website: string | null;
  socials: string[] | null;
  lat: number;
  lng: number;
  status: string | null;
  confidence: number | null;
}

/** Overture categories a venue or shop of ours can be filed under. */
const CATEGORY = /bar|pub|club|music|event_venue|theat|cinema|movie|galler|museum|arts|cultur|communit|book|record|second_hand|vintage|thrift|library|dance|performing/;
const SOCIAL_HOST = /(^|\.)(facebook|instagram|fb|linktr|linktree|tiktok|youtube|twitter|x)\.(com|ee|me)$/i;
/** Listing, ticketing and delivery sites: a page about the venue, not the venue's own site. */
const AGGREGATOR = /(^|\.)(untappd|ratebeer|tripadvisor|booking|yelp|foursquare|wolt|bolt|ubereats|google|goo|wikipedia|eventbrite|fienta|piletilevi|piletimaailm|piletitasku|tiketi|visitestonia|visittallinn|airbnb|opentable|mapcarta)\.[a-z.]+$/i;
const isOwnSite = (u: string) => { const h = new URL(u).hostname; return !SOCIAL_HOST.test(h) && !AGGREGATOR.test(h); };

/** The newest release's folder name, from the public bucket listing. */
export async function latestRelease(): Promise<string> {
  const r = await fetch('https://overturemaps-us-west-2.s3.amazonaws.com/?prefix=release/&delimiter=/', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`overture listing ${r.status}`);
  const found = [...(await r.text()).matchAll(/<Prefix>release\/([^<]+?)\/<\/Prefix>/g)].map(m => m[1]).sort();
  if (!found.length) throw new Error('overture: no release found');
  return found[found.length - 1];
}

/** Places of a bounding box with a website or a social profile. Null when DuckDB is not installed. */
export async function fetchOverture(box: { west: number; south: number; east: number; north: number }): Promise<OvertureRow[] | null> {
  const release = process.env.OVERTURE_RELEASE || await latestRelease();
  const num = (n: number) => Number(n.toFixed(5));
  const sql = `SELECT names.primary AS name, basic_category AS category, websites[1] AS website, socials AS socials,
      bbox.ymin AS lat, bbox.xmin AS lng, operating_status AS status, confidence AS confidence
    FROM read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*', hive_partitioning=1)
    WHERE bbox.xmin BETWEEN ${num(box.west)} AND ${num(box.east)} AND bbox.ymin BETWEEN ${num(box.south)} AND ${num(box.north)}
      AND (websites IS NOT NULL OR socials IS NOT NULL) AND names.primary IS NOT NULL`;
  // The bucket is public: no credentials, whatever the environment offers.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('AWS_')) delete env[k];
  const run = spawnSync('duckdb', ['-json', '-c', 'INSTALL httpfs', '-c', 'LOAD httpfs', '-c', "SET s3_region='us-west-2'", '-c', sql],
    { env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 240_000 });
  if (run.error && (run.error as NodeJS.ErrnoException).code === 'ENOENT') return null;
  if (run.status !== 0) throw new Error(`duckdb: ${(run.stderr || '').slice(0, 300)}`);
  return run.stdout.trim() ? JSON.parse(run.stdout) as OvertureRow[] : [];
}

const distinctive = (s: string) => core(s);
/** Every distinctive word of the shorter name is in the longer, and there is enough of it to mean something. */
export function sameName(ours: string[], theirs: string): boolean {
  const b = distinctive(theirs);
  return ours.some(a => {
    const x = distinctive(a);
    return x.length >= 4 && b.length >= 4 && overlap(x, b) >= 1;
  });
}

export interface Found { website: string | null; facebook: string | null; instagram: string | null; name: string; metres: number }

/** The one Overture record that is this place, or null. */
export function matchPlace(p: Place, rows: OvertureRow[]): Found | null {
  if (p.lat == null || p.lng == null) return null;
  const names = [p.name, ...(p.aliases ?? [])];
  const near = rows.map(r => ({ r, d: metres(p, r) }))
    .filter((x): x is { r: OvertureRow; d: number } => x.d != null && x.d <= 75
      && CATEGORY.test(x.r.category ?? '') && !/clos/i.test(x.r.status ?? '') && (x.r.confidence ?? 0) >= 0.5 && sameName(names, x.r.name));
  if (!near.length) return null;
  const hosts = new Set<string>();
  for (const { r } of near) {
    const u = httpUrl(r.website ?? '');
    if (u && isOwnSite(u)) hosts.add(new URL(u).hostname.replace(/^www\./, ''));
  }
  if (hosts.size > 1) return null;
  near.sort((a, b) => (b.r.confidence ?? 0) - (a.r.confidence ?? 0) || a.d - b.d);
  const best = near[0];
  const site = httpUrl(best.r.website ?? '');
  const socials = [best.r.website, ...(best.r.socials ?? [])].filter((x): x is string => !!x);
  const pick = (host: 'facebook.com' | 'instagram.com') => socials.map(s => socialUrl(host, s)).find(Boolean) ?? null;
  return {
    website: site && isOwnSite(site) ? new URL(site).origin + '/' : null,
    facebook: pick('facebook.com'), instagram: pick('instagram.com'),
    name: best.r.name, metres: Math.round(best.d),
  };
}
