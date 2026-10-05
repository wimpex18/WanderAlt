// Links checked on a venue's own site live beside its source configuration.
import type { Place } from './places.ts';
import type { Source } from './types.ts';
import { httpUrl, nameKey } from './util.ts';
import { instagramHandle } from './instagram.ts';
import { facebookPage } from './facebook-hours.ts';

export function fillSourceLinks(places: Place[], sources: Source[]): Place[] {
  const changed = new Set<Place>();
  for (const s of sources) {
    const name = String(s.config.venue_name ?? '');
    const candidates = places.filter(p => p.city === s.city && (p.status ?? 'active') === 'active' && !p.merged_into &&
      (s.config.venue_id ? p.id === s.config.venue_id : name && [p.name, ...p.aliases].some(a => nameKey(a) === nameKey(name))));
    if (candidates.length !== 1) continue;
    const p = candidates[0];
    const site = httpUrl(s.config.venue_site), ig = httpUrl(s.config.venue_instagram), fb = httpUrl(s.config.venue_facebook);
    if (!p.website && site) { p.website = site; p.website_source = 'source'; p.enriched_at = null; changed.add(p); }
    if (!p.instagram && ig && instagramHandle(ig)) { p.instagram = ig; changed.add(p); }
    if (!p.facebook && fb && facebookPage(fb)) { p.facebook = fb; changed.add(p); }
  }
  return [...changed];
}
