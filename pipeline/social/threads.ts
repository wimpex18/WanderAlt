// Threads API (graph.threads.net, v1.0). A Threads user token is separate from
// the Facebook/Instagram system user token: it comes from Threads' own OAuth
// (the app's Threads user token generator), lasts 60 days, and is refreshed
// before it ends. Limits as documented by Meta in September 2026: a post is up
// to 500 characters with at most 5 links, 250 posts per 24 hours, an image is
// JPEG or PNG up to 8 MB, and a container should rest about 30 seconds before it
// is published. Keyword search without App Review returns only the token
// owner's own posts; profile lookup without it works for Meta's own accounts.

import { UA, sleep } from '../util.ts';

const API = 'https://graph.threads.net';
const VERSION = 'v1.0';

export interface ThreadsToken { token: string; expiresAt: string | null }

async function call<T>(method: 'GET' | 'POST', path: string, params: Record<string, string>, fetcher: typeof fetch): Promise<T> {
  const qs = new URLSearchParams(params);
  const url = method === 'GET' ? `${API}/${path}?${qs}` : `${API}/${path}`;
  const r = await fetcher(url, {
    method, headers: { 'user-agent': UA, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? qs.toString() : undefined, signal: AbortSignal.timeout(30_000),
  });
  const body = await r.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } };
  if (!r.ok || body.error) throw new Error(`Threads ${path.split('/').pop()}: ${body.error?.code ?? r.status} ${String(body.error?.message ?? '').slice(0, 160)}`);
  return body;
}

/** Extend a long-lived token by another 60 days. */
export async function refreshToken(token: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<ThreadsToken> {
  const r = await call<{ access_token: string; expires_in: number }>('GET', 'refresh_access_token', { grant_type: 'th_refresh_token', access_token: token }, fetcher);
  return { token: r.access_token, expiresAt: new Date(now + r.expires_in * 1000).toISOString() };
}

export const me = (token: string, fetcher: typeof fetch = fetch) =>
  call<{ id: string; username: string }>('GET', `${VERSION}/me`, { fields: 'id,username', access_token: token }, fetcher);

export interface SearchHit { id: string; username?: string; text?: string; permalink?: string }
export async function keywordSearch(token: string, q: string, fetcher: typeof fetch = fetch): Promise<SearchHit[]> {
  // The full query first; if Threads answers with an error, the plainest one
  // (only q), so a bad optional parameter is told apart from a refused permission.
  try {
    const r = await call<{ data?: SearchHit[] }>('GET', `${VERSION}/keyword_search`, {
      q, search_type: 'RECENT', limit: '10', fields: 'id,username,text,permalink', access_token: token }, fetcher);
    return r.data ?? [];
  } catch (first) {
    try {
      const r = await call<{ data?: SearchHit[] }>('GET', `${VERSION}/keyword_search`, { q, access_token: token }, fetcher);
      return r.data ?? [];
    } catch (second) {
      throw new Error(`full query: ${(first as Error).message}; plain query: ${(second as Error).message}`);
    }
  }
}

export async function profileLookup(token: string, username: string, fetcher: typeof fetch = fetch): Promise<{ username: string; follower_count?: number } | null> {
  try {
    return await call('GET', `${VERSION}/profile_lookup`, { username, fields: 'username,follower_count', access_token: token }, fetcher);
  } catch { return null; }
}

/** The post text as Threads will count it: at most 500 characters. */
export const fitsThreads = (text: string) => text.length > 0 && text.length <= 500 && (text.match(/https?:\/\/\S+/g) ?? []).length <= 5;

/** Create the container, wait, publish. Returns the post id. */
export async function publish(token: string, userId: string, post: { text: string; imageUrl?: string }, fetcher: typeof fetch = fetch, wait = 30_000): Promise<string> {
  if (!fitsThreads(post.text)) throw new Error('Threads post must be 1–500 characters with at most 5 links');
  const container = await call<{ id: string }>('POST', `${VERSION}/${userId}/threads`, {
    media_type: post.imageUrl ? 'IMAGE' : 'TEXT', text: post.text, ...(post.imageUrl ? { image_url: post.imageUrl } : {}), access_token: token }, fetcher);
  await sleep(wait);
  const out = await call<{ id: string }>('POST', `${VERSION}/${userId}/threads_publish`, { creation_id: container.id, access_token: token }, fetcher);
  return out.id;
}
