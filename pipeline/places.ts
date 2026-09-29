// Venue names as sources write them → one place row each. A new name is
// geocoded once through OpenStreetMap's Nominatim (free; its usage policy
// allows one request a second with an identifying user agent) and stored
// with its OSM identity, so walking distance works and photos or hours can
// later be looked up by identity rather than guessed from a name.

import type { Candidate } from './types.ts';
import { UA, nameKey, slug, sleep } from './util.ts';
import { comparePlaces, metres, osmIds, placeNames, canonicalOrder, addressKey } from './place-match.ts';

export interface Place {
  id: string;
  city: string;
  name: string;
  aliases: string[];
  kind?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  osm_id?: string | null;
  osm_ids?: string[];
  status?: 'active' | 'closed' | 'hidden';
  merged_into?: string | null;
  created_at?: string;
  osm_checked_at?: string | null;
  osm_last_seen_at?: string | null;
  osm_missing_count?: number;
  osm_state?: string;
  osm_note?: string | null;
  osm_closed_by_check?: boolean;
  osm_auto_close?: boolean;
  verification_state?: 'unverified' | 'verified' | 'review' | 'closed';
  verification_checked_at?: string | null;
  website_checked_at?: string | null;
  verified_at?: string | null;
  verification_source?: string | null;
  verification_url?: string | null;
  verification_note?: string | null;
  // Venue-page details (venues.ts fills them).
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  opening_hours?: string | null;
  description?: string | null;
  wikidata_id?: string | null;
  image_url?: string | null;
  image_attr?: string | null;
  image_source?: string | null;
  enriched_at?: string | null;
}

const DETAIL_FIELDS = ['kind', 'address', 'lat', 'lng', 'osm_id', 'website', 'instagram', 'facebook',
  'opening_hours', 'description', 'wikidata_id', 'neighborhood', 'image_url', 'image_attr', 'image_source'] as const;

interface NominatimHit {
  lat: string;
  lon: string;
  osm_type: string;
  osm_id: number;
  category?: string;
  type?: string;
  name?: string;
  address?: Record<string, string>;
}

/** The area a visitor knows: the asum (Kalamaja, Vanalinn, Telliskivi's
 *  Pelgulinn), which Nominatim returns as `quarter`, not the district
 *  (Põhja-Tallinna linnaosa). The Old Town gets its English name. */
const DISTRICT = /^(kesklinna|põhja-tallinna|kristiine|haabersti|lasnamäe|mustamäe|nõmme|pirita)( linnaosa)?$|^(tallinn|all-linn)$/i;
const ENGLISH: Record<string, string> = { Vanalinn: 'Old Town' };
export function areaName(a: Record<string, string>): string | null {
  const name = a.quarter ?? a.neighbourhood ?? a.suburb?.replace(/ linnaosa$/, '') ?? a.city_district?.replace(/ linnaosa$/, '') ?? null;
  return name ? ENGLISH[name] ?? name : null;
}
/** True for an area label that names a district rather than an asum. */
export const isDistrict = (n: string | null | undefined) => !n || DISTRICT.test(n.trim());

const ONLINE = /\b(online|zoom|veebis|онлайн)\b/i;

/** Estonian addresses as Nominatim matches them (checked against it):
 *  "Kentmanni tänav 28, 10116 Tallinn" → "Kentmanni 28, Tallinn",
 *  "Narva maantee 13" → "Narva mnt 13", "L.Koidula 21c" → "Koidula 21c".
 *  No postcodes, unit numbers, parentheses or plus codes. */
export function normaliseAddress(a: string): string {
  const street = a
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3}\b/g, '')
    .replace(/,?\s*Harju ?(maakond|maa)\b/gi, '')
    .replace(/\b\d{5}\b/g, '')
    .replace(/\s*\/\s*\d+\w?\b/g, '')
    .replace(/\b(tänav|tn)\.?(?=\s|,|$)/gi, '')
    .replace(/\bmaantee\b|\bmnt\b\.?/gi, 'mnt')
    .replace(/\bpuiestee\b|\bpst\b\.?/gi, 'pst')
    .replace(/^\s*\p{Lu}\.\s*/u, '')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim();
  return /\d/.test(street) ? `${street}, Tallinn` : '';
}

