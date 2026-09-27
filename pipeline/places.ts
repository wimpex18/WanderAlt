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
  name?: string;
  address?: Record<string, string>;
}

const ONLINE = /\b(online|zoom|veebis|онлайн)\b/i;

export class Places {
  private byKey = new Map<string, Place>();
  readonly created: Place[] = [];
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
    if (hit) return hit;

    let id = `${this.city}-${slug(name)}`;
    for (let n = 2; [...this.byKey.values()].some(p => p.id === id); n++) id = `${this.city}-${slug(name)}-${n}`;
    const place: Place = { id, city: this.city, name, aliases: [nameKey(name)], address: c.address ?? null };

    if (geocode) {
      // The address first, then without its postcode, then the name itself.
      // "Telliskivi 60a / 9" names a building and a unit; Nominatim wants the building.
      const street = c.address?.replace(/\s*\/\s*\d+\w?\b/, '');
      const tries = [street, street?.replace(/\b\d{5}\b/, ''), `${name}, Tallinn`]
        .filter((q): q is string => !!q && q.trim().length > 3);
      for (const q of new Set(tries)) {
        if (this.lookups >= this.maxLookups) break;
        const found = await this.geocode(q);
        if (!found) continue;
        place.lat = Number(found.lat);
        place.lng = Number(found.lon);
        // An address can land on a different venue in the same building, so
        // the OSM identity is kept only when the names agree.
        const osmName = nameKey(found.name ?? found.address?.amenity ?? '');
        if (osmName && (osmName.includes(nameKey(name)) || nameKey(name).includes(osmName))) {
          place.osm_id = `${found.osm_type}/${found.osm_id}`;
        }
        const a = found.address ?? {};
        place.neighborhood = a.neighbourhood ?? a.suburb?.replace(/ linnaosa$/, '') ?? a.city_district?.replace(/ linnaosa$/, '') ?? null;
        if (!place.address && a.road) place.address = [a.road, a.house_number].filter(Boolean).join(' ');
        break;
      }
    }
    this.remember(place);
    this.created.push(place);
    return place;
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
