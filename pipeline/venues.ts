// The Places side: venues worth walking to whether or not they list an
// event tonight, and the details a venue page needs.
//
//   osmCatalogue()  every record shop, bookshop, gallery, thrift shop, arts
//                   centre, cinema, club, community centre and theatre in the
//                   city, from OpenStreetMap via Overpass (free, no key).
//   enrichPlace()   links and a photo, each from a source that identifies
//                   the venue: its OSM tags, its Wikidata item, its own
//                   website. Never a search by name.

import { createHash } from 'node:crypto';
import type { Place } from './places.ts';
import { get, httpUrl, decodeEntities, clip, nameKey, slug } from './util.ts';
import { closureReason, overpass, type OsmElement } from './osm.ts';

export interface VenueDetails {
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  opening_hours?: string | null;
  description?: string | null;
  wikidata_id?: string | null;
  image_url?: string | null;
  image_attr?: string | null;
  image_source?: string | null;
}

export type RichPlace = Place & VenueDetails;

/** OSM tag → place kind. Shared vocabulary with places.ts and supabase.js. */
export function osmKind(t: Record<string, string>): string | null {
  const s = t.shop, a = t.amenity, tr = t.tourism;
  if (s === 'music') return 'record store';
  if (s === 'books') return 'bookshop';
  if (s === 'second_hand' || s === 'charity') return 'thrift';
  if (s === 'art' || tr === 'gallery') return 'gallery';
  if (a === 'arts_centre') return 'arts centre';
  if (a === 'cinema') return 'cinema';
  if (a === 'nightclub') return 'club';
  if (a === 'community_centre' || a === 'social_centre') return 'community';
  if (a === 'theatre') return 'theatre';
  return null;
}

/** "instagram.com/sveta.baar/", "@sveta.baar" or a bare handle → a profile URL. */
export function socialUrl(host: 'instagram.com' | 'facebook.com', v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.trim();
  const m = new RegExp(`^(?:https?://)?(?:www\\.|m\\.)?${host.replace('.', '\\.')}/([A-Za-z0-9_.\\-]+)`, 'i').exec(s);
  const handle = m ? m[1] : /^@?([A-Za-z0-9_.\-]{2,})$/.exec(s)?.[1];
  if (!handle || /^(sharer|share|dialog|plugins|tr|p|reel|explore|events|groups|profile\.php)$/i.test(handle)) return null;
  return `https://www.${host}/${handle}`;
}

const QUERY = (area: string) => `[out:json][timeout:45];
area["name"="${area}"]["admin_level"="7"]->.t;
(
  nwr(area.t)["shop"~"^(music|books|second_hand|charity|art)$"]["name"];
  nwr(area.t)["amenity"~"^(arts_centre|cinema|nightclub|community_centre|social_centre|theatre)$"]["name"];
  nwr(area.t)["tourism"="gallery"]["name"];
);
out center tags;`;

export async function osmCatalogue(city = 'tallinn', area = 'Tallinn'): Promise<RichPlace[]> {
  const elements = await overpass(QUERY(area));
  return elements.map(el => placeFromOsm(el, city)).filter((p): p is RichPlace => !!p);
}

export function placeFromOsm(el: OsmElement, city: string): RichPlace | null {
  const t = el.tags ?? {};
  const kind = osmKind(t);
  const name = t['name:et'] ?? t.name;
  if (!kind || !name || closureReason(t, kind)) return null;
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    id: `${city}-${slug(name)}`,
    city,
    name,
    aliases: [...new Set([name, t.name, t['name:en'], ...(t.alt_name ?? '').split(';'), t['short_name']].filter(Boolean).map(n => nameKey(n!)))],
    kind,
    address: street ? `${street}, Tallinn` : null,
    lat: lat ?? null,
    lng: lng ?? null,
    osm_id: `${el.type}/${el.id}`,
    website: httpUrl(t.website ?? t['contact:website']),
    instagram: socialUrl('instagram.com', t['contact:instagram'] ?? t.instagram),
    facebook: socialUrl('facebook.com', t['contact:facebook'] ?? t.facebook),
    opening_hours: t.opening_hours ?? null,
    description: t['description:en'] ?? t.description ?? null,
    wikidata_id: /^Q\d+$/.test(t.wikidata ?? '') ? t.wikidata : null,
  };
}

// ── Enrichment ─────────────────────────────────────────────

/** The upload.wikimedia.org URL of a Commons file (never Special:FilePath). */
export function commonsUrl(file: string): string {
  const name = file.replace(/ /g, '_');
  const md5 = createHash('md5').update(name).digest('hex');
  return `https://upload.wikimedia.org/wikipedia/commons/${md5[0]}/${md5.slice(0, 2)}/${encodeURIComponent(name)}`;
}

