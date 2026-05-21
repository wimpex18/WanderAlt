/* ============================================================
   WanderAlt — wikimedia-proxy Worker
   ------------------------------------------------------------
   Routes: wanderalt.app/img/wm/*
   Job:    Re-fetch a Wikimedia thumbnail URL, strip the
           Set-Cookie / Set-Cookie2 headers Wikimedia attaches
           (WMF-Uniq, NetworkProbeLimit), and serve the bytes
           through Cloudflare's edge cache.

   Why:    venue_details.image_url is often a Wikimedia URL when
           a venue has a Wikipedia article. Loaded directly, that
           URL sets a third-party cookie on every visitor, which
           Lighthouse flags as a Best-Practice failure and which
           contradicts WanderAlt's "no third-party scripts/cookies"
           promise on /about.html. Going through this Worker keeps
           the privacy promise intact AND lets the CF edge cache
           the bytes for 24 h — Wikipedia is rate-limited, the
           edge isn't.

   Client: supabase.js' toPick() rewrites Wikimedia URLs to the
           /img/wm/<url-encoded-target> form when running on
           wanderalt.app. On localhost the URLs pass through
           unchanged.
   ============================================================ */

const ALLOWED_HOSTS = new Set([
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'en.wikipedia.org',
  'meta.wikimedia.org',
]);

const CACHE_TTL_SECONDS = 86400; // 24h — Wikimedia images don't move

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
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers: forwardHeaders,
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    });

    // Build a clean response: copy bytes + safe headers, drop cookies.
    const cleanHeaders = new Headers();
    const allowedOut = ['content-type', 'content-length', 'content-disposition',
                        'etag', 'last-modified', 'date'];
    for (const k of allowedOut) {
      const v = upstream.headers.get(k);
      if (v) cleanHeaders.set(k, v);
    }
    cleanHeaders.set('cache-control', `public, max-age=${CACHE_TTL_SECONDS}, immutable`);
    cleanHeaders.set('x-content-type-options', 'nosniff');
    cleanHeaders.set('referrer-policy', 'no-referrer');
    cleanHeaders.set('access-control-allow-origin', 'https://wanderalt.app');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: cleanHeaders,
    });
  },
};
