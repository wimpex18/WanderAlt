/* ============================================================
   map.js — the Map tab.
   ------------------------------------------------------------
   Two layers with two pin shapes: events are pills carrying their
   start time (vermilion when on now); places are round discs with their
   pictogram, ringed when open now. A chosen pin raises a row of cards
   for what is in view; swiping the row moves the choice from pin to pin.
   A sheet (a sidebar from 1024) lists what is in view by walking time;
   on phones it drags between peek, half and full. Pins cluster in screen
   space; the selected pin never clusters. Camera moves go through
   WA.MapTiles, which honours reduced motion.
   URL: ?when=tonight|tomorrow|weekend|thisweek&show=events|places
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const G = () => window.WA.Geo;
  const T = () => window.WA.MapTiles;
  const esc = (s) => window.WA.UI.esc(s);

  const state = { layer: 'all', when: 'tonight', active: '' };
  const WHEN = ['tonight', 'tomorrow', 'weekend', 'thisweek'];
  const LAYERS = ['all', 'events', 'places'];
  const qp = new URLSearchParams(location.search);
  if (WHEN.includes(qp.get('when'))) state.when = qp.get('when');
  if (LAYERS.includes(qp.get('show'))) state.layer = qp.get('show');
  const on = { get events() { return state.layer !== 'places'; }, get places() { return state.layer !== 'events'; } };
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 1023px)');

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
    $('n-events').textContent = String(events.length);
    $('n-places').textContent = String(places.length);
    document.querySelectorAll('[data-layer]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layer === state.layer)));
    $('map-when').value = state.when;
  };

  const shown = () => [
    ...(on.events ? events.map(e => ({ kind: 'event', x: e })) : []),
    ...(on.places ? places.map(v => ({ kind: 'place', x: v })) : []),
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

  /* The cards that rise for the chosen pin: what is in view, in the
     sheet's order, one card each. Swiping the row moves the choice. */
  const card = (x) => {
    const isEvent = !!x.title;
    const src = x.imageUrl && x.imageSource !== 'logo' ? window.WA.UI.safeUrl(x.imageUrl) : '';
    const m = R().walk(x);
    const meta1 = isEvent ? R().badgeFor(x).text : R().openState(x).text;
    const meta2 = (isEvent ? [x.venue, R().price(x)] : [R().kindLabel(x.kind, true), R().areaOf(x)])
      .concat(m != null ? [`${R().walkLabel(m)} walk`] : []).filter(Boolean).join(' · ');
    return `<div class="map-preview__card" data-card="${esc(x.id)}">
        <a class="map-preview__link" href="detail.html?id=${esc(encodeURIComponent(x.id))}" data-row="${esc(x.id)}">
          <span class="map-preview__art">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : window.WA.Picto.kind(x.kind)}</span>
          <span class="map-preview__body">
            <span class="map-preview__title">${esc(isEvent ? x.title : x.name)}</span>
            <span class="map-preview__meta">${esc(meta1)}</span>
            ${meta2 ? `<span class="map-preview__meta">${esc(meta2)}</span>` : ''}
          </span>
        </a>
        ${R().heart(x.id, isEvent ? x.title : x.name)}
        <button class="wa-iconbtn map-preview__close" type="button" data-act="unpick" aria-label="Close">${window.WA.Icon('close')}</button>
      </div>`;
  };

  let deck = [];
  const preview = () => {
    const host = $('preview');
    const x = [...events, ...places].find(y => y.id === state.active);
    if (!x) { host.dataset.open = 'false'; host.innerHTML = ''; deck = []; return; }
    const { evs, pls } = ordered();
    deck = [...evs.slice(0, 30), ...pls.slice(0, 30)];
    if (!deck.includes(x)) deck.unshift(x);
    host.innerHTML = `<div class="map-preview__track" id="preview-track">${deck.map(card).join('')}</div>`;
    host.dataset.open = 'true';
    const track = $('preview-track');
    const el = track.querySelector(`[data-card="${CSS.escape(x.id)}"]`);
    if (el) track.scrollLeft = el.offsetLeft - (track.clientWidth - el.clientWidth) / 2;
    track.addEventListener('scroll', onSwipe, { passive: true });
  };

  /* When the row comes to rest, the card in the middle is the choice:
     its pin lifts, and the map slides only if that pin is out of sight. */
  let swipeT = 0;
  const onSwipe = () => { clearTimeout(swipeT); swipeT = setTimeout(settleSwipe, 110); };
  const settleSwipe = () => {
    const track = $('preview-track');
    if (!track) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = null, d = Infinity;
    track.querySelectorAll('[data-card]').forEach((c) => {
      const dd = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid);
      if (dd < d) { d = dd; best = c; }
    });
    if (!best || best.dataset.card === state.active) return;
    state.active = best.dataset.card;
    placePins();
    reveal(deck.find(y => y.id === state.active));
  };

  /* Slide the map only when the chosen pin is hidden by the cards or
     the edges; a pin already in sight stays where the eye left it. */
  const reveal = (x) => {
    const m = T() && T().getMap();
    const pt = x && T().project(x._c.lng, x._c.lat);
    if (!m || !pt) return;
    const box = $('map-canvas').getBoundingClientRect();
    const top = $('preview').getBoundingClientRect().top - box.top;
    const safeTop = phone.matches ? 130 : 80;
    if (pt.x < 40 || pt.x > box.width - 40 || pt.y < safeTop || pt.y > top - 30) {
      m.easeTo({ center: [x._c.lng, x._c.lat], duration: still() ? 0 : 420, padding: { top: safeTop, bottom: box.height - top + 20, left: 0, right: 0 } });
    }
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
      ev: on.events ? events.filter(inside) : [],
      pl: on.places ? places.filter(inside) : [],
    };
  };

  const byWalk = (list, fallback) => (G().currentLoc()
    ? list.slice().sort((a, b) => (G().distanceTo(a) ?? 1e9) - (G().distanceTo(b) ?? 1e9))
    : list.slice().sort(fallback));

  const openFirst = (a, b) => (R().openState(a).open === true ? 0 : 1) - (R().openState(b).open === true ? 0 : 1) || String(a.name).localeCompare(String(b.name));
  const ordered = () => {
    const { ev, pl } = inView();
    return { evs: byWalk(ev, G().bySoonestThenDistance()), pls: byWalk(pl, openFirst) };
  };

  const placeDrawer = () => {
    const { evs, pls } = ordered();
    const whenWord = { tonight: 'tonight', tomorrow: 'tomorrow', weekend: 'this weekend', thisweek: 'this week' }[state.when];
    $('drawer-title').textContent = evs.length || pls.length ? 'In view' : 'Nothing in view';
    $('drawer-sub').textContent = [
      on.events ? `${evs.length} ${evs.length === 1 ? 'event' : 'events'} ${whenWord}` : '',
      on.places ? `${pls.length} ${pls.length === 1 ? 'place' : 'places'}` : '',
      G().currentLoc() ? 'nearest first' : '',
    ].filter(Boolean).join(' · ');

    let html = '';
    if (evs.length) html += `<p class="map-drawer__label">Events</p><ul class="wa-rows">${evs.slice(0, 30).map(e => R().row(e, { day: state.when !== 'tonight', noThumb: true })).join('')}</ul>`;
    if (pls.length) html += `<p class="map-drawer__label">Places</p><ul>${pls.slice(0, 30).map(v => R().placeRow(v)).join('')}</ul>`;
    if (!evs.length && !pls.length) {
      html += `<p class="map-legend-note">Zoom out or move the map. ${events.length} ${events.length === 1 ? 'event is' : 'events are'} placed ${whenWord}${on.events ? '' : ', with the events layer off'}.</p>
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
    const base = list || (on.events && events.length ? events : shown().map(i => i.x));
    const pts = base.map(x => ({ lat: x._c.lat, lng: x._c.lng }));
    const desk = matchMedia('(min-width: 1024px)').matches;
    const pad = desk ? { top: 100, left: 90, right: 90, bottom: 80 } : { top: 130, left: 56, right: 56, bottom: 170 };
    /* No tween: a resize during the opening frames cancels an animated fit. */
    if (pts.length) t.fitToPicks(pts, { padding: pad, duration: 0 });
  };

  const draw = () => { placePins(); placeDrawer(); preview(); };

  /* ── Sheet: peek, half, full on phones ─────────────────────── */
  const SNAPS = ['peek', 'half', 'full'];
  const page = () => document.querySelector('.map-page');
  const heights = () => {
    const H = page().clientHeight;
    const peek = parseFloat(getComputedStyle(page()).getPropertyValue('--drawer-peek')) || 150;
    const top = $('drawer').offsetParent ? document.querySelector('.wa-topbar').getBoundingClientRect().bottom : 60;
    return { peek, half: Math.round(H * 0.52), full: Math.round(H - top - 8) };
  };
  const setDrawer = (snap) => {
    if (typeof snap === 'boolean') snap = snap ? 'half' : 'peek';
    const d = $('drawer');
    d.dataset.snap = snap;
    d.dataset.open = String(snap !== 'peek');
    $('drawer-toggle').setAttribute('aria-expanded', String(snap !== 'peek'));
    page().style.setProperty('--sheet-h', `${heights()[snap]}px`);
    if (snap !== 'peek' && state.active) { state.active = ''; placePins(); preview(); }
  };

  /* One drag for finger and mouse. The grip always drags; the list drags
     the sheet only when it cannot scroll that way itself: up while the
     sheet is not full, down while the list is at its top. */
  let sheetDrag = null, ateClick = false;
  const dragStart = (y, fromList) => {
    if (!phone.matches) return;
    sheetDrag = { y0: y, h0: $('drawer').getBoundingClientRect().height, fromList, live: false, pts: [[y, performance.now()]] };
  };
  const dragMove = (y, ev) => {
    const g = sheetDrag;
    if (!g) return;
    const dy = y - g.y0;
    if (!g.live) {
      if (Math.abs(dy) < 6) return;
      if (g.fromList) {
        const list = $('drawer-list');
        const wantsSheet = (dy < 0 && $('drawer').dataset.snap !== 'full') || (dy > 0 && list.scrollTop <= 0);
        if (!wantsSheet) { sheetDrag = null; return; }
      }
      g.live = true;
      $('drawer').classList.add('is-dragging');
    }
    if (ev && ev.cancelable) ev.preventDefault();
    const { peek, full } = heights();
    let h = g.h0 - dy;
    if (h < peek) h = peek - (peek - h) * 0.25;
    if (h > full) h = full + (h - full) * 0.25;
    page().style.setProperty('--sheet-h', `${Math.round(h)}px`);
    g.pts.push([y, performance.now()]); if (g.pts.length > 5) g.pts.shift();
  };
  const dragEnd = () => {
    const g = sheetDrag;
    sheetDrag = null;
    if (!g || !g.live) return;
    ateClick = true; setTimeout(() => { ateClick = false; }, 350);
    $('drawer').classList.remove('is-dragging');
    const [[ya, ta]] = g.pts, [yb, tb] = g.pts[g.pts.length - 1];
    const v = (yb - ya) / Math.max(tb - ta, 1);   /* px/ms, down is positive */
    const hs = heights();
    const h = $('drawer').getBoundingClientRect().height;
    let snap = SNAPS.reduce((a, k) => (Math.abs(hs[k] - h) < Math.abs(hs[a] - h) ? k : a), 'peek');
    /* A flick goes one stop on in its direction, wherever it let go. */
    if (v < -0.45) snap = SNAPS.find(k => hs[k] > h + 1) || 'full';
    if (v > 0.45) snap = [...SNAPS].reverse().find(k => hs[k] < h - 1) || 'peek';
    setDrawer(snap);
  };
  const grip = $('drawer-grip'), list = $('drawer-list');
  grip.addEventListener('touchstart', (e) => dragStart(e.touches[0].clientY, false), { passive: true });
  list.addEventListener('touchstart', (e) => dragStart(e.touches[0].clientY, true), { passive: true });
  document.addEventListener('touchmove', (e) => { if (sheetDrag) dragMove(e.touches[0].clientY, e); }, { passive: false });
  document.addEventListener('touchend', dragEnd);
  document.addEventListener('touchcancel', dragEnd);
  grip.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button === 0) { dragStart(e.clientY, false); } });
  document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && sheetDrag) dragMove(e.clientY, e); });
  document.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') dragEnd(); });
  addEventListener('resize', () => { if (phone.matches) setDrawer($('drawer').dataset.snap || 'peek'); });

  /* ── Events ─────────────────────────────────────────────────── */
  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    if (ateClick && hit('#drawer')) { e.preventDefault(); ateClick = false; return; }
    const l = hit('[data-layer]');
    if (l) {
      state.layer = l.dataset.layer; state.active = '';
      const q = new URLSearchParams(location.search);
      if (state.layer === 'all') q.delete('show'); else q.set('show', state.layer);
      history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
      lastDrawer = ''; collect(); draw();
      return;
    }
    if (hit('#drawer-toggle')) { setDrawer($('drawer').dataset.snap === 'peek' ? 'half' : 'peek'); return; }
    if (hit('[data-act="fit"]')) { fit(); return; }
    if (hit('[data-act="unpick"]')) { state.active = ''; lastDrawer = ''; draw(); return; }
    if (hit('#locate')) {
      G().userLoc().then((loc) => {
        if (!loc) { $('drawer-sub').textContent = 'Location is off in this browser, so the list is ordered by time'; setDrawer('half'); return; }
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
      setDrawer('peek');
      draw();
      if (state.active) reveal([...events, ...places].find(y => y.id === state.active));
      return;
    }
    const r = hit('[data-row]');
    if (r) window.WA.Seen.mark(r.dataset.row);
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'map-when') return;
    state.when = e.target.value; state.active = '';
    const q = new URLSearchParams(location.search);
    if (state.when === 'tonight') q.delete('when'); else q.set('when', state.when);
    history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
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
        if (phone.matches) setDrawer('peek');
        m.once('idle', () => { m.resize(); fit(); });
      });
      T().on('move', placePins);
      T().on('click', () => { if (state.active) { state.active = ''; lastDrawer = ''; draw(); } });
      T().on('moveend', placeDrawer);
    } else draw();
    R().locateIfGranted();
  };
  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', (e) => { me = e.detail || G().currentLoc(); lastDrawer = ''; draw(); });
})();
