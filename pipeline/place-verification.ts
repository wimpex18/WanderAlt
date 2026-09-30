// Business activity is separate from an OSM object's continued existence.
// Never confirm a venue from HTTP 200, undated opening hours or a footer year.
import type { Place } from './places.ts';
import { placeNames } from './place-match.ts';
import { parkedHomepage } from './venues.ts';
import { UA, htmlToText, httpUrl, nameKey } from './util.ts';

const WEEK = 7 * 86_400_000;
const DAY = 86_400_000;
const MAX_BYTES = 400_000;
export interface Verification {
  state: 'verified' | 'review' | 'unverified';
  source: 'website';
  url: string;
  note: string;
  observed_at: string;
}
const sameName = (p: Place, value: unknown) => typeof value === 'string' && placeNames(p).includes(nameKey(value));
const host = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, '');

export function homepageEvidence(p: Place, html: string, finalUrl: string, now = new Date().toISOString()): Verification {
  const result = (state: Verification['state'], note: string): Verification => ({ state, source: 'website', url: finalUrl, note, observed_at: now });
  if (!p.website || host(p.website) !== host(finalUrl)) return result('review', 'Website redirects to another identity; review.');
  if (parkedHomepage(html)) return result('review', 'Venue domain is parked or for sale; review.');
  const text = nameKey(htmlToText(html));
  const identified = placeNames(p).some(n => n.length >= 4 ? text.includes(n) : n.length >= 2 && text.split(' ').includes(n));
  if (!identified) return result('review', 'Website identity could not be confirmed; review.');
  // Only an explicit statement from an identified own website is a closure
  // signal. It goes to review; no regex permanently closes a business.
  if (/(?:^|\s)(permanently closed|closed permanently|suletud loplikult|loplikult suletud|jaadavalt suletud|навсегда закрыт[ао]?|закрыт[ао]? навсегда)(?:\s|$)/u.test(text)) {
    return result('review', 'Own website mentions permanent closure; confirm manually.');
  }
  const objects: Record<string, unknown>[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (depth > 12 || objects.length >= 1500 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(v => walk(v, depth + 1)); return; }
    const object = value as Record<string, unknown>;
    objects.push(object);
    Object.values(object).forEach(v => walk(v, depth + 1));
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1])); } catch { /* broken markup proves nothing */ }
  }
  const timestamp = Date.parse(now);
  for (const object of objects) {
    const types = [object['@type']].flat();
    if (!types.some(t => typeof t === 'string' && /(^|\/)\w*Event$/.test(t))) continue;
    if (/Cancelled|Postponed/i.test(String(object.eventStatus ?? ''))) continue;
    const date = Date.parse(String(object.startDate ?? ''));
    if (!Number.isFinite(date) || date < timestamp - 30 * DAY || date > timestamp + 90 * DAY) continue;
    // Must name this exact venue as the event's location, rather than an
    // organiser, neighbouring room or linked recommendation.
    const locations = [object.location].flat().filter(v => v && typeof v === 'object') as Record<string, unknown>[];
    if (locations.some(location => sameName(p, location.name))) {
      return result('verified', 'Recent dated event on the venue’s own website, at this venue.');
    }
  }
  return result('unverified', 'Venue identity matched, but no recent dated event evidence in supported markup.');
}

export const dueWebsites = (places: Place[], now = Date.now(), limit = 30) => {
  const origins = new Set<string>();
  return places.filter(p => !p.merged_into && (p.status ?? 'active') === 'active' && httpUrl(p.website) &&
    !(p.verification_source === 'manual' && p.verification_state === 'review') &&
    !(p.verification_source === 'manual' && p.verification_state === 'verified' && p.verified_at && now - Date.parse(p.verified_at) < 90 * DAY) &&
    (!p.website_checked_at || now - Date.parse(p.website_checked_at) >= WEEK))
    .sort((a, b) => (a.website_checked_at ?? '').localeCompare(b.website_checked_at ?? '') || a.id.localeCompare(b.id))
    .filter(p => { const h = host(p.website!); if (origins.has(h)) return false; origins.add(h); return true; })
    .slice(0, Math.max(0, Math.min(40, limit)));
};

export async function checkWebsite(p: Place, now = new Date().toISOString()): Promise<Verification> {
  const url = httpUrl(p.website);
  if (!url) throw new Error('No public website');
  // No cookies, contact details, external search, retries or parallel load.
  const response = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`website HTTP ${response.status}`);
  if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') ?? '')) throw new Error('Website is not HTML');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty website');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) throw new Error('Website exceeds evidence size limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return homepageEvidence(p, Buffer.concat(chunks).toString('utf8'), response.url || url, now);
}
