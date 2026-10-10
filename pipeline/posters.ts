// Event posters by identity: an event page that clearly attaches one image
// to one event. The page must carry the event's title and, when it states a
// date, the event's day; the image must not be a logo, a placeholder or a
// picture the site reuses for everything. Nothing is searched by name.

import type { Db } from './db.ts';
import { decodeEntities, get, httpUrl, nameKey, sleep } from './util.ts';
import { parkedHomepage } from './venues.ts';
import { localDay } from './time.ts';
import { tzOf } from './cities.ts';

export interface PosterEvent { id: string; title: string; starts_at: string; url?: string | null; ticket_url?: string | null }
export interface Poster { image_url: string; image_attr: string }

/** Pages that are social profiles or feeds are never read (terms, no API). */
const SOCIAL = /(^|\.)(facebook|instagram|fb|t|twitter|x|tiktok|youtube|linkedin)\.(com|me|co)$|^(fb\.me|t\.me)$/i;
/** Files that are not a picture of this one event. */
const NOT_A_POSTER = /(^|[\s_+.-])logo|sponsor|partner|favicon|icon|placeholder|default|no[-_ ]?image|share[-_ ]?image|og[-_ ]?(image|default)|banner-?site/i;

const words = (s: string) => new Set(nameKey(s).split(' ').filter(w => w.length >= 3));

/** The page names this event: nearly every word of the shorter title is in
 *  the longer one (so "Спектакль Cosmodolphins" fits "COSMODOLPHINS"), and
 *  what is shared is more than a generic word. */
export function sameTitle(a: string, b: string): boolean {
  const [x, y] = [words(a), words(b)].sort((p, q) => p.size - q.size);
  if (!x.size) return false;
  const shared = [...x].filter(w => y.has(w));
  return shared.length / x.size >= 0.8 && shared.join('').length >= 8;
}

interface Node { [k: string]: unknown }
function jsonLdEvents(html: string): Node[] {
  const out: Node[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const stack: unknown[] = [data];
    while (stack.length) {
      const n = stack.pop();
      if (Array.isArray(n)) { stack.push(...n); continue; }
      if (!n || typeof n !== 'object') continue;
      const o = n as Node;
      if (([] as unknown[]).concat(o['@type'] ?? []).some(t => /Event$/.test(String(t)))) out.push(o);
      stack.push(...Object.values(o));
    }
  }
  return out;
}

const meta = (html: string, prop: string) =>
  new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html)?.[1]
  ?? new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i').exec(html)?.[1];

/** The picture's file name: the path's last segment, or the `file` parameter
 *  of an image proxy (Fienta serves /cf/img/?file=/org/1/poster.jpg). */
const fileName = (u: URL) => decodeURIComponent(u.searchParams.get('file') ?? u.pathname).split('/').pop() ?? '';

const goodImage = (u: string | null) => {
  if (!u) return null;
  const url = new URL(u);
  const file = fileName(url);
  // Vector files and icons are marks, not pictures of a show.
  if (NOT_A_POSTER.test(file) || /\.(svg|ico)$/i.test(file)) return null;
  return url.href;
};

/** The one image this page attaches to this event, or null. */
export function posterFromPage(html: string, pageUrl: string, ev: PosterEvent, tz: string): Poster | null {
  if (parkedHomepage(html)) return null;
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  const attr = `Image from ${host}`;
  const day = localDay(ev.starts_at, tz);

  // A structured Event with this title. On a page that lists a series, the
  // node for this day; on a page for one event, that event (a page's date
  // can lag the listing, the show is still the show).
  const named = jsonLdEvents(html).filter(n => typeof n.name === 'string' && sameTitle(decodeEntities(n.name), ev.title));
  const onDay = (n: Node) => typeof n.startDate === 'string' && !Number.isNaN(Date.parse(n.startDate)) && localDay(new Date(n.startDate).toISOString(), tz) === day;
  const node = named.find(onDay) ?? (named.length === 1 ? named[0] : undefined);
  if (node) {
    const img = node.image;
    const u = goodImage(httpUrl(Array.isArray(img) ? img[0] : typeof img === 'object' && img ? (img as Node).url : img, pageUrl));
    if (u) return { image_url: u, image_attr: attr };
  }

  // Otherwise the page's headline must be this event and its og:image the picture.
  const heading = decodeEntities(meta(html, 'og:title') ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '');
  if (!heading || !sameTitle(heading, ev.title)) return null;
  const u = goodImage(httpUrl(decodeEntities(meta(html, 'og:image') ?? meta(html, 'twitter:image') ?? ''), pageUrl));
  return u ? { image_url: u, image_attr: attr } : null;
}

/** Pages an event may be read from: its own links, not social profiles. */
export function pagesFor(ev: PosterEvent, extra: string[] = []): string[] {
  return [...new Set([ev.url, ev.ticket_url, ...extra].map(u => httpUrl(u)).filter((u): u is string => !!u))]
    .filter(u => !SOCIAL.test(new URL(u).hostname));
}

/** Give up to `limit` upcoming published events without artwork the poster
 *  their own page attaches to them. Returns how many were set. */
export async function attachPosters(db: Db, city: string, limit = 30): Promise<number> {
  const now = new Date().toISOString();
  const events = await db.select<PosterEvent>(
    `events?city=eq.${city}&status=eq.published&archived_at=is.null&merged_into=is.null&image_url=is.null&starts_at=gte.${now}` +
    `&order=starts_at.asc&limit=120&select=id,title,starts_at,url,ticket_url`);
  if (!events.length) return 0;
  const inIds = `(${events.map(e => `"${e.id}"`).join(',')})`;
  const srcs = await db.select<{ event_id: string; url: string | null }>(`event_sources?event_id=in.${inIds}&select=event_id,url`);
  const extra = new Map<string, string[]>();
  for (const s of srcs) if (s.url) extra.set(s.event_id, [...(extra.get(s.event_id) ?? []), s.url]);

  // Events whose page attaches no picture stay in the query, so the soonest
  // ones would use every attempt every run. Each run tries them in a fresh
  // order instead, and over a day reaches them all.
  for (let i = events.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [events[i], events[j]] = [events[j], events[i]]; }
  let set = 0, tried = 0;
  const lastHit = new Map<string, number>();
  for (const ev of events) {
    const pages = pagesFor(ev, extra.get(ev.id));
    if (!pages.length || tried >= limit) continue;
    tried++;
    for (const page of pages.slice(0, 2)) {
      const host = new URL(page).hostname;
      const wait = 800 - (Date.now() - (lastHit.get(host) ?? 0));
      if (wait > 0) await sleep(wait);
      lastHit.set(host, Date.now());
      let poster: Poster | null = null;
      try {
        const html = (await (await get(page, { accept: 'text/html', timeoutMs: 10_000 })).text()).slice(0, 400_000);
        poster = posterFromPage(html, page, ev, tzOf(city));
      } catch { continue; }
      if (!poster) continue;
      // A picture the site puts on several events is a default, not a poster.
      const same = await db.select<{ id: string }>(`events?image_url=eq.${encodeURIComponent(poster.image_url)}&id=neq.${encodeURIComponent(ev.id)}&select=id&limit=3`);
      if (same.length >= 2) continue;
      await db.patch(`events?id=eq.${encodeURIComponent(ev.id)}&image_url=is.null`, poster);
      set++;
      break;
    }
  }
  return set;
}
