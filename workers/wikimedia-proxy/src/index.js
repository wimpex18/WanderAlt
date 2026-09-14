/* ============================================================
   WanderAlt — wikimedia-proxy Worker
   ------------------------------------------------------------
   Routes: wanderalt.app/img/wm/*
   Job:    Re-fetch a Wikimedia thumbnail URL, strip the Set-Cookie
           headers Wikimedia attaches, and serve the bytes through
           Cloudflare's edge cache (24 h), so no third-party cookie
           reaches the reader.

   Client: supabase.js rewrites Wikimedia URLs to
           /img/wm/<url-encoded-target> on wanderalt.app. On localhost
           the URLs pass through unchanged.
   ============================================================ */

const ALLOWED_HOSTS = new Set([
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'en.wikipedia.org',
  'meta.wikimedia.org',
]);

const CACHE_TTL_SECONDS = 86400; // 24h — Wikimedia images don't move

/* Raster types only. Commons accepts user-uploaded SVG, and an
   image/svg+xml response served from wanderalt.app/img/wm/… is ACTIVE
   content on our own origin: navigating straight to such a proxy URL would
   run script that can read the reader's session out of localStorage. The
   host allowlist above does not help — the attacker uploads to an allowed
   host. Anything not on this list is refused rather than forwarded. */
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
]);

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only proxy GET / HEAD. No state-changing methods.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }

    // Pathname looks like /img/wm/<urlencoded-https-url>. Strip prefix.
    const PREFIX = '/img/wm/';
    if (!url.pathname.startsWith(PREFIX)) {
      return new Response('not found', { status: 404 });
    }

    let target;
    try {
      target = new URL(decodeURIComponent(url.pathname.slice(PREFIX.length)));
    } catch {
      return new Response('bad target url', { status: 400 });
    }
    if (target.protocol !== 'https:') {
      return new Response('https only', { status: 400 });
    }
    if (!ALLOWED_HOSTS.has(target.hostname)) {
      return new Response('host not allowed', { status: 400 });
    }

    // Forward only safe inbound headers (Accept, If-* for conditional GETs).
    const forwardHeaders = new Headers();
    const passthrough = ['accept', 'accept-language', 'if-modified-since', 'if-none-match'];
    for (const k of passthrough) {
      const v = request.headers.get(k);
      if (v) forwardHeaders.set(k, v);
    }
    forwardHeaders.set('user-agent', 'WanderAltBot/1.0 (+https://wanderalt.app)');

    // Fetch with CF edge cache. cacheEverything = cache regardless of
    // Wikipedia's own Cache-Control header (it sometimes ships shorter).
    // TTL by status: only successes get the 24h; a transient 404/5xx from
    // Wikimedia must not be pinned at the edge for a day.
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers: forwardHeaders,
      cf: {
        cacheTtlByStatus: { '200-299': CACHE_TTL_SECONDS, '404': 60, '500-599': 0 },
        cacheEverything: true,
      },
    });

    /* A 304 carries no body or content-type — pass it through untouched.
       Everything else must declare a raster image type we accept. */
    if (upstream.status !== 304 && upstream.ok) {
      const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.has(type)) {
        return new Response('unsupported media type', {
          status: 415,
          headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
        });
      }
    }

    // Build a clean response: copy bytes + safe headers, drop cookies.
    const cleanHeaders = new Headers();
    const allowedOut = ['content-type', 'content-length', 'content-disposition',
                        'etag', 'last-modified', 'date'];
    for (const k of allowedOut) {
      const v = upstream.headers.get(k);
      if (v) cleanHeaders.set(k, v);
    }
    // Long immutable caching only for real images; browsers must not hold
    // onto an upstream error (or a 304 revalidation) for 24h.
    cleanHeaders.set('cache-control', upstream.ok || upstream.status === 304
      ? `public, max-age=${CACHE_TTL_SECONDS}, immutable`
      : 'no-store');
    cleanHeaders.set('x-content-type-options', 'nosniff');
    cleanHeaders.set('referrer-policy', 'no-referrer');
    /* Belt to the content-type braces: even if something active slipped
       through, it gets no capabilities and no origin to act on. */
    cleanHeaders.set('content-security-policy', "default-src 'none'; sandbox");
    cleanHeaders.set('access-control-allow-origin', 'https://wanderalt.app');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: cleanHeaders,
    });
  },
};
