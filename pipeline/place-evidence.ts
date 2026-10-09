// Evidence about a place, gathered from sources that do not depend on each other: OpenStreetMap
// (through Nominatim), the pages of the place's own listings (a ticket shop's page usually names the
// venue and its address in JSON-LD), and the websites of the venues those pages belong to. Each piece
// says where it came from (its host), so place-checks.ts can ask for two hosts that agree.
//
// Nothing here decides anything, and nothing here trusts a model: a model may point at a passage,
// and quoteIn() is the check that the passage is really on the page.

import { getHtml, htmlToText, decodeEntities, httpUrl, nameKey, sleep, UA } from './util.ts';
import { areaName } from './places.ts';
import { type CityProfile, inCity } from './cities.ts';

/** One finding about where a place is or what it is. `host` is the independent source: two findings
 *  from the same host are one witness. */
export interface Evidence {
  source: 'osm' | 'page' | 'site' | 'catalogue';
  host: string;
  url?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  area?: string | null;
  osm_id?: string | null;
  /** OSM: the only venue in the city with exactly this place's name. */
  exact?: boolean;
  /** A room of a larger venue: the larger venue's name, as the source wrote it. */
  inside?: string | null;
  relation?: 'same' | 'part' | 'other' | null;
  /** The passage on the page that says so, checked to be there. */
  quote?: string | null;
  note?: string | null;
}

/** Text for comparing: case, accents, punctuation and spacing ignored. */
export const plain = (s: string) => ` ${nameKey(s)} `;

/** Is the quote really on the page? Compared as plain text, so spacing and accents may differ. */
export function quoteIn(text: string, quote: string | null | undefined): boolean {
  const q = plain(quote ?? '').trim();
  return q.length >= 8 && plain(text).includes(` ${q} `);
}

/** Does the text name this place? Whole words, accents ignored. */
export const mentions = (text: string, name: string) => {
  const n = plain(name).trim();
  return n.length >= 3 && plain(text).includes(` ${n} `);
};

/** Passages around each mention of a name, for a model to read instead of the whole page: the
 *  line that names it and a few lines either side. */
export function windowsAround(text: string, name: string, lines = 6, max = 4): string[] {
  const n = plain(name).trim();
  if (n.length < 3) return [];
  const all = text.split('\n'), out: string[] = [];
  let last = -Infinity;
  for (let i = 0; i < all.length && out.length < max; i++) {
    if (i - last <= lines || !plain(all[i]).includes(` ${n} `)) continue;
    out.push(all.slice(Math.max(0, i - lines), i + lines + 1).join('\n').slice(0, 2000));
    last = i;
  }
  return out;
}

// ── Pages ─────────────────────────────────────────────────────────

export interface Page { url: string; host: string; html: string; text: string }

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export { hostOf };

/** Pages fetched once a run. Only http(s), at most 3 MB, nothing that fails is retried. */
export class Pages {
  private cache = new Map<string, Promise<Page | null>>();
  get(url: string): Promise<Page | null> {
    const u = httpUrl(url);
    if (!u) return Promise.resolve(null);
    if (!this.cache.has(u)) this.cache.set(u, (async () => {
      try {
        const { html, url: final } = await getHtml(u, { timeoutMs: 20_000 });
        if (html.length > 3_000_000) return null;
        return { url: final, host: hostOf(final), html, text: htmlToText(html) };
      } catch { return null; }
    })());
    return this.cache.get(u)!;
  }
}

/** Where a page's own structured data says its events happen: JSON-LD Event.location. */
export function jsonLdLocations(html: string): { name: string | null; address: string | null; lat: number | null; lng: number | null; organizer: string | null }[] {
  const out: { name: string | null; address: string | null; lat: number | null; lng: number | null; organizer: string | null }[] = [];
  const visit = (x: unknown): void => {
    if (Array.isArray(x)) { x.forEach(visit); return; }
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    const type = ([] as unknown[]).concat(o['@type'] ?? []).map(String);
    if (type.some(t => /Event$/.test(t)) && o.location) {
      const org = ([] as unknown[]).concat(o.organizer ?? [])[0] as Record<string, unknown> | string | undefined;
      const organizer = typeof org === 'string' ? org : org && typeof org.name === 'string' ? org.name : null;
      for (const loc of ([] as unknown[]).concat(o.location)) {
        if (!loc || typeof loc !== 'object') continue;
        const l = loc as Record<string, unknown>;
        const a = l.address;
        const address = typeof a === 'string' ? a
          : a && typeof a === 'object' ? [(a as Record<string, unknown>).streetAddress, (a as Record<string, unknown>).addressLocality].filter(Boolean).map(String).join(', ') : null;
        const g = l.geo as Record<string, unknown> | undefined;
        const lat = g ? Number(g.latitude) : NaN, lng = g ? Number(g.longitude) : NaN;
        out.push({ name: typeof l.name === 'string' ? decodeEntities(l.name).trim() : null, address: address ? decodeEntities(address).trim() || null : null,
          lat: Number.isFinite(lat) && lat !== 0 ? lat : null, lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
          organizer: organizer ? decodeEntities(organizer).trim() || null : null });
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1].trim())); } catch { /* a page's broken JSON-LD says nothing */ }
  }
  return out;
}

