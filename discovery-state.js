/* Shared discovery dates for Now and Map. Taste stays in Moods; precise
   coordinates stay in Geo's short-lived session store, never in this state. */
(() => {
  'use strict';
  const W = () => window.WA.when;
  const KEY = 'wa:discovery:v1';
  const PRESETS = ['tonight', 'tomorrow', 'weekend', 'thisweek'];
  const validDate = (key) => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)
    && !isNaN(Date.parse(`${key}T12:00:00Z`)) && new Date(`${key}T12:00:00Z`).toISOString().slice(0, 10) === key;
  const clean = (raw = {}) => {
    const today = W().todayKey();
    let date = validDate(raw.date) ? raw.date : '';
    let to = date && validDate(raw.to) && raw.to > date ? raw.to : '';
    if (date && date < today) {
      if (to && to >= today) date = today; // retain the remaining days of a trip
      else { date = ''; to = ''; }
    }
    return { when: PRESETS.includes(raw.when) ? raw.when : 'tonight', date, to };
  };
  let dateState = null, stateDay = '', near = false, storedContext = false;
  const read = () => {
    if (dateState && stateDay === W().todayKey()) return dateState;
    const previous = dateState, sameDay = stateDay === W().todayKey();
    stateDay = W().todayKey();
    try {
      const raw = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      storedContext = !!(raw && raw.city === window.WA.CITY && (validDate(raw.date) || PRESETS.includes(raw.when)));
      dateState = clean(storedContext && (raw.date || raw.at === W().todayKey()) ? raw : {});
    } catch (_) { dateState = clean(previous && (previous.date || sameDay) ? previous : {}); }
    return dateState;
  };
  try { near = localStorage.getItem('wa:near:v1') === '1'; } catch (_) { /* in memory */ }
  const dates = () => ({ ...read() });
  const emit = (restore = false) => document.dispatchEvent(new CustomEvent('wa:discovery-changed', { detail: { restore } }));
  const setDates = (value, notify = true) => {
    dateState = clean(value);
    stateDay = W().todayKey();
    try { sessionStorage.setItem(KEY, JSON.stringify({ ...dateState, at: W().todayKey(), city: window.WA.CITY })); } catch (_) { /* this page only */ }
    if (notify) emit();
  };
  const fromQuery = (q) => {
    const when = q.get('when') || q.get('time');
    const date = q.get('date') || (when && when.startsWith('date:') ? when.slice(5) : '');
    if (validDate(date) && (date >= W().todayKey() || (validDate(q.get('to')) && q.get('to') >= W().todayKey()))) setDates({ date, to: q.get('to') }, false);
    else if (PRESETS.includes(when)) setDates({ when }, false);
  };
  const writeURL = () => {
    const q = new URLSearchParams(location.search), s = dates();
    for (const k of ['when', 'time', 'date', 'to']) q.delete(k);
    if (s.date) { q.set('date', s.date); if (s.to) q.set('to', s.to); }
    else q.set('when', s.when);
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  };
  const setNear = (on) => {
    near = !!on;
    try { if (near) localStorage.setItem('wa:near:v1', '1'); else localStorage.removeItem('wa:near:v1'); } catch (_) { /* this page only */ }
    emit();
  };
  const nearOn = () => near && !!window.WA.Geo.currentLoc();
  const pref = () => window.WA.Moods.pref();
  /* Presets count nights (when.js): before 05:00, Today is still last
     evening and Tomorrow is the coming evening. Picked dates stay as chosen. */
  const range = (s = dates()) => {
    if (s.date) return [s.date, s.to || s.date];
    const day = W().nightPlus;
    if (s.when === 'tomorrow') return [day(1), day(1)];
    if (s.when === 'weekend') {
      const dow = new Date(`${day(0)}T12:00:00Z`).getUTCDay();
      const start = dow === 0 || dow === 6 ? 0 : 5 - dow;
      return [day(start), day(dow === 0 ? 0 : start + (dow === 6 ? 1 : 2))];
    }
    return [day(0), day(s.when === 'thisweek' ? 6 : 0)];
  };
  /* Intersect nights: a start before 05:00 belongs to the evening before, a
     date-only run includes its final day and a stated end is exclusive. */
  const matchesDate = (e, s = dates()) => {
    const [from, to] = range(s), start = W().nightKey(e);
    if (!start || start > to) return false;
    const last = W().nightEndKey(e);
    return (last && last > start ? last : start) >= from;
  };
  const matchesEvent = (e, p = pref()) => window.WA.Moods.wantsEvent(p, e)
    && window.WA.R.withinTicketCap(e, p.cap);
  const matchesPlace = (v, p = pref()) => window.WA.Moods.wantsPlace(p, v);
  const dateLabel = key => `${window.WA.R.dateShort(key)}${key.slice(0,4) === W().todayKey().slice(0,4) ? '' : ' ' + key.slice(0,4)}`;
  const label = (s = dates()) => s.date ? (s.to ? `${dateLabel(s.date)} – ${dateLabel(s.to)}` : dateLabel(s.date))
    : { tonight: 'Today', tomorrow: 'Tomorrow', weekend: 'Weekend', thisweek: 'This week' }[s.when];
  window.WA.Discovery = { dates, setDates, fromQuery, writeURL, validDate, range, matchesDate,
    pref, matchesEvent, matchesPlace, nearOn, setNear, label };
  // Full results use pure predicates; browsing search must not change Now dates.
  const discoveryPage = ['tonight','map'].includes(document.body?.dataset.page) && new URLSearchParams(location.search).get('context') !== 'search';
  if (discoveryPage) {
    const historyReturn = typeof performance !== 'undefined' && performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
    read();
    if (historyReturn && storedContext) writeURL();
    else fromQuery(new URLSearchParams(location.search));
  }
  document.addEventListener('wa:near-changed', e => setNear(e.detail));
  addEventListener('popstate', () => { if (discoveryPage) { fromQuery(new URLSearchParams(location.search)); emit(true); } });
  addEventListener('pageshow', e => { if (e.persisted && discoveryPage) { stateDay = ''; read(); writeURL();
    try { near = localStorage.getItem('wa:near:v1') === '1'; } catch (_) {}
    emit(true); } });
})();