async function fromWikidata(qid: string): Promise<VenueDetails> {
  const r = await get(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { accept: 'application/json' });
  const ent = (await r.json() as { entities: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> ; descriptions?: Record<string, { value: string }> }> }).entities[qid];
  const claim = (p: string) => ent?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value as string | undefined;
  const image = claim('P18');
  return {
    image_url: image ? commonsUrl(image) : null,
    image_attr: image ? `Photo: Wikimedia Commons, ${image.replace(/\.[a-z]+$/i, '')}` : null,
    image_source: image ? 'wikidata' : null,
    website: httpUrl(claim('P856')),
    instagram: socialUrl('instagram.com', claim('P2003')),
    facebook: socialUrl('facebook.com', claim('P2013')),
    description: ent?.descriptions?.en?.value ?? null,
  };
}

/** A domain that lapsed and now shows a parking or for-sale page. */
const PARKED = /domeeninimi\.ee|domain (is )?for sale|see domeen on müügil|this domain may be for sale|parkingcrew|sedoparking|godaddy\.com\/domainsearch/i;
export const parkedHomepage = (html: string) => PARKED.test(html);

/** A profile belongs to the venue when its handle shares a word with the
 *  venue's name or its website's domain. Homepages also link partners,
 *  sponsors and share buttons, which this keeps out. */
export function handleFits(profile: string, name: string, site: string): boolean {
  const handle = nameKey(profile.split('/').filter(Boolean).pop() ?? '').replace(/ /g, '');
  const stem = new URL(site).hostname.replace(/^www\./, '').split('.')[0].replace(/-/g, '');
  // Words every venue in town shares prove nothing.
  const GENERIC = /^(tallinn|tallinna|eesti|estonia|club|klubi|galerii|gallery|teater|theatre|kino|cinema|baar|raamat)$/;
  const words = [...nameKey(name).split(' '), stem].filter(w => w.length >= 4 && !GENERIC.test(w));
  return words.some(w => handle.includes(w.replace(/ /g, '')) || (handle.length >= 4 && w.includes(handle)));
}

/** Links a venue's own homepage makes to its social profiles, and its
 *  og:image and meta description. The site is the venue's, so this is
 *  identity, not a guess, as long as the site is still the venue's. */
export function fromHomepage(html: string, base: string, name = ''): VenueDetails {
  if (PARKED.test(html)) return {};
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => decodeEntities(m[1]));
  const first = (host: 'instagram.com' | 'facebook.com') =>
    hrefs.map(h => (h.includes(host) ? socialUrl(host, h) : null))
      .find(u => u && (!name || handleFits(u, name, base))) ?? null;
  const meta = (prop: string) =>
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html)?.[1]
    ?? new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i').exec(html)?.[1];
  const og = meta('og:image');
  const desc = meta('og:description') ?? meta('description');
  return {
    instagram: first('instagram.com'),
    facebook: first('facebook.com'),
    image_url: og ? httpUrl(decodeEntities(og), base) : null,
    image_attr: og ? `Image from ${new URL(base).hostname.replace(/^www\./, '')}` : null,
    image_source: og ? 'website' : null,
    description: desc ? clip(decodeEntities(desc).trim(), 400) : null,
  };
}

/** Fill what a place lacks; never overwrite what it has. Wikidata's photo
 *  beats a website's og:image, which is often a logo. */
export async function enrichPlace(p: RichPlace): Promise<Partial<RichPlace>> {
  const patch: Partial<RichPlace> = {};
  const take = (d: VenueDetails) => {
    for (const k of ['website', 'instagram', 'facebook', 'description'] as const) {
      if (!p[k] && !patch[k] && d[k]) patch[k] = d[k];
    }
    if (!p.image_url && !patch.image_url && d.image_url) {
      patch.image_url = d.image_url; patch.image_attr = d.image_attr; patch.image_source = d.image_source;
    }
  };
  if (p.wikidata_id) take(await fromWikidata(p.wikidata_id).catch(() => ({})));
  const site = patch.website ?? p.website;
  if (site && (!p.instagram || !p.facebook || !p.image_url || !p.description)) {
    try {
      const html = await (await get(site, { accept: 'text/html', timeoutMs: 15_000 })).text();
      take(fromHomepage(html.slice(0, 400_000), site, p.name));
    } catch { /* an unreachable site leaves the place as it was */ }
  }
  return patch;
}
