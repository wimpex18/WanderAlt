/* ============================================================
   report.js — "Flag a problem" on an event page.
   ------------------------------------------------------------
   One insert into problem_reports with a fixed reason and an optional
   note of at most 280 characters. The table accepts inserts only; the
   reviewer reads it at /review. Until the migration is applied the call
   fails and the page says so.

   window.WA.Report: .REASONS .send(pickId, reason, note) → Promise<boolean>
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const REASONS = [
    { id: 'time', label: 'Wrong time or date' },
    { id: 'venue', label: 'Wrong venue' },
    { id: 'cancelled', label: 'Cancelled or moved' },
    { id: 'duplicate', label: 'Listed twice' },
    { id: 'other', label: 'Something else' },
  ];

  const send = async (pickId, reason, note) => {
    if (!REASONS.some(r => r.id === reason) || !pickId) return false;
    const headers = window.WA.Auth && window.WA.Auth.isSignedIn() && window.WA.Auth.getAuthHeaders
      ? window.WA.Auth.getAuthHeaders()
      : { apikey: window.WA.ANON_KEY, Authorization: `Bearer ${window.WA.ANON_KEY}` };
    try {
      const r = await fetch(`${window.WA.BASE_URL || ''}/rest/v1/problem_reports`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ pick_id: String(pickId).slice(0, 80), reason, note: String(note || '').trim().slice(0, 280) || null }),
      });
      return r.ok;
    } catch { return false; }
  };

  window.WA.Report = { REASONS, send };
})();
