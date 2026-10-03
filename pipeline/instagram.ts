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

import { UA } from './util.ts';
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

export interface InstagramPost { caption: string | null; timestamp: string; permalink: string; mediaType: string }

/** The latest posts of a public Business or Creator account, through the same
 *  business_discovery call. These are venue announcements to read for events,
 *  never to republish. */
export async function recentPosts(handle: string, cfg: InstagramConfig, limit = 10, fetcher: typeof fetch = fetch): Promise<InstagramPost[] | null> {
  const url = `${API}/${encodeURIComponent(cfg.businessId)}?` + new URLSearchParams({
    fields: `business_discovery.username(${handle}){media.limit(${Math.min(Math.max(limit, 1), 25)}){caption,timestamp,permalink,media_type}}`,
    access_token: cfg.token,
  });
  try {
    const r = await fetcher(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
    const body = await r.json() as { business_discovery?: { media?: { data?: { caption?: string; timestamp: string; permalink: string; media_type: string }[] } }; error?: unknown };
    if (body.error) return null;
    return (body.business_discovery?.media?.data ?? []).map(m => ({ caption: m.caption ?? null, timestamp: m.timestamp, permalink: m.permalink, mediaType: m.media_type }));
  } catch { return null; }
}

export type Bio =
  | { kind: 'found'; username: string; biography: string }
  | { kind: 'none'; reason: string }
  | { kind: 'stop'; reason: string };

/** The bio of a public Business or Creator account, through the same business_discovery call. */
export async function lookupBio(handle: string, cfg: InstagramConfig, fetcher: typeof fetch = fetch): Promise<Bio> {
  const url = `${API}/${encodeURIComponent(cfg.businessId)}?` + new URLSearchParams({
    fields: `business_discovery.username(${handle}){username,biography}`, access_token: cfg.token,
  });
  try {
    const r = await fetcher(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
    const body = await r.json() as { business_discovery?: { username?: string; biography?: string }; error?: { code?: number; message?: string } };
    if (body.error) {
      return [190, 10, 200, 4, 17, 32, 613].includes(Number(body.error.code))
        ? { kind: 'stop', reason: `Meta refused (code ${body.error.code}): ${String(body.error.message).slice(0, 120)}` }
        : { kind: 'none', reason: `code ${body.error.code}` };
    }
    const d = body.business_discovery;
    if (!d?.username || d.username.toLowerCase() !== handle.toLowerCase()) return { kind: 'none', reason: 'another username' };
    return d.biography ? { kind: 'found', username: d.username, biography: d.biography } : { kind: 'none', reason: 'no bio' };
  } catch (e) { return { kind: 'stop', reason: `request failed: ${(e as Error).message}` }; }
}
