// Opening hours for places that have none, from the best source each place offers, in order:
//   1. OpenStreetMap       (already on the row; the catalogue fills it)
//   2. the venue's own site: structured data (siteHours), then hours written out as text on its
//      homepage or on up to two of its contact or visit pages (textHours)
//   3. its Facebook Page, through the Graph API, which also fills a missing website and description
//      (lookupFacebookPage; needs Page Public Metadata Access, README.md)
//   4. its Instagram bio, through business_discovery, when a line states days and times (bioHours)
//   5. a free model reading the lines about hours from that same site or bio (model-hours.ts),
//      kept only when every time it gives is written there; a few a run
// The first source that gives hours the site's own reader can evaluate wins, and the row
// records which one (`hours_source`) so a page can say where the hours came from. A venue whose
// site says it opens only for its events ("on concert evenings") is recorded as `events` with no
// hours. A place is looked at again after a fortnight, or sooner once the readers here have
// improved (READER_SINCE); a source Meta refuses ends for the run. Nothing is guessed: a place
// with no source keeps none.
import type { Place } from './places.ts';
import { getHtml } from './util.ts';
import { siteHours } from './site-hours.ts';
import { textHours, hoursPages, eventNights } from './site-text-hours.ts';
import { hoursWindow, modelHours } from './model-hours.ts';
import type { Models } from './llm.ts';
import { bioHours } from './bio-hours.ts';
import { facebookPage, lookupFacebookPage } from './facebook-hours.ts';
import { instagramHandle, lookupBio, type InstagramConfig } from './instagram.ts';

export type HoursSource = 'osm' | 'site' | 'facebook' | 'instagram' | 'events';
const REVISIT_DAYS = 14;
/** When the readers below last learned something: a place looked at before this is due again. Move
 *  it forward whenever a reader changes, so the places it missed are read with the new one. */
export const READER_SINCE = '2026-10-05T00:00:00Z';
/** Places a run may hand to the model, which spends free quota shared with the event reader. */
const MODEL_PLACES = 8;

interface Deps {
  html?: (url: string) => Promise<string | null>;
  facebook?: typeof lookupFacebookPage;
  bio?: typeof lookupBio;
  log?: (s: string) => void;
  now?: number;
  /** Filled with each bio read (lower-case handle → text), so the drift check does not ask again. */
  bios?: Map<string, string>;
  /** The free model lanes; without them the last step is skipped. */
  models?: Models | null;
  modelHours?: typeof modelHours;
}

/* A page counts as the venue's own when it stays on the same site; a move between its own
   subdomains (www.fotografiska.com to tallinn.fotografiska.com) still does. */
const site = (u: string) => new URL(u).hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
const readSite = async (url: string): Promise<string | null> => {
  try {
    const page = await getHtml(url, { timeoutMs: 15_000 });
    return site(page.url) === site(url) ? page.html.slice(0, 400_000) : null;
  } catch { return null; }
};

/** Active places with no hours, picked ones first, not looked at in the last fortnight. */
export function dueForHours(places: Place[], now = Date.now()): Place[] {
  return places
    .filter(p => (p.status ?? 'active') === 'active' && !p.merged_into && !p.opening_hours && (p.website || p.facebook || p.instagram)
      && (!p.hours_checked_at || now - Date.parse(p.hours_checked_at) > REVISIT_DAYS * 86_400_000 || p.hours_checked_at < READER_SINCE))
    .sort((a, b) => Number(!!b.picked) - Number(!!a.picked) || (a.hours_checked_at ?? '').localeCompare(b.hours_checked_at ?? '') || a.id.localeCompare(b.id));
}

/** Look for hours for up to `limit` due places. Returns the places that changed. */
export async function fillHours(places: Place[], cfg: InstagramConfig | null, limit = 30, deps: Deps = {}): Promise<Place[]> {
  const html = deps.html ?? readSite, fb = deps.facebook ?? lookupFacebookPage, bio = deps.bio ?? lookupBio, log = deps.log ?? console.log;
  const now = deps.now ?? Date.now();
  const ask = deps.modelHours ?? modelHours;
  let modelLeft = deps.models ? MODEL_PLACES : 0;
  const stopped = new Set<'facebook' | 'instagram'>();
  const tally: Record<string, number> = {};
  const changed: Place[] = [];
  const due = dueForHours(places, now).slice(0, limit);
  for (const p of due) {
    let found: { hours: string | null; source: HoursSource } | null = null;
    // The venue's own words about its hours, kept for the model in case no rule reads them.
    const windows: { text: string; source: HoursSource }[] = [];
    if (p.website) {
      const page = await html(p.website);
      const read = (h: string) => { windows.push({ text: hoursWindow(h), source: 'site' }); return siteHours(h) || textHours(h); };
      let h = page && read(page);
      let events = !!page && eventNights(page);
      for (const sub of page && !h ? hoursPages(page, p.website) : []) {
        const more = await html(sub);
        h = more && read(more);
        events ||= !!more && eventNights(more);
        if (h) break;
      }
      if (h) found = { hours: h, source: 'site' };
      else if (events) found = { hours: null, source: 'events' };
    }
    const page = facebookPage(p.facebook);
    if (!found && cfg && page && !stopped.has('facebook')) {
      const r = await fb(page, cfg);
      if (r.kind === 'found') {
        if (r.hours) found = { hours: r.hours, source: 'facebook' };
        // The Page is the venue's own (its record or its site gave the link): what it says fills gaps.
        if (r.website && !p.website) { p.website = r.website; p.website_source = 'facebook'; }
        if (r.about && !p.description) p.description = r.about;
        if (r.closed) log(`[hours] ${p.name}: its Facebook Page says it is permanently closed; check it`);
      }
      else if (r.kind === 'stop') { stopped.add('facebook'); log(`[hours] facebook stopped: ${r.reason}`); }
    }
    const handle = instagramHandle(p.instagram);
    if (!found && cfg && handle && !stopped.has('instagram')) {
      const r = await bio(handle, cfg);
      if (r.kind === 'found') {
        deps.bios?.set(handle.toLowerCase(), r.biography);
        const h = bioHours(r.biography);
        if (h) found = { hours: h, source: 'instagram' }; else windows.push({ text: hoursWindow(r.biography, false), source: 'instagram' });
      } else if (r.kind === 'stop') { stopped.add('instagram'); log(`[hours] instagram stopped: ${r.reason}`); }
    }
    const said = windows.filter(w => w.text);
    if (!found && said.length && modelLeft > 0 && deps.models?.ready) {
      modelLeft--;
      for (const w of said) {
        const h = await ask(deps.models, p.name, w.text);
        if (h) { found = { hours: h, source: w.source }; log(`[hours] ${p.name}: read by the model from its ${w.source === 'site' ? 'site' : 'Instagram bio'}`); break; }
      }
    }
    p.hours_checked_at = new Date(now).toISOString();
    if (found) { p.opening_hours = found.hours; p.hours_source = found.source; tally[found.source] = (tally[found.source] ?? 0) + 1; }
    else if (p.hours_source === 'events') p.hours_source = null;   // the site no longer says so
    changed.push(p);
  }
  const got = Object.entries(tally).map(([k, n]) => (k === 'events' ? `${n} open for events only` : `${n} from ${k}`)).join(', ');
  log(`[hours] ${due.length} places looked at${got ? `: ${got}` : ', none found'}`);
  return changed;
}
