/* ============================================================
   WanderAlt — bookmark store utility
   ------------------------------------------------------------
   Primary store: localStorage (always available, instant).
   Secondary store: Supabase `bookmarks` table when signed in.

   Public API (window.WA.Bookmarks):
     get()           → { id: true, … }   — local state
     set(id, val)    → write local; if signed in, sync to cloud
     ids()           → [ id, … ]
     syncFromCloud() → pull cloud state, merge into localStorage,
                       dispatch 'wa:bookmarks-synced'

   On 'wa:signed-in': syncFromCloud() is called automatically.
   On 'wa:signed-out': cloud calls are silently skipped; local
   state is kept (user can still bookmark while offline/guest).

   Load order:
     catalog.js → supabase.js → auth.js → bookmark.js → [page]
   ============================================================ */
window.WA = window.WA || {};

window.WA.Bookmarks = (() => {
  const LOCAL_KEY = 'wanderalt:bookmarks:v1';
  /* Read city dynamically — city.js sets WA.CITY before bookmark.js runs. */
  const city = () => (window.WA && window.WA.CITY) || 'tallinn';

  /* ── localStorage helpers ────────────────────────────────── */

  const get = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
    catch { return {}; }
  };

  const _save = (store) => {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(store)); } catch {}
  };

  const ids = () => {
    const store = get();
    return Object.keys(store).filter(id => store[id]);
  };

  /* ── Cloud helpers (no-op when not signed in) ────────────── */

  const authHeaders = () => {
    const auth = window.WA && window.WA.Auth;
    if (!auth || !auth.isSignedIn()) return null;
    return auth.getAuthHeaders();
  };

  const BASE_URL = () => (window.WA && window.WA.BASE_URL) || '';

  const upsertCloud = async (id) => {
    const headers = authHeaders();
    if (!headers) return;
    try {
      await fetch(`${BASE_URL()}/rest/v1/bookmarks`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify({ pick_id: id, city: city() }),
      });
    } catch { /* silent — local state is source of truth */ }
  };

  const deleteCloud = async (id) => {
    const headers = authHeaders();
    if (!headers) return;
    const auth = window.WA.Auth;
    if (!auth || !auth.session) return;
    try {
      await fetch(
        `${BASE_URL()}/rest/v1/bookmarks?pick_id=eq.${encodeURIComponent(id)}&city=eq.${city()}`,
        { method: 'DELETE', headers }
      );
    } catch { /* silent */ }
  };

  /* ── Public: set ─────────────────────────────────────────── */

  const set = (id, val) => {
    const store = get();
    if (val) store[id] = true;
    else delete store[id];
    _save(store);

    /* Fire and forget cloud sync. */
    if (val) upsertCloud(id);
    else     deleteCloud(id);
  };

  /* ── Public: syncFromCloud ───────────────────────────────── */

  const syncFromCloud = async () => {
    const headers = authHeaders();
    if (!headers) return;

    try {
      const res = await fetch(
        `${BASE_URL()}/rest/v1/bookmarks?city=eq.${city()}&select=pick_id`,
        { headers }
      );
      if (!res.ok) return;

      const rows  = await res.json();
      const store = get();

      /* Merge: cloud wins for adds; local removals are preserved.
         (Simple merge — cloud is authoritative for items present.) */
      rows.forEach(r => { store[r.pick_id] = true; });
      _save(store);

      document.dispatchEvent(new CustomEvent('wa:bookmarks-synced'));
    } catch { /* silent */ }
  };

  /* ── Auto-sync on sign-in ────────────────────────────────── */

  document.addEventListener('wa:signed-in', () => syncFromCloud());

  return { get, set, ids, syncFromCloud };
})();
