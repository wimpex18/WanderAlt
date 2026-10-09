// What the pipeline needs to know about a city to place things in it: its name as a geocoder
// reads it, its country, a box around it (lookups outside it are namesakes elsewhere), its time
// zone and the languages its venues write in. A new city is one entry here, its sources file
// (sources.<city>.json) and its entry in city.js; README "Adding a city" lists the rest.

export interface CityProfile {
  id: string;
  /** As a geocoder reads it after a venue's name: "Kai kino, Tallinn". */
  name: string;
  /** ISO 3166-1 alpha-2, lower case, for Nominatim's countrycodes. */
  country: string;
  /** [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
  /** [lat, lng] of the centre: a short plus code ("CQW3+JC") is read relative to it. */
  centre: [number, number];
  /** How the city's name opens a venue's name ("Tallinna Linnahall" is OpenStreetMap's "Linnahall"). */
  prefixes: string[];
  tz: string;
  /** ISO 639-1, most used first. */
  languages: string[];
  /** Words that name a room or a door inside a larger venue, in the city's languages:
   *  "Tallinna Linnahall main entrance" is in Tallinna Linnahall. */
  roomWords: string[];
}

const ROOMS_EN = ['main entrance', 'entrance', 'hall', 'main hall', 'small hall', 'big hall', 'stage', 'studio', 'gallery', 'foyer', 'black box', 'room', 'bar', 'cafe', 'courtyard', 'garden', 'terrace', 'cinema', 'club'];

export const CITIES: Record<string, CityProfile> = {
  tallinn: {
    id: 'tallinn',
    name: 'Tallinn',
    country: 'ee',
    bbox: [24.55, 59.35, 24.97, 59.51],
    centre: [59.437, 24.7536],
    prefixes: ['tallinna', 'tallinn'],
    tz: 'Europe/Tallinn',
    languages: ['et', 'en', 'ru'],
    roomWords: [...ROOMS_EN, 'peasissepääs', 'sissepääs', 'saal', 'suur saal', 'väike saal', 'lava', 'stuudio', 'galerii', 'fuajee', 'ruum', 'baar', 'kohvik', 'hoov', 'aed', 'terrass', 'kino', 'klubi',
      'зал', 'сцена', 'студия', 'галерея', 'фойе', 'вход'],
  },
};

export function cityProfile(id: string): CityProfile {
  const c = CITIES[id];
  if (!c) throw new Error(`No city profile for "${id}": add one to pipeline/cities.ts`);
  return c;
}

export const inCity = (c: CityProfile, lat: number, lng: number) =>
  lng >= c.bbox[0] && lng <= c.bbox[2] && lat >= c.bbox[1] && lat <= c.bbox[3];
