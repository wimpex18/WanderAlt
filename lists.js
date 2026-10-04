/* ============================================================
   lists.js — WA.Lists. Named collections of saves.
   ------------------------------------------------------------
   A list is a name and a set of pick ids, not a second bookmark store:
   adding to a list also saves the pick, and removing a save removes it
   from every list.

   SaveStore keeps account data and pending edits locally until the cloud
   confirms them. Concurrent edits to one list use the last synced version.
   ============================================================ */
window.WA = window.WA || {};

window.WA.Lists = (() => {
  'use strict';

  const city = () => window.WA.CITY || 'tallinn';
  const store = window.WA.SaveStore('wa:lists:v1', 'wa:lists-changed', async request => {
    const [lists, items] = await Promise.all([
      request('saved_lists?select=id,name,city,created_at').then(r => r.json()),
      request('saved_list_items?select=list_id,pick_id').then(r => r.json()),
    ]);
    return Object.fromEntries(lists.map(l => [l.id, { id: l.id, name: l.name, city: l.city,
      createdAt: l.created_at, items: items.filter(r => r.list_id === l.id).map(r => r.pick_id) }]));
  }, async (id, value, request, who) => {
    const filter = `list_id=eq.${encodeURIComponent(id)}`;
    if (!value) {
      await request(`saved_list_items?${filter}`, { method: 'DELETE' });
      await request(`saved_lists?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return;
    }
    await request('saved_lists', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: who, id, name: value.name, city: value.city, created_at: value.createdAt }) });
    const rows = await (await request(`saved_list_items?${filter}&select=pick_id`)).json();
    const wanted = value.items || [];
    for (const row of rows) if (!wanted.includes(row.pick_id))
      await request(`saved_list_items?${filter}&pick_id=eq.${encodeURIComponent(row.pick_id)}`, { method: 'DELETE' });
    if (wanted.length) await request('saved_list_items', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify(wanted.map(pick_id => ({ user_id: who, list_id: id, pick_id }))) });
  });
  const get = store.get;
  /* Each changed list is an outbox entry; missing lists are tombstones. */
  const _save = (next) => {
    const prev = get();
    new Set([...Object.keys(prev), ...Object.keys(next)]).forEach(id => {
      if (JSON.stringify(prev[id]) !== JSON.stringify(next[id])) store.set(id, next[id] || null);
    });
  };
  const newId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ── Reads ───────────────────────────────────────────────── */

  /* Newest first: a list you just made is the one you are filling. */
  const all = () => Object.values(get())
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const forCity = (c) => all().filter(l => l.city === (c || city()));

  const byId = (id) => get()[id] || null;

  const items = (id) => (byId(id) || {}).items || [];
  const canonical = (id) => window.WA.canonicalId ? window.WA.canonicalId(id) : id;

  /* Which lists a pick is in — drives the checked state in the sheet. */
  const listsFor = (pickId) => all().filter(l => (l.items || []).some(id => canonical(id) === canonical(pickId)));

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
    return l.id;
  };

  const rename = (id, name) => {
    const clean = String(name || '').trim().slice(0, 60);
    const store = get();
    if (!store[id] || !clean) return;
    store[id].name = clean;
    _save(store);
  };

  const remove = (id) => {
    const store = get();
    if (!store[id]) return;
    delete store[id];
    _save(store);
    /* The items go with it. Deleting the list does NOT unsave the
       picks — they fall back to the plain shortlist, which is what a
       reader expects from removing a folder rather than its contents. */
  };

  const add = (listId, pickId) => {
    const store = get();
    const l = store[listId];
    if (!l || !pickId) return;
    l.items = l.items || [];
    if (!l.items.some(id => canonical(id) === canonical(pickId))) l.items.push(pickId);
    _save(store);
    /* Adding to a list saves the pick. The two stores cannot be allowed
       to disagree about what is saved. */
    if (window.WA.Bookmarks) window.WA.Bookmarks.set(pickId, true);
  };

  const removeItem = (listId, pickId) => {
    const store = get();
    const l = store[listId];
    if (!l) return;
    l.items = (l.items || []).filter(x => canonical(x) !== canonical(pickId));
    _save(store);
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
      }
    });
    if (touched) _save(store);
  };

  /* The name sheets (Saved, and Add to a list on an event page) share two small conveniences:
     tapping a suggestion fills the name, and Return creates the list. */
  const SUGGEST = ['Saturday night', 'Date night', 'Rainy day', 'Out of town guests'];
  const suggestions = () => `<div class="wa-ideas" role="group" aria-label="Name ideas">${SUGGEST.map(s =>
    `<button class="wa-ideas__chip" type="button" data-suggest="${s}">${s}</button>`).join('')}</div>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-suggest]');
    const input = document.getElementById('list-name');
    if (!b || !input) return;
    input.value = b.dataset.suggest;
    input.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target || e.target.id !== 'list-name') return;
    const go = document.getElementById('list-create');
    if (go) { e.preventDefault(); go.click(); }
  });

  return {
    suggestions,
    all, forCity, byId, items, listsFor,
    create, rename, remove, add, removeItem, purge,
    pendingSync: store.pending, syncFromCloud: store.sync,
  };
})();
