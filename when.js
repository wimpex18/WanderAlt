/* ============================================================
   when.js — the ONE shared definition of "tonight" / "this week".
   ------------------------------------------------------------
   Why this exists: the DB flags (picks.tonight / picks.this_week) are
   maintained by lifecycle crons that are FROZEN pre-release, so the
   flags aged to false while pages kept trusting them — Today then
   fabricated a "This week" list via its never-blank fallback while
   Discover's thisweek filter honestly showed 0. One derivation, stamped
   onto every catalog entry, keeps all surfaces telling the same truth.

   Semantics mirror the pipeline's reset_tonight() SQL:
   - picks.day holds 'Mon'…'Sun' abbreviations (Europe/Tallinn clock —
     all three cities share the Baltic timezone) or the special
     value 'Tonight'.
   - tonight  = explicit flag OR day === 'Tonight' OR day === today.
   - thisWeek = explicit flag OR the pick is dated at all (the catalog
     is a weekly edition; a dated pick belongs to the current week).
   Explicit true flags are always respected — derivation only widens.

   Both catalog paths call WA.when.stampAll(): catalog.js (static
   fallback) and supabase.js (live). Loads before catalog.js on every
   page that includes it (deferred scripts execute in document order).
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const todayAbbrev = () => {
    try {
      return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Tallinn' })
        .format(new Date());
    } catch {
      return DAYS[new Date().getDay()]; /* local clock — same for Baltic users */
    }
  };

  const norm = (d) => String(d || '').trim().slice(0, 3).toLowerCase();

  const isTonight = (e) => {
    if (e.tonight === true) return true;
    const d = norm(e.day);
    return d !== '' && (d === 'ton' || d === norm(todayAbbrev()));
  };

  const isThisWeek = (e) => e.thisWeek === true || String(e.day || '').trim() !== '';

  /* ── Calendar days ───────────────────────────────────────────
     "Tomorrow" and "pick a date" need an actual day, not a flag, so the
     weekday abbreviation has to resolve to one. A pick carrying 'Fri' in a
     weekly edition means the COMING Friday — today counts as its own day,
     so 'Fri' read on a Friday is today, not a week out.

     Everything below works in Europe/Tallinn (all three live cities share
     the Baltic clock) and compares 'YYYY-MM-DD' keys rather than Date
     objects, so a reader whose device sits in another timezone still sees
     the same "tomorrow" the curators meant. */
  const KEY_FMT = { timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit' };

  /* 'YYYY-MM-DD' in city time. en-CA formats exactly that way. */
  const dayKey = (date) => {
    try {
      return new Intl.DateTimeFormat('en-CA', KEY_FMT).format(date);
    } catch {
      const p = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
    }
  };

  const todayKey = () => dayKey(new Date());

  /* Step whole calendar days off today's key.
     Deliberately NOT `Date.now() + n * 86400000`: Estonia keeps EU summer
     time, so twice a year a day is 23 or 25 wall-clock hours long. Adding
     a fixed 24h and reformatting in city time then lands on the wrong date
     for the hour either side of midnight — "tomorrow" jumping two days in
     March and staying on today in October. The key is already a calendar
     date, so anchor it at UTC noon and step UTC days, which no offset
     change can shift. */
  const keyStep = (key, n) => {
    const d = new Date(`${key}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const keyPlus = (n) => keyStep(todayKey(), n);

  /* Weekday index (0=Sun) of a 'YYYY-MM-DD' key — parsed as UTC noon so no
     timezone can roll it onto the neighbouring day. */
  const keyWeekday = (key) => new Date(`${key}T12:00:00Z`).getUTCDay();

  /* The date a pick falls on, or null when it carries no date at all.
     starts_at wins when present (it is a real timestamp); otherwise the
     weekday abbreviation is projected onto the coming week. */
  const resolveKey = (e) => {
    if (e && e.startsAt) {
      const d = new Date(e.startsAt);
      if (!isNaN(d)) return dayKey(d);
    }
    const d = norm(e && e.day);
    if (d === '') return null;
    if (d === 'ton') return todayKey();
    const want = DAYS.findIndex(x => norm(x) === d);
    if (want < 0) return null;
    const today = todayKey();
    const ahead = (want - keyWeekday(today) + 7) % 7;   /* 0 = today */
    return ahead === 0 ? today : keyPlus(ahead);
  };

  const isTomorrow = (e) => resolveKey(e) === keyPlus(1);

  /* The COMING Fri–Sun block. Read on a Saturday, "this weekend" is the
     Saturday you are standing in plus Sunday — not next week's. */
  const weekendKeys = () => {
    const today = todayKey();
    const dow   = keyWeekday(today);                    /* 0=Sun … 6=Sat */
    /* Sunday is the tail of the weekend you are already in, not the start
       of the next one, so it offers itself alone. */
    if (dow === 0) return [today];
    if (dow === 6) return [today, keyPlus(1)];
    const toFri = 5 - dow;                              /* Mon–Fri → 4…0 */
    return [keyPlus(toFri), keyPlus(toFri + 1), keyPlus(toFri + 2)];
  };

  const isWeekend = (e) => {
    const k = resolveKey(e);
    return k != null && weekendKeys().includes(k);
  };

  const isOnDate = (e, key) => !!key && resolveKey(e) === key;

  /* The ONE reading of a `time` filter value, so the list and the map
     cannot drift apart. They used to hold separate copies of this switch,
     which meant a value one of them didn't know (weekend, tomorrow, a
     picked date) silently filtered nothing on the other — the map showing
     every pin beside a list showing one.
     An unrecognised value widens rather than blanks: a stale bookmarked
     link should show more than the reader expected, never an empty page. */
  const matches = (e, time) => {
    const t = String(time == null ? 'all' : time);
    if (t.startsWith('date:')) return isOnDate(e, t.slice(5));
    switch (t) {
      case 'tonight':  return isTonight(e);
      case 'tomorrow': return isTomorrow(e);
      case 'weekend':  return isWeekend(e);
      case 'thisweek': return isThisWeek(e) || isTonight(e);
      default:         return true;
    }
  };

  /* Stamp derived flags in place; explicit true flags survive. Returns list. */
  const stampAll = (list) => {
    for (const e of list || []) {
      e.tonight  = isTonight(e);
      e.thisWeek = isThisWeek(e);
    }
    return list;
  };

  window.WA.when = {
    todayAbbrev, isTonight, isThisWeek, stampAll,
    dayKey, todayKey, keyPlus, resolveKey, isTomorrow, isWeekend, weekendKeys, isOnDate,
    matches,
  };
})();
