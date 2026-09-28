/* ============================================================
   going.js — "I'm going", and how many others are.
   ------------------------------------------------------------
   The mark lives in this browser (wa:going:v1) and, when signed in, in
   the going table (own rows only). The public count comes from
   going_counts, which a trigger keeps; nobody sees who else is going.
   Until the migration is applied the count call fails quietly and the
   page shows no number.

   window.WA.Going: .has(id) .set(id, on) .count(id) → Promise<number|null>
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const KEY = 'wa:going:v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };

  const base = () => window.WA.BASE_URL || '';
  const signedIn = () => !!(window.WA.Auth && window.WA.Auth.isSignedIn());
  const anon = () => ({ apikey: window.WA.ANON_KEY, Authorization: `Bearer ${window.WA.ANON_KEY}` });

  const cloud = async (id, on) => {
    if (!signedIn()) return;
    const headers = window.WA.Auth.getAuthHeaders();
    try {
      if (on) {
        await fetch(`${base()}/rest/v1/going`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
          body: JSON.stringify({ pick_id: id }),
        });
      } else {
        await fetch(`${base()}/rest/v1/going?pick_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      }
    } catch { /* the local mark stands */ }
  };

  const has = (id) => !!read()[id];
  const set = (id, on) => {
    const s = read();
    if (on) s[id] = Date.now(); else delete s[id];
    write(s);
    return cloud(id, on);
  };

  const count = async (id) => {
    try {
      const r = await fetch(`${base()}/rest/v1/going_counts?pick_id=eq.${encodeURIComponent(id)}&select=n`, { headers: anon() });
      if (!r.ok) return null;
      const rows = await r.json();
      return rows.length ? Number(rows[0].n) || 0 : 0;
    } catch { return null; }
  };

  /* Signing in carries marks made while signed out, and brings back
     marks made on another device. */
  document.addEventListener('wa:signed-in', async () => {
    const s = read();
    Object.keys(s).forEach(id => cloud(id, true));
    try {
      const r = await fetch(`${base()}/rest/v1/going?select=pick_id`, { headers: window.WA.Auth.getAuthHeaders() });
      if (!r.ok) return;
      (await r.json()).forEach(row => { s[row.pick_id] = s[row.pick_id] || Date.now(); });
      write(s);
      document.dispatchEvent(new CustomEvent('wa:going-synced'));
    } catch { /* offline */ }
  });

  window.WA.Going = { has, set, count, ids: () => Object.keys(read()) };
})();
