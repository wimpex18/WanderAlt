// The Places side: venues worth walking to whether or not they list an
// event tonight, and the details a venue page needs.
//
//   osmCatalogue()  every record shop, bookshop, gallery, thrift shop, arts
//                   centre, cinema, club, community centre and theatre in the
//                   city, from OpenStreetMap via Overpass (free, no key).
//   enrichPlace()   links and a photo, each from a source that identifies
//                   the venue: its OSM tags, its Wikidata item, its own
//                   website. Never a search by name.

import { createHash } from 'node:crypto';
import type { Place } from './places.ts';
import { UA, get, getHtml, httpUrl, decodeEntities, clip, nameKey, slug } from './util.ts';
import { closureReason, overpass, type OsmElement } from './osm.ts';
import { probeImage, usableSize } from './imageprobe.ts';

export interface VenueDetails {
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  opening_hours?: string | null;
  description?: string | null;
  wikidata_id?: string | null;
  image_url?: string | null;
  image_attr?: string | null;
  image_source?: string | null;
  /** Other pictures the site offers as its mark, best first; `weak` ones (a
   *  logo linked to the homepage, a declared icon) are checked for size first. */
  image_candidates?: { url: string; weak: boolean; icon?: boolean }[];
}

export type RichPlace = Place & VenueDetails;

/** OSM tag → place kind. Shared vocabulary with places.ts and supabase.js. */
export function osmKind(t: Record<string, string>): string | null {
  const s = t.shop, a = t.amenity, tr = t.tourism;
  if (s === 'music') return 'record store';
  if (s === 'books') return 'bookshop';
  if (s === 'second_hand' || s === 'charity') return 'thrift';
  if (s === 'art' || tr === 'gallery') return 'gallery';
  if (a === 'arts_centre') return 'arts centre';
  if (a === 'cinema') return 'cinema';
  if (a === 'nightclub') return 'club';
  if (a === 'community_centre' || a === 'social_centre') return 'community';
  if (a === 'theatre') return 'theatre';
  return null;
}

/** "instagram.com/sveta.baar/", "@sveta.baar" or a bare handle → a profile URL. */
export function socialUrl(host: 'instagram.com' | 'facebook.com', v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.trim();
  const m = new RegExp(`^(?:https?://)?(?:www\\.|m\\.)?${host.replace('.', '\\.')}/([A-Za-z0-9_.\\-]+)`, 'i').exec(s);
  const handle = m ? m[1] : /^@?([A-Za-z0-9_.\-]{2,})$/.exec(s)?.[1];
  if (!handle || /^(sharer|share|dialog|plugins|tr|p|reel|explore|events|groups|profile\.php)$/i.test(handle)) return null;
  return `https://www.${host}/${handle}`;
}

const QUERY = (area: string) => `[out:json][timeout:45];
area["name"="${area}"]["admin_level"="7"]->.t;
(
  nwr(area.t)["shop"~"^(music|books|second_hand|charity|art)$"]["name"];
  nwr(area.t)["amenity"~"^(arts_centre|cinema|nightclub|community_centre|social_centre|theatre)$"]["name"];
  nwr(area.t)["tourism"="gallery"]["name"];
);
out center tags;`;

export async function osmCatalogue(city = 'tallinn', area = 'Tallinn'): Promise<RichPlace[]> {
  const elements = await overpass(QUERY(area));
  return elements.map(el => placeFromOsm(el, city)).filter((p): p is RichPlace => !!p);
}

export function placeFromOsm(el: OsmElement, city: string): RichPlace | null {
  const t = el.tags ?? {};
  const kind = osmKind(t);
  const name = t['name:et'] ?? t.name;
  if (!kind || !name || closureReason(t, kind)) return null;
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    id: `${city}-${slug(name)}`,
    city,
    name,
    aliases: [...new Set([name, t.name, t['name:en'], ...(t.alt_name ?? '').split(';'), t['short_name']].filter(Boolean).map(n => nameKey(n!)))],
    kind,
    address: street ? `${street}, Tallinn` : null,
    lat: lat ?? null,
    lng: lng ?? null,
    osm_id: `${el.type}/${el.id}`,
    website: httpUrl(t.website ?? t['contact:website'] ?? t['operator:website'] ?? t.url),
    instagram: socialUrl('instagram.com', t['contact:instagram'] ?? t.instagram),
    facebook: socialUrl('facebook.com', t['contact:facebook'] ?? t.facebook),
    opening_hours: t.opening_hours ?? null,
    description: t['description:en'] ?? t.description ?? null,
    wikidata_id: /^Q\d+$/.test(t.wikidata ?? '') ? t.wikidata : null,
  };
}

