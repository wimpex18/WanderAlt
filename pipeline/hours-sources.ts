// Opening hours for places that have none, from the best source each place offers, in order:
//   1. OpenStreetMap       (already on the row; the catalogue fills it)
//   2. the venue's own site, as structured data   (siteHours)
//   3. its Facebook Page, through the Graph API   (lookupFacebookHours)
//   4. its Instagram bio, through business_discovery, when a line states days and times (bioHours)
// The first source that gives hours the site's own reader can evaluate wins, and the row
// records which one (`hours_source`) so a page can say where the hours came from. A place is
// looked at again after a fortnight; a source Meta refuses ends for the run. Nothing here uses
// a model, so no quota is spent, and nothing is guessed: a place with no source keeps none.
import type { Place } from './places.ts';
import { getHtml } from './util.ts';
import { siteHours } from './site-hours.ts';
import { bioHours } from './bio-hours.ts';
import { facebookPage, lookupFacebookHours } from './facebook-hours.ts';
import { instagramHandle, lookupBio, type InstagramConfig } from './instagram.ts';

export type HoursSource = 'osm' | 'site' | 'facebook' | 'instagram';
const REVISIT_DAYS = 14;

interface Deps {
  html?: (url: string) => Promise<string | null>;
  facebook?: typeof lookupFacebookHours;
  bio?: typeof lookupBio;
  log?: (s: string) => void;
  now?: number;
  /** Filled with each bio read (lower-case handle → text), so the drift check does not ask again. */
  bios?: Map<string, string>;
}

const readSite = async (url: string): Promise<string | null> => {
  try {
    const page = await getHtml(url, { timeoutMs: 15_000 });
    const host = (u: string) => new URL(u).hostname.replace(/^www\./, '');
    return host(page.url) === host(url) ? page.html.slice(0, 400_000) : null;
  } catch { return null; }
};

/** Active places with no hours, picked ones first, not looked at in the last fortnight. */
export function dueForHours(places: Place[], now = Date.now()): Place[] {
  return places
    .filter(p => (p.status ?? 'active') === 'active' && !p.merged_into && !p.opening_hours && (p.website || p.facebook || p.instagram)
      && (!p.hours_checked_at || now - Date.parse(p.hours_checked_at) > REVISIT_DAYS * 86_400_000))
    .sort((a, b) => Number(!!b.picked) - Number(!!a.picked) || (a.hours_checked_at ?? '').localeCompare(b.hours_checked_at ?? '') || a.id.localeCompare(b.id));
}

/** Look for hours for up to `limit` due places. Returns the places that changed. */
export async function fillHours(places: Place[], cfg: InstagramConfig | null, limit = 30, deps: Deps = {}): Promise<Place[]> {
  const html = deps.html ?? readSite, fb = deps.facebook ?? lookupFacebookHours, bio = deps.bio ?? lookupBio, log = deps.log ?? console.log;
  const now = deps.now ?? Date.now();
  const stopped = new Set<'facebook' | 'instagram'>();
  const tally: Record<string, number> = {};
  const changed: Place[] = [];
  const due = dueForHours(places, now).slice(0, limit);
  for (const p of due) {
    let found: { hours: string; source: HoursSource } | null = null;
    if (p.website) {
      const page = await html(p.website);
      const h = page && siteHours(page);
      if (h) found = { hours: h, source: 'site' };
    }
    const page = facebookPage(p.facebook);
    if (!found && cfg && page && !stopped.has('facebook')) {
      const r = await fb(page, cfg);
      if (r.kind === 'found') found = { hours: r.hours, source: 'facebook' };
      else if (r.kind === 'stop') { stopped.add('facebook'); log(`[hours] facebook stopped: ${r.reason}`); }
    }
    const handle = instagramHandle(p.instagram);
    if (!found && cfg && handle && !stopped.has('instagram')) {
      const r = await bio(handle, cfg);
      if (r.kind === 'found') { deps.bios?.set(handle.toLowerCase(), r.biography); const h = bioHours(r.biography); if (h) found = { hours: h, source: 'instagram' }; }
      else if (r.kind === 'stop') { stopped.add('instagram'); log(`[hours] instagram stopped: ${r.reason}`); }
    }
    p.hours_checked_at = new Date(now).toISOString();
    if (found) { p.opening_hours = found.hours; p.hours_source = found.source; tally[found.source] = (tally[found.source] ?? 0) + 1; }
    changed.push(p);
  }
  const got = Object.entries(tally).map(([k, n]) => `${n} from ${k}`).join(', ');
  log(`[hours] ${due.length} places looked at${got ? `: ${got}` : ', none found'}`);
  return changed;
}
