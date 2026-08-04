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

   Same-origin fetch, so CSP connect-src 'self' covers it. Cached in
   sessionStorage because it is a few hundred bytes fetched on every
   navigation of a no-build static site.
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const KEY = 'wa:marks-sprite';
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

  const load = () => {
    let cached = null;
    try { cached = sessionStorage.getItem(KEY); } catch (_) { /* storage blocked */ }
    if (cached) { inject(cached); return Promise.resolve(); }

    return fetch('marks.svg')
      .then(r => (r.ok ? r.text() : ''))
      .then((text) => {
        if (!text) return;
        try { sessionStorage.setItem(KEY, text); } catch (_) { /* quota / blocked */ }
        inject(text);
      })
      .catch(() => { /* offline: wells stay tinted, which still reads as an object */ });
  };

  if (document.body) load();
  else document.addEventListener('DOMContentLoaded', load, { once: true });

  window.WA.Marks = { markFor, load };
})();
