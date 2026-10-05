// Event announcements on the Instagram accounts of venues we already know.
// For places whose record carries an Instagram profile, the latest posts are
// read through the Instagram Graph API (business_discovery, see
// ../instagram.ts): Business and Creator accounts only, a few accounts a run.
// The caption is kept as text and a model reads it later like a Telegram post.
// Posts are read for facts (what, when, where), never republished.

import type { RawItem, Source } from '../types.ts';
import type { Db } from '../db.ts';
import { clip } from '../util.ts';
import { instagramConfig, instagramHandle, recentPosts, hashtagPosts, type InstagramConfig, type InstagramPost } from '../instagram.ts';

interface PlaceRow { id: string; name: string; instagram: string | null }

/** A fixed, small set of public hashtags; identity is never inferred from a tag. */
export async function collectHashtags(source: Source, now = new Date(), deps: { cfg?: InstagramConfig | null; posts?: typeof hashtagPosts; log?: (s: string) => void } = {}): Promise<RawItem[]> {
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
  deps: { cfg?: InstagramConfig | null; posts?: (handle: string, cfg: InstagramConfig) => Promise<InstagramPost[] | null>; log?: (s: string) => void } = {},
): Promise<RawItem[]> {
  const cfg = deps.cfg === undefined ? instagramConfig() : deps.cfg;
  const log = deps.log ?? console.log;
  if (!db || !cfg) return [];
  const read = deps.posts ?? ((h: string, c: InstagramConfig) => recentPosts(h, c, 10));
  const maxAge = Number(source.config.max_age_days ?? 14) * 86_400_000;
  const perRun = Number(source.config.accounts_per_run ?? 15);
  const places = (await db.select<PlaceRow>(`places?city=eq.${source.city}&status=eq.active&merged_into=is.null&instagram=not.is.null&select=id,name,instagram`))
    .filter(p => instagramHandle(p.instagram));
  // Stable six-hour rotation: random selection could miss an account forever.
  places.sort((a, b) => a.id.localeCompare(b.id));
  const start = places.length ? (Math.floor(now.getTime() / (6 * 3_600_000)) * perRun) % places.length : 0;
  const todo = [...places.slice(start), ...places.slice(0, start)].slice(0, perRun);
  const out: RawItem[] = [];
  let readable = 0, unreadable = 0;
  for (const p of todo) {
    const handle = instagramHandle(p.instagram)!;
    const posts = await read(handle, cfg);
    if (!posts) { unreadable++; continue; }
    readable++;
    for (const post of posts) {
      if (!post.caption || post.caption.trim().length < 20) continue;
      if (now.getTime() - Date.parse(post.timestamp) > maxAge) continue;
      out.push({
        external_id: `ig:${handle}:${post.permalink.split('/').filter(Boolean).pop()}`,
        url: post.permalink,
        payload: { text: clip(post.caption, 6000), posted_at: post.timestamp, handle, place_id: p.id, venue_name: p.name },
      });
    }
  }
  log(`[instagram] ${todo.length} venue accounts asked, ${readable} readable, ${unreadable} not (personal, private or unknown); ${out.length} recent posts kept`);
  return out;
}
