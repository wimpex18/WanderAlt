/* ============================================================
   share.js — the native share trigger, and nothing else.
   ------------------------------------------------------------
     WA.Share.url({ title, text, url }) -> Promise<'shared'|'copied'|'cancelled'|'failed'>
       Native share sheet when available, then clipboard, then no-op.
       Resolves with what happened so callers can update their label.
       Dismissing the OS sheet (AbortError) is 'cancelled', never a
       clipboard copy.

   Only detail.html loads it.
   ============================================================ */
(function () {
  'use strict';
  window.WA = window.WA || {};

  /* ---- Native share with graceful fallbacks ---------------- */
  async function shareUrl({ title, text, url } = {}) {
    const shareData = {
      title: title || 'WanderAlt',
      text:  text  || '',
      url:   url   || window.location.href,
    };
    /* navigator.share is gated to secure contexts + (often) a user
       gesture; this is always called from a click handler. */
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return 'shared';
      } catch (err) {
        /* AbortError = user dismissed the sheet; treat as a no-op,
           don't fall through to a surprise clipboard write. */
        if (err && err.name === 'AbortError') return 'cancelled';
        /* Any other failure (e.g. NotAllowedError) → try clipboard. */
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(shareData.url);
        return 'copied';
      } catch (_) { /* fall through */ }
    }
    return 'failed';
  }

  window.WA.Share = { url: shareUrl };
})();
