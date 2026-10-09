// A venue source's own accounts, checked against what the venue's own site links. The handle is
// what a listing shows ("Source · @…") and venue_instagram / venue_facebook are copied onto the
// place, so a stale or mistyped account is a wrong fact on every listing. The venue's site is the
// first-party record: an account it does not link is reported, with the ones it does.
//
//   node pipeline/source-check.ts [--city tallinn] [--github]
//
// Reports only; it never edits sources.<city>.json and never fails. In CI (--github) each finding
// is a warning annotation on the pull request.

import { readFileSync } from 'node:fs';
import type { Source } from './types.ts';
import { Pages, profileLinks, sitePages } from './place-evidence.ts';

export interface SourceFinding { source: string; field: 'handle' | 'venue_instagram' | 'venue_facebook'; ours: string; site: string[]; page: string }

/** Kinds whose source is the venue itself; a ticket shop's or a channel's handle is its own. */
const VENUE_KINDS = new Set(['html', 'jsonld', 'wordpress']);
const handleOf = (host: 'instagram.com' | 'facebook.com', v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null;
  const m = new RegExp(`${host.replace('.', '\\.')}/([A-Za-z0-9_.\\-]{2,})`, 'i').exec(v);
  return (m ? m[1] : v.replace(/^@/, '')).replace(/\/+$/, '').toLowerCase();
};
export const siteOf = (s: Source): string | null => {
  const site = (s.config as Record<string, unknown>).venue_site;
  if (typeof site === 'string' && site) return site;
  try { return VENUE_KINDS.has(s.kind) ? new URL(s.url).origin + '/' : null; } catch { return null; }
};

/** What the source says against what the site links. Only a site that links accounts of that kind
 *  can contradict one; a site with no Instagram link says nothing about the handle. */
export function compareAccounts(s: Source, links: { instagram: string[]; facebook: string[] }, page: string): SourceFinding[] {
  if (!VENUE_KINDS.has(s.kind)) return [];
  const c = s.config as Record<string, unknown>, out: SourceFinding[] = [];
  const check = (field: SourceFinding['field'], value: string | null, site: string[]) => {
    if (value && site.length && !site.includes(value)) out.push({ source: s.id, field, ours: value, site, page });
  };
  check('handle', handleOf('instagram.com', s.handle), links.instagram);
  check('venue_instagram', handleOf('instagram.com', c.venue_instagram), links.instagram);
  check('venue_facebook', handleOf('facebook.com', c.venue_facebook), links.facebook);
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const city = args[args.indexOf('--city') + 1] && args.includes('--city') ? args[args.indexOf('--city') + 1] : 'tallinn';
  const github = args.includes('--github');
  const sources = (JSON.parse(readFileSync(new URL(`./sources.${city}.json`, import.meta.url), 'utf8')) as Source[]).filter(s => s.config.enabled !== false);
  let findings = 0, checked = 0;
  const pages = new Pages();
  for (const s of sources) {
    const site = siteOf(s);
    if (!site) continue;
    // The homepage and its contact, about and venue pages: a theatre may link its bar's account on
    // the homepage and its own on the contact page.
    const read = await sitePages(pages, site);
    if (!read.length) { console.log(`[sources] ${s.id}: ${site} did not answer`); continue; }
    checked++;
    const links = read.map(p => profileLinks(p.html));
    const all = { instagram: [...new Set(links.flatMap(l => l.instagram))], facebook: [...new Set(links.flatMap(l => l.facebook))] };
    for (const f of compareAccounts(s, all, read[0].url)) {
      findings++;
      const text = `${f.source}: ${f.field} is "${f.ours}", but ${f.page} links ${f.site.map(h => `"${h}"`).join(', ')}`;
      console.log(github ? `::warning file=pipeline/sources.${city}.json,title=Source account::${text}` : `[sources] ${text}`);
    }
  }
  console.log(`[sources] ${checked} venue sites checked, ${findings} account${findings === 1 ? '' : 's'} not linked from the venue's own site`);
}
