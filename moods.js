/* ============================================================
   moods.js — what you are in the mood for.
   ------------------------------------------------------------
   A mood is a lens on the kinds we already hold: listing kinds, place
   kinds and, where a pipeline tag exists, tags. It adds no data of its own.
   A mood appears only when the city has enough behind it right now
   (`min` upcoming listings plus picked places), and only at the hours it
   suits, so a new city shows what it has and Tallinn never offers a
   dance floor at noon. The words are per language; the rules are per city.

   window.WA.Moods:
     .available()        → [{ id, label, hint, count }] for this hour, in the order of DEFS
     .get(id)            → the definition, or null
     .matchesEvent(id,e) / .matchesPlace(id,v)
     .pref()             → { mood, cap }   (mood '' = anything, cap null = any price)
     .setPref(p)         → saves, then fires 'wa:mood-changed'
     .summary()          → "Look · up to €10", "Any mood · any price"
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const H = 60;
  /* Words by language (English first; add a language by adding its keys). */
  const DEFS = [
    { id: 'look',   label: { en: 'Look' },    hint: { en: 'Shows, galleries, film' },    listing: ['exhibition', 'film', 'theatre'], place: ['gallery', 'arts centre', 'cinema', 'museum'] },
    { id: 'browse', label: { en: 'Browse' },  hint: { en: 'Records, books, thrift' },    listing: ['market'],                        place: ['record store', 'bookshop', 'thrift'] },
    { id: 'make',   label: { en: 'Make' },    hint: { en: 'Workshops and talks' },       listing: ['workshop', 'talk'],              place: [] },
    { id: 'listen', label: { en: 'Listen' },  hint: { en: 'Gigs, jazz, live rooms' },    listing: ['gig'],                           place: ['bar', 'club'] },
    { id: 'dance',  label: { en: 'Dance' },   hint: { en: 'Club nights' },               listing: ['club'],                          place: ['club'], from: 20 * H, until: 5 * H },
    { id: 'join',   label: { en: 'Join in' }, hint: { en: 'Quiz, chess, craft nights' }, listing: [], tags: ['easy-alone'],        place: [] },
  ];
  /* Per city: which moods to consider and how much must be behind one. */
  const CITY = { default: { min: 3 }, tallinn: { min: 3 } };

  const lang = () => String(document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  const say = (o) => (o && (o[lang()] || o.en)) || '';
  const rule = () => CITY[window.WA.CITY] || CITY.default;
  const nowMin = () => (window.WA.Hours ? window.WA.Hours.cityNow().minutes : 12 * H);

  const get = (id) => DEFS.find(d => d.id === id) || null;
  const lc = (x) => String(x || '').toLowerCase();
  const matchesEvent = (id, e) => {
    const d = get(id);
    if (!d || !e) return false;
    if (d.listing.includes(lc(e.kind))) return true;
    const tags = (e.tags || []).map(lc);
    return !!(d.tags && d.tags.some(t => tags.includes(t)));
  };
  const matchesPlace = (id, v) => {
    const d = get(id);
    return !!(d && v && d.place.includes(lc(v.kind)));
  };
  const inHours = (d, m) => d.from == null || (d.from > d.until ? (m >= d.from || m < d.until) : (m >= d.from && m < d.until));

  const available = () => {
    const R = window.WA.R;
    const events = R ? R.live() : [], places = R ? R.places().filter(v => v.picked) : [];
    const m = nowMin(), min = rule().min;
    return DEFS.filter(d => inHours(d, m)).map((d) => ({
      id: d.id, label: say(d.label), hint: say(d.hint),
      count: events.filter(e => matchesEvent(d.id, e)).length + places.filter(v => matchesPlace(d.id, v)).length,
    })).filter(x => x.count >= min);
  };

  const KEY = 'wa:mood:v1';
  let saved = null;
  const read = () => {
    if (saved) return saved;
    let p = {};
    try { p = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { /* blocked or corrupt */ }
    saved = { mood: get(p.mood) ? p.mood : '', cap: p.cap != null && [0, 10, 20].includes(Number(p.cap)) ? Number(p.cap) : null };
    return saved;
  };
  const pref = () => ({ ...read() });
  const setPref = (p) => {
    saved = { mood: get(p && p.mood) ? p.mood : '', cap: p && p.cap != null && [0, 10, 20].includes(Number(p.cap)) ? Number(p.cap) : null };
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (_) { /* kept for this page only */ }
    document.dispatchEvent(new CustomEvent('wa:mood-changed', { detail: pref() }));
  };
  const capText = (c) => (c == null ? 'any price' : c === 0 ? 'free' : `up to €${c}`);
  const summary = () => {
    const p = read(), d = get(p.mood);
    return `${d ? say(d.label) : 'Any mood'} · ${capText(p.cap)}`;
  };

  window.WA.Moods = { available, get, matchesEvent, matchesPlace, pref, setPref, summary, capText };
})();
