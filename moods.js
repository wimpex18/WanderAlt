/* ============================================================
   moods.js — what you are in the mood for.
   ------------------------------------------------------------
   A mood is a lens on the kinds we already hold: listing kinds, place
   kinds and, where a pipeline tag exists, tags. It adds no data of its own.
   A mood appears only when the city has enough behind it right now
   (`min` upcoming listings plus picked places), and only at the hours it
   suits for a route. Discovery sheets request allHours so a future
   club night can be chosen at noon. The words are per language; the rules are per city.

   You may pick several moods, or none (anything). A mood can be narrowed by
   its `subs` (Records inside Records & books, Comedy inside Art & film);
   with none of its subs chosen a mood means all of it. A sub with `only`
   reads its tags on those listing kinds alone (Jazz is a gig tagged jazz).

   window.WA.Moods:
     .available()        → [{ id, label, hint, picto, count, subs: [{ id, label, count }] }] for this hour
     .get(id)            → the definition, or null
     .matchesEvent(id,e) / .matchesPlace(id,v)   one mood, all of it
     .wantsEvent(p,e) / .wantsPlace(p,v)         a choice: any chosen mood, narrowed by its chosen subs
     .pref()             → { moods: [], subs: [], cap }   (no moods = anything, cap null = any price)
     .setPref(p)         → saves, then fires 'wa:mood-changed'
     .summary()          → "Records, Jazz · up to €20", "Any mood · any price"
     .CAPS               → the price limits offered, [0, 20]
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const H = 60;
  /* Words by language (English first; add a language by adding its keys).
     `picto` is the Label disc the sheet shows (icons.js). */
  const DEFS = [
    { id: 'look', label: { en: 'Art & film' }, hint: { en: 'Galleries, cinema, stage, comedy' }, picto: 'gallery',
      listing: ['exhibition', 'film', 'theatre'], place: ['gallery', 'arts centre', 'cinema', 'museum', 'theatre'],
      subs: [
        { id: 'art', label: { en: 'Art' }, listing: ['exhibition'], place: ['gallery', 'museum', 'arts centre'] },
        { id: 'film', label: { en: 'Film' }, listing: ['film'], place: ['cinema'] },
        { id: 'stage', label: { en: 'Stage' }, listing: ['theatre'], place: ['theatre'] },
        { id: 'comedy', label: { en: 'Comedy' }, tags: ['comedy', 'standup', 'stand-up', 'improv'] },
      ] },
    { id: 'listen', label: { en: 'Live music' }, hint: { en: 'Gigs, jazz, concerts' }, picto: 'gig',
      listing: ['gig'], place: ['bar', 'club'],
      subs: [
        { id: 'jazz', label: { en: 'Jazz' }, only: ['gig'], tags: ['jazz'] },
        { id: 'rock', label: { en: 'Indie & rock' }, only: ['gig'], tags: ['indie', 'rock', 'punk', 'metal', 'diy'] },
        { id: 'classical', label: { en: 'Classical' }, only: ['gig'], tags: ['classical', 'piano', 'choir'] },
      ] },
    { id: 'dance', label: { en: 'Club nights' }, hint: { en: 'Techno, house, DJs' }, picto: 'club',
      listing: ['club'], place: ['club'], from: 20 * H, until: 5 * H, subs: [] },
    { id: 'browse', label: { en: 'Records & books' }, hint: { en: 'Vinyl, books, thrift, markets' }, picto: 'record',
      listing: ['market'], place: ['record store', 'bookshop', 'thrift'],
      subs: [
        { id: 'records', label: { en: 'Records' }, place: ['record store'], tags: ['vinyl'] },
        { id: 'books', label: { en: 'Books' }, place: ['bookshop'], tags: ['literature', 'zine', 'poetry'] },
        { id: 'thrift', label: { en: 'Thrift' }, place: ['thrift'] },
        { id: 'markets', label: { en: 'Markets' }, listing: ['market'] },
      ] },
    { id: 'make', label: { en: 'Workshops & talks' }, hint: { en: 'Make, learn, meet people' }, picto: 'workshop',
      listing: ['workshop', 'talk'], tags: ['easy-alone'], place: [],
      subs: [
        { id: 'workshops', label: { en: 'Workshops' }, listing: ['workshop'] },
        { id: 'talks', label: { en: 'Talks' }, listing: ['talk'] },
        { id: 'alone', label: { en: 'Easy alone' }, tags: ['easy-alone'] },
      ] },
    { id: 'drink', label: { en: 'Craft beer' }, hint: { en: 'Taprooms and brewery bars' }, picto: 'beer',
      listing: [], place: ['taproom'], from: 12 * H, until: 2 * H, subs: [] },
  ];
  /* Older choices that were moods of their own. */
  const RENAMED = { join: { mood: 'make', sub: 'alone' } };
  /* Per city: which moods to consider and how much must be behind one. */
  const CITY = { default: { min: 3 }, tallinn: { min: 3 } };
  const CAPS = [0, 20];

  const lang = () => String(document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  const say = (o) => (o && (o[lang()] || o.en)) || '';
  const rule = () => CITY[window.WA.CITY] || CITY.default;
  const nowMin = () => (window.WA.Hours ? window.WA.Hours.cityNow().minutes : 12 * H);

  const get = (id) => DEFS.find(d => d.id === id) || null;
  const subOf = (id) => { for (const d of DEFS) { const s = d.subs.find(x => x.id === id); if (s) return { mood: d, sub: s }; } return null; };
  const lc = (x) => String(x || '').toLowerCase();

  /* One rule (a mood or a sub) against a listing or a place. */
  const hitsEvent = (r, e) => {
    if (!r || !e) return false;
    if (r.only && !r.only.includes(lc(e.kind))) return false;
    if ((r.listing || []).includes(lc(e.kind))) return true;
    if (!r.tags) return false;
    const tags = (e.tags || []).map(lc);
    return r.tags.some(t => tags.includes(t));
  };
  const hitsPlace = (r, v) => !!(r && v && (r.place || []).includes(lc(v.kind)));

  /* A mood is all of itself and all of its subs. */
  const matchesEvent = (id, e) => { const d = get(id); return !!d && (hitsEvent(d, e) || d.subs.some(s => hitsEvent(s, e))); };
  const matchesPlace = (id, v) => { const d = get(id); return !!d && (hitsPlace(d, v) || d.subs.some(s => hitsPlace(s, v))); };

  /* A choice matches when any chosen mood does; a mood with chosen subs means those subs only. */
  const wants = (p, x, isEvent) => {
    const moods = (p && p.moods) || [];
    if (!moods.length) return true;
    const subs = (p && p.subs) || [];
    return moods.some((id) => {
      const d = get(id);
      if (!d) return false;
      const chosen = d.subs.filter(s => subs.includes(s.id));
      if (chosen.length) return chosen.some(s => (isEvent ? hitsEvent(s, x) : hitsPlace(s, x)));
      return isEvent ? matchesEvent(id, x) : matchesPlace(id, x);
    });
  };
  const wantsEvent = (p, e) => wants(p, e, true);
  const wantsPlace = (p, v) => wants(p, v, false);

  const inHours = (d, m) => d.from == null || (d.from > d.until ? (m >= d.from || m < d.until) : (m >= d.from && m < d.until));

  const available = (opts = {}) => {
    const R = window.WA.R;
    const events = R ? R.live() : [], places = R ? R.places().filter(v => v.picked) : [];
    const m = nowMin(), min = rule().min;
    return DEFS.filter(d => opts.allHours || inHours(d, m)).map((d) => ({
      id: d.id, label: say(d.label), hint: say(d.hint), picto: d.picto,
      count: events.filter(e => matchesEvent(d.id, e)).length + places.filter(v => matchesPlace(d.id, v)).length,
      subs: d.subs.map(s => ({ id: s.id, label: say(s.label), count: events.filter(e => hitsEvent(s, e)).length + places.filter(v => hitsPlace(s, v)).length }))
        .filter(s => s.count > 0),
    })).filter(x => x.count >= min);
  };

  const KEY = 'wa:mood:v1';
  const clean = (p) => {
    const moods = [], subs = [];
    const raw = [].concat((p && p.moods) || [], p && p.mood ? [p.mood] : []);
    for (const id of raw) {
      const was = RENAMED[id];
      const m = was ? was.mood : id;
      if (get(m) && !moods.includes(m)) moods.push(m);
      if (was && !subs.includes(was.sub)) subs.push(was.sub);
    }
    for (const id of [].concat((p && p.subs) || [])) {
      const s = subOf(id);
      if (s && moods.includes(s.mood.id) && !subs.includes(id)) subs.push(id);
    }
    const cap = p && p.cap != null && CAPS.includes(Number(p.cap)) ? Number(p.cap) : null;
    return { moods, subs, cap };
  };
  let saved = null;
  const read = () => {
    if (saved) return saved;
    let p = {};
    try { p = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { /* blocked or corrupt */ }
    saved = clean(p);
    return saved;
  };
  const pref = () => { const p = read(); return { moods: p.moods.slice(), subs: p.subs.slice(), cap: p.cap }; };
  const setPref = (p) => {
    saved = clean(p);
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (_) { /* kept for this page only */ }
    document.dispatchEvent(new CustomEvent('wa:mood-changed', { detail: pref() }));
  };
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    try { saved = clean(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { return; }
    document.dispatchEvent(new CustomEvent('wa:mood-changed', { detail: { ...pref(), restore:true } }));
  });
  const capText = (c) => (c == null ? 'any price' : c === 0 ? 'free' : `up to €${c}`);
  /* The words for a choice: the narrower picks where there are any, the moods otherwise. */
  const words = (p) => {
    const out = [];
    for (const id of p.moods) {
      const d = get(id);
      const chosen = d.subs.filter(s => p.subs.includes(s.id));
      if (chosen.length) chosen.forEach(s => out.push(say(s.label))); else out.push(say(d.label));
    }
    return out;
  };
  const summary = () => {
    const p = read(), w = words(p);
    const what = !w.length ? 'Any mood' : w.length <= 2 ? w.join(', ') : `${w[0]} +${w.length - 1}`;
    return `${what} · ${capText(p.cap)}`;
  };

  window.WA.Moods = { available, get, matchesEvent, matchesPlace, wantsEvent, wantsPlace, pref, setPref, summary, capText, words, CAPS };
})();
