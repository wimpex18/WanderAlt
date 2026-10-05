// A venue's Instagram profile picture, through Meta's official Instagram Graph
// API (business_discovery): our own professional account asks for another
// public Business or Creator account by the username its place already
// carries. No scraping and no login of ours beyond that token. The picture's
// address is a signed Instagram CDN link that expires, so the file is copied
// into our own storage bucket and that address is stored.
//
// Secrets: INSTAGRAM_ACCESS_TOKEN (a system user token) and
// INSTAGRAM_BUSINESS_ID (the id of our Instagram account). Without both the
// step does nothing.

import { UA, clip, scrubContacts } from './util.ts';
import { pageWebsite } from './facebook-hours.ts';
import type { Db } from './db.ts';
import type { Place } from './places.ts';

const API = 'https://graph.facebook.com/v26.0';
export const BUCKET = 'venue-pictures';
const MAX_BYTES = 2_000_000;

export interface InstagramConfig { token: string; businessId: string }
export const instagramConfig = (env = process.env): InstagramConfig | null => {
  const token = env.INSTAGRAM_ACCESS_TOKEN?.trim(), businessId = env.INSTAGRAM_BUSINESS_ID?.trim();
  return token && businessId ? { token, businessId } : null;
};

/** The username in an Instagram profile link, or null for a post, a reel, a
 *  tag page or anything that is not a profile. */
export function instagramHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg.length !== 1) return null;
    return /^[A-Za-z0-9._]{2,30}$/.test(seg[0]) && !/^(p|reel|reels|explore|stories|accounts|tv|direct)$/i.test(seg[0]) ? seg[0] : null;
  } catch { return null; }
}

export type Lookup =
  | { kind: 'found'; username: string; pictureUrl: string }
  | { kind: 'none'; reason: string }            // not a Business/Creator account, or no such name
  | { kind: 'stop'; reason: string };           // the token or app is refused: stop asking this run

