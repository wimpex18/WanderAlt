// Instagram publishing through the Instagram Graph API with Facebook Login
// (graph.facebook.com, v26.0): our own Business account, the system user
// token. Documented limits in September 2026: JPEG only, hosted at a public
// address while Instagram fetches it, 100 API-published posts per 24 hours,
// container status checked about once a minute for at most five minutes.

import { UA, sleep } from '../util.ts';
import type { InstagramConfig } from '../instagram.ts';

const API = 'https://graph.facebook.com/v26.0';

async function call<T>(method: 'GET' | 'POST', path: string, params: Record<string, string>, fetcher: typeof fetch): Promise<T> {
  const qs = new URLSearchParams(params);
  const r = await fetcher(method === 'GET' ? `${API}/${path}?${qs}` : `${API}/${path}`, {
    method, headers: { 'user-agent': UA, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? qs.toString() : undefined, signal: AbortSignal.timeout(30_000),
  });
  const body = await r.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } };
  if (!r.ok || body.error) throw new Error(`Instagram ${path.split('/').pop()}: ${body.error?.code ?? r.status} ${String(body.error?.message ?? '').slice(0, 160)}`);
  return body;
}

/** Posts published through the API in the last 24 hours, and the quota. */
export async function publishingLimit(cfg: InstagramConfig, fetcher: typeof fetch = fetch): Promise<{ used: number; total: number }> {
  const r = await call<{ data?: { quota_usage: number; config?: { quota_total: number } }[] }>('GET', `${cfg.businessId}/content_publishing_limit`,
    { fields: 'quota_usage,config', access_token: cfg.token }, fetcher);
  return { used: r.data?.[0]?.quota_usage ?? 0, total: r.data?.[0]?.config?.quota_total ?? 100 };
}

/** Publish one JPEG with a caption (at most 2,200 characters). Returns the media id. */
export async function publishImage(cfg: InstagramConfig, post: { imageUrl: string; caption: string; altText?: string }, fetcher: typeof fetch = fetch, pollMs = 20_000): Promise<string> {
  if (!/\.jpe?g$/i.test(new URL(post.imageUrl).pathname)) throw new Error('Instagram takes JPEG only: the image address must end in .jpg or .jpeg');
  if (post.caption.length > 2200) throw new Error('Instagram caption is at most 2,200 characters');
  const { used, total } = await publishingLimit(cfg, fetcher);
  if (used >= total) throw new Error(`Instagram publishing quota used (${used}/${total} in 24 hours)`);
  const container = await call<{ id: string }>('POST', `${cfg.businessId}/media`, {
    image_url: post.imageUrl, caption: post.caption, ...(post.altText ? { alt_text: post.altText } : {}), access_token: cfg.token }, fetcher);
  for (let i = 0; i < 15; i++) {
    const s = await call<{ status_code: string }>('GET', container.id, { fields: 'status_code', access_token: cfg.token }, fetcher);
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram container ${s.status_code}`);
    await sleep(pollMs);
  }
  const out = await call<{ id: string }>('POST', `${cfg.businessId}/media_publish`, { creation_id: container.id, access_token: cfg.token }, fetcher);
  return out.id;
}
