/* ============================================================
   route.js — the evening: two to four stops, on foot.
   ------------------------------------------------------------
   One timed listing is the anchor. A picked place before it (a record
   shop, a bookshop, a gallery) and a bar or club after it fill out the
   evening, each within a short walk and, where hours are filed, open
   when you would be there. Everything is worked out here from our own
   places and listings; nothing is invented. A route is its stops, so it
   travels in a URL: route.html?s=place:<id>:<minute>,event:<id>:<minute>

   The pipeline also composes evenings for the next few days with a free
   model (pipeline/routes.ts) and stores them in `routes`; the page reads
   them, checks every stop again, and shows the ones that still hold.

   window.WA.Route:
     .compose()          → the best evening for tonight, worked out here, or null
     .plan(opts)         → routes for the next few hours, best first: { mood, cap } narrow them;
                           a few picked places on foot when nothing is on soon, so daytime has an answer
     .best()             → the first of plan(): a stored evening that still holds, else one worked out here
     .loadStored()       → Promise of the stored routes (cached; 'wa:routes-ready' when they arrive)
     .upcoming()         → stored routes that still hold, soonest day first, best first
     .fromParam(s)       → a route from the URL's stops, or null
     .param(route)       → the URL's `s` value
     .mapsUrl(route)     → a walking route in Google Maps
   Route: { title, area, stops[], walkMin, metres, cost }
   Stop:  { type, id, name, kind, area, minute, walk (min from the stop before), lat, lng, href, note, hours }
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const W = () => window.WA.when, G = () => window.WA.Geo, H = () => window.WA.Hours, R = () => window.WA.R;

  const BEFORE = new Set(['record store', 'bookshop', 'gallery', 'thrift', 'arts centre', 'cinema']);
  const AFTER = new Set(['bar', 'club', 'taproom']);
  const MAX_BEFORE = 15, MAX_AFTER = 12, DAY = 24 * 60;
  const NEAR = 15;    /* Near me: the first stop within this many minutes on foot */

  const nowMin = () => H().cityNow().minutes;
  const at = (minute, offset = 0) => {
    let date = new Date(Date.now() + (minute - nowMin() + offset * DAY) * 60000);
    /* Match the Tallinn wall clock across 23/25-hour DST days. */
    if (W().keyPlus && W().dayKey) {
      const wall = Date.parse(`${W().keyPlus(offset)}T00:00:00Z`) + minute * 60000;
      for (let i = 0; i < 2; i++) {
        const seen = Date.parse(`${W().dayKey(date)}T00:00:00Z`) + H().cityNow(date).minutes * 60000;
        date = new Date(+date + wall - seen);
      }
    }
    return date;
  };
  const metres = (a, b) => {
    const ca = G().coordsFor(a), cb = G().coordsFor(b);
    return ca && cb ? G().distanceTo(a, cb) : null;
  };
  const walk = (m) => (m == null ? null : G().walkMinutes(m));
  const round5 = (m) => Math.round(m / 5) * 5;

  /* Is a place open at this minute: 'open', 'shut' or 'unknown' (hours not listed). */
  const hoursAt = (v, minute, offset = 0) => {
    const s = v && v.openingHours ? H().state(v.openingHours, at(minute, offset)) : null;
    return !s || !s.known ? 'unknown' : s.open ? 'open' : 'shut';
  };

  /* A place with no filed hours is never said to be open, but nobody is sent to
     a record shop at one in the morning either: an unfiled place is tried only
     inside the hours its kind usually keeps, and still reads "hours not listed".
     A room that opens for what is on (a cinema, a theatre) is no stop on its own
     without filed hours. */
  const USUAL = {
    'record store': [11 * 60, 19 * 60], bookshop: [10 * 60, 19 * 60], thrift: [10 * 60, 19 * 60],
    gallery: [11 * 60, 18 * 60], museum: [10 * 60, 18 * 60], 'arts centre': [11 * 60, 19 * 60],
    bar: [17 * 60, 60], taproom: [15 * 60, 23 * 60], club: [23 * 60, 4 * 60],
  };
  const usual = (kind, minute) => {
    const w = USUAL[kind];
    if (!w) return false;
    const m = ((minute % DAY) + DAY) % DAY;
    return w[0] < w[1] ? m >= w[0] && m < w[1] : m >= w[0] || m < w[1];
  };
  /* Worth walking to at this minute: open by its filed hours, or unfiled and inside its kind's usual ones. */
  const fits = (v, h, minute) => h === 'open' || (h === 'unknown' && usual(v.kind, minute));
  /* Worth the visit, not only the arrival: it still fits five minutes before you
     would leave, so no walk spends forty minutes at a shop that shuts in five. */
  const STAY = 40;
  const fitsStay = (v, minute, leave, offset = 0) => fits(v, hoursAt(v, minute, offset), minute)
    && fits(v, hoursAt(v, leave - 5, offset), leave - 5);

  const startOf = (e) => G().startMinutes(e);
  const endOf = (e, start) => {
    const t = e.endsAt ? Date.parse(e.endsAt) : NaN, s = e.startsAt ? Date.parse(e.startsAt) : NaN;
    const len = Math.round((t - s) / 60000);
    return start + (Number.isFinite(len) && len > 0 ? len : 120);
  };

  /* A listing's own words, cut at a word, never mid-sentence into silence. */
  const clip = (t, n = 140) => {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n), sp = cut.lastIndexOf(' ');
    return `${(sp > 60 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '')}…`;
  };

  /* When an open place shuts after this minute, for "open till 19:00"; null when it keeps no closing
     hour worth printing or its hours are not filed. */
  const closesAt = (v, minute, offset = 0) => {
    const s = v && v.openingHours ? H().state(v.openingHours, at(minute, offset)) : null;
    return s && s.open && !s.allDay ? s.closesAt : null;
  };
  /* "open till 19:00", "open" or "hours not listed": what a stop's line says of its hours. */
  const hoursNote = (hours, closes) =>
    hours === 'open' ? (closes != null ? `open till ${H().clock(closes)}` : 'open') : hours === 'unknown' ? 'hours not listed' : '';

  const placeStop = (v, minute, prevM, hours, offset = 0) => ({
    type: 'place', id: v.id, name: v.name, kind: v.kind, area: R().areaOf(v) || '', minute, walk: walk(prevM),
    lat: v.lat, lng: v.lng, href: `detail.html?id=${encodeURIComponent(v.id)}`, note: v.pickNote || '', hours,
    closes: hours === 'open' ? closesAt(v, minute, offset) : null,
  });
  /* A note the reader can read: the source's own words when they are in the interface language,
     otherwise our summary in that language (English when it has no translation yet), as on the
     listing's page. The source's blurb in another language is never the note. */
  const noteOf = (e) => {
    const lang = window.WA.Lang ? window.WA.Lang.current() : 'en';
    const own = e.originalLanguage === lang ? window.WA.UI.descriptionOr(e.description, e.title) : '';
    return clip(own || window.WA.UI.descriptionOr(e.quote, e.title));
  };
  const eventStop = (e, minute, prevM) => {
    const c = G().coordsFor(e) || {};
    return { type: 'event', id: e.id, name: e.title || '', kind: e.kind, area: R().areaOf(e) || '', minute, walk: walk(prevM),
      lat: c.lat, lng: c.lng, href: `detail.html?id=${encodeURIComponent(e.id)}`, note: noteOf(e), hours: 'event',
      venue: e.venue || '', price: R().isFree(e) ? 'Free' : '',
      cost: R().isFree(e) ? 0 : (e.priceMin != null && isFinite(Number(e.priceMin)) ? Number(e.priceMin) : null) };
  };

  /* Words for the title, in the order of the evening. Each is written capitalised, looked up in the
     interface language (lang/phrases.tsv), and lowered after the first; a word already used becomes
     "another …" ("Craft beer, a late drink, another late drink"). */
  const BEFORE_WORD = { 'record store': 'Records', bookshop: 'Books', gallery: 'A gallery', thrift: 'A thrift shop', 'arts centre': 'An arts centre', cinema: 'A film', museum: 'A museum' };
  const FIRST_WORD = { taproom: 'Craft beer', bar: 'A bar', club: 'A club' };
  const ANCHOR_WORD = { gig: 'A gig', club: 'A club night', film: 'A film', theatre: 'A stage', talk: 'A talk', workshop: 'A workshop', exhibition: 'An opening', festival: 'A festival' };
  const ANOTHER = { 'A late drink': 'Another late drink', 'A drink': 'Another drink', 'A club': 'Another club', 'A bar': 'Another bar', 'A film': 'Another film', 'A gallery': 'Another gallery', 'A thrift shop': 'Another thrift shop' };
  const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const word = (w) => (window.WA.Lang ? window.WA.Lang.t(w) : w);
  const titleFor = (stops) => {
    const used = new Set();
    const words = stops.map((s, i) => {
      let w = s.type === 'event' ? (ANCHOR_WORD[String(s.kind || '').toLowerCase()] || 'A show')
        : BEFORE_WORD[s.kind] || (i === 0 ? FIRST_WORD[s.kind] || 'A place' : s.minute >= 21 * 60 ? 'A late drink' : s.kind === 'club' ? 'A club' : 'A drink');
      if (used.has(w) && ANOTHER[w]) w = ANOTHER[w];
      used.add(w);
      return i === 0 ? word(w) : lower(word(w));
    });
    return words.join(', ');
  };

  /* What the tickets cost, as far as we know: the cheapest price of each listing.
     Places carry no price, so only listings count; an unknown stays unknown. */
  const costOf = (stops) => {
    const events = stops.filter(s => s.type === 'event');
    const known = events.filter(s => s.cost != null);
    return { events: events.length, tickets: known.reduce((n, s) => n + s.cost, 0), unknown: events.length - known.length };
  };
  const costText = (route) => {
    const c = route.cost || costOf(route.stops);
    if (!c.events) return '';
    const eur = (n) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;
    if (c.tickets > 0) return `tickets from ${eur(c.tickets)}${c.unknown ? ` · ${c.unknown} price not listed` : ''}`;
    return c.unknown ? 'price not listed' : 'free entry';
  };

  const build = (stops) => {
    let m = 0;
    for (let i = 1; i < stops.length; i++) m += metres(stops[i - 1], stops[i]) || 0;
    const anchor = stops.find(s => s.type === 'event') || stops[0];
    const me = G().currentLoc(), first = stops[0];
    const fromYou = me && first.lat != null ? walk(G().distanceTo(first)) : null;
    return { day: W().todayKey?.(), title: titleFor(stops), area: anchor.area, stops, walkMin: stops.reduce((n, s) => n + (s.walk || 0), 0), metres: Math.round(m), cost: costOf(stops), fromYou };
  };

  /* Moods and a price limit narrow what may anchor or fill a route. A route must
     hold at least one stop of the chosen mood; a listing priced above the limit
     is left out, and one with no price listed stays in and says so. */
  const MOODS = () => window.WA.Moods || null;
  /* The choice (Moods.pref() shape); an older single `mood` still reads. */
  const wantOf = (opts) => {
    const w = opts.want || (opts.mood ? { moods: [opts.mood], subs: [] } : null);
    return w && w.moods && w.moods.length && MOODS() ? w : null;
  };
  const wantsPlace = (opts, v) => { const w = wantOf(opts); return !!w && MOODS().wantsPlace(w, v); };
  const holdsMood = (opts, stops, entries) => {
    const w = wantOf(opts);
    return !w || stops.some((s, i) => (s.type === 'event' ? MOODS().wantsEvent(w, entries[i]) : MOODS().wantsPlace(w, entries[i])));
  };

  /* Every evening worth walking for the rest of tonight, best first: a picked place
     before a timed listing and, after it, a bar or club (or, before five, another
     daytime place). Each listing makes at most one. */
  const evenings = (opts = {}) => {
    const now = nowMin();
    const places = R().places().filter(v => v.picked && G().coordsFor(v));
    if (!places.length) return [];
    const me = G().currentLoc();
    const anchors = R().live().filter(e => W().isTonight(e) && !R().isOff(e) && e.flag !== 'sold_out' && !R().isLive(e) && G().coordsFor(e)
      && startOf(e) != null && startOf(e) >= now + 20 && startOf(e) < DAY && R().withinTicketCap(e, opts.cap)
      && !(opts.near && me && (walk(G().distanceTo(e)) || 0) > NEAR));
    const found = [];
    for (const e of anchors) {
      const start = startOf(e), host = window.WA.venueFor ? window.WA.venueFor(e) : null;
      const stops = [];
      let score = 0;

      /* A picked place to visit before: close, and open when you would be there. */
      let bestBefore = null;
      for (const v of places) {
        if (!BEFORE.has(v.kind) || (host && v.id === host.id)) continue;
        const d = metres(v, e), w = walk(d);
        if (w == null || w < 2 || w > MAX_BEFORE) continue;
        const minute = Math.max(round5(now + 10), round5(start - w - 60));
        if (minute + 30 + w > start) continue;                      /* at least half an hour there */
        const h = hoursAt(v, minute), leave = Math.min(start - w - 10, minute + 30);
        if (!fits(v, h, minute) || !fits(v, hoursAt(v, leave), leave)) continue;
        const s = (h === 'open' ? 2 : 1) - w / 30 + (v.pickNote ? .2 : 0) + (wantsPlace(opts, v) ? 1.5 : 0);
        if (!bestBefore || s > bestBefore.s) bestBefore = { v, w, minute, h, s };
      }
      /* A picked bar or club after it, or by day another place to browse. */
      const end = endOf(e, start);
      let bestAfter = null;
      for (const v of places) {
        if (bestBefore && v.id === bestBefore.v.id) continue;
        const dayPlace = BEFORE.has(v.kind);
        if ((!AFTER.has(v.kind) && !dayPlace) || (host && v.id === host.id)) continue;
        const d = metres(v, e), w = walk(d);
        if (w == null || w < 2 || w > MAX_AFTER) continue;
        const minute = round5(end + 15 + w);
        if (dayPlace) { if (minute >= 17 * 60) continue; }
        else if (minute > 23 * 60 + 30 || minute < (v.kind === 'club' ? 21 * 60 : 16 * 60)) continue;   /* a club after nine, a bar after four */
        const h = hoursAt(v, minute);
        if (!fitsStay(v, minute, minute + STAY)) continue;
        const s = (h === 'open' ? 1.5 : .8) - w / 30 + (wantsPlace(opts, v) ? 1.5 : 0);
        if (!bestAfter || s > bestAfter.s) bestAfter = { v, w, minute, h, s };
      }
      if (!bestBefore && !bestAfter) continue;
      const entries = [];
      if (bestBefore) { stops.push(placeStop(bestBefore.v, bestBefore.minute, null, bestBefore.h)); entries.push(bestBefore.v); score += 3 + bestBefore.s; }
      stops.push(eventStop(e, start, bestBefore ? metres(bestBefore.v, e) : null)); entries.push(e);
      if (bestAfter) { stops.push(placeStop(bestAfter.v, bestAfter.minute, metres(e, bestAfter.v), bestAfter.h)); entries.push(bestAfter.v); score += 2 + bestAfter.s; }
      if (!holdsMood(opts, stops, entries)) continue;
      if (host && host.picked) score += 1;
      if (R().interests && R().interests.matches && R().interests.matches(e)) score += 1;
      score -= Math.max(0, (start - now) - 360) / 120;              /* prefer the next few hours */
      if (me) { const d = G().distanceTo(stops[0].type === 'event' ? e : bestBefore.v); if (d != null) score -= d / (opts.near ? 600 : 4000); }
      found.push({ score, stops, start });
    }
    return found.sort((a, b) => b.score - a.score);
  };
  const compose = () => { const best = evenings()[0]; return best ? build(best.stops) : null; };

  /* A few picked places on foot, for when nothing is on soon: open when you
     would be there, each a short walk from the one before, never the same kind
     of place twice running. Daytime kinds from six to five; after that bars,
     taprooms and clubs join them, and the hours decide (`fits`). Nothing is
     tried between three and six in the morning. */
  const WALK_STEP = 10;
  const asleep = (minute) => { const m = ((minute % DAY) + DAY) % DAY; return m >= 3 * 60 && m < 6 * 60; };
  const walks = (opts = {}) => {
    const now = nowMin();
    const day = now >= 6 * 60 && now < 17 * 60;
    const kinds = (v) => (day ? BEFORE.has(v.kind) : BEFORE.has(v.kind) || AFTER.has(v.kind));
    const pool = R().places().filter(v => v.picked && G().coordsFor(v) && kinds(v));
    if (pool.length < 2) return [];
    const me = G().currentLoc();
    const found = [];
    for (const first of pool) {
      const toFirst = me ? walk(G().distanceTo(first)) : 0;
      if (toFirst != null && toFirst > (opts.near ? NEAR : MAX_BEFORE)) continue;
      const m0 = round5(now + 10 + (toFirst || 0));
      const h0 = hoursAt(first, m0);
      if (asleep(m0) || !fitsStay(first, m0, m0 + STAY)) continue;
      const stops = [placeStop(first, m0, null, h0)], entries = [first];
      let score = (h0 === 'open' ? 2 : 1) + (first.pickNote ? .2 : 0) - (toFirst || 0) / 30;
      let at = m0, prev = first;
      for (let n = 0; n < 2; n++) {
        let best = null;
        for (const v of pool) {
          if (stops.some(s => s.id === v.id) || v.kind === prev.kind) continue;
          const w = walk(metres(prev, v));
          if (w == null || w < 1 || w > WALK_STEP) continue;
          const minute = round5(at + STAY + w);
          const h = hoursAt(v, minute);
          if (asleep(minute) || !fitsStay(v, minute, minute + STAY)) continue;
          if (day && minute >= 17 * 60 && !AFTER.has(v.kind) && h !== 'open') continue;
          const sc = (h === 'open' ? 1.5 : .8) - w / 30 + (v.pickNote ? .2 : 0) + (wantsPlace(opts, v) ? 1.5 : 0);
          if (!best || sc > best.sc) best = { v, w, minute, h, sc };
        }
        if (!best) break;
        stops.push(placeStop(best.v, best.minute, metres(prev, best.v), best.h)); entries.push(best.v);
        score += best.sc; at = best.minute; prev = best.v;
      }
      if (stops.length < 2 || !holdsMood(opts, stops, entries)) continue;
      found.push({ score: score + (wantsPlace(opts, first) ? 1.5 : 0) - (opts.near ? (toFirst || 0) / 5 : 0), stops });
    }
    return found.sort((a, b) => b.score - a.score);
  };

  /* The next few hours, best first. What starts soon leads (a stored evening or one
     worked out here), then places on foot, then later evenings; no two are the same.
     A stored evening leads only when nothing narrows the search. */
  const plan = (opts = {}) => {
    const out = [], seen = new Set();
    const add = (r) => { if (r) { const k = param(r); if (!seen.has(k)) { seen.add(k); out.push(r); } } };
    const now = nowMin(), soon = now + 150;
    const stored = !wantOf(opts) && opts.cap == null && !opts.near ? upcoming().filter(r => r.off === 0) : [];
    stored.filter(r => r.stops[0].minute <= soon).forEach(add);
    const evs = evenings(opts);
    evs.filter(r => r.start <= soon + 30).forEach(r => add(build(r.stops)));
    walks(opts).slice(0, 6).forEach(r => add(build(r.stops)));
    stored.forEach(add);
    evs.forEach(r => add(build(r.stops)));
    /* Near me: the closer the first stop, the sooner (in steps of five minutes on foot), the order otherwise kept. */
    const step = (r) => (r.fromYou == null ? 99 : Math.ceil(Math.max(1, r.fromYou) / 5));
    if (opts.near) out.sort((a, b) => step(a) - step(b));
    return out.slice(0, 8);
  };

  /* Picked places within a short walk of somewhere, for "after this": one per mood
     first (the nearest of each, so the choices differ), then the nearest of the rest,
     closest first. Shut places are left out; unknown hours stay and say so. */
  const nextFrom = (entry, o = {}) => {
    const max = o.max || 10, limit = o.limit || 3, now = o.minute ?? nowMin(), offset = o.offset || 0;
    const moods = MOODS() ? MOODS().available() : [];
    const rows = R().places().filter(v => v.picked && v.id !== entry.id && v.id !== entry.venueId && G().coordsFor(v))
      .map(v => ({ v, w: walk(metres(entry, v)) })).filter(r => r.w != null && r.w <= max)
      .map(r => Object.assign(r, { hours: hoursAt(r.v, now + r.w, offset) }))
      .map(r => Object.assign(r, { closes: r.hours === 'open' ? closesAt(r.v, now + r.w, offset) : null }))
      .filter(r => r.hours !== 'shut' && (r.hours === 'open' || usual(r.v.kind, now + r.w) || !USUAL[r.v.kind]))
      /* Still open half an hour after you arrive. */
      .filter(r => { const later = now + r.w + 25, h = hoursAt(r.v, later, offset); return h !== 'shut' && (h === 'open' || usual(r.v.kind, later) || !USUAL[r.v.kind]); })
      .sort((a, b) => a.w - b.w);
    const chosen = [];
    for (const m of moods) {
      const hit = rows.find(r => !chosen.includes(r) && MOODS().matchesPlace(m.id, r.v));
      if (hit) { hit.mood = m.label; chosen.push(hit); }
      if (chosen.length >= limit) break;
    }
    for (const r of rows) { if (chosen.length >= limit) break; if (!chosen.includes(r)) chosen.push(r); }
    return chosen.sort((a, b) => a.w - b.w).slice(0, limit);
  };

  /* A route that starts at this place or listing and walks on: up to two picked
     places after it, a short walk from the one before. */
  const fromHere = (entry) => {
    const isEvent = entry.title !== undefined;
    const day = isEvent ? W().resolveKey?.(entry) : W().todayKey?.();
    const offset = day ? dayOffset(day) : 0;
    if (offset < 0) return null;
    if (isEvent && (R().isOff(entry) || entry.flag === 'sold_out' || W().hasEnded(entry))) return null;
    const now = nowMin();
    let start = isEvent ? startOf(entry) : round5(now + 5);
    if (start == null) return null;
    if (isEvent && !G().coordsFor(entry)) return null;
    const first = isEvent ? eventStop(entry, start, null) : placeStop(entry, start, null, hoursAt(entry, start, offset), offset);
    const stops = [first];
    let prev = entry, at = isEvent ? endOf(entry, start) : start + STAY;
    for (let n = 0; n < 2; n++) {
      const pick = nextFrom(prev, { limit: 3, max: 10, minute: at + 10, offset }).find(r => {
        const arrival = round5(at + 10 + r.w);
        return !stops.some(s => s.id === r.v.id) && fitsStay(r.v, arrival, arrival + STAY, offset);
      });
      if (!pick) break;
      const minute = round5(at + 10 + pick.w);
      stops.push(placeStop(pick.v, minute, metres(prev, pick.v), hoursAt(pick.v, minute, offset), offset));
      prev = pick.v; at = minute + STAY;
    }
    return stops.length > 1 ? Object.assign(build(stops), { day, off: offset }) : null;
  };

  /* ── The route as a URL ───────────────────────────────────── */
  const param = (route) => route.stops.map(s => `${s.type}:${s.id}:${s.minute}`).join(',');
  const fromParam = (str, offset = 0) => {
    const parts = String(str || '').split(',').map(x => x.split(':'));
    if (parts.length < 2 || parts.length > 6 || parts.some(p => p.length !== 3 || !/^(place|event)$/.test(p[0]) || !/^[\w.-]{1,80}$/.test(p[1]) || !/^\d{1,4}$/.test(p[2]))) return null;
    const stops = [];
    const ids = new Set();
    for (const [type, id, min] of parts) {
      const minute = Number(min);
      let entry;
      if (type === 'place') entry = (window.WA._venuesAll || []).find(v => v.id === id) || (window.WA._venuesAll || []).find(v => window.WA.canonicalId && v.id === window.WA.canonicalId(id));
      else entry = (window.WA.catalog || []).find(e => e.id === id) || (window.WA.catalog || []).find(e => window.WA.canonicalId && e.id === window.WA.canonicalId(id));
      if (!entry || entry.isClosed || entry.isVerified === false || ids.has(entry.id) || minute >= 2880) return null;
      ids.add(entry.id);
      const prev = stops[stops.length - 1];
      if (prev && minute <= prev.minute) return null;
      const prevM = prev ? (type === 'place' ? metres(entry, prev) : metres(prev, entry)) : null;
      stops.push(type === 'place' ? placeStop(entry, minute, prevM, hoursAt(entry, minute, offset), offset) : eventStop(entry, minute, prevM));
    }
    return Object.assign(build(stops), { day: W().keyPlus?.(offset), off: offset });
  };

  const href = (route) => `route.html?s=${encodeURIComponent(param(route))}&d=${encodeURIComponent(route.day || W().todayKey())}${route.id ? `&t=${encodeURIComponent(route.id)}` : ''}`;
  const fromURL = (str, day) => {
    /* Older event links can recover their day from the listing. A place-only
       legacy link has no date evidence and keeps the old today behaviour. */
    if (day == null) {
      const eventId = String(str).split(',').find(x => x.startsWith('event:'))?.split(':')[1];
      const event = eventId && (window.WA.catalog || []).find(e => e.id === eventId);
      day = (event && W().resolveKey(event)) || W().todayKey();
    }
    const offset = dayOffset(day);
    if (offset < 0) return null;
    const route = fromParam(str, offset);
    if (!route || (offset === 0 && route.stops[0].minute < nowMin() - 15)) return null;
    if (route.stops.some(s => s.type === 'place' && !fits({ kind: s.kind }, s.hours, s.minute))) return null;
    for (const [i, stop] of route.stops.entries()) {
      if (stop.type !== 'event') continue;
      const event = (window.WA.catalog || []).find(e => e.id === stop.id);
      if (!event || R().isOff(event) || event.flag === 'sold_out' || W().hasEnded(event)
        || startOf(event) !== stop.minute % DAY || W().resolveKey(event) !== W().keyPlus(offset + Math.floor(stop.minute / DAY))) return null;
      const next = route.stops[i + 1];
      if (next && next.minute < endOf(event, stop.minute) + (next.walk || 0)) return null;
    }
    return route;
  };

  /* A walking route in Google Maps; no origin, so it starts where you are. */
  const mapsUrl = (route) => {
    if (route.stops.some(s => s.lat == null || s.lng == null || !Number.isFinite(Number(s.lat)) || !Number.isFinite(Number(s.lng)) || Math.abs(Number(s.lat)) > 90 || Math.abs(Number(s.lng)) > 180)) return '';
    const pts = route.stops.map(s => `${Number(s.lat).toFixed(6)},${Number(s.lng).toFixed(6)}`);
    if (pts.length < 2) return '';
    const dest = pts[pts.length - 1], via = pts.slice(0, -1);
    return `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${dest}&waypoints=${via.join('%7C')}`;
  };

  /* ── Evenings the pipeline composed ─────────────────────────── */
  let stored = null, pending = null;
  const loadStored = () => {
    if (pending) return pending;
    const qs = `city=eq.${encodeURIComponent(window.WA.CITY || 'tallinn')}&day=gte.${W().todayKey()}&order=day.asc,score.desc&limit=30&select=id,day,area,title,blurb,stops,score,engine`;
    pending = (window.WA.read ? window.WA.read('routes', qs) : Promise.reject(new Error('no reader'))).then(r => (r.ok ? r.json() : [])).catch(() => [])
      .then((rows) => { stored = Array.isArray(rows) ? rows : []; document.dispatchEvent(new CustomEvent('wa:routes-ready')); return stored; });
    return pending;
  };
  const dayOffset = (day) => { for (let i = 0; i < 7; i++) if (W().keyPlus(i) === day) return i; return -1; };

  /* A stored route, checked against the page's own data: every stop is still
     there, the listing has not started, and no place is shut when you would
     be there. Anything else, and it is simply not shown. */
  const fromRow = (row) => {
    const off = dayOffset(row.day);
    if (off < 0 || !Array.isArray(row.stops)) return null;
    const r = fromURL(row.stops.map(s => `${s.type}:${s.id}:${s.minute}`).join(','), row.day);
    if (!r) return null;
    if (r.stops.some(s => s.hours === 'shut' || (s.type === 'place' && s.hours === 'unknown' && !usual(s.kind, s.minute)))) return null;
    /* Each place stays open until you would leave it for the next stop. */
    if (r.stops.some((s, i) => {
      if (s.type !== 'place') return false;
      const v = (window.WA._venuesAll || []).find(x => x.id === s.id), next = r.stops[i + 1];
      const leave = next ? next.minute - (next.walk || 0) : s.minute + STAY;
      return !v || !fitsStay(v, s.minute, Math.max(leave, s.minute + 10), off);
    })) return null;
    const anchor = r.stops.find(s => s.type === 'event');
    const entry = anchor && (window.WA.catalog || []).find(e => e.id === anchor.id);
    if (!entry || R().isOff(entry) || W().hasEnded(entry)) return null;
    if (off === 0 && anchor.minute < nowMin() + 10) return null;
    if (off === 0 && r.stops[0].minute < nowMin() - 15) return null;                 /* it would already have begun */
    /* The stored title and note are the model's English; in another language the evening keeps its
       composed title, in that language, and no note. */
    const en = !window.WA.Lang || window.WA.Lang.current() === 'en';
    return Object.assign(r, { id: row.id, day: row.day, off, saved: true,
      ...(en ? { title: row.title, blurb: row.blurb || '', engine: row.engine } : { blurb: '', engine: 'rules' }) });
  };
  const upcoming = () => (stored || []).map(fromRow).filter(Boolean);
  const best = () => plan()[0] || compose();

  /* ── Markup shared by Tonight's card and the route page ───── */
  const esc = (x) => window.WA.UI.esc(x);
  const clock = (m) => H().clock(m % DAY);
  const stopSub = (s) => {
    if (s.type === 'event') return [s.venue, s.price].filter(Boolean).join(' · ');
    return [R().kindLabel(s.kind, true), hoursNote(s.hours, s.closes)].filter(Boolean).join(' · ');
  };
  const lengthText = (route) => {
    const first = route.stops[0].minute, last = route.stops[route.stops.length - 1].minute;
    const span = Math.max(0, last - first);
    const h = Math.floor(span / 60), m = span % 60;
    const len = h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
    const dist = route.metres ? `, ${G().format(route.metres)} on foot` : '';
    return `${len}${dist}`;
  };

  /* The route cards in lists of evenings: title, stops and walks between. */
  const card = (route, o = {}) => {
    const opt = typeof o === 'string' ? { label: o } : o;
    const url = esc(href(route));
    const sub = [opt.label, route.area, `about ${lengthText(route).split(',')[0]}`, costText(route)].filter(Boolean).join(' · ');
    const lead = route.fromYou != null ? `<li class="rt-card__walk rt-card__walk--you" aria-hidden="true"><span></span><span class="rt-card__rail"></span><span>${esc(G().anchor() ? (route.fromYou <= 1 ? 'Right by here' : `${route.fromYou} min walk from here`) : (route.fromYou <= 1 ? 'Right by you' : `${route.fromYou} min walk from you`))}</span></li>` : '';
    const stops = lead + route.stops.map((s, i) => `${i && s.walk ? `<li class="rt-card__walk" aria-hidden="true"><span></span><span class="rt-card__rail"></span><span>${esc(`${s.walk} min walk`)}</span></li>` : ''}<li class="rt-card__stop${s.type === 'event' ? ' is-event' : ''}">
        <time>${esc(clock(s.minute))}</time><span class="rt-card__dot" aria-hidden="true"></span>
        <span class="rt-card__what"><b>${esc(s.name)}</b><small>${esc(stopSub(s))}</small></span></li>`).join('');
    return `<section class="rt-card" aria-label="${esc(route.title)}">
      <a class="rt-card__main" href="${url}"><span class="rt-card__title">${esc(route.title)}</span><span class="rt-card__sub">${esc(sub)}</span>
      <ol class="rt-card__stops">${stops}</ol></a></section>`;
  };

  window.WA.Route = { compose, plan, best, nextFrom, fromHere, loadStored, upcoming, fromParam, fromURL, param, href, mapsUrl, titleFor, card, stopSub, hoursNote, lengthText, costText };
})();
