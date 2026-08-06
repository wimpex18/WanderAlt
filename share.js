/* ============================================================
   share.js — the native share trigger, and nothing else.
   ------------------------------------------------------------
   Exposes window.WA.Share with one method, no dependencies and
   CSP-safe (external file, no inline):

     WA.Share.url({ title, text, url }) -> Promise<'shared'|'copied'|'cancelled'|'failed'>
       Uses the native OS share sheet (navigator.share) when
       available — the right pattern on mobile in 2026 — and falls
       back to clipboard copy, then to a no-op. Resolves with what
       actually happened so callers can update their button label.

   The AbortError branch is the reason this lives in a module rather
   than in the click handler: dismissing the OS sheet throws, and
   treating that as a failure copies a link the reader just declined
   to share. detail.js hand-rolled its own version for a while and
   made exactly that mistake.

   ── downloadIcs was deleted here (Aug 2026) ──────────────────
   It built a one-event .ics for a single pick and was wired to a
   calendar button on venue.html; 93da056 added it, and e9d7f3f
   dropped the call site when venue.html and place.html merged into
   detail.html. It sat callable and uncalled for a month.

   It is gone rather than rewired because the redesign moved the
   calendar answer from per-pick to whole-week. Every calendar
   surface the direction draws is the subscribable feed: 6f's
   Saturday-email card ("take the whole thing as a calendar feed"),
   the You row ("Add to my calendar"), and Tonight's desktop right
   half ("the whole week as a calendar feed"). The detail screen
   draws three cells, "Walk me there" and provenance — no calendar
   control. The feed is calendar-feed, and About prints its URL.

   The action row could not have taken it anyway: it is flex:1 1 0
   with nowrap, so a fourth key squeezes "Walk me there" to 79px
   across three lines at 390px. Measured, not assumed.

   Load order: after city.js (needs nothing else). Only detail.html
   loads it — it is the only page with a share trigger.
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
