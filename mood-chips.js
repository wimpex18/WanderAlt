/* ============================================================
   WanderAlt — Mood chips
   ------------------------------------------------------------
   Renders the editorial mood filter strip into every element
   with class .mood-chips on the page.

   Vocabulary (10 tags drawn from brand voice, not Yelp):
     quiet · loud · indoors · outdoors · solo · social ·
     drinks · sober · walk-up · ticketed

   State lives in the URL hash: #mood=quiet,solo
   Multi-select, AND semantics (all active tags must match).

   Dispatches 'wa:mood-changed' with { tags: [...activeTags] }
   whenever the selection changes. Page scripts (briefing.js,
   search.js, map.js) listen and re-filter their content.

   Also exposes window.WA.MoodChips.active() → Set<string>
   so page scripts can check the initial state on load.

   Load order (all pages that use mood chips):
     catalog.js → city.js → supabase.js → auth.js →
     bookmark.js → mood-chips.js → [page script]
   ============================================================ */
(() => {
  const TAGS = [
    'quiet', 'loud', 'indoors', 'outdoors',
    'solo', 'social', 'drinks', 'sober',
    'walk-up', 'ticketed',
  ];

  /* ── URL hash helpers ─────────────────────────────────────── */

  const getActive = () => {
    const m = window.location.hash.match(/[#&]mood=([^&]+)/);
    if (!m) return new Set();
    return new Set(m[1].split(',').filter(t => TAGS.includes(t)));
  };

  const setHash = (tags) => {
    const arr   = [...tags];
    const base  = window.location.pathname + window.location.search;
    const other = window.location.hash.replace(/[#&]mood=[^&]*/g, '').replace(/^#$/, '');
    if (arr.length) {
      const sep = other ? other + '&' : '#';
      history.replaceState(null, '', base + sep + 'mood=' + arr.join(','));
    } else {
      history.replaceState(null, '', other ? base + '#' + other.replace(/^#/, '') : base);
    }
  };

  /* ── Render chips into every .mood-chips container ─────────── */

  const renderChips = (active) => {
    document.querySelectorAll('.mood-chips').forEach(container => {
      container.innerHTML = TAGS.map(tag =>
        `<button class="m-chip${active.has(tag) ? ' m-chip--on' : ''}" ` +
        `type="button" data-mood="${tag}">${tag}</button>`
      ).join('');
    });
  };

  /* ── Dispatch filter event to page scripts ─────────────────── */

  const notify = (active) => {
    document.dispatchEvent(new CustomEvent('wa:mood-changed', {
      detail: { tags: [...active] },
    }));
  };

  /* ── Wire click handler (delegated, single listener) ───────── */

  let wired = false;
  const wireClicks = () => {
    if (wired) return;
    wired = true;
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-mood]');
      if (!chip) return;
      const active = getActive();
      const tag    = chip.dataset.mood;
      if (active.has(tag)) active.delete(tag);
      else                 active.add(tag);
      setHash(active);
      renderChips(active);
      notify(active);
    });
  };

  /* ── Init ───────────────────────────────────────────────────── */

  const init = () => {
    const active = getActive();
    renderChips(active);
    wireClicks();
    /* If the page was loaded with a mood hash, fire immediately so
       page scripts can apply the filter on their first render.    */
    if (active.size > 0) notify(active);
  };

  /* Run after catalog-ready so catalog data is available when
     page scripts receive the initial wa:mood-changed event.     */
  document.addEventListener('wa:catalog-ready', init);

  /* Sync on browser back/forward. */
  window.addEventListener('hashchange', () => {
    const active = getActive();
    renderChips(active);
    notify(active);
  });

  /* Public API */
  window.WA             = window.WA || {};
  window.WA.MoodChips   = { active: getActive };
})();
