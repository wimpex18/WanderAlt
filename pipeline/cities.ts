// What the pipeline needs to know about a city to place things in it: its name as a geocoder
// reads it, its country, a box around it (lookups outside it are namesakes elsewhere), its time
// zone, the languages its venues write in, how its addresses and areas are written, and the words
// its venue names share. Words that belong to a language rather than a city (a closure notice, a
// programme link, a floor) are in WORDS, and a city uses those of its languages. A new city is one
// entry here, its sources file (sources.<city>.json) and its entry in city.js; README "Adding a
// city" lists the rest.

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
  /** Areas a geocoder gives that are districts, not the smaller areas visitors know (asum): replaced. */
  districts: RegExp;
  /** What a geocoder appends to a district's name ("Kesklinna linnaosa"). */
  districtSuffix: RegExp;
  /** Areas better known under an English name. */
  areaNames: Record<string, string>;
  /** Street types as addresses write them: words the geocoder matches without, and long forms it
   *  matches in their short form. */
  streets: { drop: string[]; short: Record<string, string> };
  /** The county an address may add, and a postcode, both dropped before geocoding. */
  region: RegExp;
  postcode: RegExp;
  /** The city and country as venue names carry them: never a venue's own word. */
  cityWords: string[];
  /** The city or country alone in a bracket after a name, as patterns ("(Tallinnas)"): a note, not the name. */
  bracketPlaces: string[];
  /** Legal forms written into business names (OÜ, MTÜ). */
  legalForms: string[];
  /** The OpenStreetMap area the venue catalogue reads. */
  osm: { area: string; adminLevel: number };
  /** Sites of the city's own portal: their logo is the city's, not a venue's. */
  portalHosts: RegExp;
  /** How a reader of a post is told to write a venue's name: in the script and languages the city's
   *  venues use, with an example from a text in another script. */
  venueNaming: string;
}

/** Words of each language the checks read in names and on venues' own sites. */
export interface LanguageWords {
  /** A kind of place: never what tells one venue from another. */
  kinds: string[];
  /** A floor or wing of a building, in a bracket after a name ("3. korrusel"). */
  floors: string[];
  /** An explicit notice that a venue has closed for good (on text compared as nameKey). */
  closure: string[];
  /** A link or address that leads to a programme. */
  programme: string[];
}

export const WORDS: Record<string, LanguageWords> = {
  en: {
    kinds: ['club', 'cinema', 'gallery', 'theatre', 'bar', 'pub', 'cafe', 'shop', 'store', 'jazz'],
    floors: ['floor'],
    closure: ['permanently closed', 'closed permanently'],
    programme: ['events?', 'programm?e?', 'program', 'calendar', 'schedule', 'repertoire', 'whats-on', 'upcoming'],
  },
  et: {
    kinds: ['klubi', 'kino', 'galerii', 'teater', 'baar', 'kohvik', 'raamatupood', 'raamatukauplus'],
    floors: ['korrus\\w*', 'korpus\\w*'],
    closure: ['suletud loplikult', 'loplikult suletud', 'jaadavalt suletud'],
    programme: ['kava', 'kalender', 'repertuaar', 'sündmused', 'syndmused', 'üritused', 'uritused', 'kontserdid', 'etendused', 'näitused'],
  },
  ru: {
    kinds: [],
    floors: [],
    closure: ['навсегда закрыт[ао]?', 'закрыт[ао]? навсегда'],
    programme: ['afisha'],
  },
};

/** The words of a city's languages, one list per use. */
export const wordsOf = (c: CityProfile, use: keyof LanguageWords): string[] => c.languages.flatMap(l => WORDS[l]?.[use] ?? []);

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
    districts: /^(kesklinna|põhja-tallinna|kristiine|haabersti|lasnamäe|mustamäe|nõmme|pirita)( linnaosa)?$|^(tallinn|all-linn)$/i,
    districtSuffix: / linnaosa$/,
    areaNames: { Vanalinn: 'Old Town' },
    streets: { drop: ['tänav', 'tn'], short: { maantee: 'mnt', puiestee: 'pst' } },
    region: /,?\s*Harju ?(maakond|maa)\b/gi,
    postcode: /\b\d{5}\b/g,
    cityWords: ['tallinn', 'tallinna', 'eesti', 'estonia'],
    bracketPlaces: ['tallinn(?:as)?', 'estonia'],
    legalForms: ['sa', 'ou', 'mtu', 'as'],
    osm: { area: 'Tallinn', adminLevel: 7 },
    portalHosts: /(^|\.)tallinn\.ee$/i,
    venueNaming: 'as the place is named in Tallinn (Estonian or English): for a Russian text give "Estonia Theatre", not "театр «Эстония»"',
  },
};

export function cityProfile(id: string): CityProfile {
  const c = CITIES[id];
  if (!c) throw new Error(`No city profile for "${id}": add one to pipeline/cities.ts`);
  return c;
}

export const inCity = (c: CityProfile, lat: number, lng: number) =>
  lng >= c.bbox[0] && lng <= c.bbox[2] && lat >= c.bbox[1] && lat <= c.bbox[3];
