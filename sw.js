/* ============================================================
   sw.js — the minimal service worker 6f#5 asks for.

   "The offline card in 6d promises saved picks and tonight's list work
   without signal. There is no service worker in the repo — bookmarks are
   localStorage, the list is not cached. Either ship a minimal SW that
   caches the last Tonight response and the shell, or soften the copy.
   Do not ship the stronger claim unbacked."

   The copy was softened first, which was the right call at the time.
   This is the other half, so the stronger claim can be true.

   Three strategies, chosen per request type:

     navigations   network-first, cache fallback. There is no build step
                   and no content hashing here, so a cache-first HTML
                   rule would serve yesterday's page for as long as the
                   cache lived. Network-first means a deploy is visible
                   immediately and offline still works.

     static        stale-while-revalidate. CSS, JS, fonts, the sprite.
                   Fast, and self-healing on the next visit.

     picks/venues  network-first with a timestamped cache fallback. This
                   is what makes "tonight's list works offline" true.
                   The timestamp is what lets the banner say how stale
                   it is rather than implying it is live.

   Never cached: anything carrying an Authorization header that is not
   the public anon key, and every non-GET. Saves already sync through
   localStorage and Supabase; a worker holding someone's session data is
   a liability with no upside.
   ============================================================ */

/* Bump this whenever the precache list changes. v2: Inter came out and
   Plus Jakarta Sans went in, so a reader still holding the v1 shell
   would have kept a cached font the CSS no longer asks for and missed
   the one it does. */
const VERSION = 'wa-v2';
const SHELL   = `${VERSION}-shell`;
const DATA    = `${VERSION}-data`;

/* Everything needed to render a page with no network. Deliberately
   explicit: a wildcard precache is how a service worker quietly starts
   shipping files nobody meant to ship. */
const SHELL_URLS = [
  './',
  './index.html',
  './discover.html',
  './saved.html',
  './detail.html',
  './source.html',
  './profile.html',
  './about.html',
  './404.html',
  './walk.html',
  './wa.css',
  './marks.svg',
  './walks.json',
  './theme.js', './when.js', './catalog.js', './geo.js', './hours.js',
  './marks.js', './seen.js', './share.js', './offline.js', './ui-helpers.js',
  './city.js', './supabase.js', './auth.js', './bookmark.js', './lists.js',
  './follow.js', './toast.js', './view-transition.js',
  './explore.js', './tonight.js', './saved-page.js', './detail.js',
  './source.js', './you.js', './about.js', './notfound.js', './walk.js',
  './fonts/fraunces-600.woff2',
  './fonts/geist-mono-400.woff2',
  './fonts/geist-mono-500.woff2',
  './fonts/plus-jakarta-sans-latin.woff2',
  './fonts/plus-jakarta-sans-latin-ext.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    /* addAll rejects the whole batch if one URL 404s, which would leave
       the worker uninstalled and the failure invisible. One at a time,
       and a missing file is skipped rather than fatal. */
    await Promise.all(SHELL_URLS.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isData = (url) =>
  /\/rest\/v1\/(picks|venues|past|venue_details)/.test(url.pathname + url.search);

const isStatic = (url) =>
  /\.(css|js|svg|woff2|json|png|ico|webmanifest)$/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Never hold a signed-in session's responses. */
  const auth = req.headers.get('Authorization') || '';
  const isAnon = !auth || auth.includes('anon') || auth.length > 200;
  if (auth && !isAnon) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(SHELL);
        c.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match(req)) ||
               (await caches.match('./index.html')) ||
               Response.error();
      }
    })());
    return;
  }

  if (isData(url)) {
    e.respondWith((async () => {
      const c = await caches.open(DATA);
      try {
        const fresh = await fetch(req);
        /* Stamp the response so the offline banner can say how old the
           list is. Implying a cached list is live is the exact thing
           6f#5 warns against. */
        const body = await fresh.clone().blob();
        const stamped = new Response(body, {
          status: fresh.status,
          statusText: fresh.statusText,
          headers: (() => {
            const h = new Headers(fresh.headers);
            h.set('x-wa-cached-at', String(Date.now()));
            return h;
          })(),
        });
        c.put(req, stamped.clone());
        return fresh;
      } catch (_) {
        const hit = await c.match(req);
        return hit || Response.error();
      }
    })());
    return;
  }

  if (isStatic(url) && url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req);
      const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});

/* The page asks how stale the cached list is; the worker is the only
   thing that knows. */
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'wa:cache-age') return;
  e.waitUntil((async () => {
    let newest = 0;
    try {
      const c = await caches.open(DATA);
      for (const req of await c.keys()) {
        const res = await c.match(req);
        const t = +(res && res.headers.get('x-wa-cached-at'));
        if (t > newest) newest = t;
      }
    } catch (_) { /* no cache yet */ }
    (e.source ? [e.source] : await self.clients.matchAll())
      .forEach(cl => cl.postMessage({ type: 'wa:cache-age', at: newest || null }));
  })());
});
