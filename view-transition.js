/* ============================================================
   WanderAlt — card → detail hero View Transition (cross-document)
   ------------------------------------------------------------
   @view-transition in wa.css enables cross-document transitions and
   names the chrome. This file adds the shared element: clicking a row
   or poster tags its picture `view-transition-name: venue-hero`,
   pairing with the detail page's photo (.det-media img). Photoless
   rows stay untagged and cross-fade. One element tagged at a time; modifier/middle clicks
   and reduced motion skip tagging.
   ============================================================ */
(() => {
  'use strict';

  const NAME = 'venue-hero';

  const clearAll = () =>
    document.querySelectorAll('[style*="view-transition-name"]')
      .forEach((el) => { el.style.viewTransitionName = ''; });

  document.addEventListener('click', (e) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const link = e.target.closest('a[href*="detail.html"]');
    if (!link || link.target === '_blank') return;

    /* The card is the anchor, so the photo is inside the link itself.
       Rows and photoless cards return null and cross-fade instead. */
    const source = link.querySelector('.wa-row__thumb img, .wa-place__glyph img, .wa-feed__art img');
    if (!source) return;

    clearAll();
    source.style.viewTransitionName = NAME;
  }, true);   /* capture, so the name is set before the navigation snapshot */

  /* Back/forward (bfcache) restore: drop any leftover inline name so the
     next click cannot collide with a stale one. */
  window.addEventListener('pageshow', clearAll);

  /* Entrance gate for the listing animations in wa.css. They only play while
     html[data-enter] is set: from the start of the page until a moment after the
     first listings are drawn (or five seconds, whichever is first). A list drawn
     again later, a filter changing or the five-minute refresh, does not replay them.
     Off for reduced motion and Data Saver. */
  const root = document.documentElement;
  const c = navigator.connection;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !(c && c.saveData)) {
    root.setAttribute('data-enter', '');
    const stop = () => root.removeAttribute('data-enter');
    document.addEventListener('wa:catalog-ready', () => setTimeout(stop, 1200), { once: true });
    setTimeout(stop, 5000);
  }
})();
