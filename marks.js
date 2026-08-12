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

  /* ── A photo that fails to load ──────────────────────────────
     The no-grey-box rule is written for a photo that is ABSENT, and
     every renderer already honours it: explore's card, saved's mosaic
     tile and detail's well all branch to the mark when imageUrl is
     empty. A photo that is PRESENT and then 404s produces the same
     rendered outcome — an empty well — and nothing was catching it.
     A census on 12 Aug 2026 confirmed it: point a tile's img at a
     missing file and the img stays in the DOM at full tile size with
     naturalWidth 0 and no mark behind it. That is the torn frame the
     rule exists to ban, and verify-images only clears dead URLs on a
     schedule, so a decayed link renders that way until the next sweep.

     One delegated listener rather than an onerror attribute: the
     production CSP blocks inline handlers. `error` does not bubble but
     it does capture, which is why this is on the capture phase.

     Each surface degrades exactly the way its own renderer already
     does when there is no photo, so nothing new is invented here:
       card well   → the mark on the tint
       list tile   → the mark alone; the tile IS the well
       row media   → nothing at all. The element is removed so the
                     :has(.wa-row__media) track collapses and the row
                     runs full width, which is what a photoless row
                     already does. Never a 96px glyph on a timetable.
       detail well → the --mark variant with its own credit line
     The kind travels on data-mark, written at each render site, since
     an <img> cannot otherwise say what it was a picture of. A missing
     or unknown value lands on the plain pin via markFor. */
  const useMark = (name) => `<svg aria-hidden="true"><use href="#wa-mark-${name}"></use></svg>`;

  const onImageError = (ev) => {
    const img = ev.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.waFallback) return;
    /* One swap per image. Without this a fallback that itself failed
       would loop, and re-entry on a detached node throws. */
    img.dataset.waFallback = '1';

    /* markFor only ever returns a name from the fixed sprite set, so
       this interpolation cannot carry attacker text. */
    const name = markFor(img.dataset.mark);

    const media = img.closest('.wa-row__media');
    if (media) { media.remove(); return; }

    const detail = img.closest('.wa-detail__well');
    if (detail) {
      detail.classList.add('wa-detail__well--mark');
      detail.innerHTML = `<span class="wa-mark">${useMark(name)}</span>`
        + `<p class="wa-detail__credit">no photo on file</p>`;
      return;
    }

    const tile = img.closest('.wa-list-card__tile');
    if (tile) { tile.innerHTML = useMark(name); return; }

    const well = img.closest('.wa-card__well');
    if (well) {
      const span = document.createElement('span');
      span.className = 'wa-mark';
      span.innerHTML = useMark(name);
      img.replaceWith(span);
    }
    /* Anything else — the city plates in About, the dropdown thumbs —
       is a bundled local asset, not a catalogue photo. Left alone. */
  };

  document.addEventListener('error', onImageError, true);

  window.WA.Marks = { markFor, load };
})();