// ── Enrichment ─────────────────────────────────────────────

/** The upload.wikimedia.org URL of a Commons file (never Special:FilePath). */
export function commonsUrl(file: string): string {
  const name = file.replace(/ /g, '_');
  const md5 = createHash('md5').update(name).digest('hex');
  const dir = `${md5[0]}/${md5.slice(0, 2)}`;
  // The image proxy serves raster files only, so a vector logo is asked for as a PNG render.
  if (/\.svg$/i.test(name)) return `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir}/${encodeURIComponent(name)}/512px-${encodeURIComponent(name)}.png`;
  return `https://upload.wikimedia.org/wikipedia/commons/${dir}/${encodeURIComponent(name)}`;
}

/** Wikidata items that name these OpenStreetMap objects as their own
 *  (P11693 node, P10689 way, P402 relation): identity by a curated link,
 *  not by a name. One query for all of them. */
export async function wikidataByOsm(osmIds: string[]): Promise<Map<string, string>> {
  const by: Record<string, string[]> = { node: [], way: [], relation: [] };
  for (const id of new Set(osmIds)) {
    const m = /^(node|way|relation)\/(\d+)$/.exec(id);
    if (m) by[m[1]].push(m[2]);
  }
  const block = (prop: string, type: string) => by[type].length
    ? `{ VALUES ?n { ${by[type].map(n => `"${n}"`).join(' ')} } ?i wdt:${prop} ?n . BIND(CONCAT("${type}/", ?n) AS ?osm) }` : '';
  const parts = [block('P11693', 'node'), block('P10689', 'way'), block('P402', 'relation')].filter(Boolean);
  const out = new Map<string, string>();
  if (!parts.length) return out;
  const query = `SELECT ?i ?osm WHERE { ${parts.join(' UNION ')} }`;
  // POST: a few hundred ids do not fit in a URL.
  const r = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'user-agent': UA, accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query, format: 'json' }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`wikidata ${r.status}`);
  const rows = (await r.json() as { results: { bindings: { i: { value: string }; osm: { value: string } }[] } }).results.bindings;
  for (const b of rows) {
    const qid = /Q\d+$/.exec(b.i.value)?.[0];
    // Two items for one object is not identity: leave it.
    if (qid && !out.has(b.osm.value)) out.set(b.osm.value, qid); else if (qid && out.get(b.osm.value) !== qid) out.set(b.osm.value, '');
  }
  for (const [k, v] of out) if (!v) out.delete(k);
  return out;
}

async function fromWikidata(qid: string): Promise<VenueDetails> {
  const r = await get(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { accept: 'application/json' });
  const ent = (await r.json() as { entities: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> ; descriptions?: Record<string, { value: string }> }> }).entities[qid];
  const claim = (p: string) => ent?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value as string | undefined;
  const image = claim('P18');
  // P154 is the item's own logo. It fills the picture only when there is no
  // photograph (P18), and is marked as a logo so the app draws it whole.
  const logo = image ? undefined : claim('P154');
  return {
    image_url: image ? commonsUrl(image) : logo ? commonsUrl(logo) : null,
    image_attr: image ? `Photo: Wikimedia Commons, ${image.replace(/\.[a-z]+$/i, '')}`
      : logo ? `Logo: Wikimedia Commons, ${logo.replace(/\.[a-z]+$/i, '')}` : null,
    image_source: image ? 'wikidata' : logo ? 'logo' : null,
    website: httpUrl(claim('P856')),
    instagram: socialUrl('instagram.com', claim('P2003')),
    facebook: socialUrl('facebook.com', claim('P2013')),
    description: ent?.descriptions?.en?.value ?? null,
  };
}

/** A domain that lapsed and now shows a parking or for-sale page. */
const PARKED = /domeeninimi\.ee|domain (is )?for sale|see domeen on müügil|this domain may be for sale|parkingcrew|sedoparking|godaddy\.com\/domainsearch/i;
export const parkedHomepage = (html: string) => PARKED.test(html);

/** A profile belongs to the venue when its handle shares a word with the
 *  venue's name or its website's domain. Homepages also link partners,
 *  sponsors and share buttons, which this keeps out. */
