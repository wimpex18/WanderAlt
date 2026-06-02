/* ============================================================
   share.js — tiny shared helpers for sharing + calendar export.
   ------------------------------------------------------------
   Exposes window.WA.Share with two methods, both no-dependency
   and CSP-safe (external file, no inline, Blob download):

     WA.Share.url({ title, text, url }) -> Promise<'shared'|'copied'|'failed'>
       Uses the native OS share sheet (navigator.share) when
       available — the right pattern on mobile in 2026 — and falls
       back to clipboard copy, then to a no-op. Resolves with what
       actually happened so callers can update their button label.

     WA.Share.downloadIcs(entry) -> boolean
       Builds a minimal RFC-5545 VEVENT for a dated pick and triggers
       a download. Returns false when the pick has no day (permanent
       place / undated), so callers can hide the action. Times are
       written as floating local time (no TZID) — WanderAlt picks
       carry a weekday + "HH:MM" string, not an absolute timestamp,
       so a floating event is the honest representation.

   Load order: after city.js (needs nothing else). Add
     <script defer src="./share.js"></script>
   before the page script that uses it.
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

  /* ---- ICS calendar export --------------------------------- */
  const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

  /* Resolve a pick's { day, time } to the next matching Date.
     "Tonight" → today; a weekday name → the next such weekday
     (today included). Returns null if day is absent/undated. */
  function nextDateFor(day, time) {
    if (!day) return null;
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (String(day).toLowerCase() !== 'tonight') {
      const want = DAY_INDEX[String(day).slice(0, 3).toLowerCase()];
      if (want != null) {
        let delta = (want - base.getDay() + 7) % 7;
        base.setDate(base.getDate() + delta);
      }
    }
    const m = /^(\d{1,2}):(\d{2})/.exec(time || '');
    base.setHours(m ? +m[1] : 19, m ? +m[2] : 0, 0, 0); /* default 19:00 */
    return base;
  }

  /* Local floating time stamp: YYYYMMDDTHHMMSS (no Z, no TZID). */
  function fmtLocal(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T` +
           `${p(d.getHours())}${p(d.getMinutes())}00`;
  }
  /* UTC stamp for DTSTAMP (creation time). */
  function fmtUtc(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T` +
           `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  }
  /* RFC-5545 text escaping for summary/location/description. */
  function esc(s) {
    return String(s || '')
      .replace(/\\/g, '\\\\').replace(/;/g, '\\;')
      .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  function buildIcs(entry) {
    const start = nextDateFor(entry.day, entry.time);
    if (!start) return null;
    /* Default duration: 2h. */
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const loc = [entry.venue, entry.neighborhood].filter(Boolean).join(', ');
    const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}venue.html?id=${encodeURIComponent(entry.id)}`;
    const desc = [entry.quote ? `"${entry.quote}"` : '', entry.handle ? `via ${entry.handle}` : '', url]
      .filter(Boolean).join('\n');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//WanderAlt//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${esc(entry.id)}@wanderalt.app`,
      `DTSTAMP:${fmtUtc(new Date())}`,
      `DTSTART:${fmtLocal(start)}`,
      `DTEND:${fmtLocal(end)}`,
      `SUMMARY:${esc(entry.title)}`,
      loc  ? `LOCATION:${esc(loc)}`   : '',
      desc ? `DESCRIPTION:${esc(desc)}` : '',
      `URL:${esc(url)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
  }

  function downloadIcs(entry) {
    const ics = buildIcs(entry);
    if (!ics) return false;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `wanderalt-${String(entry.id).slice(0, 40)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* Revoke after the click has a chance to start the download. */
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    return true;
  }

  /* True when a pick is dated (so a calendar export makes sense). */
  function isDated(entry) {
    return !!(entry && entry.day);
  }

  window.WA.Share = { url: shareUrl, downloadIcs, isDated };
})();
