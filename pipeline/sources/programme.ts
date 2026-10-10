// What the readers of venues' own programme pages share (nextflight.ts, saal.ts, stl.ts): where a row
// happens and a clean link.
//
// A row prints its place as text. config.venue_map: [[regex on that text, our venue name or null], …],
// the first match wins; null keeps the show in Tallinn without a named place ("Urban space, Tallinn").
// A row that names no place is at the source's own venue (config.venue_name), as on any single venue's
// programme. A place no entry matches is kept only when its own text says Tallinn ("Ronimisministeerium
// (Suur-Paala 39, Tallinn)": the name before the brackets, the address inside them). Anything else is a
// tour date or a partner stage in another town and is not listed. config.skip_places: rows that are not
// public, such as a performance for school groups.

import type { Source } from '../types.ts';
import { httpUrl } from '../util.ts';
import { cityProfile } from '../cities.ts';

export interface Where { venue: string | null; address: string | null; hall: string | null }

export function whereOf(text: string | null | undefined, source: Source): Where | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  const own = (source.config.venue_name as string | undefined) ?? null;
  const ownAddress = (source.config.address as string | undefined) ?? null;
  if (source.config.skip_places && new RegExp(String(source.config.skip_places), 'iu').test(t)) return null;
  if (!t) return { venue: own, address: ownAddress, hall: null };
  for (const [re, name] of (source.config.venue_map as [string, string | null][] | undefined) ?? []) {
    if (new RegExp(re, 'iu').test(t)) return { venue: name, address: name && name === own ? ownAddress : null, hall: t };
  }
  // A place in the city by name ("Kultuurikatel, Tallinn", "Kai (Peetri 12, Tallinn)"); anywhere else is a tour date.
  const city = cityProfile(source.city).name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${city}\\b`, 'i').test(t)) {
    const name = t.split(/\s*[,(]\s*/)[0].trim();
    const address = new RegExp(`\\(([^()]*\\b${city}\\b[^()]*)\\)`, 'i').exec(t)?.[1].trim() ?? null;
    return { venue: name && !new RegExp(`^${city}\\b`, 'i').test(name) ? name : null, address, hall: t };
  }
  return null;
}

/** An http(s) link without tracking parameters (utm_*, fbclid, gclid). */
export function cleanLink(u: unknown, base?: string): string | null {
  const href = httpUrl(typeof u === 'string' ? u.replace(/&amp;/g, '&') : u, base);
  if (!href) return null;
  const url = new URL(href);
  for (const k of [...url.searchParams.keys()]) if (/^(fbclid|gclid|utm_.*|_aem_.*|mc_.*)$/i.test(k)) url.searchParams.delete(k);
  return url.href;
}

/** Same place text, ignoring case and spacing: a hall named like its venue is not a second place. */
export const samePlace = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').toLowerCase().replace(/\s+/g, ' ').trim() === (b ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
