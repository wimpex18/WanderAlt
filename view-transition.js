/* ============================================================
   WanderAlt — card → detail hero View Transition (cross-document)
   ------------------------------------------------------------
   @view-transition in wa.css enables cross-document transitions and
   names the chrome. This file adds the shared element: clicking a
   .wa-card tags its photo `view-transition-name: venue-hero`, pairing
   with detail.html's .wa-detail__photo. Photoless cards stay untagged
   and cross-fade. One element tagged at a time; modifier/middle clicks
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
    const source = link.querySelector('.wa-card__photo');
    if (!source) return;

    clearAll();
    source.style.viewTransitionName = NAME;
  }, true);   /* capture, so the name is set before the navigation snapshot */

  /* Back/forward (bfcache) restore: drop any leftover inline name so the
     next click cannot collide with a stale one. */
  window.addEventListener('pageshow', clearAll);
})();