/** Pages of a venue's own site that say where it is and what rooms it has: the homepage and up to
 *  three same-site links whose words mean contact, address, venue, rooms or getting here. */
const PLACE_WORDS = /\b(contact|contacts|about|venue|venues|location|locations|address|find us|getting here|how to get|spaces|rooms|halls|floor ?plans?|kontakt|kontaktid|asukoht|saalid|ruumid|meist|kontakty|контакт\p{L}*|адрес|как добраться|о нас)\b/iu;
export async function sitePages(pages: Pages, website: string | null | undefined, max = 3): Promise<Page[]> {
  const home = website ? await pages.get(website) : null;
  if (!home) return [];
  const links = new Map<string, string>();
  for (const m of home.html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = httpUrl(decodeEntities(m[1]), home.url);
    const words = `${decodeEntities(m[2].replace(/<[^>]+>/g, ' '))} ${m[1]}`;
    if (href && hostOf(href) === home.host && href !== home.url && PLACE_WORDS.test(words)) links.set(href, words);
  }
  // A site that draws its menu with script links nothing in its HTML: try the usual addresses.
  if (!links.size) for (const path of ['contact', 'kontakt', 'en/contact', 'about', 'en/about']) links.set(new URL(path, home.url.replace(/\/?$/, '/')).href, path);
  const more = await Promise.all([...links.keys()].slice(0, max).map(u => pages.get(u)));
  return [home, ...more.filter((p): p is Page => !!p && p.host === home.host)];
}

// ── OpenStreetMap through Nominatim ───────────────────────────────

export interface OsmHit { name: string; names: string[]; lat: number; lng: number; osm_id: string; kind: string; address: string | null; area: string | null }

/** Classes of OSM object that cannot be a venue, though they share its name: the bus stop, platform
 *  or street called after it, the district it gives its name to. */
const NOT_VENUE = /^(highway|railway|aeroway|public_transport|boundary|place|natural|waterway|route|power|barrier)$/;

/** Nominatim, one request a second as its policy asks, and only inside the city's box. */
export class Geocoder {
  lookups = 0;
  private city: CityProfile;
  private max: number;
  constructor(city: CityProfile, max = 40) { this.city = city; this.max = max; }

  async search(q: string): Promise<OsmHit[]> {
    if (this.lookups >= this.max) return [];
    this.lookups++;
    const [w, s, e, n] = this.city.bbox;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', namedetails: '1', limit: '6',
      countrycodes: this.city.country, viewbox: `${w},${n},${e},${s}`, bounded: '1' }).toString();
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return [];
      const hits = await r.json() as { name?: string; namedetails?: Record<string, string>; lat: string; lon: string; osm_type: string; osm_id: number; category: string; type: string; address?: Record<string, string> }[];
      return hits.map(h => ({
        name: h.name || h.namedetails?.name || '',
        // Every name OSM records for it: official, English, short, old and alternative names.
        names: [...new Set([h.name, ...Object.entries(h.namedetails ?? {}).filter(([k]) => /^(name|official_name|short_name|alt_name|old_name|loc_name|int_name)(:[a-z]{2})?$/.test(k)).flatMap(([, v]) => v.split(';'))]
          .map(v => (v ?? '').trim()).filter(Boolean))],
        lat: Number(h.lat), lng: Number(h.lon), osm_id: `${h.osm_type}/${h.osm_id}`, kind: `${h.category}/${h.type}`,
        address: h.address?.road ? [h.address.road, h.address.house_number].filter(Boolean).join(' ') : null,
        area: h.address ? areaName(h.address) : null,
      })).filter(h => inCity(this.city, h.lat, h.lng));
    } catch { return []; } finally { await sleep(1100); }
  }

  /** The one venue in the city with exactly this name, or null when there is none or more than one
   *  (two objects of the same name within 60 m are one venue drawn twice). */
  async venueNamed(name: string): Promise<OsmHit | null> {
    if (nameKey(name).length < 3) return null;
    const hits = (await this.search(name)).filter(h => !NOT_VENUE.test(h.kind.split('/')[0]) && osmNamed(h.names, name, this.city));
    const distinct = hits.filter((h, i) => !hits.slice(0, i).some(o => Math.hypot(o.lat - h.lat, (o.lng - h.lng) * Math.cos(h.lat * Math.PI / 180)) * 111_320 < 60));
    return distinct.length === 1 ? distinct[0] : null;
  }

  /** A street address in the city: the first hit that is a house or a venue, not a whole street. */
  async address(address: string): Promise<OsmHit | null> {
    const q = plain(address).includes(plain(this.city.name)) ? address : `${address}, ${this.city.name}`;
    const hits = await this.search(q);
    return hits.find(h => /house|building|amenity|tourism|leisure|shop|office/.test(h.kind) || /\d/.test(h.address ?? '')) ?? null;
  }
}

