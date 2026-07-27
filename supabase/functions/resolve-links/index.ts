import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// resolve-links  v1  (Jul 2026)
// ------------------------------------------------------------
// Turns picks.entities — the named things a pick is ABOUT — into
// picks.links, a map of platform -> url.
//
// The design decision worth keeping: we integrate HUBS, not platforms.
// A Spotify integration buys one platform and costs a client-credentials
// secret. One MusicBrainz artist lookup with inc=url-rels returns
// Spotify, SoundCloud, Bandcamp, Mixcloud, Discogs, Resident Advisor,
// YouTube and the official site together, for free, with no key at all —
// and Bandcamp has no public metadata API to integrate directly, while
// Mixcloud's is OAuth-only. So the hubs are strictly better:
//
//   music (artist, label)          -> MusicBrainz
//   books, authors, readings       -> Open Library
//   art, theatre, film, everything -> Wikidata
//
// And the honest part: for flea markets, community nights, sports and
// most local underground events there is NO hub. Nothing looks them up.
// Those pass through with no links, and the pages fall back to the
// source page and the venue's own socials, which we already hold. This
// function must never invent a link to fill that gap — a wrong artist
// page is worse than an empty one, which is why every match below is
// confidence-gated and drops out rather than guessing.
//
// All three hubs are free, keyless, and ask for a descriptive
// User-Agent plus considerate rates. We are serial with a delay, small
// batches per invocation, and each pick is stamped links_resolved_at
// whether or not anything was found, so nothing is retried forever.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UA = 'WanderAlt/1.0 (https://wanderalt.app; hello@wanderalt.app)';

/* MusicBrainz asks for at most one request per second. The others are
   more relaxed; we use the same pacing everywhere for simplicity. */
const RATE_MS    = 1100;
const BATCH      = 15;
const TIME_CAP_MS = 50_000;

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey:         SERVICE_KEY,
      Authorization:  `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

/* Only ever store http(s). A hub could hand back anything. */
const safeUrl = (u: unknown): string | null => {
  if (typeof u !== 'string') return null;
  try {
    const p = new URL(u.trim());
    return (p.protocol === 'http:' || p.protocol === 'https:') ? p.toString() : null;
  } catch (_) { return null; }
};

/* Classify by HOST, not by the hub's relation-type vocabulary. MusicBrainz
   renames and reorganises relationship types; hostnames don't move. */
const PLATFORM_BY_HOST: [RegExp, string][] = [
  [/(^|\.)open\.spotify\.com$/i,        'spotify'],
  [/(^|\.)spotify\.com$/i,              'spotify'],
  [/(^|\.)soundcloud\.com$/i,           'soundcloud'],
  [/(^|\.)bandcamp\.com$/i,             'bandcamp'],
  [/(^|\.)mixcloud\.com$/i,             'mixcloud'],
  [/(^|\.)discogs\.com$/i,              'discogs'],
  [/(^|\.)(ra\.co|residentadvisor\.net)$/i, 'residentadvisor'],
  [/(^|\.)(youtube\.com|youtu\.be)$/i,  'youtube'],
  [/(^|\.)last\.fm$/i,                  'lastfm'],
  [/(^|\.)facebook\.com$/i,             'facebook'],
  [/(^|\.)instagram\.com$/i,            'instagram'],
  [/(^|\.)(twitter\.com|x\.com)$/i,     'twitter'],
  [/(^|\.)(bsky\.app)$/i,               'bluesky'],
  [/(^|\.)imdb\.com$/i,                 'imdb'],
  [/(^|\.)letterboxd\.com$/i,           'letterboxd'],
  [/(^|\.)openlibrary\.org$/i,          'openlibrary'],
  [/(^|\.)wikidata\.org$/i,             'wikidata'],
  [/(^|\.)wikipedia\.org$/i,            'wikipedia'],
];

function classify(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const [re, key] of PLATFORM_BY_HOST) if (re.test(host)) return key;
    return null;
  } catch (_) { return null; }
}

/* Normalise for comparison: casefold, strip accents and punctuation.
   "Röyksopp" and "roeyksopp" still differ — deliberately. We would rather
   miss a link than attach the wrong artist's Spotify page. */
const norm = (s: string) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// ── Hub: MusicBrainz ────────────────────────────────────────────
// Free, no key. Search then look up with url-rels.
async function musicbrainz(name: string): Promise<Record<string, string>> {
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, '')}"`);
  const found = await getJson(
    `https://musicbrainz.org/ws/2/artist?query=${q}&fmt=json&limit=3`);
  const cands: any[] = found?.artists ?? [];
  /* score is MusicBrainz's own match confidence. Requiring a normalised
     exact name match on top of it is what keeps "Hall" the Tallinn club
     from resolving to "Hall & Oates". */
  const hit = cands.find(a => (a.score ?? 0) >= 90 && norm(a.name ?? '') === norm(name));
  if (!hit?.id) return {};

  await sleep(RATE_MS);
  const full = await getJson(
    `https://musicbrainz.org/ws/2/artist/${hit.id}?inc=url-rels&fmt=json`);
  const out: Record<string, string> = {};
  for (const rel of (full?.relations ?? [])) {
    const url = safeUrl(rel?.url?.resource);
    if (!url) continue;
    const key = classify(url);
    if (key) { if (!out[key]) out[key] = url; }
    else if (rel.type === 'official homepage' && !out.website) out.website = url;
  }
  out.musicbrainz = `https://musicbrainz.org/artist/${hit.id}`;
  return out;
}