/** OSM tags → the place kinds the site lists (supabase.js VENUE_KINDS). */
const OSM_KIND: Record<string, string> = {
  'amenity/cinema': 'cinema', 'amenity/nightclub': 'club', 'amenity/arts_centre': 'arts centre',
  'amenity/community_centre': 'community', 'amenity/social_centre': 'community',
  'tourism/gallery': 'gallery', 'shop/art': 'gallery', 'shop/books': 'bookshop',
  'shop/music': 'record store', 'shop/second_hand': 'thrift', 'shop/charity': 'thrift',
  'amenity/theatre': 'theatre', 'amenity/bar': 'bar', 'amenity/pub': 'bar', 'amenity/cafe': 'cafe',
  'tourism/museum': 'museum', 'amenity/library': 'library',
};

export class Places {
  private byId = new Map<string, Place>();
  readonly created: Place[] = [];
  readonly updated: Place[] = [];
  private retried = new Set<string>();
  private lookups = 0;
  private city: string;
  private maxLookups: number;

  constructor(existing: Place[], city = 'tallinn', maxLookups = 25) {
    this.city = city;
    this.maxLookups = maxLookups;
    for (const p of existing) this.remember(p);
  }

  /** Fold a catalogue place (OpenStreetMap) into the store: an existing
   *  place with the same OSM id or name gains what it lacks; anything else
   *  becomes a new place. */
  merge(incoming: Place): Place {
    const known = this.find(incoming);
    if (known) {
      let changed = false;
      for (const k of DETAIL_FIELDS) {
        if ((known[k] == null || known[k] === '') && incoming[k] != null) { (known as unknown as Record<string, unknown>)[k] = incoming[k]; changed = true; }
      }
      const aliases = [...new Set([...placeNames(known), ...placeNames(incoming)])];
      if (aliases.length !== known.aliases.length) { known.aliases = aliases; changed = true; }
      const identities = [...new Set([...osmIds(known), ...osmIds(incoming)])];
      if (identities.join() !== (known.osm_ids ?? []).join()) { known.osm_ids = identities; changed = true; }
      this.remember(known);
      if (changed && !this.created.includes(known) && !this.updated.includes(known)) this.updated.push(known);
      return known;
    }
    let id = incoming.id;
    for (let n = 2; this.byId.has(id); n++) id = `${incoming.id}-${n}`;
    const place = { ...incoming, id };
    this.remember(place);
    this.created.push(place);
    return place;
  }

  /** Every place known this run, stored or new. */
  all(): Place[] {
    return [...this.byId.values()].filter(p => !p.merged_into);
  }

  private remember(p: Place) {
    this.byId.set(p.id, p);
  }

  private find(incoming: Place): Place | undefined {
    const proof = { ...incoming, id: '' };
    const all = this.all().filter(p => p.city === incoming.city).sort(canonicalOrder);
    const identity = all.filter(p => osmIds(incoming).some(id => osmIds(p).includes(id)));
    if (identity.length === 1) return identity[0];
    const exact = all.filter(p => placeNames(p).some(n => placeNames(incoming).includes(n)));
    // A unique exact spelling without location evidence preserves the old
    // name lookup. Supplied coordinates/address must agree when both exist.
    if (exact.length === 1) {
      const p = exact[0], d = metres(p, incoming);
      if ((d == null || d <= 100) && (!p.address || !incoming.address || addressKey(p.address) === addressKey(incoming.address))) return p;
    }
    const near = all.filter(p => comparePlaces(p, proof)?.action === 'merge');
    if (near.length === 1) return near[0];
    return undefined;
  }