/** Does an OSM object carry this name? Any of its recorded names, compared as plain text, and with
 *  the city's own name ignored at the start: "Tallinna Linnahall" is OpenStreetMap's "Linnahall". */
export function osmNamed(names: string[], name: string, city: Pick<CityProfile, 'prefixes'>): boolean {
  const bare = (k: string) => { for (const p of city.prefixes) if (k.startsWith(`${p} `)) return k.slice(p.length + 1); return k; };
  const key = nameKey(name), keys = new Set([key, bare(key)].filter(k => k.length >= 3));
  return names.some(n => keys.has(nameKey(n)) || keys.has(bare(nameKey(n))));
}

// ── Profiles a site links ─────────────────────────────────────────

/** The Instagram and Facebook accounts a page links, as lower-case handles. */
export function profileLinks(html: string): { instagram: string[]; facebook: string[] } {
  const grab = (host: string) => [...new Set([...html.matchAll(new RegExp(`https?://(?:www\\.|m\\.)?${host.replace('.', '\\.')}/([A-Za-z0-9_.\\-]{2,})`, 'gi'))]
    .map(m => m[1].replace(/\.+$/, '').toLowerCase())
    .filter(h => !/^(sharer|share|dialog|plugins|tr|p|reel|reels|explore|events|groups|profile\.php|watch|stories|accounts|legal|about|help|policies|privacy)$/.test(h)))];
  return { instagram: grab('instagram.com'), facebook: grab('facebook.com') };
}

// ── Plus codes ────────────────────────────────────────────────────

const OLC = '23456789CFGHJMPQRVWX';
const PAIR_RES = [20, 1, 0.05, 0.0025, 0.000125];
export const PLUS_CODE = /\b([23456789CFGHJMPQRVWX]{4,8})\+([23456789CFGHJMPQRVWX]{2,3})\b/i;

/** The centre of a plus code's area. A short code ("CQW3+JC", as ticket shops print it) is read as
 *  the nearest match to the city's centre, as the Open Location Code spec recovers it. */
export function plusCode(text: string | null | undefined, ref: [number, number]): { lat: number; lng: number } | null {
  const m = PLUS_CODE.exec(text ?? '');
  if (!m) return null;
  const head = m[1].toUpperCase(), tail = m[2].toUpperCase().slice(0, 2);
  if (head.length % 2) return null;
  const decode = (code: string) => {
    let lat = -90, lng = -180, res = 0;
    for (let i = 0; i + 1 < code.length && i < 10; i += 2) {
      res = PAIR_RES[i / 2];
      lat += OLC.indexOf(code[i]) * res; lng += OLC.indexOf(code[i + 1]) * res;
    }
    return { lat: lat + res / 2, lng: lng + res / 2 };
  };
  if (head.length === 8) return decode(head + tail);
  const pad = 8 - head.length, resolution = Math.pow(20, 2 - pad / 2), half = resolution / 2;
  let latV = ref[0] + 90, lngV = ref[1] + 180, prefix = '';
  for (let i = 0; i < pad / 2; i++) {
    const r = PAIR_RES[i], a = Math.floor(latV / r), b = Math.floor(lngV / r);
    prefix += OLC[a] + OLC[b]; latV -= a * r; lngV -= b * r;
  }
  let { lat, lng } = decode(prefix + head + tail);
  if (ref[0] + half < lat && lat - resolution >= -90) lat -= resolution; else if (ref[0] - half > lat && lat + resolution <= 90) lat += resolution;
  if (ref[1] + half < lng) lng -= resolution; else if (ref[1] - half > lng) lng += resolution;
  return { lat, lng };
}