// ── Hub: Open Library ───────────────────────────────────────────
// Free, no key. Authors for readings, book launches, literary talks.
async function openLibrary(name: string): Promise<Record<string, string>> {
  const found = await getJson(
    `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(name)}&limit=3`);
  const hit = (found?.docs ?? []).find((d: any) => norm(d?.name ?? '') === norm(name));
  if (!hit?.key) return {};
  return { openlibrary: `https://openlibrary.org/authors/${hit.key}` };
}

// ── Hub: Wikidata ───────────────────────────────────────────────
// Free, no key. The universal fallback: artists, galleries, theatre
// companies, films, museums. Carries the platform ids directly, so a
// film resolves to IMDb without a TMDB key.
const WD_CLAIM: Record<string, (v: string) => string> = {
  P856:  v => v,                                              // official website
  P2003: v => `https://instagram.com/${v}`,                   // Instagram
  P2013: v => `https://facebook.com/${v}`,                    // Facebook
  P1902: v => `https://open.spotify.com/artist/${v}`,         // Spotify artist
  P3040: v => `https://soundcloud.com/${v}`,                  // SoundCloud
  P3283: v => `https://${v}.bandcamp.com`,                    // Bandcamp
  P1953: v => `https://www.discogs.com/artist/${v}`,          // Discogs artist
  P345:  v => `https://www.imdb.com/title/${v}`,              // IMDb
  P6127: v => `https://letterboxd.com/film/${v}`,             // Letterboxd
};
const WD_KEY: Record<string, string> = {
  P856: 'website', P2003: 'instagram', P2013: 'facebook',
  P1902: 'spotify', P3040: 'soundcloud', P3283: 'bandcamp',
  P1953: 'discogs', P345: 'imdb', P6127: 'letterboxd',
};

async function wikidata(name: string): Promise<Record<string, string>> {
  const search = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json` +
    `&language=en&limit=3&search=${encodeURIComponent(name)}`);
  const hit = (search?.search ?? []).find((s: any) => norm(s?.label ?? '') === norm(name));
  if (!hit?.id) return {};

  await sleep(RATE_MS);
  const data = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`);
  const claims = data?.entities?.[hit.id]?.claims ?? {};
  const out: Record<string, string> = { wikidata: `https://www.wikidata.org/wiki/${hit.id}` };
  for (const [prop, build] of Object.entries(WD_CLAIM)) {
    const v = claims[prop]?.[0]?.mainsnak?.datavalue?.value;
    if (typeof v !== 'string') continue;
    const url = safeUrl(build(v));
    if (url) out[WD_KEY[prop]] = url;
  }
  return out;
}

