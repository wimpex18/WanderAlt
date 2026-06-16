/* ============================================================
   WanderAlt — card → venue-hero View Transition (cross-document)
   ------------------------------------------------------------
   View Transitions are enabled globally (@view-transition in styles.css);
   the topbar + nav already carry view-transition-names so chrome morphs.
   This adds a SHARED-ELEMENT morph: clicking a photo card (or the Tonight
   hero) that navigates to venue.html tags the source photo with
   `view-transition-name: venue-hero`, which pairs with venue.html's
   `.detail-hero` (same name) — so the photo expands into the detail hero.

   Only one element is ever tagged (we clear any prior first), modifier-
   click / new-tab is ignored, reduced-motion skips tagging entirely, and
   on unsupported browsers setting the property is a harmless no-op (the
   navigation just happens instantly). Load on the source pages
   (index / discover / saved) only — venue.html just needs the CSS name.
   ============================================================ */
(() => {
  const NAME = 'venue-hero';

  const clearAll = () =>
    document.querySelectorAll('[style*="view-transition-name"]')
      .forEach((el) => { el.style.viewTransitionName = ''; });

  document.addEventListener('click', (e) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const link = e.target.closest('a[href*="venue.html"]');
    if (!link || link.target === '_blank') return;

    /* Source = the Tonight hero itself, else the photo .thumb of the
       clicked card. Plain list rows (e.g. venue "more from") have no
       .thumb, so they fall through to a default cross-fade. */
    let source = null;
    if (link.classList.contains('tonight__hero') || link.classList.contains('tonight__photo')) {
      source = link;
    } else {
      const card = link.closest('.pick, .list-row--card');
      source = card && card.querySelector('.thumb');
    }
    if (source) {
      clearAll();
      source.style.viewTransitionName = NAME;
    }
  }, true);   /* capture, so the name is set before the navigation snapshot */

  /* Back/forward (bfcache) restore: drop any leftover inline name so the
     next click can't collide with a stale one. */
  window.addEventListener('pageshow', clearAll);
})();
