/* ============================================================
   follow.js — WA.Follows.
   ------------------------------------------------------------
   localStorage-only follow store, same shape as WA.Bookmarks. Drives
   "Only sources I follow" on Tonight and the list on You.

   Public API (window.WA.Follows):
     get()            → { sourceKey: true, … }
     has(key)         → boolean
     set(key, on)     → write; dispatches 'wa:follows-changed'
     toggle(key)      → flips and returns the new state
     keys()           → [ sourceKey, … ]

   A sourceKey identifies a venue or feed. Callers pass the value they
   display (venue name or source channel); keyOf() lowercases and trims.
   ============================================================ */
window.WA = window.WA || {};

window.WA.Follows = (() => {
  'use strict';

  const LOCAL_KEY = 'wa:follows';

  /* Follows are per-city like bookmarks: the same venue name can exist
     in two cities, and a reader who follows a Riga venue should not see
     it counted while browsing Tallinn. */
  const city = () => (window.WA && window.WA.CITY) || 'tallinn';

  const keyOf = (source) => {
    const s = String(source == null ? '' : source).toLowerCase().trim();
    return s ? `${city()}|${s}` : '';
  };

  const readAll = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
    catch (_) { return {}; }   /* corrupt or blocked — behave as empty */
  };

  const writeAll = (store) => {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(store)); }
    catch (_) { /* private mode / quota — following degrades, nothing breaks */ }
  };

  /* Only the active city's entries, keyed by the bare source name so
     callers never have to know about the city prefix. */
  const get = () => {
    const prefix = `${city()}|`;
    const out = {};
    const all = readAll();
    for (const k of Object.keys(all)) {
      if (all[k] && k.startsWith(prefix)) out[k.slice(prefix.length)] = true;
    }
    return out;
  };

  const has = (source) => {
    const k = keyOf(source);
    return !!(k && readAll()[k]);
  };

  const set = (source, on) => {
    const k = keyOf(source);
    if (!k) return false;
    const all = readAll();
    if (on) all[k] = true; else delete all[k];
    writeAll(all);
    document.dispatchEvent(new CustomEvent('wa:follows-changed', {
      detail: { source: String(source), following: !!on },
    }));
    return !!on;
  };

  const toggle = (source) => set(source, !has(source));

  const keys = () => Object.keys(get());

  return { get, has, set, toggle, keys, keyOf };
})();