/** One business_discovery call. */
export async function lookupProfile(handle: string, cfg: InstagramConfig, fetcher: typeof fetch = fetch): Promise<Lookup> {
  const url = `${API}/${encodeURIComponent(cfg.businessId)}?` + new URLSearchParams({
    fields: `business_discovery.username(${handle}){username,profile_picture_url}`,
    access_token: cfg.token,
  });
  let body: { business_discovery?: { username?: string; profile_picture_url?: string }; error?: { code?: number; error_subcode?: number; message?: string } };
  try {
    const r = await fetcher(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
    body = await r.json() as typeof body;
  } catch (e) { return { kind: 'stop', reason: `request failed: ${(e as Error).message}` }; }
  const err = body.error;
  if (err) {
    // 190: token expired or revoked; 10 and 200: a permission or app problem;
    // 4, 17, 32 and 613: rate limits. Each means the next call would fail too.
    if ([190, 10, 200, 4, 17, 32, 613].includes(Number(err.code))) return { kind: 'stop', reason: `Meta refused (code ${err.code}): ${String(err.message).slice(0, 120)}` };
    return { kind: 'none', reason: `code ${err.code}${err.error_subcode ? `/${err.error_subcode}` : ''}` };
  }
  const d = body.business_discovery;
  if (!d?.username || !d.profile_picture_url) return { kind: 'none', reason: 'no picture' };
  // The account that answered must be the one asked for.
  if (d.username.toLowerCase() !== handle.toLowerCase()) return { kind: 'none', reason: 'another username' };
  return { kind: 'found', username: d.username, pictureUrl: d.profile_picture_url };
}

/** Copy the picture into the bucket and return its public address. */
export async function storePicture(db: Pick<Db, 'storageUpload'>, placeId: string, pictureUrl: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await fetcher(pictureUrl, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    return await db.storageUpload(BUCKET, `instagram/${placeId}.${ext}`, bytes, type);
  } catch { return null; }
}

/** Places with an Instagram profile and no picture, a few a run. Returns how
 *  many got one. A refused token ends the step for this run, with one line. */
export async function attachInstagramPictures(
  db: Pick<Db, 'storageUpload'>, places: Place[], cfg: InstagramConfig, limit = 20,
  deps: { lookup?: typeof lookupProfile; store?: typeof storePicture; log?: (s: string) => void } = {},
): Promise<Place[]> {
  const lookup = deps.lookup ?? lookupProfile, store = deps.store ?? storePicture, log = deps.log ?? console.log;
  const todo = places.filter(p => !p.image_url && (p.status ?? 'active') === 'active' && instagramHandle(p.instagram))
    .sort(() => Math.random() - 0.5).slice(0, limit);
  const done: Place[] = [];
  const skipped: Record<string, number> = {};
  for (const p of todo) {
    const handle = instagramHandle(p.instagram)!;
    const r = await lookup(handle, cfg);
    if (r.kind === 'stop') { log(`[instagram] stopped: ${r.reason}`); break; }
    if (r.kind === 'none') { skipped[r.reason] = (skipped[r.reason] ?? 0) + 1; continue; }
    const url = await store(db, p.id, r.pictureUrl);
    if (!url) { skipped['picture not stored'] = (skipped['picture not stored'] ?? 0) + 1; continue; }
    p.image_url = url; p.image_attr = "Profile picture of the venue's Instagram account"; p.image_source = 'logo';
    done.push(p);
  }
  const why = Object.entries(skipped).map(([k, n]) => `${n}× ${k}`).join(', ');
  log(`[instagram] ${todo.length} profiles looked at, ${done.length} pictures stored${why ? `; skipped: ${why}` : ''}`);
  return done;
}

export interface InstagramPost { caption: string | null; timestamp: string; permalink: string; mediaType: string; imageUrl?: string; posterAvailable?: boolean }

/** Public hashtag captions. Meta limits an account to 30 unique tags in seven
 * days; callers must use a small fixed list, never rotate through guessed tags. */
export async function hashtagPosts(tag: string, cfg: InstagramConfig, limit = 25, fetcher: typeof fetch = fetch): Promise<InstagramPost[]> {
  if (!/^[A-Za-z0-9_]{1,100}$/.test(tag)) throw new Error('Use a hashtag without #, spaces or punctuation');
  const request = async (path: string, params: Record<string, string>) => {
    const r = await fetcher(`${API}/${path}?${new URLSearchParams(params)}`, {
      headers: { authorization: `Bearer ${cfg.token}`, 'user-agent': UA }, signal: AbortSignal.timeout(30_000),
    });
    const body = await r.json();
    if (!r.ok || body.error) throw new Error(`Instagram hashtag access refused (HTTP ${r.status}, code ${body.error?.code ?? '-'})`);
    return body;
  };
  const match = await request('ig_hashtag_search', { user_id: cfg.businessId, q: tag });
  const id = match.data?.[0]?.id;
  if (!id || !/^\d+$/.test(id)) return [];
  const size = Math.min(25, Math.max(1, limit));
  const read = (count: number) => request(`${id}/recent_media`, {
    user_id: cfg.businessId, fields: 'id,caption,timestamp,permalink', limit: String(count),
  });
  let result;
  try { result = await read(size); }
  catch (e) {
    // Meta sometimes times out or returns 500 on a larger batch. Retry once
    // with five; never retry a permission refusal or consume another tag.
    if (size <= 5 || !(/HTTP 5\d\d/.test((e as Error).message) || (e as Error).name === 'TimeoutError')) throw e;
    result = await read(5);
  }
  return (result.data ?? []).map((m: { caption?: string; timestamp: string; permalink: string; media_type: string }) =>
    ({ caption: m.caption ?? null, timestamp: m.timestamp, permalink: m.permalink, mediaType: m.media_type ?? '' }));
}

/** The latest posts of a public Business or Creator account, through the same
 *  business_discovery call. These are venue announcements to read for events,
 *  never to republish. */
export async function recentPosts(handle: string, cfg: InstagramConfig, limit = 10, fetcher: typeof fetch = fetch): Promise<InstagramPost[] | null> {
  const result = await lookupPosts(handle, cfg, limit, fetcher);
  return result.kind === 'found' ? result.posts : null;
}

export type PostLookup = { kind: 'found'; posts: InstagramPost[] } | { kind: 'none' | 'stop'; reason: string };

/** Images are read only for poster text. Signed CDN addresses never become event artwork. */
export async function lookupPosts(handle: string, cfg: InstagramConfig, limit = 10, fetcher: typeof fetch = fetch): Promise<PostLookup> {
  const r = await discovery(handle, `username,media.limit(${Math.min(Math.max(limit, 1), 25)}){caption,timestamp,permalink,media_type,media_url,children.limit(3){media_type,media_url}}`, cfg, fetcher);
  if (r.kind !== 'found') return r;
  const media = r.data.media as { data?: { caption?: string; timestamp: string; permalink: string; media_type: string; media_url?: string; children?: { data?: { media_type: string; media_url?: string }[] } }[] } | undefined;
  return { kind: 'found', posts: (media?.data ?? []).map(m => {
    const image = m.media_type === 'IMAGE' ? m.media_url : m.children?.data?.find(c => c.media_type === 'IMAGE')?.media_url;
    const imageUrl = instagramImage(image);
    return { caption: m.caption ?? null, timestamp: m.timestamp, permalink: m.permalink, mediaType: m.media_type,
      ...(imageUrl ? { imageUrl, posterAvailable: true } : {}) };
  }) };
}

/** Only media served by Meta, never an arbitrary URL from a caption. */
export function instagramImage(raw: unknown): string | null {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' && !u.username && !u.password && /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname) ? u.href : null;
  } catch { return null; }
}

