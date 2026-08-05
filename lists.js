/* ============================================================
   lists.js — WA.Lists. Named collections of saves (5f).

   "Saved borrows their wishlist grid but sorts by expiry, not by date
   added. Time-bound things first… then lists as four-up mosaics; then
   the honest note about what died."

   A list is a name and a set of pick ids. It is deliberately NOT a
   second bookmark store: adding to a list also saves the pick, and
   removing a save removes it from every list, so the two can never
   disagree about what is saved. Saving without choosing a list stays
   the default path — the reader who never makes one sees exactly what
   they saw before, which is the whole reason lists are additive here
   rather than a step in the way.

   Modelled on bookmark.js line for line: localStorage is the source of
   truth, cloud is a copy that only exists once signed in, every network
   call is fire-and-forget and silent on failure. If you change the
   shape of the stored object, bump the :v1 suffix and write the
   migration in this file — that is the repo's rule and this store is
   the one most likely to grow a field.
   ============================================================ */
window.WA = window.WA || {};

window.WA.Lists = (() => {
  'use strict';

  const LOCAL_KEY = 'wa:lists:v1';
  const city = () => (window.WA && window.WA.CITY) || 'tallinn';
  const BASE_URL = () => (window.WA && window.WA.BASE_URL) || '';

  /* ── localStorage ────────────────────────────────────────── */

  const get = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
    catch { return {}; }
  };

  const _save = (store) => {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(store)); } catch (_) { /* storage blocked */ }
    document.dispatchEvent(new CustomEvent('wa:lists-changed'));
  };

  /* Client-generated, because a list has to be creatable signed out and
     keep its identity if the reader signs in later. A server default
     would mint a second id for a list that already exists here. */
  const newId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ── Cloud (no-op when signed out) ───────────────────────── */

  const authHeaders = () => {
    const auth = window.WA && window.WA.Auth;
    if (!auth || !auth.isSignedIn()) return null;
    return auth.getAuthHeaders();
  };

  const post = async (path, body) => {
    const headers = authHeaders();
    if (!headers) return;
    try {
      await fetch(`${BASE_URL()}/rest/v1/${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(body),
      });
    } catch (_) { /* silent — local is the source of truth */ }
  };

  const del = async (path) => {
    const headers = authHeaders();
    if (!headers) return;
    try { await fetch(`${BASE_URL()}/rest/v1/${path}`, { method: 'DELETE', headers }); }
    catch (_) { /* silent */ }
  };

  /* ── Reads ───────────────────────────────────────────────── */

  /* Newest first: a list you just made is the one you are filling. */
  const all = () => Object.values(get())
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const forCity = (c) => all().filter(l => l.city === (c || city()));

  const byId = (id) => get()[id] || null;

  const items = (id) => (byId(id) || {}).items || [];

  /* Which lists a pick is in — drives the checked state in the sheet. */
  const listsFor = (pickId) => all().filter(l => (l.items || []).includes(pickId));

  /* ── Writes ──────────────────────────────────────────────── */

  const create = (name) => {
    const clean = String(name || '').trim().slice(0, 60);
    if (!clean) return null;
    const store = get();
    /* Same name in the same city is the same list. Two "Kalamaja day
       off"s would be indistinguishable in the mosaic. */
    const existing = Object.values(store)
      .find(l => l.city === city() && l.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing.id;

    const l = { id: newId(), name: clean, city: city(), createdAt: new Date().toISOString(), items: [] };
    store[l.id] = l;
    _save(store);
    post('saved_lists', { id: l.id, name: l.name, city: l.city });
    return l.id;
  };

  const rename = (id, name) => {
    const clean = String(name || '').trim().slice(0, 60);
    const store = get();
    if (!store[id] || !clean) return;
    store[id].name = clean;
    _save(store);
    post('saved_lists', { id, name: clean, city: store[id].city });
  };

  const remove = (id) => {
    const store = get();
    if (!store[id]) return;
    delete store[id];
    _save(store);
    /* The items go with it. Deleting the list does NOT unsave the
       picks — they fall back to the plain shortlist, which is what a
       reader expects from removing a folder rather than its contents. */
    del(`saved_list_items?list_id=eq.${encodeURIComponent(id)}`);
    del(`saved_lists?id=eq.${encodeURIComponent(id)}`);
  };

  const add = (listId, pickId) => {
    const store = get();
    const l = store[listId];
    if (!l || !pickId) return;
    l.items = l.items || [];
    if (!l.items.includes(pickId)) l.items.push(pickId);
    _save(store);
    /* Adding to a list saves the pick. The two stores cannot be allowed
       to disagree about what is saved. */
    if (window.WA.Bookmarks) window.WA.Bookmarks.set(pickId, true);
    post('saved_list_items', { list_id: listId, pick_id: pickId });
  };

  const removeItem = (listId, pickId) => {
    const store = get();
    const l = store[listId];
    if (!l) return;
    l.items = (l.items || []).filter(x => x !== pickId);
    _save(store);
    del(`saved_list_items?list_id=eq.${encodeURIComponent(listId)}&pick_id=eq.${encodeURIComponent(pickId)}`);
  };

  /* Unsaving a pick has to drop it from every list, or Saved shows a
     list containing something the reader has unsaved. */
  const purge = (pickId) => {
    const store = get();
    let touched = false;
    Object.values(store).forEach(l => {
      if ((l.items || []).includes(pickId)) {
        l.items = l.items.filter(x => x !== pickId);
        touched = true;
        del(`saved_list_items?pick_id=eq.${encodeURIComponent(pickId)}&list_id=eq.${encodeURIComponent(l.id)}`);
      }
    });
    if (touched) _save(store);
  };

  /* ── Sync on sign-in ─────────────────────────────────────── */

  const syncFromCloud = async () => {
    const headers = authHeaders();
    if (!headers) return;
    try {
      const [lr, ir] = await Promise.all([
        fetch(`${BASE_URL()}/rest/v1/saved_lists?select=id,name,city,created_at`, { headers }),
        fetch(`${BASE_URL()}/rest/v1/saved_list_items?select=list_id,pick_id`, { headers }),
      ]);
      if (!lr.ok) return;
      const lists = await lr.json();
      const rows  = ir.ok ? await ir.json() : [];
      const store = get();

      /* Cloud wins for presence, same merge rule bookmark.js uses: a
         list that exists in either place exists. */
      lists.forEach(l => {
        store[l.id] = store[l.id] || { id: l.id, items: [] };
        store[l.id].name = l.name;
        store[l.id].city = l.city;
        store[l.id].createdAt = l.created_at || store[l.id].createdAt || new Date().toISOString();
      });
      rows.forEach(r => {
        const l = store[r.list_id];
        if (!l) return;
        l.items = l.items || [];
        if (!l.items.includes(r.pick_id)) l.items.push(r.pick_id);
      });
      _save(store);
    } catch (_) { /* silent */ }
  };

  document.addEventListener('wa:signed-in', () => syncFromCloud());

  return {
    all, forCity, byId, items, listsFor,
    create, rename, remove, add, removeItem, purge,
    syncFromCloud,
  };
})();
