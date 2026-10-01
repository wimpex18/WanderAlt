/* ============================================================
   push.js — notifications on this device.
   ------------------------------------------------------------
   Opt-in only, from You. Asking for permission happens on the tap, never
   on load. The subscription is stored in push_subscriptions (own rows
   only); pipeline/digest.ts sends to it. Until the VAPID public key below
   is set the switch stays hidden, so nothing half-works.

   iPhone: web push exists only for a site added to the Home Screen, and
   in the EU it may not work at all; the page says so instead of hiding
   the reason.

   window.WA.Push: .state() → Promise<'unconfigured'|'unsupported'|'install'|'denied'|'off'|'on'>
                   .enable() → Promise<boolean>   .disable() → Promise<void>
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  /* The public half of the VAPID pair (`npx web-push generate-vapid-keys`,
     private half in the repository secret VAPID_PRIVATE_KEY). Public by design. */
  const VAPID_PUBLIC = '';

  const base = () => window.WA.BASE_URL || '';
  const authed = () => !!(window.WA.Auth && window.WA.Auth.isSignedIn && window.WA.Auth.isSignedIn());
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  const key = () => {
    const pad = '='.repeat((4 - VAPID_PUBLIC.length % 4) % 4);
    const raw = atob((VAPID_PUBLIC + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  };
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const registration = async () => {
    try { return await navigator.serviceWorker.ready; } catch (_) { return null; }
  };

  const state = async () => {
    if (!VAPID_PUBLIC) return 'unconfigured';
    if (!('serviceWorker' in navigator)) return 'unsupported';
    if (!('PushManager' in window) || !('Notification' in window)) return ios() && !standalone() ? 'install' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await registration();
    const sub = reg && await reg.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  };

  const enable = async () => {
    if (!authed() || !VAPID_PUBLIC) return false;
    try {
      if (await Notification.requestPermission() !== 'granted') return false;
      const reg = await registration();
      if (!reg) return false;
      const sub = (await reg.pushManager.getSubscription()) ||
        await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() });
      const j = sub.toJSON();
      const r = await fetch(`${base()}/rest/v1/push_subscriptions`, {
        method: 'POST',
        headers: { ...window.WA.Auth.getAuthHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ endpoint: sub.endpoint, p256dh: (j.keys && j.keys.p256dh) || b64(sub.getKey('p256dh')), auth: (j.keys && j.keys.auth) || b64(sub.getKey('auth')) }),
      });
      return r.ok;
    } catch (_) { return false; }
  };

  const disable = async () => {
    try {
      const reg = await registration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (!sub) return;
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      if (authed()) {
        await fetch(`${base()}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE', headers: window.WA.Auth.getAuthHeaders() });
      }
    } catch (_) { /* the browser forgets it either way */ }
  };

  window.WA.Push = { state, enable, disable };
})();