  /** The place a candidate happens at, creating it on first sight. */
  async resolve(c: Candidate, geocode = true): Promise<Place | null> {
    const name = c.venue_name?.split(',')[0]?.trim();
    if (!name || ONLINE.test(name)) return null;
    const incoming: Place = { id: '', city: this.city, name, aliases: [nameKey(name)],
      address: c.address ?? null, lat: c.lat ?? null, lng: c.lng ?? null };
    const hit = this.find(incoming);
    if (hit) {
      // A place an earlier run could not locate or identify gets another try;
      // ten such places per run.
      const unfinished = hit.lat == null || (hit.osm_id == null && hit.kind == null);
      if (geocode && unfinished && !this.retried.has(hit.id) && this.retried.size < 10 && !this.created.includes(hit)) {
        this.retried.add(hit.id);
        if (await this.locate(hit, name, c.address ?? hit.address ?? null)) this.updated.push(hit);
      }
      return hit;
    }

    let id = `${this.city}-${slug(name)}`;
    for (let n = 2; this.byId.has(id); n++) id = `${this.city}-${slug(name)}-${n}`;
    const place: Place = { ...incoming, id };

    if (geocode) await this.locate(place, name, c.address ?? null);
    if (!this.find(place) && this.all().filter(p => placeNames(p).includes(nameKey(name))).length > 1) {
      console.log(`[places] unresolved ${name}: more than one venue uses this name`);
      return null;
    }
    // Geocoding can identify an existing venue under another spelling.
    return this.merge(place);
  }

  /** Coordinates from the address, then identity and kind from OSM's own
   *  record of the venue when one with the same name is close by. */
  private async locate(place: Place, name: string, address: string | null): Promise<boolean> {
    const street = address ? normaliseAddress(address) : '';
    const byAddress = street && this.lookups < this.maxLookups ? await this.geocode(street) : null;
    const byName = this.lookups < this.maxLookups ? await this.geocode(`${name}, Tallinn`) : null;
    const osmName = nameKey(byName?.name ?? '');
    const sameName = !!osmName && (osmName.includes(nameKey(name)) || nameKey(name).includes(osmName));
    const at = (h: NominatimHit) => ({ lat: Number(h.lat), lng: Number(h.lon) });
    // A name match far from the stated address is a namesake, not this venue.
    const venue = byName && sameName && (!byAddress || (metres(at(byName), at(byAddress)) ?? Infinity) < 250) ? byName : null;
    const hit = venue ?? byAddress;
    if (!hit) return false;
    place.lat = Number(hit.lat);
    place.lng = Number(hit.lon);
    if (venue) {
      place.osm_id = `${venue.osm_type}/${venue.osm_id}`;
      place.osm_ids = [...new Set([...(place.osm_ids ?? []), place.osm_id])];
      place.kind = place.kind ?? OSM_KIND[`${venue.category}/${venue.type}`] ?? null;
    }
    const a = hit.address ?? {};
    place.neighborhood = areaName(a);
    if (!place.address && a.road) place.address = [a.road, a.house_number].filter(Boolean).join(' ');
    return true;
  }

  /** Replace a district-level or missing area with the asum at the
   *  place's coordinates (Nominatim reverse, one lookup). */
  async area(place: Place): Promise<boolean> {
    if (place.lat == null || place.lng == null || this.lookups >= this.maxLookups) return false;
    this.lookups++;
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.search = new URLSearchParams({ lat: String(place.lat), lon: String(place.lng), format: 'jsonv2', zoom: '15', addressdetails: '1' }).toString();
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
      await sleep(1100);
      if (!r.ok) return false;
      const name = areaName((await r.json() as { address?: Record<string, string> }).address ?? {});
      if (!name || name === place.neighborhood) return false;
      place.neighborhood = name;
      return true;
    } catch {
      return false;
    }
  }

  private async geocode(q: string): Promise<NominatimHit | null> {
    this.lookups++;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: 'ee' }).toString();
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return null;
      const hits = await r.json() as NominatimHit[];
      return hits[0] ?? null;
    } catch {
      return null;
    } finally {
      await sleep(1100); // failures must respect the same Nominatim spacing
    }
  }
}
