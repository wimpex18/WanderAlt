// Venue names as sources write them → one place row each. A new name is
// geocoded once through OpenStreetMap's Nominatim (free; its usage policy
// allows one request a second with an identifying user agent) and stored
// with its OSM identity, so walking distance works and photos or hours can
// later be looked up by identity rather than guessed from a name.

import type { Candidate } from './types.ts';
import { UA, nameKey, slug, sleep } from './util.ts';

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
}

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

const ONLINE = /\b(online|zoom|veebis|онлайн)\b/i;

/** Estonian addresses as Nominatim matches them: "Kentmanni tänav 28, 10116
 *  Tallinn" → "Kentmanni 28, Tallinn". OSM names streets without "tänav",
 *  spells "maantee" and "puiestee" out, and has no unit numbers. */
export function normaliseAddress(a: string): string {
  const street = a
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,?\s*Harju ?(maakond|maa)\b/gi, '')
    .replace(/\b\d{5}\b/g, '')
    .replace(/\s*\/\s*\d+\w?\b/g, '')
    .replace(/\b(tänav|tn)\.?(?=\s|,|$)/gi, '')
    .replace(/\bmnt\b\.?/gi, 'maantee')
    .replace(/\bpst\b\.?/gi, 'puiestee')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim();
  return street ? `${street}, Tallinn` : '';
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
  private byKey = new Map<string, Place>();
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

  private remember(p: Place) {
    this.byKey.set(nameKey(p.name), p);
    for (const a of p.aliases) this.byKey.set(nameKey(a), p);
  }

  /** The place a candidate happens at, creating it on first sight. */
  async resolve(c: Candidate, geocode = true): Promise<Place | null> {
    const name = c.venue_name?.split(',')[0]?.trim();
    if (!name || ONLINE.test(name)) return null;
    const hit = this.byKey.get(nameKey(name));
    if (hit) {
      // A place an earlier run could not find gets a few more tries, one per run.
      if (geocode && hit.lat == null && !this.retried.has(hit.id) && this.retried.size < 10 && !this.created.includes(hit)) {
        this.retried.add(hit.id);
        if (await this.locate(hit, name, c.address ?? hit.address ?? null)) this.updated.push(hit);
      }
      return hit;
    }

    let id = `${this.city}-${slug(name)}`;
    for (let n = 2; [...this.byKey.values()].some(p => p.id === id); n++) id = `${this.city}-${slug(name)}-${n}`;
    const place: Place = { id, city: this.city, name, aliases: [nameKey(name)], address: c.address ?? null };

    if (geocode) await this.locate(place, name, c.address ?? null);
    this.remember(place);
    this.created.push(place);
    return place;
  }

  /** Coordinates, neighbourhood, and — when OSM's name agrees — identity and kind. */
  private async locate(place: Place, name: string, address: string | null): Promise<boolean> {
    const tries = [address ? normaliseAddress(address) : '', `${name}, Tallinn`].filter(q => q.length > 9);
    for (const q of new Set(tries)) {
      if (this.lookups >= this.maxLookups) return false;
      const found = await this.geocode(q);
      if (!found) continue;
      place.lat = Number(found.lat);
      place.lng = Number(found.lon);
      // An address can land on a different venue in the same building, so
      // the OSM identity and kind are kept only when the names agree.
      const osmName = nameKey(found.name ?? found.address?.amenity ?? '');
      if (osmName && (osmName.includes(nameKey(name)) || nameKey(name).includes(osmName))) {
        place.osm_id = `${found.osm_type}/${found.osm_id}`;
        place.kind = place.kind ?? OSM_KIND[`${found.category}/${found.type}`] ?? null;
      }
      const a = found.address ?? {};
      place.neighborhood = a.neighbourhood ?? a.suburb?.replace(/ linnaosa$/, '') ?? a.city_district?.replace(/ linnaosa$/, '') ?? null;
      if (!place.address && a.road) place.address = [a.road, a.house_number].filter(Boolean).join(' ');
      return true;
    }
    return false;
  }

  private async geocode(q: string): Promise<NominatimHit | null> {
    this.lookups++;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: 'ee' }).toString();
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
      await sleep(1100);
      if (!r.ok) return null;
      const hits = await r.json() as NominatimHit[];
      return hits[0] ?? null;
    } catch {
      return null;
    }
  }
}
