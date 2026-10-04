/* Saves are instant locally; SaveStore retries account writes durably. */
window.WA = window.WA || {};
window.WA.Bookmarks = (() => {
  const city = () => window.WA.CITY || 'tallinn';
  const canonical = id => window.WA.canonicalId ? window.WA.canonicalId(id) : id;
  const store = window.WA.SaveStore('wanderalt:bookmarks:v1', 'wa:bookmarks-synced', async request => {
    const rows = await (await request('bookmarks?select=pick_id')).json();
    return Object.fromEntries(rows.map(r => [r.pick_id, true]));
  }, async (id, value, request, who) => {
    if (value) await request('bookmarks', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ user_id: who, pick_id: id, city: city() }) });
    else await request(`bookmarks?pick_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  });
  const get = () => Object.fromEntries(Object.entries(store.get()).filter(([, on]) => on).map(([id]) => [canonical(id), true]));
  const set = (id, val) => {
    id = canonical(id);
    const aliases = [...new Set([id, ...Object.keys(store.get()).filter(key => canonical(key) === id)])];
    if (val) store.set(id, true);
    else aliases.forEach(key => { store.set(key, null); if (window.WA.Lists) window.WA.Lists.purge(key); });
  };
  return { get, set, ids: () => Object.keys(get()), syncConfirmed: store.confirmed, pendingSync: store.pending, syncFromCloud: store.sync };
})();
