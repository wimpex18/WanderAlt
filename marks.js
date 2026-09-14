/* ============================================================
   marks.js — makes the category sprite usable.
   ------------------------------------------------------------
   <use href="marks.svg#…"> (external document) does not resolve in
   Chrome or Safari, so marks.svg is fetched and injected once per page,
   after which same-document <use href="#wa-mark-…"> resolves. Not cached
   in sessionStorage: the HTTP cache revalidates, so an edited sprite wins.
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
     A photo that 404s degrades exactly as the renderer would with no
     photo. One delegated capture-phase listener (`error` does not bubble,
     and the CSP blocks inline onerror):
       card well   → the mark on the tint
       list tile   → the mark alone; the tile IS the well
       row media   → removed, so the :has(.wa-row__media) track collapses
       detail well → the --mark variant with its own credit line
     The kind travels on data-mark; unknown values land on the plain pin. */
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

  /* ── Too small to fill the box it was given ──────────────────
     Logos and feed thumbnails can be far smaller than the detail well.
     Asked at load against the box the image actually got: below 60% of
     its container it is contained on the tint instead of cropped to fill.
     Capture phase because `load` does not bubble. */
  const FILL_RATIO = 0.6;

  const onImageLoad = (ev) => {
    const img = ev.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.naturalWidth) return;
    if (img.dataset.waFit) return;

    const well = img.closest('.wa-detail__well');
    if (!well || well.classList.contains('wa-detail__well--brand')) return;

    const box = well.getBoundingClientRect().width;
    if (!box) return;
    if (img.naturalWidth >= box * FILL_RATIO) return;

    img.dataset.waFit = '1';
    well.classList.add('wa-detail__well--brand');
  };

  document.addEventListener('load', onImageLoad, true);

  window.WA.Marks = { markFor, load };
})();
