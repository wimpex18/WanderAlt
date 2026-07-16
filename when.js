/* ============================================================
   when.js — the ONE shared definition of "tonight" / "this week".
   ------------------------------------------------------------
   Why this exists: the DB flags (picks.tonight / picks.this_week) are
   maintained by lifecycle crons that are FROZEN pre-release, so the
   flags aged to false while pages kept trusting them — Today then
   fabricated a "This week" list via its never-blank fallback while
   Discover's thisweek filter honestly showed 0. One derivation, stamped
   onto every catalog entry, keeps all surfaces telling the same truth.

   Semantics mirror the pipeline's reset_tonight() SQL:
   - picks.day holds 'Mon'…'Sun' abbreviations (Europe/Tallinn clock —
     all three cities share the Baltic timezone) or the special
     value 'Tonight'.
   - tonight  = explicit flag OR day === 'Tonight' OR day === today.
   - thisWeek = explicit flag OR the pick is dated at all (the catalog
     is a weekly edition; a dated pick belongs to the current week).
   Explicit true flags are always respected — derivation only widens.

   Both catalog paths call WA.when.stampAll(): catalog.js (static
   fallback) and supabase.js (live). Loads before catalog.js on every
   page that includes it (deferred scripts execute in document order).
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const todayAbbrev = () => {
    try {
      return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Tallinn' })
        .format(new Date());
    } catch {
      return DAYS[new Date().getDay()]; /* local clock — same for Baltic users */
    }
  };

  const norm = (d) => String(d || '').trim().slice(0, 3).toLowerCase();

  const isTonight = (e) => {
    if (e.tonight === true) return true;
    const d = norm(e.day);
    return d !== '' && (d === 'ton' || d === norm(todayAbbrev()));
  };

  const isThisWeek = (e) => e.thisWeek === true || String(e.day || '').trim() !== '';

  /* Stamp derived flags in place; explicit true flags survive. Returns list. */
  const stampAll = (list) => {
    for (const e of list || []) {
      e.tonight  = isTonight(e);
      e.thisWeek = isThisWeek(e);
    }
    return list;
  };

  window.WA.when = { todayAbbrev, isTonight, isThisWeek, stampAll };
})();
