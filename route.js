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
     .best()             → tonight's best: a stored one that still holds, else compose()
     .loadStored()       → Promise of the stored routes (cached; 'wa:routes-ready' when they arrive)
     .upcoming()         → stored routes that still hold, soonest day first, best first
     .fromParam(s)       → a route from the URL's stops, or null
     .param(route)       → the URL's `s` value
     .mapsUrl(route)     → a walking route in Google Maps
   Route: { title, area, stops[], walkMin, metres }
   Stop:  { type, id, name, kind, area, minute, walk (min from the stop before), lat, lng, href, note, hours }
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const W = () => window.WA.when, G = () => window.WA.Geo, H = () => window.WA.Hours, R = () => window.WA.R;

  const BEFORE = new Set(['record store', 'bookshop', 'gallery', 'thrift', 'arts centre', 'cinema']);
  const AFTER = new Set(['bar', 'club']);
  const MAX_BEFORE = 15, MAX_AFTER = 12, DAY = 24 * 60;

  const nowMin = () => H().cityNow().minutes;
  const at = (minute, offset = 0) => new Date(Date.now() + (minute - nowMin() + offset * DAY) * 60000);
  const metres = (a, b) => {
    const ca = G().coordsFor(a), cb = G().coordsFor(b);
    return ca && cb ? G().distanceTo(a, cb) : null;
  };
  const walk = (m) => (m == null ? null : G().walkMinutes(m));
  const round5 = (m) => Math.round(m / 5) * 5;

  /* Is a place open at this minute: 'open', 'shut' or 'unknown' (hours not filed). */
  const hoursAt = (v, minute, offset = 0) => {
    const s = v && v.openingHours ? H().state(v.openingHours, at(minute, offset)) : null;
    return !s || !s.known ? 'unknown' : s.open ? 'open' : 'shut';
  };

  const startOf = (e) => G().startMinutes(e);
  const endOf = (e, start) => {
    const t = e.endsAt ? Date.parse(e.endsAt) : NaN, s = e.startsAt ? Date.parse(e.startsAt) : NaN;
    const len = !isNaN(t) && !isNaN(s) ? Math.round((t - s) / 60000) : 120;
    return start + Math.min(Math.max(len, 45), 180);
  };

  /* A listing's own words, cut at a word, never mid-sentence into silence. */
  const clip = (t, n = 140) => {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n), sp = cut.lastIndexOf(' ');
    return `${(sp > 60 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '')}…`;
  };

  const placeStop = (v, minute, prevM, hours) => ({
    type: 'place', id: v.id, name: v.name, kind: v.kind, area: R().areaOf(v) || '', minute, walk: walk(prevM),
    lat: v.lat, lng: v.lng, href: `detail.html?id=${encodeURIComponent(v.id)}`, note: v.pickNote || '', hours,
  });
  const eventStop = (e, minute, prevM) => {
    const c = G().coordsFor(e) || {};
    return { type: 'event', id: e.id, name: e.title || '', kind: e.kind, area: R().areaOf(e) || '', minute, walk: walk(prevM),
      lat: c.lat, lng: c.lng, href: `detail.html?id=${encodeURIComponent(e.id)}`, note: clip(e.description), hours: 'event',
      venue: e.venue || '', price: R().isFree(e) ? 'Free' : '' };
  };

  /* Words for the title, in the order of the evening. */
  const BEFORE_WORD = { 'record store': 'Records', bookshop: 'Books', gallery: 'A gallery', thrift: 'Thrift', 'arts centre': 'An arts centre', cinema: 'A film' };
  const ANCHOR_WORD = { gig: 'a gig', club: 'a club night', film: 'a film', theatre: 'a stage', talk: 'a talk', workshop: 'a workshop', exhibition: 'an opening', festival: 'a festival' };
  const titleFor = (stops) => {
    const words = stops.map((s, i) => {
      if (s.type === 'event') return ANCHOR_WORD[String(s.kind || '').toLowerCase()] || 'a show';
      if (i === 0) return BEFORE_WORD[s.kind] || 'A place';
      return s.minute >= 21 * 60 ? 'a late drink' : s.kind === 'club' ? 'a club' : 'a drink';
    });
    const t = words.join(', ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  const build = (stops) => {
    let m = 0;
    for (let i = 1; i < stops.length; i++) m += metres(stops[i - 1], stops[i]) || 0;
    const anchor = stops.find(s => s.type === 'event') || stops[0];
    return { title: titleFor(stops), area: anchor.area, stops, walkMin: stops.reduce((n, s) => n + (s.walk || 0), 0), metres: Math.round(m) };
  };

  /* The best evening for the rest of tonight, or null. */
  const compose = () => {
    const now = nowMin();
    const places = R().places().filter(v => v.picked && G().coordsFor(v));
    if (!places.length) return null;
    const anchors = R().live().filter(e => W().isTonight(e) && !R().isOff(e) && !R().isLive(e) && G().coordsFor(e)
      && startOf(e) != null && startOf(e) >= now + 20 && startOf(e) < DAY);
    const me = G().currentLoc();
    let best = null;
    for (const e of anchors) {
      const start = startOf(e), host = window.WA.venueFor ? window.WA.venueFor(e) : null;
      const here = G().coordsFor(e);
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
        const h = hoursAt(v, minute);
        if (h === 'shut' || (h === 'open' && hoursAt(v, Math.min(start - w - 10, minute + 30)) === 'shut')) continue;
        const s = (h === 'open' ? 2 : 1) - w / 30 + (v.pickNote ? .2 : 0);
        if (!bestBefore || s > bestBefore.s) bestBefore = { v, w, minute, h, s };
      }
      /* A picked bar or club after it. */
      const end = endOf(e, start);
      let bestAfter = null;
      for (const v of places) {
        if (!AFTER.has(v.kind) || (host && v.id === host.id)) continue;
        const d = metres(v, e), w = walk(d);
        if (w == null || w < 2 || w > MAX_AFTER) continue;
        const minute = round5(end + 15 + w);
        if (minute > 23 * 60 + 30 || minute < (v.kind === 'club' ? 21 * 60 : 16 * 60)) continue;   /* a club after nine, a bar after four */
        const h = hoursAt(v, minute);
        if (h === 'shut') continue;
        const s = (h === 'open' ? 1.5 : .8) - w / 30;
        if (!bestAfter || s > bestAfter.s) bestAfter = { v, w, minute, h, s };
      }
      if (!bestBefore && !bestAfter) continue;
      if (bestBefore) { stops.push(placeStop(bestBefore.v, bestBefore.minute, null, bestBefore.h)); score += 3 + bestBefore.s; }
      stops.push(eventStop(e, start, bestBefore ? metres(bestBefore.v, e) : null));
      if (bestAfter) { stops.push(placeStop(bestAfter.v, bestAfter.minute, metres(e, bestAfter.v), bestAfter.h)); score += 2 + bestAfter.s; }
      if (host && host.picked) score += 1;
      if (R().interests && R().interests.matches && R().interests.matches(e)) score += 1;
      score -= Math.max(0, (start - now) - 360) / 120;              /* prefer the next few hours */
      if (me) { const d = G().distanceTo(e); if (d != null) score -= d / 4000; }
      if (!best || score > best.score) best = { score, stops };
    }
    return best ? build(best.stops) : null;
  };

  /* ── The route as a URL ───────────────────────────────────── */
  const param = (route) => route.stops.map(s => `${s.type}:${s.id}:${s.minute}`).join(',');
  const fromParam = (str, offset = 0) => {
    const parts = String(str || '').split(',').slice(0, 6).map(x => x.split(':'));
    if (parts.length < 2 || parts.some(p => p.length !== 3 || !/^(place|event)$/.test(p[0]) || !/^[\w.-]{1,80}$/.test(p[1]) || !/^\d{1,4}$/.test(p[2]))) return null;
    const stops = [];
    for (const [type, id, min] of parts) {
      const minute = Number(min);
      let entry;
      if (type === 'place') entry = (window.WA._venuesAll || []).find(v => v.id === id);
      else entry = (window.WA.catalog || []).find(e => e.id === id) || (window.WA.catalog || []).find(e => window.WA.canonicalId && e.id === window.WA.canonicalId(id));
      if (!entry) return null;
      const prev = stops[stops.length - 1];
      const prevM = prev ? (type === 'place' ? metres(entry, prev) : metres(prev, entry)) : null;
      stops.push(type === 'place' ? placeStop(entry, minute, prevM, hoursAt(entry, minute, offset)) : eventStop(entry, minute, prevM));
    }
    return build(stops);
  };

  /* A walking route in Google Maps; no origin, so it starts where you are. */
  const mapsUrl = (route) => {
    const pts = route.stops.filter(s => s.lat != null && s.lng != null).map(s => `${Number(s.lat).toFixed(6)},${Number(s.lng).toFixed(6)}`);
    if (pts.length < 2) return '';
    const dest = pts[pts.length - 1], via = pts.slice(0, -1);
    return `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${dest}&waypoints=${via.join('%7C')}`;
  };

  /* ── Evenings the pipeline composed ─────────────────────────── */
  let stored = null, pending = null;
  const loadStored = () => {
    if (pending) return pending;
    const h = window.WA.ANON_KEY ? { apikey: window.WA.ANON_KEY, Authorization: `Bearer ${window.WA.ANON_KEY}` } : {};
    const q = `routes?city=eq.${encodeURIComponent(window.WA.CITY || 'tallinn')}&day=gte.${W().todayKey()}&order=day.asc,score.desc&limit=30&select=id,day,area,title,blurb,stops,score,engine`;
    pending = fetch(`${window.WA.BASE_URL || ''}/rest/v1/${q}`, { headers: h }).then(r => (r.ok ? r.json() : [])).catch(() => [])
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
    const r = fromParam(row.stops.map(s => `${s.type}:${s.id}:${s.minute}`).join(','), off);
    if (!r) return null;
    if (r.stops.some(s => s.hours === 'shut')) return null;
    const anchor = r.stops.find(s => s.type === 'event');
    const entry = anchor && (window.WA.catalog || []).find(e => e.id === anchor.id);
    if (!entry || R().isOff(entry) || W().hasEnded(entry)) return null;
    if (off === 0 && anchor.minute < nowMin() + 10) return null;
    if (off === 0 && r.stops[0].minute < nowMin() - 15) return null;                 /* it would already have begun */
    return Object.assign(r, { id: row.id, day: row.day, off, title: row.title, blurb: row.blurb || '', engine: row.engine, saved: true });
  };
  const upcoming = () => (stored || []).map(fromRow).filter(Boolean);
  const best = () => upcoming().find(r => r.off === 0) || compose();

  /* ── Markup shared by Tonight's card and the route page ───── */
  const esc = (x) => window.WA.UI.esc(x);
  const clock = (m) => H().clock(m % DAY);
  const stopSub = (s) => {
    if (s.type === 'event') return [s.venue, s.price].filter(Boolean).join(' · ');
    const hours = s.hours === 'open' ? 'open then' : s.hours === 'unknown' ? 'hours not filed' : '';
    return [R().kindLabel(s.kind, true), hours].filter(Boolean).join(' · ');
  };
  const lengthText = (route) => {
    const first = route.stops[0].minute, last = route.stops[route.stops.length - 1].minute;
    const span = Math.max(0, last - first);
    const h = Math.floor(span / 60), m = span % 60;
    const len = h ? `${h} h${m ? ` ${m}` : ''}` : `${m} min`;
    const dist = route.metres ? `, ${G().format(route.metres)} on foot` : '';
    return `${len}${dist}`;
  };

  /* The small card on Tonight: the stops, no more. */
  const card = (route, label) => `<a class="rt-card" href="route.html?s=${esc(param(route))}${route.id ? `&t=${esc(encodeURIComponent(route.id))}` : ''}" aria-label="${esc(`${label || "Tonight's route"}: ${route.title}`)}">
      <span class="rt-card__head"><span class="rt-card__eyebrow">${esc(label || "Tonight's route")}${route.area ? ` · ${esc(route.area)}` : ''}</span><span class="rt-card__go">Open ${window.WA.Icon('arrow')}</span></span>
      <span class="rt-card__title">${esc(route.title)}</span>
      <ol class="rt-card__stops">${route.stops.map((s, i) => `<li class="rt-card__stop${s.type === 'event' ? ' is-event' : ''}">
        <time>${esc(clock(s.minute))}</time><span class="rt-card__dot" aria-hidden="true"></span>
        <span class="rt-card__what"><b>${esc(s.name)}</b><small>${esc(i && s.walk ? `${s.walk} min walk` : stopSub(s))}</small></span></li>`).join('')}</ol></a>`;

  window.WA.Route = { compose, best, loadStored, upcoming, fromParam, param, mapsUrl, titleFor, card, stopSub, lengthText };
})();
