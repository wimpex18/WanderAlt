/* ============================================================
   when.js — the ONE shared definition of "tonight" / "this week".
   ------------------------------------------------------------
   One derivation, stamped onto every catalog entry, so every surface
   agrees rather than trusting the DB flags alone.

   - picks.day holds 'Mon'…'Sun' (Europe/Tallinn clock, shared by all
     four cities) or the special value 'Tonight'.
   - Explicit true flags are always respected — derivation only widens.

   supabase.js calls WA.when.stampAll() on the live catalogue. Loads
   before supabase.js (deferred scripts execute in document order).
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const norm = (d) => String(d || '').trim().slice(0, 3).toLowerCase();

  /* isTonight / isThisWeek are defined AFTER resolveKey below, which they
     depend on. */

  /* ── Calendar days ───────────────────────────────────────────
     A pick carrying 'Fri' means the COMING Friday; today counts as its own
     day. Everything works in Europe/Tallinn and compares 'YYYY-MM-DD'
     keys, so a device in another timezone sees the same "tomorrow". */
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

  /* Step whole calendar days off today's key. Not `Date.now() + n*86400000`:
     DST days are 23 or 25 hours long. Anchor at UTC noon and step UTC
     days, which no offset change can shift. */
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

  /* ── Tonight / this week ─────────────────────────────────────
     Both go through resolveKey(), which prefers starts_at and falls back
     to projecting the weekday (a pick may carry starts_at with day = null).
     Explicit true flags are still respected —
     derivation only ever widens. */

  const isTonight = (e) => {
    if (!e) return false;
    if (e.tonight === true) return true;
    if (norm(e.day) === 'ton') return true;
    return resolveKey(e) === todayKey();
  };

  /* "This week" is the coming seven days. */
  const isThisWeek = (e) => {
    if (!e) return false;
    if (e.thisWeek === true) return true;
    /* Anything on tonight is trivially in the coming week. */
    if (isTonight(e)) return true;
    const k = resolveKey(e);
    if (k == null) return false;
    return k >= todayKey() && k <= keyPlus(6);
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

  /* The ONE reading of a `time` filter value, shared by list and map.
     An unrecognised value widens rather than blanks: a stale link should
     show more than expected, never an empty page. */
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

  /* ── Does this pick actually state a clock? ──────────────────
     picks.time carries prose as often as a time ("open daily", "Wed–Sun")
     and a bare date arrives as a midnight timestamp. Midnight
     counts as absent: a genuine midnight start shows the day instead.

     Returns minutes past local midnight, or null when no clock is
     stated. Callers must treat null as "say the day, not a time". */
  const statedMinutes = (e) => {
    if (!e) return null;
    const m = window.WA.Geo && window.WA.Geo.startMinutes
      ? window.WA.Geo.startMinutes(e) : null;
    if (m == null || m === 0) return null;
    if (e.startsAt) {
      const d = new Date(e.startsAt);
      if (!isNaN(d) && d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return null;
    }
    return m;
  };

  window.WA.when = {
    isTonight, stampAll, todayKey, keyPlus, resolveKey, isOnDate,
    matches, statedMinutes,
  };
})();