export function handleFits(profile: string, name: string, site: string): boolean {
  const handle = nameKey(profile.split('/').filter(Boolean).pop() ?? '').replace(/ /g, '');
  const stem = new URL(site).hostname.replace(/^www\./, '').split('.')[0].replace(/-/g, '');
  // Words every venue in town shares prove nothing.
  const GENERIC = /^(tallinn|tallinna|eesti|estonia|club|klubi|galerii|gallery|teater|theatre|kino|cinema|baar|raamat)$/;
  const words = [...nameKey(name).split(' '), stem].filter(w => w.length >= 4 && !GENERIC.test(w));
  return words.some(w => handle.includes(w.replace(/ /g, '')) || (handle.length >= 4 && w.includes(handle)));
}

const LOGO_FILE = /(?:^|[\s_+.-])logo(?:[\s_+.-]|jpg|d|fail|$)/i;
/** Never a venue's own mark: partners, sponsors, icons and placeholders. */
const NOT_A_LOGO = /sponsor|partner|footer|favicon|icon|placeholder|default[-_ ]?image|banner|poster/i;
const fileOf = (u: string) => decodeURIComponent(new URL(u).pathname.split('/').pop() ?? '').replace(/%20/gi, ' ');
const bareHost = (u: string) => new URL(u).hostname.replace(/^www\./, '');

/** The `logo` a site declares for its own organisation in JSON-LD. */
export function jsonLdLogo(html: string, base: string): string | null {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const stack: unknown[] = [data];
    while (stack.length) {
      const n = stack.pop();
      if (Array.isArray(n)) { stack.push(...n); continue; }
      if (!n || typeof n !== 'object') continue;
      const o = n as Record<string, unknown>;
      const types = ([] as unknown[]).concat(o['@type'] ?? []).map(String);
      if (types.some(t => /^(Organization|PerformingGroup|TheaterGroup|LocalBusiness|NightClub|MovieTheater|ArtGallery|Library|Store|BarOrPub|EntertainmentBusiness|PerformingArtsTheater|MusicVenue)$/.test(t))) {
        const l = o.logo;
        const u = httpUrl(typeof l === 'object' && l ? (l as Record<string, unknown>).url : l, base);
        if (u && !NOT_A_LOGO.test(fileOf(u))) return u;
      }
      stack.push(...Object.values(o));
    }
  }
  return null;
}

/** The first `<img>` on the site's own host whose file is named as a logo.
 *  Sponsor ribbons carry logos too, but on other hosts or under other names. */
export function ownLogoImg(html: string, base: string): string | null {
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = /\b(?:data-src|src)=["']([^"']+)["']/i.exec(m[0])?.[1];
    const u = httpUrl(decodeEntities(src ?? ''), base);
    if (!u || bareHost(u) !== bareHost(base)) continue;
    const f = fileOf(u);
    if (LOGO_FILE.test(f) && !NOT_A_LOGO.test(f) && /\.(svg|png|webp|jpe?g)$/i.test(f)) return u;
  }
  return null;
}

/** An image inside a link to the site's own homepage: the logo in the header,
 *  which is how nearly every site marks itself. Partner and sponsor images are
 *  not wrapped in a link to the venue's own front page. */
export function homeLinkImg(html: string, base: string): string | null {
  const home = new URL(base);
  for (const m of html.slice(0, 200_000).matchAll(/<a\b([^>]*)>([\s\S]{0,1500}?)<\/a>/gi)) {
    const href = /\bhref=["']([^"']*)["']/i.exec(m[1])?.[1];
    if (href == null) continue;
    let target: URL;
    try { target = new URL(decodeEntities(href), base); } catch { continue; }
    const isHome = bareHost(target.href) === bareHost(base) && (target.pathname === '/' || target.pathname === home.pathname || /^\/(index|home|et|en|ee)\/?(\.html?)?$/i.test(target.pathname)) && !target.search;
    if (!isHome) continue;
    const img = /<img\b[^>]*>/i.exec(m[2])?.[0];
    if (!img) continue;
    const srcset = /\bsrcset=["']([^"']+)["']/i.exec(img)?.[1]?.split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
    const src = /\b(?:data-src|src)=["']([^"']+)["']/i.exec(img)?.[1];
    const u = httpUrl(decodeEntities(srcset ?? src ?? ''), base);
    if (!u || /^data:/i.test(src ?? '')) continue;
    const alt = /\balt=["']([^"']*)["']/i.exec(img)?.[1] ?? '';
    if (NOT_A_LOGO.test(fileOf(u)) || NOT_A_LOGO.test(alt) || !/\.(svg|png|webp|jpe?g|gif)(\?|$)/i.test(new URL(u).pathname + '.png')) continue;
    return u;
  }
  return null;
}

