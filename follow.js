/* ============================================================
   follow.js — WA.Follows, the store 6e assumed already existed.
   ------------------------------------------------------------
   The handoff map says of curator.js: "rewrite → source.js. Group by
   venue/feed, KEEP the follow store." There is no follow store to keep.
   Verified rather than assumed: no `follow` code in any page script, no
   wa:follow* key among the fifteen localStorage keys the product uses,
   no follows table, and `profiles` carries only user_id / city /
   digest_enabled. Following was drawn in 3b and never built.

   So it is new, and it lands here rather than inside source.js because
   it is behaviour, not a screen: Explore will want to lift followed
   venues, You will want to list them, and a store that lives inside one
   page script is a store the other pages hand-copy.

   Deliberately localStorage-only for now. bookmark.js mirrors to a
   Supabase table because saves are the thing a reader would be upset to
   lose between devices; a follow is a weaker signal, and inventing a
   `follows` table plus an RLS INSERT policy before the screen that
   writes to it exists is schema written on spec. The API below is the
   same shape as WA.Bookmarks, so adding cloud sync later is an addition
   to this file and nothing else.

   Public API (window.WA.Follows):
     get()            → { sourceKey: true, … }
     has(key)         → boolean
     set(key, on)     → write; dispatches 'wa:follows-changed'
     toggle(key)      → flips and returns the new state
     keys()           → [ sourceKey, … ]

   A sourceKey identifies a venue or feed, not a person — that is the
   whole point of the change from curators. Callers should pass the
   value they already display: the venue name or the source channel,
   lowercased and trimmed by keyOf() so "Paavli Kultuurivabrik" and
   "paavli kultuurivabrik " are one thing.
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
