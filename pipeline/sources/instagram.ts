// Event announcements on the Instagram accounts of venues we already know.
// For places whose record carries an Instagram profile, the latest posts are
// read through the Instagram Graph API (business_discovery, see
// ../instagram.ts): Business and Creator accounts only, a few accounts a run.
// The caption is kept as text and a model reads it later like a Telegram post.
// Posts are read for facts (what, when, where), never republished.

import type { RawItem, Source } from '../types.ts';
import type { Db } from '../db.ts';
import { clip } from '../util.ts';
import { instagramConfig, instagramHandle, recentPosts, type InstagramConfig, type InstagramPost } from '../instagram.ts';

interface PlaceRow { id: string; name: string; instagram: string | null }

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
  // A different few accounts each run: every account is reached within days.
  const todo = places.sort(() => Math.random() - 0.5).slice(0, perRun);
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
