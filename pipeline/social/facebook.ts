// Manual publishing to our own Page. Public venue access is separate (facebook-hours.ts).
import type { InstagramConfig } from '../instagram.ts';

const API = 'https://graph.facebook.com/v26.0';
export interface FacebookPage { id: string; name: string; token: string }

async function call<T>(token: string, path: string, params: Record<string, string>, method: 'GET' | 'POST', fetcher: typeof fetch): Promise<T> {
  const query = new URLSearchParams(params);
  const r = await fetcher(`${API}/${path}${method === 'GET' ? `?${query}` : ''}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? query.toString() : undefined, signal: AbortSignal.timeout(15_000),
  });
  const body = await r.json().catch(() => ({})) as T & { error?: { code?: number } };
  // Never echo response messages, which can contain credentials or request data.
  if (!r.ok || body.error) throw new Error(`Facebook ${path.split('/').pop()}: refused (code ${body.error?.code ?? r.status})`);
  return body;
}

/** Exact configured Page only; never choose the first Page the token happens to manage. */
export async function ownPage(cfg: InstagramConfig, pageId: string, fetcher: typeof fetch = fetch): Promise<FacebookPage> {
  if (!/^\d+$/.test(pageId)) throw new Error('Facebook needs a numeric FACEBOOK_PAGE_ID');
  const body = await call<{ data?: { id: string; name: string; access_token?: string; tasks?: string[] }[] }>(
    cfg.token, 'me/accounts', { fields: 'id,name,access_token,tasks', limit: '100' }, 'GET', fetcher);
  const page = body.data?.find(p => p.id === pageId);
  if (!page?.access_token || !page.tasks?.some(t => t === 'CREATE_CONTENT' || t === 'MANAGE')) {
    throw new Error('Configured Facebook Page is not assigned with publishing access');
  }
  return { id: page.id, name: page.name, token: page.access_token };
}

/** A successful read checks the Page token, without creating or publishing a post. */
export async function checkPage(page: FacebookPage, fetcher: typeof fetch = fetch): Promise<void> {
  await call(page.token, `${page.id}/feed`, { fields: 'id', limit: '1' }, 'GET', fetcher);
}

export async function publishText(page: FacebookPage, text: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!text.trim()) throw new Error('Facebook post needs text');
  const body = await call<{ id?: string }>(page.token, `${page.id}/feed`, { message: text, published: 'true' }, 'POST', fetcher);
  if (!body.id) throw new Error('Facebook did not return a post ID');
  return body.id;
}