/** Cargo sites draw their pages from JSON, with no <img>: the header's media
 *  item that links to "home" is the logo. Its file is served by Cargo's CDN. */
export function cargoHomeLogo(html: string): string | null {
  if (!/freight\.cargo\.site/.test(html)) return null;
  const item = /(?:<|\\u003c)media-item\b[^>]*?\bhash=\\?"([A-Z]\d+)\\?"[^>]*?\bhref=\\?"(?:home|\/)\\?"/i.exec(html)
    ?? /(?:<|\\u003c)media-item\b[^>]*?\bhref=\\?"(?:home|\/)\\?"[^>]*?\bhash=\\?"([A-Z]\d+)\\?"/i.exec(html);
  if (!item) return null;
  const name = new RegExp(`"name":"([^"]+)","hash":"${item[1]}"`).exec(html)?.[1];
  return name && /\.(png|jpe?g|webp|svg)$/i.test(name) && !NOT_A_LOGO.test(name)
    ? `https://freight.cargo.site/w/600/q/75/i/${item[1]}/${encodeURIComponent(name)}` : null;
}

/** Icons the site declares for itself, largest first. Small favicons fail the
 *  size check later; a 180 px touch icon or a 182 px .ico is a mark. */
export function declaredIcons(html: string, base: string): string[] {
  const out: { u: string; size: number }[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1] ?? '';
    if (!/\b(apple-touch-icon(-precomposed)?|icon)\b/i.test(rel) || /mask-icon/i.test(rel)) continue;
    const href = httpUrl(decodeEntities(/\bhref=["']([^"']+)["']/i.exec(tag)?.[1] ?? ''), base);
    if (!href || /\.svg(\?|$)/i.test(href)) continue;
    const size = Number(/sizes=["'](\d+)x\d+/i.exec(tag)?.[1] ?? (/apple-touch/i.test(rel) ? 180 : 0));
    out.push({ u: href, size });
  }
  return [...new Map(out.sort((a, b) => b.size - a.size).map(x => [x.u, x])).keys()];
}

/** Homepage metadata identifies the website, not necessarily the venue:
 *  og:image often shows a current show, an advert or a placeholder. Only
 *  recognisable logo filenames are imported automatically; venue photos
 *  come from Wikidata P18 or an individually reviewed image. */
export function fromHomepage(html: string, base: string, name = ''): VenueDetails {
  if (PARKED.test(html)) return {};
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => decodeEntities(m[1]));
  const first = (host: 'instagram.com' | 'facebook.com') =>
    hrefs.map(h => (h.includes(host) ? socialUrl(host, h) : null))
      .find(u => u && (!name || handleFits(u, name, base))) ?? null;
  const meta = (prop: string) =>
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html)?.[1]
    ?? new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i').exec(html)?.[1];
  const og = httpUrl(decodeEntities(meta('og:image') ?? ''), base);
  const filename = og ? (new URL(og).pathname.split('/').pop() ?? '').replace(/%20/gi, ' ') : '';
  const logo = LOGO_FILE.test(filename);
  const strong = [(logo && !/placeholder|default[-_ ]?image/i.test(filename) ? og : null), jsonLdLogo(html, base), ownLogoImg(html, base)];
  const header = [homeLinkImg(html, base), cargoHomeLogo(html)];
  const candidates = [...new Map([...strong.filter((u): u is string => !!u).map(url => ({ url, weak: false })),
    ...header.filter((u): u is string => !!u).map(url => ({ url, weak: true })),
    ...declaredIcons(html, base).map(url => ({ url, weak: true, icon: true }))].map(c => [c.url, c])).values()];
  const image = candidates[0]?.url ?? null;
  const desc = meta('og:description') ?? meta('description');
  return {
    instagram: first('instagram.com'),
    facebook: first('facebook.com'),
    image_url: image,
    image_candidates: candidates,
    image_attr: image ? `Logo from ${new URL(base).hostname.replace(/^www\./, '')}` : null,
    image_source: image ? 'logo' : null,
    description: desc ? clip(decodeEntities(desc).trim(), 400) : null,
  };
}

/** The first candidate that is a real mark: a strong one (named logo, JSON-LD)
 *  unless it is tiny, a weak one (header link, declared icon) only after its
 *  size was read: 48 px for a header logo, 128 px and square for an icon. */