// ── Which hub answers for which pick ────────────────────────────
// Driven by the entity's role first (the ingest knows what it captured)
// and the pick's kind second.
const MUSIC_KINDS = new Set(['gig', 'club', 'concert', 'festival']);
const BOOK_KINDS  = new Set(['talk', 'lecture', 'reading', 'bookshop', 'literature']);
const FILM_KINDS  = new Set(['cinema', 'film']);

function hubsFor(role: string, kind: string): ((n: string) => Promise<Record<string, string>>)[] {
  const k = (kind || '').toLowerCase();
  if (role === 'artist')  return [musicbrainz, wikidata];
  if (role === 'author')  return [openLibrary, wikidata];
  if (role === 'film')    return [wikidata];
  if (MUSIC_KINDS.has(k)) return [musicbrainz, wikidata];
  if (BOOK_KINDS.has(k))  return [openLibrary, wikidata];
  if (FILM_KINDS.has(k))  return [wikidata];
  /* Exhibitions, galleries, theatre, performance, markets, community,
     sports: Wikidata is the only hub that might know them, and for a flea
     market it simply won't. That is the expected outcome, not a failure. */
  return [wikidata];
}

type Pick = {
  id: string;
  kind: string | null;
  entities: { name: string; role?: string }[] | null;
};

async function resolveOne(p: Pick): Promise<{ id: string; found: number }> {
  const links: Record<string, string> = {};
  const ents = (p.entities ?? []).slice(0, 4);   // cap the fan-out per pick

  for (const ent of ents) {
    if (!ent?.name) continue;
    for (const hub of hubsFor(String(ent.role ?? 'artist'), p.kind ?? '')) {
      await sleep(RATE_MS);
      let got: Record<string, string> = {};
      try { got = await hub(ent.name); } catch (_) { got = {}; }
      /* First entity to answer for a platform wins — the headliner is
         listed first, and its Spotify is the one worth showing. */
      for (const [k, v] of Object.entries(got)) if (!links[k]) links[k] = v;
      if (Object.keys(got).length) break;   // a hub answered; don't ask the next
    }
  }

  const found = Object.keys(links).length;
  await rest(`picks?id=eq.${encodeURIComponent(p.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      /* Stamp even when empty: "we looked and there is nothing" is a
         result, and without it every flea market is retried forever. */
      links: found ? links : null,
      links_resolved_at: new Date().toISOString(),
    }),
  });
  return { id: p.id, found };
}

export default {
  async fetch(_req: Request): Promise<Response> {
    const started = Date.now();
    const res = await rest(
      'picks?archived_at=is.null&links_resolved_at=is.null&entities=not.is.null' +
      `&select=id,kind,entities&limit=${BATCH}`);
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `picks ${res.status}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const picks = (await res.json()) as Pick[];

    const results: { id: string; found: number }[] = [];
    for (const p of picks) {
      if (Date.now() - started > TIME_CAP_MS) break;
      try { results.push(await resolveOne(p)); }
      catch (e) { console.error(`resolve ${p.id}:`, e instanceof Error ? e.message : String(e)); }
    }

    const withLinks = results.filter(r => r.found > 0).length;
    await rest('ingest_log', {
      method: 'POST',
      body: JSON.stringify({
        fn: 'resolve-links',
        finished_at: new Date().toISOString(),
        status: 'ok',
        inserted: withLinks,
        detail: { examined: results.length, with_links: withLinks, remaining_in_batch: picks.length - results.length },
      }),
    });

    return new Response(JSON.stringify({
      ok: true, examined: results.length, with_links: withLinks, results,
    }), { headers: { 'Content-Type': 'application/json' } });
  },
};
