/* ============================================================
   WanderAlt — Facebook page picture proxy (Cloudflare Pages Function)
   ------------------------------------------------------------
   Route:  /img/fb/<page-name>, deployed with the site.
   Job:    A venue's Facebook page picture, for a venue with no logo of its
           own. The page name comes from a link the venue's record or its own
           website gave. This fetches Facebook's documented Graph API picture
           endpoint (public, no login, no token), strips the cookies and
           serves the bytes through the edge cache for a day, so the reader's
           browser never contacts Facebook.
   ============================================================ */

const NAME = /^[A-Za-z0-9.\-_]{3,80}$/;
const CACHE_TTL_SECONDS = 86400;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function onRequest({ request }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
  const url = new URL(request.url);
  const PREFIX = '/img/fb/';
  if (!url.pathname.startsWith(PREFIX)) return new Response('not found', { status: 404 });
  const name = decodeURIComponent(url.pathname.slice(PREFIX.length));
  if (!NAME.test(name)) return new Response('bad page name', { status: 400 });

  const upstream = await fetch(`https://graph.facebook.com/${encodeURIComponent(name)}/picture?type=large`, {
    method: request.method,
    headers: { 'user-agent': 'WanderAltBot/1.0 (+https://wanderalt.app)', accept: 'image/*' },
    cf: { cacheTtlByStatus: { '200-299': CACHE_TTL_SECONDS, '400-499': 60, '500-599': 0 }, cacheEverything: true },
  });
  const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!upstream.ok || !ALLOWED_TYPES.has(type)) {
    return new Response('no picture', { status: 404, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  }
  const headers = new Headers();
  for (const k of ['content-type', 'content-length', 'etag', 'last-modified']) {
    const v = upstream.headers.get(k);
    if (v) headers.set(k, v);
  }
  headers.set('cache-control', `public, max-age=${CACHE_TTL_SECONDS}`);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('content-security-policy', "default-src 'none'; sandbox");
  headers.set('access-control-allow-origin', url.origin);
  return new Response(upstream.body, { status: 200, headers });
}