export async function pickLogo(candidates: { url: string; weak: boolean; icon?: boolean }[], probe: typeof probeImage = probeImage): Promise<string | null> {
  // The city portal's mark on a school's or a youth centre's page is the
  // city's, not the venue's.
  for (const c of candidates.filter(x => !PORTAL_LOGO.test(bareHost(x.url))).slice(0, 5)) {
    const size = await probe(c.url);
    // A wordmark may be wide; an icon must be square-ish and 128 px or more.
    if (size ? (c.icon ? usableSize(size, 128, 2) : usableSize(size, 48)) : !c.weak) return c.url;
  }
  return null;
}

/** Hosts whose logo says who runs the site, not what the venue is. */
const PORTAL_LOGO = /(^|\.)tallinn\.ee$/i;
const FB_RESERVED = /^(pages|people|profile\.php|groups|events|public|share|sharer|p|watch|marketplace|login|policies|tr)$/i;
/** The page name of a Facebook page link, when it names a page (not a group,
 *  an event or a numeric profile). */
export function facebookPage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean)[0] ?? '';
    return /^[A-Za-z0-9.\-_]{3,80}$/.test(seg) && !FB_RESERVED.test(seg) ? seg : null;
  } catch { return null; }
}

/** A Facebook page's public profile picture through Facebook's documented
 *  Graph API picture endpoint (no login, no token, one request), for a page
 *  the venue's own site or record links. Not a silhouette, at least 100 px. */
export async function facebookPicture(page: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await fetcher(`https://graph.facebook.com/${encodeURIComponent(page)}/picture?redirect=false&type=large`, {
      headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const d = (await r.json() as { data?: { is_silhouette?: boolean; width?: number; height?: number } }).data;
    if (!d || d.is_silhouette !== false || Math.min(d.width ?? 0, d.height ?? 0) < 100) return null;
    return `https://graph.facebook.com/${encodeURIComponent(page)}/picture?type=large`;
  } catch { return null; }
}

/** Fill what a place lacks; never overwrite what it has. Wikidata's photo
 *  beats a website's logo. */
export async function enrichPlace(p: RichPlace, opts: { facebook?: boolean } = {}): Promise<Partial<RichPlace>> {
  const patch: Partial<RichPlace> = {};
  const take = (d: VenueDetails) => {
    for (const k of ['website', 'instagram', 'facebook', 'description'] as const) {
      if (!p[k] && !patch[k] && d[k]) patch[k] = d[k];
    }
    if (!p.image_url && !patch.image_url && d.image_url) {
      patch.image_url = d.image_url; patch.image_attr = d.image_attr; patch.image_source = d.image_source;
    }
  };
  if (p.wikidata_id) take(await fromWikidata(p.wikidata_id).catch(() => ({})));
  const site = patch.website ?? p.website;
  if (site && (!p.instagram || !p.facebook || !p.image_url || !p.description)) {
    try {
      const page = await getHtml(site, { timeoutMs: 15_000 });
      // A site that now redirects to another host (a domain that changed
      // hands, a parent organisation) is another identity: nothing is taken.
      const same = bareHost(page.url) === bareHost(site);
      if (!same) console.warn(`[venues] ${p.name}: ${site} now redirects to ${bareHost(page.url)}; nothing taken`);
      const d = same ? fromHomepage(page.html.slice(0, 400_000), site, p.name) : {};
      // Which of the site's candidate marks is big enough to be one.
      if (!p.image_url && !patch.image_url && d.image_candidates?.length) {
        const url = await pickLogo(d.image_candidates);
        d.image_url = url;
        if (!url) { d.image_attr = null; d.image_source = null; }
      }
      take(d);
    } catch (e) {
      // An unreachable site leaves the place as it was; the run says how many.
      console.warn(`[venues] ${p.name}: homepage not read (${(e as Error).message.slice(0, 80)})`);
    }
  }
  // Last resort: the venue's own Facebook page picture, for a link its record
  // or its site gave (handleFits already tied a site link to the venue).
  if (opts.facebook !== false && !p.image_url && !patch.image_url) {
    const link = patch.facebook ?? p.facebook;
    const page = facebookPage(link);
    // A named page must share a distinctive word with the venue (a numeric
    // page id carries no name to test and is taken from the record as is).
    const named = page && !/^\d+$/.test(page);
    const fits = !named || handleFits(link!, p.name, p.website ?? 'https://invalid.example/');
    const url = page && fits ? await facebookPicture(page) : null;
    if (url) { patch.image_url = url; patch.image_attr = "Profile picture of the venue's Facebook page"; patch.image_source = 'logo'; }
  }
  return patch;
}
