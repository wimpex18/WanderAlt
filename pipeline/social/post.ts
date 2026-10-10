// A post file: one picture and the words for each platform, sent by `social.ts post`.
// The checks here keep the repo's voice and each platform's limits out of the way of a bad send.

import { fitsThreads } from './threads.ts';

export const PLATFORMS = ['facebook', 'instagram', 'threads'] as const;
export type Platform = typeof PLATFORMS[number];

export interface PostFile {
  /** Public https .jpg address: Instagram takes JPEG only, and all three platforms fetch it from here. */
  image: string;
  alt?: string;
  /** Facebook Places ID, used for Instagram and Facebook. */
  location?: string;
  /** Threads has its own location IDs and needs the threads_location_tagging scope. */
  threadsLocation?: string;
  facebook?: string;
  instagram?: string;
  threads?: string;
}

const text = (v: unknown, name: string): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !v.trim()) throw new Error(`post file: ${name} must be non-empty text`);
  return v;
};
const id = (v: unknown, name: string): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !/^\d+$/.test(v)) throw new Error(`post file: ${name} must be a numeric ID in quotes`);
  return v;
};

export function loadPost(raw: unknown): PostFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('post file: expected a JSON object');
  const o = raw as Record<string, unknown>;
  let image: URL;
  try { image = new URL(String(o.image)); } catch { throw new Error('post file: image must be a public https address'); }
  if (image.protocol !== 'https:' || !/\.jpe?g$/i.test(image.pathname)) throw new Error('post file: image must be a public https .jpg address');
  const post: PostFile = {
    image: image.href, alt: text(o.alt, 'alt'), location: id(o.location, 'location'), threadsLocation: id(o.threadsLocation, 'threadsLocation'),
    facebook: text(o.facebook, 'facebook'), instagram: text(o.instagram, 'instagram'), threads: text(o.threads, 'threads'),
  };
  if (!PLATFORMS.some(p => post[p])) throw new Error('post file: needs text for at least one of facebook, instagram, threads');
  for (const p of PLATFORMS) {
    const t = post[p];
    if (!t) continue;
    if (t.includes('!')) throw new Error(`post file: ${p} text has an exclamation mark; the voice has none`);
    if (/\bdiscover\b/i.test(t)) throw new Error(`post file: ${p} text uses "discover"; the voice never does`);
  }
  if (post.instagram && post.instagram.length > 2200) throw new Error('post file: instagram text is at most 2,200 characters');
  if (post.threads && !fitsThreads(post.threads)) throw new Error('post file: threads text must be 1–500 characters with at most 5 links');
  return post;
}

/** The picture must already be public and a JPEG, or Instagram and Threads fail after the container is made. */
export async function checkImage(url: string, fetcher: typeof fetch = fetch): Promise<void> {
  const r = await fetcher(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`image is not public yet (${r.status} at ${url}); merge and deploy it first`);
  const type = r.headers.get('content-type') ?? '';
  if (!/^image\/jpeg\b/i.test(type)) throw new Error(`image is served as "${type || 'no type'}", not image/jpeg`);
}
