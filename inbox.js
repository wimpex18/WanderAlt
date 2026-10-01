/* ============================================================
   inbox.js — WA.Inbox, the in-app notes.
   ------------------------------------------------------------
   The alert job writes a row for a signed-in reader when a saved or
   going event changes, and once a week for places they follow. This
   module reads their own rows (RLS), keeps the unread count, and puts a
   dot on the You links. A missing table or a signed-out reader leaves it
   empty and silent.
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  let unread = 0;
  const base = () => `${window.WA.BASE_URL}/rest/v1/notifications`;
  const headers = () => window.WA.Auth.getAuthHeaders();
  const signedIn = () => !!(window.WA.Auth && window.WA.Auth.isSignedIn && window.WA.Auth.isSignedIn());

  const paint = () => {
    document.querySelectorAll('[data-nav="profile"], #account').forEach((a) => {
      if (unread > 0) { a.setAttribute('data-unread', String(unread)); a.setAttribute('aria-label', `You, ${unread} unread`); }
      else { a.removeAttribute('data-unread'); a.setAttribute('aria-label', 'You'); }
    });
  };

  const refresh = async () => {
    if (!signedIn()) { unread = 0; paint(); return; }
    try {
      const r = await fetch(`${base()}?select=id&read_at=is.null&limit=1`, { headers: { ...headers(), Prefer: 'count=exact' } });
      if (r.ok) {
        const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
        unread = m ? +m[1] : 0;
      }
    } catch (_) { /* offline: keep what we had */ }
    paint();
  };

  /* Newest first, up to 50. Null when the list cannot be read. */
  const list = async () => {
    if (!signedIn()) return null;
    try {
      const r = await fetch(`${base()}?select=id,kind,title,body,url,created_at,read_at&order=created_at.desc&limit=50`, { headers: headers() });
      return r.ok ? await r.json() : null;
    } catch (_) { return null; }
  };

  const markRead = async () => {
    if (!signedIn() || !unread) return;
    try {
      const r = await fetch(`${base()}?read_at=is.null`, {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ read_at: new Date().toISOString() }),
      });
      if (r.ok) { unread = 0; paint(); }
    } catch (_) { /* tried; the dot stays */ }
  };

  const clear = async () => {
    if (!signedIn()) return false;
    try {
      const r = await fetch(`${base()}?id=not.is.null`, { method: 'DELETE', headers: { ...headers(), Prefer: 'return=minimal' } });
      if (r.ok) { unread = 0; paint(); return true; }
    } catch (_) { /* offline */ }
    return false;
  };

  window.WA.Inbox = { refresh, list, markRead, clear, unread: () => unread };

  document.addEventListener('wa:signed-in', refresh);
  document.addEventListener('wa:signed-out', () => { unread = 0; paint(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
})();
