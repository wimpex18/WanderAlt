/* ============================================================
   WanderAlt — appearance: Day / Night / Dusk
   ------------------------------------------------------------
   Day is the default now, not Night. Most deciding happens in
   daylight, and outdoors in daylight paper beats glass; Night
   arrives at dusk. Loaded WITHOUT defer so the attribute lands
   before first paint — no flash of the wrong theme. CSP-clean.

   Three explicit options, persisted (localStorage `wa:appearance`).
   The automation survives as one of the three rather than as an
   invisible rule, which is both what the direction asked for and
   what accessibility needs — a reader in bright sun and a reader in
   a dark bar both have to be able to override us.

     'day'   → Day    — always the paper theme
     'dusk'  → Night  — always the near-black theme
     'auto'  → Dusk   — follow the sun in the active city

   The stored VALUES are unchanged from the previous two-plus-auto
   scheme on purpose: everyone who already set a preference keeps it.
   Only the labels are new, and WA.Theme.OPTIONS owns the mapping so
   no page hand-writes it.

   The DOM attribute stays data-theme="day" | "dusk" — wa.css keys
   its night block off exactly that.

   The sun table is PRECOMPUTED (no API — the €45 lesson): civil
   dawn/dusk as fractional local hours, mid-month, per city. ±15
   minutes of truth is fine; this drives a theme, not an almanac.
   White-nights months round to just-before-midnight.
   ============================================================ */
(() => {
  'use strict';
  const KEY = 'wa:appearance';   /* 'auto' | 'dusk' | 'day' */

  const SUN = {
    /*            J    F    M    A    M    J    J    A    S    O    N    D  */
    tallinn:  { dawn: [8.9, 7.9, 6.6, 5.3, 3.9, 3.0, 3.5, 4.9, 6.1, 7.3, 8.2, 8.9],
                dusk: [16.4, 17.7, 19.0, 21.2, 22.7, 23.8, 23.3, 21.9, 20.3, 18.8, 16.7, 15.9] },
    helsinki: { dawn: [9.0, 8.0, 6.6, 5.2, 3.7, 2.6, 3.2, 4.8, 6.1, 7.4, 8.4, 9.1],
                dusk: [16.3, 17.7, 19.1, 21.3, 22.9, 23.9, 23.6, 22.0, 20.3, 18.7, 16.6, 15.8] },
    riga:     { dawn: [8.6, 7.7, 6.5, 5.4, 4.2, 3.6, 4.0, 5.1, 6.1, 7.1, 7.9, 8.5],
                dusk: [16.8, 17.9, 19.0, 21.0, 22.2, 23.0, 22.8, 21.6, 20.2, 18.8, 16.9, 16.2] },
    vilnius:  { dawn: [8.3, 7.5, 6.4, 5.4, 4.4, 3.9, 4.2, 5.2, 6.1, 7.0, 7.7, 8.2],
                dusk: [16.9, 17.9, 18.9, 20.8, 21.9, 22.6, 22.4, 21.3, 20.0, 18.7, 16.9, 16.3] },
  };

  const pref = () => { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } };
  const city = () => { try { return localStorage.getItem('wa:city') || 'tallinn'; } catch { return 'tallinn'; } };
  const sun  = () => SUN[city()] || SUN.tallinn;

  const isDayNow = () => {
    const t = sun();
    const m = new Date().getMonth();
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    return h >= t.dawn[m] && h < t.dusk[m];
  };

  const resolve = () => {
    const p = pref();
    if (p === 'day' || p === 'dusk') return p;
    /* auto: an explicit OS dark preference wins; else follow the sun. */
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dusk';
    return isDayNow() ? 'day' : 'dusk';
  };

  /* The browser chrome colour has to match the ground the page actually
     paints. wa.css uses #f2efe6 by day and #0a1011 at night, but hard-
     coding either mis-tints anything that does not, and rots the next
     time a ground value moves — which is exactly what happened during
     the migration, when half the pages were still on a stylesheet with
     a different cream.

     Ask the page rather than guess. --ground is wa.css's token; if it is
     absent this is an un-migrated page, and the honest answer is what
     <body> actually paints. Reading the old stylesheet's token instead
     was the first attempt and it was wrong — --c-paper is that system's
     CARD colour (#ffffff), not its ground (#f4f1e8), so the chrome came
     out white against cream.

     <body> does not exist yet on the pre-paint call, which is why the
     literal fallback stays and why settle() runs once the DOM is up. */
  const rgbToHex = (v) => {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v || '');
    if (!m) return '';
    return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('');
  };

  const groundColour = (mode) => {
    try {
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue('--ground').trim();
      if (token) return token;
      if (document.body) {
        const painted = rgbToHex(getComputedStyle(document.body).backgroundColor);
        if (painted) return painted;
      }
    } catch (_) { /* an engine that dislikes this pre-paint — fall through */ }
    return mode === 'day' ? '#f2efe6' : '#0a1011';
  };

  const apply = () => {
    const mode = resolve();
    document.documentElement.dataset.theme = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = groundColour(mode);
    document.dispatchEvent(new CustomEvent('wa:theme-changed', { detail: { theme: mode } }));
  };

  /* Second pass once <body> exists, so un-migrated pages — which have no
     --ground to read pre-paint — end up with the colour they really are. */
  const settle = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = groundColour(resolve());
  };

  window.WA = window.WA || {};
  window.WA.Theme = {
    /* The Appearance control renders straight from this, so the label
       and the stored value can never drift apart. */
    OPTIONS: [
      { value: 'day',  label: 'Day' },
      { value: 'dusk', label: 'Night' },
      { value: 'auto', label: 'Dusk' },
    ],
    apply,
    resolve,
    get: pref,
    set(v) {
      try { localStorage.setItem(KEY, v); } catch (_) { /* storage blocked */ }
      apply();
    },
    /* "DUSK AT 21:14" — tonight's switch time for the Appearance row. */
    duskLabel() {
      const d = sun().dusk[new Date().getMonth()];
      const h = Math.min(Math.floor(d), 23);
      const mm = Math.round((d - Math.floor(d)) * 60) % 60;
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    },
  };

  apply();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', settle, { once: true });
  } else {
    settle();
  }

  /* Re-resolve when the OS scheme flips while on auto. */
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => { if (pref() === 'auto') apply(); });
    } catch (_) { /* older engines */ }
  }
})();
