/* ============================================================
   map.js — the Map tab.
   ------------------------------------------------------------
   Two layers with two pin shapes: events are pills carrying their
   start time (vermilion when on now); places are round discs with their
   pictogram, ringed when open now. A chosen pin raises a preview card. A drawer (a sidebar from
   1024) lists what is in view by walking time. Pins cluster in screen
   space; the selected pin never clusters. Camera moves go through
   WA.MapTiles, which honours reduced motion.
   URL: ?when=tonight|tomorrow|weekend|thisweek
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const G = () => window.WA.Geo;
  const T = () => window.WA.MapTiles;
  const esc = (s) => window.WA.UI.esc(s);

  const state = { events: true, places: true, when: 'tonight', active: '' };
  const WHEN = ['tonight', 'tomorrow', 'weekend', 'thisweek'];
  const qp = new URLSearchParams(location.search);
  if (WHEN.includes(qp.get('when'))) state.when = qp.get('when');

  let events = [], places = [], clusters = [], me = null, lastDrawer = '';

  const withCoords = (x) => { const c = G().coordsFor(x); return c ? Object.assign(x, { _c: c }) : null; };

  const collect = () => {
    events = R().live().filter(e => W().matches(e, state.when)).map(withCoords).filter(Boolean)
      .sort(G().bySoonestThenDistance());
    /* The places layer is what is open now, plus the rooms hosting an
       event in this window; the rest of the catalogue lives on Places. */
    const hosts = new Set(events.map(e => e.venueId).filter(Boolean));
    const hostNames = new Set(events.map(e => String(e.venue || '').toLowerCase().trim()));
    places = R().places().filter(v => R().openState(v).open === true || hosts.has(v.id) || hostNames.has(String(v.name).toLowerCase().trim()))
      .map(withCoords).filter(Boolean);
    const open = places.filter(v => R().openState(v).open === true).length;
    $('n-events').textContent = String(events.length);
    $('n-places').textContent = `${open} open`;
    $('layer-events').setAttribute('aria-pressed', String(state.events));
    $('layer-places').setAttribute('aria-pressed', String(state.places));
    $('map-when').value = state.when;
  };

  const shown = () => [
    ...(state.events ? events.map(e => ({ kind: 'event', x: e })) : []),
    ...(state.places ? places.map(v => ({ kind: 'place', x: v })) : []),
  ];

  /* ── Pins ───────────────────────────────────────────────────── */
  const pinFor = (it, p) => {
    const { x } = it;
    const cur = x.id === state.active;
    if (it.kind === 'event') {
      const live = R().isLive(x);
      const t = live ? 'Now' : (R().clockOf(x) || R().dow(W().resolveKey(x) || W().todayKey()));
      return `<button class="wa-pin wa-pin--event${live ? ' wa-pin--live' : ''}" type="button" data-pin="${esc(x.id)}" aria-current="${cur}"
        aria-label="${esc(`${x.title}, ${t}, ${x.venue || ''}`)}" style="left:${p.x}px;top:${p.y}px"><span class="wa-pin__tag">${esc(t)}</span></button>`;
    }
    const o = R().openState(x);
    return `<button class="wa-pin wa-pin--place ${o.open === true ? 'is-open' : 'is-shut'}" type="button" data-pin="${esc(x.id)}" aria-current="${cur}"
      aria-label="${esc(`${x.name}, ${o.text}`)}" style="left:${p.x}px;top:${p.y}px"><span class="wa-pin__disc">${window.WA.Picto.kind(x.kind)}</span></button>`;
  };

  /* The card that rises for the chosen pin: photo, title, the facts,
     a heart, and a way to close it. */
  const preview = () => {
    const host = $('preview');
    const x = [...events, ...places].find(y => y.id === state.active);
    if (!x) { host.dataset.open = 'false'; host.innerHTML = ''; return; }
    const isEvent = !!x.title;
    const src = x.imageUrl && x.imageSource !== 'logo' ? window.WA.UI.safeUrl(x.imageUrl) : '';
    const m = R().walk(x);
    const meta1 = isEvent ? R().badgeFor(x).text : R().openState(x).text;
    const meta2 = (isEvent ? [x.venue, R().price(x)] : [R().kindLabel(x.kind, true), R().areaOf(x)])
      .concat(m != null ? [`${R().walkLabel(m)} walk`] : []).filter(Boolean).join(' · ');
    host.innerHTML = `<a class="map-preview__link" href="detail.html?id=${esc(encodeURIComponent(x.id))}" data-row="${esc(x.id)}">
        <span class="map-preview__art">${src ? `<img src="${esc(src)}" alt="">` : window.WA.Picto.kind(x.kind)}</span>
        <span class="map-preview__body">
          <span class="map-preview__title">${esc(isEvent ? x.title : x.name)}</span>
          <span class="map-preview__meta">${esc(meta1)}</span>
          ${meta2 ? `<span class="map-preview__meta">${esc(meta2)}</span>` : ''}
        </span>
      </a>
      ${R().heart(x.id, isEvent ? x.title : x.name)}
      <button class="wa-iconbtn map-preview__close" type="button" data-act="unpick" aria-label="Close">${window.WA.Icon('close')}</button>`;
    host.dataset.open = 'true';
  };

  const placePins = () => {
    const t = T();
    if (!t || !t.isReady()) return;
    const CL = 42;
    const items = shown().map(it => ({ it, p: t.project(it.x._c.lng, it.x._c.lat) })).filter(o => o.p);
    clusters = [];
    for (const o of items) {
      if (o.it.x.id === state.active) { clusters.push({ ...o, members: [o.it] }); continue; }
      const near = clusters.find(c => c.it.x.id !== state.active && Math.abs(c.p.x - o.p.x) < CL && Math.abs(c.p.y - o.p.y) < CL);
      if (near) near.members.push(o.it); else clusters.push({ ...o, members: [o.it] });
    }
    let html = clusters.map((c, i) => c.members.length > 1
      ? `<button class="wa-pin wa-pin--cluster" type="button" data-cluster="${i}" aria-label="${esc(`${c.members.length} here, zoom in`)}" style="left:${c.p.x}px;top:${c.p.y}px"><span class="wa-pin__count">${c.members.length}</span></button>`
      : pinFor(c.it, c.p)).join('');
    if (me) { const p = t.project(me.lng, me.lat); if (p) html += `<span class="wa-pin wa-pin--me" style="left:${p.x}px;top:${p.y}px"><span></span></span>`; }
    $('map-pins').innerHTML = html;
  };

  /* ── Drawer: what's in view, by walking time ─────────────── */
  const inView = () => {
    const m = T() && T().getMap && T().getMap();
    const b = m && m.getBounds ? m.getBounds() : null;
    const inside = (x) => !b || (x._c.lng >= b.getWest() && x._c.lng <= b.getEast() && x._c.lat >= b.getSouth() && x._c.lat <= b.getNorth());
    return {
      ev: state.events ? events.filter(inside) : [],
      pl: state.places ? places.filter(inside) : [],
    };
  };

  const byWalk = (list, fallback) => (G().currentLoc()
    ? list.slice().sort((a, b) => (G().distanceTo(a) ?? 1e9) - (G().distanceTo(b) ?? 1e9))
    : list.slice().sort(fallback));

  const placeDrawer = () => {
    const { ev, pl } = inView();
    const openFirst = (a, b) => (R().openState(a).open === true ? 0 : 1) - (R().openState(b).open === true ? 0 : 1) || String(a.name).localeCompare(String(b.name));
    const evs = byWalk(ev, G().bySoonestThenDistance());
    const pls = byWalk(pl, openFirst);
    const whenWord = { tonight: 'tonight', tomorrow: 'tomorrow', weekend: 'this weekend', thisweek: 'this week' }[state.when];
    $('drawer-title').textContent = evs.length || pls.length ? 'In view' : 'Nothing in view';
    $('drawer-sub').textContent = [
      state.events ? `${evs.length} ${evs.length === 1 ? 'event' : 'events'} ${whenWord}` : '',
      state.places ? `${pls.length} ${pls.length === 1 ? 'place' : 'places'}` : '',
      G().currentLoc() ? 'nearest first' : '',
    ].filter(Boolean).join(' · ');

    let html = '';
    if (evs.length) html += `<p class="map-drawer__label">Events</p><ul class="wa-rows">${evs.slice(0, 30).map(e => R().row(e, { day: state.when !== 'tonight', noThumb: true })).join('')}</ul>`;
    if (pls.length) html += `<p class="map-drawer__label">Places</p><ul>${pls.slice(0, 30).map(v => R().placeRow(v)).join('')}</ul>`;
    if (!evs.length && !pls.length) {
      html += `<p class="map-legend-note">Zoom out or move the map. ${events.length} ${events.length === 1 ? 'event is' : 'events are'} placed ${whenWord}${state.events ? '' : ', with the events layer off'}.</p>
        <button class="wa-btn wa-btn--sm" type="button" data-act="fit">Show everything</button>`;
    }
    html += `<p class="map-legend-note">Pills are events with their start time. A round pin is a place; a vermilion ring means it is open now.</p>`;
    if (html === lastDrawer) return;
    lastDrawer = html;
    $('drawer-list').innerHTML = html;
  };

  const fit = (list) => {
    const t = T();
    if (!t) return;
    const base = list || (state.events && events.length ? events : shown().map(i => i.x));
    const pts = base.map(x => ({ lat: x._c.lat, lng: x._c.lng }));
    const desk = matchMedia('(min-width: 1024px)').matches;
    const pad = desk ? { top: 100, left: 90, right: 90, bottom: 80 } : { top: 130, left: 56, right: 56, bottom: 170 };
    /* No tween: a resize during the opening frames cancels an animated fit. */
    if (pts.length) t.fitToPicks(pts, { padding: pad, duration: 0 });
  };

  const draw = () => { placePins(); placeDrawer(); preview(); };

  /* ── Events ─────────────────────────────────────────────────── */
  const setDrawer = (open) => {
    $('drawer').dataset.open = String(open);
    $('drawer-toggle').setAttribute('aria-expanded', String(open));
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    if (hit('#layer-events')) { state.events = !state.events; collect(); draw(); return; }
    if (hit('#layer-places')) { state.places = !state.places; collect(); draw(); return; }
    if (hit('#drawer-toggle')) { const o = $('drawer').dataset.open !== 'true'; setDrawer(o); if (o) { state.active = ''; preview(); } return; }
    if (hit('[data-act="fit"]')) { fit(); return; }
    if (hit('[data-act="unpick"]')) { state.active = ''; lastDrawer = ''; draw(); return; }
    if (hit('#locate')) {
      G().userLoc().then((loc) => {
        if (!loc) { $('drawer-sub').textContent = 'Location is off in this browser, so the list is ordered by time'; setDrawer(true); return; }
        me = loc; T().flyTo(loc.lng, loc.lat, 14.5); draw();
      });
      return;
    }
    const c = hit('[data-cluster]');
    if (c) {
      const cl = clusters[Number(c.dataset.cluster)];
      if (cl) T().fitToPicks(cl.members.map(m => m.x._c), { maxZoom: 17, padding: 90 });
      return;
    }
    const p = hit('[data-pin]');
    if (p) {
      state.active = state.active === p.dataset.pin ? '' : p.dataset.pin;
      lastDrawer = '';
      setDrawer(false);
      draw();
      return;
    }
    const r = hit('[data-row]');
    if (r) window.WA.Seen.mark(r.dataset.row);
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'map-when') return;
    state.when = e.target.value; state.active = '';
    history.replaceState(null, '', state.when === 'tonight' ? location.pathname : `?when=${state.when}`);
    collect(); draw(); fit();
  });
  /* Hovering a drawer row lifts its pin, the cheap direction of the pairing. */
  document.addEventListener('pointerover', (e) => {
    const r = e.target.closest && e.target.closest('[data-row],[data-place]');
    if (!r) return;
    const id = r.dataset.row || r.dataset.place;
    document.querySelectorAll('.wa-pin[aria-current="true"]').forEach(x => x.setAttribute('aria-current', String(x.dataset.pin === state.active)));
    const pin = document.querySelector(`.wa-pin[data-pin="${CSS.escape(id)}"]`);
    if (pin) pin.setAttribute('aria-current', 'true');
  });

  /* ── Boot ───────────────────────────────────────────────────── */
  let started = false;
  const boot = () => {
    collect();
    if (!started) {
      started = true;
      T().init('map-canvas');
      T().onReady(() => {
        /* Fit once the canvas has its real size, not the size it booted at. */
        const m = T().getMap();
        requestAnimationFrame(() => { m.resize(); fit(); draw(); });
        m.once('idle', () => { m.resize(); fit(); });
      });
      T().on('move', placePins);
      T().on('moveend', placeDrawer);
    } else draw();
    R().locateIfGranted();
  };
  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', (e) => { me = e.detail || G().currentLoc(); lastDrawer = ''; draw(); });
})();
