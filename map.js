/* ============================================================
   map.js — the Map tab.
   ------------------------------------------------------------
   Two layers with two pin shapes: events are vermilion tags carrying
   their start time; places are round discs with their kind, filled when
   open now and hollow when shut or unfiled. A drawer (a sidebar from
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
    places = R().places().map(withCoords).filter(Boolean);
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
      const t = R().isLive(x) ? 'NOW' : (R().clockOf(x) || R().dow(W().resolveKey(x) || W().todayKey()));
      return `<button class="wa-pin wa-pin--event" type="button" data-pin="${esc(x.id)}" aria-current="${cur}"
        aria-label="${esc(`${x.title}, ${t}, ${x.venue || ''}`)}" style="left:${p.x}px;top:${p.y}px"><span class="wa-pin__tag">${esc(t)}</span></button>`;
    }
    const open = R().openState(x).open === true;
    return `<button class="wa-pin wa-pin--place${open ? '' : ' is-shut'}" type="button" data-pin="${esc(x.id)}" aria-current="${cur}"
      aria-label="${esc(`${x.name}, ${R().openState(x).text}`)}" style="left:${p.x}px;top:${p.y}px"><span class="wa-pin__disc">${window.WA.Icon.kind(x.kind)}</span></button>`;
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
    const active = [...events, ...places].find(x => x.id === state.active);
    const whenWord = { tonight: 'tonight', tomorrow: 'tomorrow', weekend: 'this weekend', thisweek: 'this week' }[state.when];
    $('drawer-title').textContent = evs.length || pls.length ? 'In view' : 'Nothing in view';
    $('drawer-sub').textContent = [
      state.events ? `${evs.length} ${evs.length === 1 ? 'event' : 'events'} ${whenWord}` : '',
      state.places ? `${pls.length} ${pls.length === 1 ? 'place' : 'places'}` : '',
      G().currentLoc() ? 'nearest first' : '',
    ].filter(Boolean).join(' · ');

    let html = '';
    if (active) {
      html += `<p class="map-drawer__label">Selected</p>` + (active.title
        ? `<ul class="wa-rows">${R().row(active, { day: state.when !== 'tonight' })}</ul>`
        : `<ul>${R().placeRow(active)}</ul>`);
    }
    if (evs.length) html += `<p class="map-drawer__label">Events</p><ul class="wa-rows">${evs.filter(e => e !== active).slice(0, 30).map(e => R().row(e, { day: state.when !== 'tonight', noThumb: true })).join('')}</ul>`;
    if (pls.length) html += `<p class="map-drawer__label">Places</p><ul>${pls.filter(v => v !== active).slice(0, 30).map(v => R().placeRow(v)).join('')}</ul>`;
    if (!evs.length && !pls.length) {
      html += `<p class="map-legend-note">Zoom out or move the map. ${events.length} ${events.length === 1 ? 'event is' : 'events are'} placed ${whenWord}${state.events ? '' : ', with the events layer off'}.</p>
        <button class="wa-btn wa-btn--sm" type="button" data-act="fit">Show everything</button>`;
    }
    html += `<p class="map-legend-note">Tags are events with their start time. A filled disc is a place open now; a hollow one is shut or has no hours filed.</p>`;
    if (html === lastDrawer) return;
    lastDrawer = html;
    $('drawer-list').innerHTML = html;
  };

  const fit = (list) => {
    const t = T();
    if (!t) return;
    const pts = (list || shown().map(i => i.x)).map(x => ({ lat: x._c.lat, lng: x._c.lng }));
    const desk = matchMedia('(min-width: 1024px)').matches;
    const pad = desk ? { top: 80, left: 60, right: 60, bottom: 60 } : { top: 110, left: 40, right: 40, bottom: 150 };
    if (pts.length) t.fitToPicks(pts, { padding: pad });
  };

  const draw = () => { placePins(); placeDrawer(); };

  /* ── Events ─────────────────────────────────────────────────── */
  const setDrawer = (open) => {
    $('drawer').dataset.open = String(open);
    $('drawer-toggle').setAttribute('aria-expanded', String(open));
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    if (hit('#layer-events')) { state.events = !state.events; collect(); draw(); return; }
    if (hit('#layer-places')) { state.places = !state.places; collect(); draw(); return; }
    if (hit('#drawer-toggle')) { setDrawer($('drawer').dataset.open !== 'true'); return; }
    if (hit('[data-act="fit"]')) { fit(); return; }
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
      draw();
      if (state.active) { setDrawer(true); $('drawer-list').scrollTop = 0; }
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
      T().onReady(() => { fit(); draw(); });
      T().on('move', placePins);
      T().on('moveend', placeDrawer);
    } else draw();
    R().locateIfGranted();
  };
  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', (e) => { me = e.detail || G().currentLoc(); lastDrawer = ''; draw(); });
})();