async function discovery(handle: string, fields: string, cfg: InstagramConfig, fetcher: typeof fetch): Promise<
  { kind: 'found'; data: Record<string, unknown> } | { kind: 'none' | 'stop'; reason: string }
> {
  if (!/^[A-Za-z0-9._]{2,30}$/.test(handle)) return { kind: 'none', reason: 'invalid username' };
  try {
    const r = await fetcher(`${API}/${encodeURIComponent(cfg.businessId)}?${new URLSearchParams({ fields: `business_discovery.username(${handle}){${fields}}` })}`,
      { headers: { authorization: `Bearer ${cfg.token}`, 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
    const body = await r.json() as { business_discovery?: Record<string, unknown>; error?: { code?: number } };
    if (body.error || !r.ok) return { kind: [190, 10, 200, 4, 17, 32, 613].includes(Number(body.error?.code)) || r.status >= 500 ? 'stop' : 'none',
      reason: `Meta HTTP ${r.status}, code ${body.error?.code ?? '-'}` };
    const d = body.business_discovery;
    if (!d || typeof d.username !== 'string' || d.username.toLowerCase() !== handle.toLowerCase()) return { kind: 'none', reason: 'account unavailable or identity mismatch' };
    return { kind: 'found', data: d };
  } catch { return { kind: 'stop', reason: 'request unavailable' }; }
}

export type Bio =
  | { kind: 'found'; username: string; biography: string; website?: string | null }
  | { kind: 'none'; reason: string }
  | { kind: 'stop'; reason: string };

/** The bio of a public Business or Creator account, through the same business_discovery call. */
export async function lookupBio(handle: string, cfg: InstagramConfig, fetcher: typeof fetch = fetch): Promise<Bio> {
  const r = await discovery(handle, 'username,biography,website', cfg, fetcher);
  if (r.kind !== 'found') return r;
  const biography = typeof r.data.biography === 'string' ? r.data.biography : '';
  const website = pageWebsite(r.data.website);
  return biography || website ? { kind: 'found', username: String(r.data.username), biography, website } : { kind: 'none', reason: 'no bio or website' };
}

/** Fill explicit profile facts even for places whose opening hours are already known. */
export async function fillInstagramDetails(places: Place[], cfg: InstagramConfig, limit = 20,
  deps: { bio?: typeof lookupBio; bios?: Map<string, string>; now?: number; log?: (s: string) => void } = {}): Promise<Place[]> {
  const emptyDescription = (p: Place) => !p.description || /^cargo\.site$/i.test(p.description.trim());
  const due = places.filter(p => (p.status ?? 'active') === 'active' && !p.merged_into && instagramHandle(p.instagram) && (!p.website || emptyDescription(p)))
    .sort((a, b) => Number(!!b.picked) - Number(!!a.picked) || a.id.localeCompare(b.id));
  const start = due.length ? Math.floor((deps.now ?? Date.now()) / (6 * 3_600_000)) * limit % due.length : 0;
  const todo = [...due.slice(start), ...due.slice(0, start)].slice(0, limit);
  const changed: Place[] = [];
  for (const p of todo) {
    const handle = instagramHandle(p.instagram)!;
    const r = await (deps.bio ?? lookupBio)(handle, cfg);
    if (r.kind === 'stop') { (deps.log ?? console.log)(`[instagram details] stopped: ${r.reason}`); break; }
    if (r.kind !== 'found') continue;
    deps.bios?.set(handle.toLowerCase(), r.biography);
    let filled = false;
    if (!p.website && r.website) { p.website = r.website; p.website_source = 'instagram'; p.enriched_at = null; filled = true; }
    const description = clip(scrubContacts(r.biography)?.trim() ?? '', 400);
    if (emptyDescription(p) && description) { p.description = description; filled = true; }
    if (filled) changed.push(p);
  }
  (deps.log ?? console.log)(`[instagram details] ${todo.length} profiles selected, ${changed.length} places filled from explicit profile facts`);
  return changed;
}
