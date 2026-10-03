/* ============================================================
   brand-reveal.js — the opening, every time the app is opened.
   ------------------------------------------------------------
   Loaded blocking in <head>, so the cover exists before first paint.
   The mark is built from its parts: the tile pops, the route draws
   itself, the spark lights, "wander" slides in and "alt" arrives a
   little off the line before it settles. Then it holds until the page
   underneath is ready (catalogue drawn, fonts in, first pictures
   decoded), and the mark flies to its place in the top bar while the
   cover lifts. Minimum about 0.6 s, never past 1.8 s.
   An opening plays it: a link from a message (event and source pages
   included), a bookmark, the home-screen icon, a typed address, a reload,
   but not when the app was open under 30 minutes ago (`wa:opened`), so
   someone checking a time between two stops never waits for it.
   Moving around inside the app does not: a page reached from another page
   of this site, or by Back and Forward, goes straight to its content.
   Skipped for reduced motion, prerendering, Back and Forward, the review
   queue and not found. CSS is in wa.css under .wa-splash.
   ============================================================ */
(() => {
  const MIN = 600, MAX = 1800, AGAIN = 30 * 60 * 1000;
  try {
    // Every page load stamps the time, so "recently" counts from the last look.
    const last = Number(localStorage.getItem('wa:opened')) || 0;
    if (!document.prerendering) localStorage.setItem('wa:opened', String(Date.now()));
    if (document.prerendering) return;
    if (/\/(404|review)(\.html)?\/?$/.test(location.pathname)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // An opening arrives from outside the site. A page reached from this
    // site's own pages, or by Back and Forward, is moving around, not opening.
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'back_forward') return;
    if ((!nav || nav.type !== 'reload') && document.referrer && new URL(document.referrer).origin === location.origin) return;
    if (Date.now() - last < AGAIN) return;      // Recently here: no opening.
  } catch (_) { return; } // Cannot tell how the page was reached: go straight to it.

  const root = document.documentElement;
  const t0 = performance.now();
  const cover = document.createElement('div');
  cover.className = 'wa-splash';
  cover.setAttribute('aria-hidden', 'true');
  cover.setAttribute('inert', '');
  /*mark:start*/
  cover.innerHTML = '<div class="wa-splash__stage"><svg class="wa-splash__mark" viewBox="0 0 32 32" width="104" height="104" focusable="false"><g class="wa-splash__tile"><rect width="32" height="32" rx="9" fill="#d83a14"/></g><circle class="wa-splash__ring" cx="25" cy="9" r="4" fill="none" stroke="#d83a14" stroke-width=".6"/><path class="wa-splash__route" pathLength="1" d="M6.5 12 11 23 16 14 21 23 23.5 17" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path class="wa-splash__spark" d="m25 4.5 1.3 3.2 3.2 1.3-3.2 1.3L25 13.5l-1.3-3.2L20.5 9l3.2-1.3z" fill="#fff"/></svg><span class="wa-splash__word"><span class="wa-splash__w1">wander</span><span class="wa-splash__w2">alt</span></span><span class="wa-splash__line">Tonight in Tallinn</span></div>';
  /*mark:end*/
  root.dataset.brandReveal = '';
  // Appended to <html> so it exists before <body> is parsed.
  root.appendChild(cover);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    delete root.dataset.brandReveal;
    document.querySelectorAll('.wa-brand__mark').forEach((m) => { m.style.visibility = ''; });
    cover.remove();
  };
  // Nothing may keep the page covered, whatever fails below.
  setTimeout(finish, MAX + 1200);

  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Pictures in the first screen, decoded, so nothing pops in as the cover lifts.
  const pictures = async () => {
    const seen = [...document.querySelectorAll('main img')].filter((img) => {
      const r = img.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.width > 0;
    }).slice(0, 8);
    await Promise.race([Promise.all(seen.map((img) => img.decode().catch(() => {}))), wait(700)]);
  };

  const ready = new Promise((resolve) => {
    const go = async () => {
      await frames();
      await Promise.race([document.fonts ? document.fonts.ready : 0, wait(600)]);
      await pictures();
      resolve();
    };
    if (window.WA && window.WA.DATA_LIVE !== undefined) go();
    else document.addEventListener('wa:catalog-ready', go, { once: true });
  });

  const lift = async () => {
    const mark = cover.querySelector('.wa-splash__mark');
    const target = document.querySelector('.wa-brand__mark');
    root.dataset.brandReveal = 'out';
    const from = mark.getBoundingClientRect();
    const to = target && target.getBoundingClientRect();
    if (to && to.width && to.bottom > 0 && to.top < innerHeight && from.width) {
      target.style.visibility = 'hidden';
      mark.style.transformOrigin = '0 0';
      const s = to.width / from.width;
      const fly = mark.animate(
        [{ transform: 'none' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${s})` }],
        { duration: 520, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' });
      await fly.finished.catch(() => {});
    } else {
      await wait(360);
    }
    finish();
  };

  Promise.race([ready, wait(MAX)])
    .then(() => wait(Math.max(0, MIN - (performance.now() - t0))))
    .then(lift, finish);
})();
