// Event announcements on the Instagram accounts of venues we already know.
// For places whose record carries an Instagram profile, the latest posts are
// read through the Instagram Graph API (business_discovery, see
// ../instagram.ts): Business and Creator accounts only, a few accounts a run.
// Captions are kept as text; available images are resolved later for guarded poster transcription.
// Posts are read for facts (what, when, where), never republished.

import type { RawItem, Source } from '../types.ts';
import type { Db } from '../db.ts';
import { clip } from '../util.ts';
import { instagramConfig, instagramHandle, lookupPosts, hashtagPosts, type InstagramConfig, type InstagramPost, type PostLookup } from '../instagram.ts';

interface PlaceRow { id: string; name: string; instagram: string | null }

/** A fixed, small set of public hashtags; identity is never inferred from a tag. */
export async function collectHashtags(source: Source, now = new Date(), deps: { cfg?: InstagramConfig | null; posts?: typeof hashtagPosts; log?: (s: string) => void } = {}): Promise<RawItem[]> {
  if (source.config.enabled !== true) return []; // general city aggregation needs an approved use case
  const cfg = deps.cfg === undefined ? instagramConfig() : deps.cfg;
  if (!cfg) return [];
  const tags = [...new Set((source.config.hashtags as string[] ?? []).map(t => t.toLowerCase()))];
  if (tags.length > 3 || tags.some(t => !/^[a-z0-9_]{1,100}$/.test(t))) throw new Error('Instagram source needs at most three fixed hashtags');
  const out = new Map<string, RawItem>();
  for (const tag of tags) {
    for (const p of await (deps.posts ?? hashtagPosts)(tag, cfg, 25)) {
      const age = now.getTime() - Date.parse(p.timestamp);
      let url: URL;
      try { url = new URL(p.permalink); } catch { continue; }
      if (url.protocol !== 'https:' || !/^(www\.)?instagram\.com$/.test(url.hostname) || !/^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
        || !Number.isFinite(age) || age < 0 || age > 14 * 86_400_000 || !p.caption || p.caption.trim().length < 20) continue;
      const external_id = `ig:hashtag:${url.pathname.split('/').filter(Boolean).pop()}`;
      out.set(external_id, { external_id, url: p.permalink, payload: { text: clip(p.caption, 6000), posted_at: p.timestamp, hashtag: tag } });
    }
  }
  (deps.log ?? console.log)(`[instagram] ${tags.length} fixed hashtags searched, ${out.size} recent captions kept (venue identity requires evidence)`);
  return [...out.values()];
}

export async function collectInstagram(
  source: Source, db: Pick<Db, 'select'> | null, now = new Date(),
  deps: { cfg?: InstagramConfig | null; posts?: (handle: string, cfg: InstagramConfig) => Promise<InstagramPost[] | null>; lookup?: (handle: string, cfg: InstagramConfig) => Promise<PostLookup>; log?: (s: string) => void } = {},
): Promise<RawItem[]> {
  const cfg = deps.cfg === undefined ? instagramConfig() : deps.cfg;
  const log = deps.log ?? console.log;
  if (!db || !cfg) return [];
  const read = deps.lookup ?? (deps.posts ? async (h: string, c: InstagramConfig): Promise<PostLookup> => {
    const posts = await deps.posts!(h, c); return posts ? { kind: 'found', posts } : { kind: 'none', reason: 'unavailable' };
  } : (h: string, c: InstagramConfig) => lookupPosts(h, c, 10));
  const maxAge = Number(source.config.max_age_days ?? 14) * 86_400_000;
  const perRun = Math.min(50, Math.max(1, Number(source.config.accounts_per_run ?? 30)));
  const places = (await db.select<PlaceRow>(`places?city=eq.${source.city}&status=eq.active&merged_into=is.null&instagram=not.is.null&select=id,name,instagram`))
    .filter(p => instagramHandle(p.instagram));
  // Stable six-hour rotation: random selection could miss an account forever.
  places.sort((a, b) => a.id.localeCompare(b.id));
  const accounts = new Map<string, PlaceRow[]>();
  for (const p of places) {
    const h = instagramHandle(p.instagram)!.toLowerCase();
    accounts.set(h, [...(accounts.get(h) ?? []), p]);
  }
  const handles = [...accounts.keys()];
  const start = handles.length ? (Math.floor(now.getTime() / (6 * 3_600_000)) * perRun) % handles.length : 0;
  const todo = [...handles.slice(start), ...handles.slice(0, start)].slice(0, perRun);
  const out: RawItem[] = [];
  let readable = 0, unreadable = 0, asked = 0;
  for (const handle of todo) {
    asked++;
    const result = await read(handle, cfg);
    if (result.kind === 'stop') throw new Error(`Instagram collection stopped: ${result.reason}`);
    if (result.kind !== 'found') { unreadable++; continue; }
    readable++;
    for (const post of result.posts) {
      if ((!post.caption || post.caption.trim().length < 20) && !post.posterAvailable) continue;
      const age = now.getTime() - Date.parse(post.timestamp);
      const url = instagramPostUrl(post.permalink);
      if (!url || !Number.isFinite(age) || age < 0 || age > maxAge) continue;
      const linked = accounts.get(handle)!;
      out.push({
        external_id: `ig:${handle}:${url.split('/').filter(Boolean).pop()}`,
        url,
        payload: { text: clip(post.caption ?? '', 6000), posted_at: post.timestamp, handle,
          ...(linked.length === 1 ? { place_id: linked[0].id, venue_name: linked[0].name } : {}),
          ...(post.posterAvailable ? { poster_available: true } : {}) },
      });
    }
  }
  log(`[instagram] ${asked} venue accounts asked, ${readable} readable, ${unreadable} not (personal, private or unknown); ${out.length} recent posts kept; ${handles.length} known handles`);
  return out;
}

export function instagramPostUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || !/^(www\.)?instagram\.com$/.test(u.hostname)
      || !/^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) return null;
    return `https://www.instagram.com${u.pathname.replace(/\/$/, '')}/`;
  } catch { return null; }
}
