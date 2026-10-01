/* ============================================================
   sw.js — the service worker.
   ------------------------------------------------------------
   Three strategies, chosen per request type:

     navigations   network-first, cache fallback. Nothing is content-
                   hashed, so cache-first HTML would serve stale pages.

     static        stale-while-revalidate. CSS, JS, fonts, the sprite.

     listings      picks, venues and venue_details: network-first with a
                   timestamped cache fallback, so the banner can say how
                   old they are.

   Never cached: anything carrying an Authorization header that is not
   the public anon key, and every non-GET.
   ============================================================ */

/* Bump this whenever the precache list changes. */
const VERSION = 'wa-v40';
const SHELL   = `${VERSION}-shell`;
const DATA    = `${VERSION}-data`;

/* Everything needed to render a page with no network. Deliberately
   explicit: a wildcard precache is how a service worker quietly starts
   shipping files nobody meant to ship. */
const SHELL_URLS = [
  './',
  './index.html', './discover.html', './map.html', './places.html',
  './saved.html', './detail.html', './source.html', './profile.html',
  './about.html', './404.html',
  './wa.css',
  './theme.js', './brand-reveal.js', './icons.js', './when.js', './geo.js', './hours.js',
  './seen.js', './share.js', './offline.js', './ui-helpers.js',
  './city.js', './supabase.js', './auth.js', './bookmark.js', './lists.js',
  './follow.js', './toast.js', './render.js', './view-transition.js', './tabbar.js', './going.js', './report.js', './push.js', './ask.js',
  './finder.js', './home.js', './programme.js', './map.js', './places.js', './saved-page.js',
  './detail.js', './source.js', './you.js', './about.js', './notfound.js',
  './maplibre-loader.js', './map-tiles.js',
  './map-style.json', './map-style-dusk.json',
  './fonts/geologica-latin.woff2',
  './fonts/geologica-latin-ext.woff2',
  './fonts/geologica-cyrillic.woff2',
  './fonts/geist-mono-500.woff2',
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

/* Exact public credentials only: JWT length or claimed role cannot prove
   anonymity. Keep these in sync with supabase.js. */
const PUBLIC_ORIGIN = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
const PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';
const isData = (url) => url.origin === PUBLIC_ORIGIN &&
  /^\/rest\/v1\/(picks|venues|venue_details|catalogue_redirects)$/.test(url.pathname);

const isStatic = (url) =>
  /\.(css|js|svg|woff2|json|png|ico|webmanifest)$/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Never hold a signed-in session's responses. */
  const auth = req.headers.get('Authorization') || '';
  const apiKey = req.headers.get('apikey') || '';
  if ((auth && auth !== `Bearer ${PUBLIC_KEY}`) || (apiKey && apiKey !== PUBLIC_KEY)) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(SHELL);
        if (fresh.ok) await c.put(req, fresh.clone());
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
    if (auth !== `Bearer ${PUBLIC_KEY}` || apiKey !== PUBLIC_KEY) return;
    e.respondWith((async () => {
      const c = await caches.open(DATA);
      try {
        const fresh = await fetch(req);
        if (!fresh.ok) return (await c.match(req)) || fresh;
        /* Stamp the response so the offline banner can say how old it is. */
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
        await c.put(req, stamped.clone());
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
      const net = fetch(req).then(async res => { if (res.ok) await c.put(req, res.clone()); return res; }).catch(() => null);
      e.waitUntil(net.then(() => {}));
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

/* ── Notifications ───────────────────────────────────────────
   pipeline/digest.ts sends { title, body, url }. The notification opens that
   page on this site; any other address is ignored. */
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (_) { /* a plain-text push still shows */ }
  e.waitUntil(self.registration.showNotification(String(m.title || 'WanderAlt').slice(0, 80), {
    body: String(m.body || '').slice(0, 200),
    icon: './apple-touch-icon.png',
    tag: String(m.tag || 'wanderalt'),
    data: { url: String(m.url || './index.html') },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './index.html', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin;
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (c.url === url && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});
