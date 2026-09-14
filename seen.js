/* ============================================================
   seen.js — WA.Seen, the opened/saved log.
   ------------------------------------------------------------
   A capped, FIFO-trimmed set of pick ids the reader opened or saved.
   Powers the opt-in "hide things I've seen" filter; You can wipe it.

   Public API (window.WA.Seen):
     mark(id)      → record an open
     has(id)       → boolean
     ids()         → [ id, … ]  newest last
     count()       → number
     clear()       → wipe (the reset in You)
     filter(list)  → drop entries already seen
   ============================================================ */
window.WA = window.WA || {};

window.WA.Seen = (() => {
  'use strict';

  const KEY = 'wa:seen:v1';
  const CAP = 400;

  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
    } catch (_) { return []; }
  };

  const write = (arr) => {
    try { localStorage.setItem(KEY, JSON.stringify(arr.slice(-CAP))); }
    catch (_) { /* private mode / quota — the feature degrades, nothing breaks */ }
  };

  const mark = (id) => {
    const key = String(id || '').trim();
    if (!key) return;
    const arr = read().filter(x => x !== key);   /* re-open moves it to newest */
    arr.push(key);
    write(arr);
    document.dispatchEvent(new CustomEvent('wa:seen-changed', { detail: { id: key } }));
  };

  const has = (id) => read().includes(String(id || '').trim());

  /* Saving something counts as seeing it — the two signals mean the same
     thing for this filter, and bookmark.js already records the save. */
  document.addEventListener('wa:bookmarks-synced', () => {
    const b = window.WA.Bookmarks;
    if (!b) return;
    const arr = read();
    let touched = false;
    for (const id of Object.keys(b.get() || {})) {
      if (!arr.includes(id)) { arr.push(id); touched = true; }
    }
    if (touched) write(arr);
  });

  return {
    mark, has,
    ids:    () => read(),
    count:  () => read().length,
    clear:  () => { write([]); document.dispatchEvent(new CustomEvent('wa:seen-changed', { detail: { cleared: true } })); },
    filter: (list) => {
      const s = new Set(read());
      return (list || []).filter(e => e && !s.has(e.id));
    },
  };
})();
