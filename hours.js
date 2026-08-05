/* ============================================================
   hours.js — WA.Hours, the one reading of "is it open right now".
   ------------------------------------------------------------
   The Aug 2026 direction prints open-now / closes-at next to a walking
   distance on every place row, so this had to become a real field
   instead of a decorative one. Two shapes reach the browser and neither
   is going away:

     venues.opening_hours       raw OSM syntax, written by ingest-osm
                                "Tu-Sa 12:00-19:00; Su,Mo off"
     venue_details.opening_hours  Google weekday_text JSON array,
                                ["Monday: 12:00 – 10:00 PM", …]

   parse() sniffs which one it got. Everything downstream works on the
   normalised week: seven arrays of {open, close} minute pairs.

   Coverage is the thing to keep in mind while reading this file. It was
   1 of 937 public venues before ingest-osm started capturing the tag,
   and OSM carries it on roughly half its rows — so "unknown" is a
   first-class answer here, not an error path. Every function returns
   null rather than guessing, and the UI prints the honest line
   ("Hours not filed") instead of implying a venue is shut.

   All reasoning happens in Europe/Tallinn: the four cities share the
   Baltic clock, and a reader whose phone is on another timezone should
   still be told what the door is doing locally.
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const TZ   = 'Europe/Tallinn';
  const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];   /* index 0 = Monday */

  /* Google's array is Monday-first; JS getDay() is Sunday-first. */
  const MON_FIRST = (jsDay) => (jsDay + 6) % 7;

  /* ── City-local now, as {dayIdx, minutes} ────────────────────
     Intl gives the city's wall clock regardless of device timezone. */
  const cityNow = (date) => {
    const d = date || new Date();
    let h, m, weekday;
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, hour: '2-digit', minute: '2-digit',
        weekday: 'short', hour12: false,
      }).formatToParts(d);
      const get = (t) => (parts.find(p => p.type === t) || {}).value;
      h = parseInt(get('hour'), 10);
      m = parseInt(get('minute'), 10);
      weekday = String(get('weekday') || '').slice(0, 2);
    } catch (_) {
      h = d.getHours(); m = d.getMinutes();
      weekday = DAYS[MON_FIRST(d.getDay())];
    }
    /* Intl can emit hour 24 at midnight in some engines. */
    if (h === 24) h = 0;
    let dayIdx = DAYS.findIndex(x => x.toLowerCase() === weekday.toLowerCase());
    if (dayIdx < 0) dayIdx = MON_FIRST(d.getDay());
    return { dayIdx, minutes: h * 60 + m };
  };

  /* ── Shape A: raw OSM opening_hours ──────────────────────────
     Deliberately a SUBSET of the OSM grammar. The full spec carries
     public holidays, week numbers, sunset offsets and month ranges; a
     parser for all of it is a library, and a half-parser that guesses
     would tell someone standing outside that a closed door is open.
     So: weekday ranges and lists, time ranges, 24/7, and off/closed.
     Anything containing syntax we do not model returns null — unknown,
     not open. */
  const OSM_UNSUPPORTED = /\b(?:PH|SH|easter|sunrise|sunset|dawn|dusk|week\s|\[)/i;

  const dayIndex = (tok) => DAYS.findIndex(d => d.toLowerCase() === String(tok).slice(0, 2).toLowerCase());

  const hhmm = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 48 || mi > 59) return null;
    return h * 60 + mi;
  };

  const parseOSM = (raw) => {
    const src = String(raw).trim();
    if (!src) return null;
    if (OSM_UNSUPPORTED.test(src)) return null;

    const week = [[], [], [], [], [], [], []];

    if (/^24\/7$/i.test(src)) {
      for (let i = 0; i < 7; i++) week[i].push({ open: 0, close: 1440 });
      return week;
    }

    /* OSM's separator is ';', but 10% of the venues we hold (149 of
       1,467) write their rules comma-separated with no semicolon at all:
       "We,Th 12:00-23:00, Fr,Sa 12:00-01:00, Su 12:00-18:00". Splitting
       on ';' alone left those unparsed, so their rail fell back to OPEN
       and a route could not promise anything about them.

       A comma cannot just be treated as a separator: it also joins days
       inside one rule ("Mo,We,Fr 09:00-17:00"), and it joins two ranges
       on one day ("10:00-12:00,14:00-18:00"). Both of those must survive.

       What tells a rule boundary apart is BOTH sides of the comma: it is
       preceded by a time (or off/closed) and followed by day letters
       carrying their own time. Keying on the lookahead alone split
       "Mo,We,Fr 09:00-17:00" after "Mo" -- caught by testing a plain day
       list, which is why that case is in the list below.

       Written with a capture rather than a lookbehind: lookbehind is
       still a parse-time syntax error on older Safari, and one bad regex
       would take the whole file down rather than one venue's hours. */
    const normalised = src.replace(
      /(\d{1,2}:\d{2}|off|closed)\s*,\s*(?=[A-Za-z]{2,3}(?:\s*-\s*[A-Za-z]{2,3})?(?:\s*,\s*[A-Za-z]{2,3}(?:\s*-\s*[A-Za-z]{2,3})?)*\s+(?:\d{1,2}:\d{2}|off|closed))/gi,
      '$1;'
    );

    for (const rule of normalised.split(';')) {
      const r = rule.trim();
      if (!r) continue;

      /* Split the day selector from the time selector. A rule is either
         "Mo-Fr 10:00-18:00", "Mo,We 10:00-18:00", "Su off", or a bare
         "10:00-18:00" meaning every day. */
      const m = /^([A-Za-z,\-\s]*?)\s*((?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*,?\s*)+|off|closed)$/i.exec(r);
      if (!m) return null;                       /* something we don't model */

      const daySel  = m[1].trim();
      const timeSel = m[2].trim();

      let days = [];
      if (!daySel) {
        days = [0, 1, 2, 3, 4, 5, 6];
      } else {
        for (const part of daySel.split(',')) {
          const p = part.trim();
          if (!p) continue;
          const range = /^([A-Za-z]{2,3})\s*-\s*([A-Za-z]{2,3})$/.exec(p);
          if (range) {
            const a = dayIndex(range[1]), b = dayIndex(range[2]);
            if (a < 0 || b < 0) return null;
            for (let i = a; ; i = (i + 1) % 7) { days.push(i); if (i === b) break; }
          } else {
            const i = dayIndex(p);
            if (i < 0) return null;
            days.push(i);
          }
        }
      }
      if (!days.length) return null;

      if (/^(off|closed)$/i.test(timeSel)) {
        for (const d of days) week[d] = [];
        continue;
      }

      for (const span of timeSel.split(',')) {
        const t = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(span.trim());
        if (!t) return null;
        const open = hhmm(t[1]);
        let close  = hhmm(t[2]);
        if (open == null || close == null) return null;
        /* "20:00-04:00" and the OSM "20:00-28:00" form both mean the
           door shuts after midnight. Carry it as minutes past this
           day's midnight so openNow() can look back a day. */
        if (close <= open) close += 1440;
        for (const d of days) week[d].push({ open, close });
      }
    }

    return week.some(d => d.length) ? week : null;
  };

  /* ── Shape B: Google weekday_text JSON ───────────────────────
     ["Monday: 12:00 – 10:00 PM", "Tuesday: Closed", …], Monday first.
     The en-dash is Google's; the AM/PM marker often appears only on the
     closing time ("12:00 – 10:00 PM" means noon to 22:00), so the
     opening time inherits the meridiem when it carries none. */
  const parse12h = (s, inheritedMeridiem) => {
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(String(s).trim());
    if (!m) return null;
    let h = +m[1];
    const mi = m[2] ? +m[2] : 0;
    const mer = (m[3] || inheritedMeridiem || '').toUpperCase();
    if (h > 12 || mi > 59) return null;
    if (mer === 'PM' && h !== 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
    return { minutes: h * 60 + mi, meridiem: m[3] ? m[3].toUpperCase() : '' };
  };

  const parseGoogle = (raw) => {
    let arr;
    try { arr = JSON.parse(raw); } catch (_) { return null; }
    if (!Array.isArray(arr) || !arr.length) return null;

    const week = [[], [], [], [], [], [], []];
    let sawAny = false;

    arr.slice(0, 7).forEach((line, i) => {
      const text = String(line || '');
      const body = text.slice(text.indexOf(':') + 1).trim();
      if (!body || /closed/i.test(body)) return;
      if (/open 24 hours/i.test(body)) { week[i].push({ open: 0, close: 1440 }); sawAny = true; return; }

      /* Multiple spans per day are comma separated. */
      for (const span of body.split(',')) {
        const parts = span.split(/[–—-]/);
        if (parts.length !== 2) continue;
        /* Parse the close first so its meridiem can back-fill the open. */
        const close = parse12h(parts[1], '');
        if (!close) continue;
        const open = parse12h(parts[0], close.meridiem);
        if (!open) continue;
        let c = close.minutes;
        if (c <= open.minutes) c += 1440;
        week[i].push({ open: open.minutes, close: c });
        sawAny = true;
      }
    });

    return sawAny ? week : null;
  };

  /* ── Public: parse either shape ──────────────────────────────
     Returns the normalised week, or null for absent/unparseable —
     which callers must render as "not filed", never as "closed". */
  const parse = (raw) => {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    return s.charAt(0) === '[' ? parseGoogle(s) : parseOSM(s);
  };

  /* ── Is it open, and until when ──────────────────────────────
     Checks today's spans and yesterday's after-midnight overflow, so a
     bar listed "20:00-04:00" still reads open at 01:30. */
  const state = (raw, at) => {
    const week = parse(raw);
    if (!week) return { known: false, open: null, closesAt: null, opensAt: null };

    const { dayIdx, minutes } = cityNow(at);
    const prev = (dayIdx + 6) % 7;

    for (const span of week[prev]) {
      if (span.close > 1440 && minutes < span.close - 1440) {
        return { known: true, open: true, allDay: false, closesAt: span.close - 1440, opensAt: null };
      }
    }
    for (const span of week[dayIdx]) {
      if (minutes >= span.open && minutes < span.close) {
        /* A full-day span has no closing time worth printing — saying
           "closes 00:00" of a 24/7 venue reads as "shuts at midnight". */
        const allDay = span.open === 0 && span.close >= 1440;
        return { known: true, open: true, allDay, closesAt: allDay ? null : span.close % 1440, opensAt: null };
      }
    }
    /* Shut now — find the next opening today, for "opens 18:00". */
    let next = null;
    for (const span of week[dayIdx]) {
      if (span.open > minutes && (next == null || span.open < next)) next = span.open;
    }
    return { known: true, open: false, closesAt: null, opensAt: next };
  };

  const pad = (n) => String(n).padStart(2, '0');
  const clock = (mins) => (mins == null ? '' : `${pad(Math.floor((mins % 1440) / 60))}:${pad(mins % 60)}`);

  /* The left-rail string the timetable row prints for a place.
     "NOW" while open, "→02" for a place open until two, '' when unknown
     — the rail must never invent a time we don't have. */
  /* The place rail, exactly as 1a defines it: "a clock time for an
     event, NOW when it has already started, →02 for a place open until
     two." So the arrow carries the CLOSING hour — the fact that decides
     whether it is worth walking there — not the opening one.

     This function had no callers and the opposite semantics: it printed
     NOW when open and the OPENING hour when shut, which is the one
     reading 1a rules out. Returns:
       →HH  open now, closing at HH
       24H  open with no closing time worth printing
       SHUT hours are known and it is closed
       ''   hours not filed, so the caller says something honest instead */
  const rail = (raw, at) => {
    const s = state(raw, at);
    if (!s.known) return '';
    if (!s.open)  return 'SHUT';
    if (s.allDay || s.closesAt == null) return '24H';
    return `→${pad(Math.floor(s.closesAt / 60))}`;
  };

  /* The human line: "Open now · closes 02:00", "Opens 18:00",
     "Closed today", or the honest gap. */
  const label = (raw, at) => {
    const s = state(raw, at);
    if (!s.known)  return 'Hours not filed';
    if (s.open)    return s.closesAt == null ? 'Open 24 hours' : `Open now · closes ${clock(s.closesAt)}`;
    if (s.opensAt != null) return `Opens ${clock(s.opensAt)}`;
    return 'Closed for the day';
  };

  /* Seven rows for the detail page's week strip: {day, text, isToday}.
     Same object the density strip renders, so the two stay in sync. */
  const week = (raw, at) => {
    const w = parse(raw);
    if (!w) return null;
    const today = cityNow(at).dayIdx;
    const names = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    return w.map((spans, i) => ({
      day:     names[i],
      isToday: i === today,
      text:    spans.length
        ? spans.map(s => `${clock(s.open)}–${clock(s.close)}`).join(', ')
        : 'closed',
      spans,
    }));
  };

  window.WA.Hours = { parse, state, rail, label, week, clock, cityNow };
})();
