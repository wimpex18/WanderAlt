/* ============================================================
   marks.js — makes the category sprite usable.
   ------------------------------------------------------------
   marks.svg is the single source of truth for the eight marks, but
   <use href="marks.svg#wa-mark-gig"> does NOT resolve in Chrome or
   Safari: external-document references in <use> are a Firefox-only
   feature in practice. The sprite renders as an empty well everywhere
   that matters, which is exactly the grey box the direction bans.

   The alternatives were: inline forty lines of <symbol> into all eight
   pages (duplication the repo already avoids), or move the paths into a
   JS table (then marks.svg is decorative and drifts). Instead the file
   stays authoritative and is injected once per page, after which the
   same-document <use href="#wa-mark-gig"> resolves normally — SVG
   references are live, so marks already on the page fill in the moment
   the symbols land.

   Same-origin fetch, so CSP connect-src 'self' covers it.

   NOT cached in sessionStorage. It was, to avoid re-fetching a few
   hundred bytes on every navigation — but that put a copy of the sprite
   somewhere with no expiry, so editing marks.svg showed nothing until
   the reader opened a new tab, and a half-written sprite would have
   pinned itself for the session. The HTTP cache already does this job
   properly: /*.svg falls under the _headers /* rule, the browser
   revalidates, and a changed file wins. One cache, and it is the one
   with invalidation.
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const KINDS = new Set(['gig', 'club', 'records', 'gallery', 'film', 'market', 'bar', 'books']);

  /* Catalogue kinds are messier than eight names. This is the one place
     the mapping lives; a kind with no home lands on the plain pin rather
     than on nothing. */
  const KIND_TO_MARK = {
    gig: 'gig', concert: 'gig', music: 'gig', talk: 'gig', lecture: 'gig',
    club: 'club', party: 'club', rave: 'club',
    'record store': 'records', records: 'records', vinyl: 'records',
    gallery: 'gallery', exhibition: 'gallery', art: 'gallery',
    museum: 'gallery', 'arts centre': 'gallery',
    film: 'film', cinema: 'film', screening: 'film',
    theatre: 'film', burlesque: 'film',
    market: 'market', flea: 'market', thrift: 'market', fair: 'market',
    bar: 'bar', cafe: 'bar', pub: 'bar', club_bar: 'bar',
    bookshop: 'books', books: 'books', library: 'books', community: 'books',
  };

  const markFor = (kind) => {
    const k = String(kind || '').toLowerCase().trim();
    if (KINDS.has(k)) return k;
    return KIND_TO_MARK[k] || 'place';
  };

  const inject = (text) => {
    if (!text || document.getElementById('wa-marks-sprite')) return;
    const host = document.createElement('div');
    host.id = 'wa-marks-sprite';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    host.innerHTML = text;
    document.body.appendChild(host);
  };

  /* Guard against a second call racing the first — inject() is
     idempotent by id, but two in-flight fetches are pure waste. */
  let pending = null;

  const load = () => {
    if (document.getElementById('wa-marks-sprite')) return Promise.resolve();
    if (pending) return pending;
    pending = fetch('marks.svg')
      .then(r => (r.ok ? r.text() : ''))
      .then((text) => { if (text) inject(text); })
      .catch(() => { /* offline: wells stay tinted, which still reads as an object */ })
      .finally(() => { pending = null; });
    return pending;
  };

  if (document.body) load();
  else document.addEventListener('DOMContentLoaded', load, { once: true });

  window.WA.Marks = { markFor, load };
})();
