/* ============================================================
   WanderAlt — Dusk / Daybreak theme switch (board 4e)
   ------------------------------------------------------------
   Dusk (dark) is the default; Daybreak is the same DOM with the
   [data-theme="day"] token swap in styles.css. Loaded WITHOUT
   defer (like taste-flag.js) so the attribute lands before first
   paint — no flash of the wrong theme. CSP-clean external file.

   Appearance preference (localStorage `wa:appearance`):
     auto — follow the sun: Daybreak between civil dawn and civil
            dusk in the active city, Dusk otherwise. An explicit
            OS dark preference wins while on auto.
     dusk / day — manual override from Profile → Appearance.

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

  const apply = () => {
    const mode = resolve();
    document.documentElement.dataset.theme = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = mode === 'day' ? '#f4f1e8' : '#0a1011';
    document.dispatchEvent(new CustomEvent('wa:theme-changed', { detail: { theme: mode } }));
  };

  window.WA = window.WA || {};
  window.WA.Theme = {
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
  /* Re-resolve when the OS scheme flips while on auto. */
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => { if (pref() === 'auto') apply(); });
    } catch (_) { /* older engines */ }
  }
})();
