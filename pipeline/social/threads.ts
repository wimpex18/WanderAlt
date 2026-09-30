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
  const raw = await r.text().catch(() => '');
  let body = {} as T & { error?: { message?: string; code?: number; type?: string; error_subcode?: number; fbtrace_id?: string } };
  try { body = JSON.parse(raw); } catch { /* a 500 from the edge may carry no JSON */ }
  if (!r.ok || body.error) {
    const e = body.error;
    // The trace id is what Meta's support asks for; the raw text shows a body that is not JSON.
    const trace = e?.fbtrace_id ?? r.headers.get('x-fb-trace-id');
    const plain = e ? '' : raw.replace(/access_token=[^&\s"]+/g, 'access_token=…').replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(`Threads ${path.split('/').pop()}: HTTP ${r.status}, code ${e?.code ?? '-'}${e?.error_subcode ? `/${e.error_subcode}` : ''}${e?.type ? ` ${e.type}` : ''} ${String(e?.message ?? '').slice(0, 160)}${trace ? ` [trace ${trace}]` : ''}${plain ? ` [body "${plain}"]` : ''}`.replace(/\s+\[/g, ' ['));
  }
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

/** Several small requests with the same token, to tell a missing permission
 *  (this token never received it) from a restriction on the endpoint (no
 *  review yet) or a fault on Meta's side. Reads only; one line per probe. */
export async function probe(token: string, username: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const probes: [string, string, Record<string, string>][] = [
    ['own profile (threads_basic)', 'me', { fields: 'id,username' }],
    ['own posts (threads_basic)', 'me/threads', { fields: 'id', limit: '1' }],
    ['own insights (threads_manage_insights)', 'me/threads_insights', { metric: 'views' }],
    ['publishing limit (threads_content_publish)', 'me/threads_publishing_limit', { fields: 'quota_usage' }],
    ['search, q only', 'keyword_search', { q: 'tallinn' }],
    ['search, q and own username', 'keyword_search', { q: 'tallinn', author_username: username }],
    ['search, tag mode', 'keyword_search', { q: 'tallinn', search_mode: 'TAG' }],
    ['search, recent and since', 'keyword_search', { q: 'tallinn', search_type: 'RECENT', since: String(Math.floor(Date.now() / 1000) - 7 * 86400) }],
  ];
  const out: string[] = [];
  for (const [label, path, params] of probes) {
    try {
      const r = await call<{ data?: unknown[] }>('GET', `${VERSION}/${path}`, { ...params, access_token: token }, fetcher);
      out.push(`${label}: ok${Array.isArray(r.data) ? `, ${r.data.length} items` : ''}`);
    } catch (e) { out.push(`${label}: ${(e as Error).message.replace(/^Threads [^:]+: /, '')}`); }
  }
  return out;
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
