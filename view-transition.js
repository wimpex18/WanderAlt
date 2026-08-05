/* ============================================================
   WanderAlt — card → detail hero View Transition (cross-document)
   ------------------------------------------------------------
   Cross-document transitions are enabled globally by @view-transition
   in wa.css, where the top bar and tab bar also carry stable
   view-transition-names so the chrome morphs instead of cross-fading.

   This file adds the SHARED-ELEMENT half: clicking a card that
   navigates to detail.html tags that card's photo with
   `view-transition-name: venue-hero`, which pairs with the same name on
   detail.html's `.wa-detail__photo` — so the photo expands into the
   hero rather than the page fading.

   Rewritten Aug 2026, because every line of it had rotted quietly. It
   targeted `a[href*="venue.html"]` (a page the redesign merged into
   detail.html), read a rule from styles.css (deleted in the cutover),
   and hunted for `.pick`, `.list-row--card`, `.thumb`, `.tonight__hero`
   and `.tonight__photo` — five Dusk Glass class names, none of which
   any module emits any more. The file still loaded on six pages and did
   nothing at all. Nothing surfaces a dead listener, which is exactly
   why it survived the reskin.

   The new markup is simpler: `.wa-card` IS the anchor, so the photo is
   just a descendant of the clicked link. Cards without a photo render a
   `.wa-mark` glyph instead and are deliberately left untagged — morphing
   a category glyph into a photograph reads as a glitch, so those fall
   through to the default cross-fade.

   Only one element is ever tagged (any prior is cleared first), modifier
   and middle clicks are ignored, reduced-motion skips tagging, and on
   browsers without the API setting the property is a harmless no-op —
   the navigation just happens instantly.
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
