/* ============================================================
   WanderAlt — Map page
   Illustrated Tallinn map with pan/zoom, pin overlay,
   two-row filter chips (time + category), bottom sheet
   (mobile) and side panel (desktop), locate FAB.
   ============================================================ */
(() => {
  const WORLD_W = 1800, WORLD_H = 1200;
  const MIN_ZOOM = 0.28, MAX_ZOOM = 2.4;

  // ── State ─────────────────────────────────────────────────────
  let zoom = 0.5, tx = 0, ty = 0;
  let drag = null, dragged = false;
  let activeId = null;
  let timeFilter = 'all';        // all | tonight | thisweek | places
  let catFilters = new Set();    // set of category ids; empty = show all
  let userLoc = null;            // { worldX, worldY } | null
  let locStatus = 'off';         // off | locating | on | error
  let userPuckEl = null;

  // ── DOM refs (set in boot) ─────────────────────────────────────
  let viewport, worldWrap, pinsEl, sheetEl, detailEl;

  // ── Coordinate helpers ────────────────────────────────────────
  const worldToScreen = (wx, wy) => ({
    x: wx * zoom + tx,
    y: wy * zoom + ty,
  });

  // ── Pan/Zoom ──────────────────────────────────────────────────
  function applyTransform() {
    worldWrap.style.transform = `translate(${tx}px,${ty}px) scale(${zoom})`;
    positionPins();
    if (userLoc) positionPuck();
  }

  function fitView() {
    const rect = viewport.getBoundingClientRect();
    const fitW = (rect.width  - 8) / WORLD_W;
    const fitH = (rect.height - 8) / WORLD_H;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(fitW, fitH * 1.12)));
    zoom = z;
    tx = (rect.width  - WORLD_W * z) / 2;
    ty = (rect.height - WORLD_H * z) / 2 - 24;
    applyTransform();
  }

  function zoomAround(mx, my, nextZoom) {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    tx = mx - (mx - tx) * (z / zoom);
    ty = my - (my - ty) * (z / zoom);
    zoom = z;
    applyTransform();
  }

  function initPanZoom() {
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomAround(e.clientX - rect.left, e.clientY - rect.top, zoom * Math.exp(-e.deltaY * 0.0014));
    }, { passive: false });

    viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, tx, ty };
      dragged = false;
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!dragged && Math.hypot(dx, dy) > 5) dragged = true;
      tx = drag.tx + dx;
      ty = drag.ty + dy;
      applyTransform();
    });
    viewport.addEventListener('pointerup', () => { drag = null; });

    // touch pinch-zoom
    let tc = null;
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const r = viewport.getBoundingClientRect();
        tc = {
          dist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY),
          zoom,
          mx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
          my: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top,
        };
      }
    }, { passive: true });
    viewport.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && tc) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        zoomAround(tc.mx, tc.my, tc.zoom * (d / tc.dist));
      }
    }, { passive: false });
    viewport.addEventListener('touchend', () => { tc = null; });
  }

  // ── Zoom controls ─────────────────────────────────────────────
  function initZoomControls() {
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      const r = viewport.getBoundingClientRect();
      zoomAround(r.width / 2, r.height / 2, zoom * 1.35);
    });
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      const r = viewport.getBoundingClientRect();
      zoomAround(r.width / 2, r.height / 2, zoom / 1.35);
    });
    document.getElementById('btn-zoom-fit')?.addEventListener('click', fitView);
  }

  // ── Kind normalisation ────────────────────────────────────────
  const KIND_MAP = {
    'gig': 'music', 'club': 'music', 'noise': 'music',
    'talk': 'culture', 'lecture': 'culture', 'exhibition': 'culture', 'gallery': 'culture',
    'record store': 'vinyl', 'bookshop': 'vinyl',
    'thrift': 'market',
  };
  function normaliseKind(k) { return KIND_MAP[k] || k; }

  // ── Filters ───────────────────────────────────────────────────
  function getVisibleEntries() {
    return (window.WA?.catalog || []).filter(e => {
      if (!e.world_x || !e.world_y) return false;
      if (timeFilter === 'tonight'  && !e.tonight) return false;
      if (timeFilter === 'thisweek' && !e.thisWeek && !e.tonight) return false;
      if (timeFilter === 'places'   && e.day) return false;
      if (catFilters.size > 0 && !catFilters.has(normaliseKind(e.kind))) return false;
      return true;
    });
  }

  function renderTimeChips() {
    const row = document.querySelector('.map-filter-time');
    if (!row) return;
    const chips = [
      { id: 'all',      label: 'All' },
      { id: 'tonight',  label: 'Tonight' },
      { id: 'thisweek', label: 'This week' },
      { id: 'places',   label: 'Places' },
    ];
    row.innerHTML = chips.map(c =>
      `<button class="m-chip${timeFilter === c.id ? ' m-chip--on' : ''}" data-time="${c.id}" type="button">${c.label}</button>`
    ).join('');
    row.querySelectorAll('[data-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        timeFilter = btn.dataset.time;
        renderTimeChips();
        renderPins();
      });
    });
  }

  function renderCatChips() {
    const row = document.querySelector('.map-filter-cat');
    if (!row) return;
    const cats = window.WA?.MAP_CATEGORIES || [];
    const catC = window.WA?.MAP_CAT || {};
    row.innerHTML = cats.map(cat => {
      const on = catFilters.has(cat.id);
      const c  = catC[cat.id];
      return `<button class="m-chip map-cat-chip${on ? ' m-chip--cat-on' : ''}" data-cat="${cat.id}" type="button"
        style="${on ? `background:${c?.bg||'#333'};color:#fff;border-color:${c?.bg||'#333'}` : ''}"
      >${cat.label}</button>`;
    }).join('');
    row.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.cat;
        catFilters.has(id) ? catFilters.delete(id) : catFilters.add(id);
        renderCatChips();
        renderPins();
      });
    });
  }

  // ── Pins ──────────────────────────────────────────────────────
  const PIN_ICONS = {
    music:   `<svg viewBox="0 0 20 20" width="13" height="13" fill="none"><line x1="4" y1="13" x2="4" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="8" y1="14" x2="8" y2="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="14" x2="12" y2="5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="16" y1="13" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    drink:   `<svg viewBox="0 0 20 20" width="13" height="13" fill="none"><path d="M5 6h10l-1.4 9a2 2 0 01-2 1.6h-3.2a2 2 0 01-2-1.6L5 6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.5 9h7" stroke="currentColor" stroke-width="1.2"/></svg>`,
    vinyl:   `<svg viewBox="0 0 20 20" width="13" height="13" fill="none"><circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="0.8" fill="currentColor"/></svg>`,
    market:  `<svg viewBox="0 0 20 20" width="13" height="13" fill="none"><path d="M3 7h14l-1 2v6a1 1 0 01-1 1H5a1 1 0 01-1-1V9L3 7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M4 7l1.5-3h9L16 7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    culture: `<svg viewBox="0 0 20 20" width="13" height="13" fill="none"><rect x="3" y="4" width="14" height="11" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="9" r="2" stroke="currentColor" stroke-width="1.3"/></svg>`,
    art:     `<svg viewBox="0 0 20 20" width="13" height="13" fill="none"><rect x="6" y="3" width="8" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="8" x2="10" y2="11" stroke="currentColor" stroke-width="1.5"/><path d="M6 11h8l-1 6a1 1 0 01-1 1H8a1 1 0 01-1-1l-1-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  };

  function pinHTML(entry) {
    const kind = normaliseKind(entry.kind);
    const catC = window.WA?.MAP_CAT || {};
    const c = catC[kind] || { bg: '#333', fg: '#fff' };
    const active = entry.id === activeId;
    const num = entry.pin?.num ?? '';
    return `<button class="map-pin-new${active ? ' map-pin-new--active' : ''}"
      data-id="${entry.id}" type="button"
      aria-label="${entry.title}" aria-pressed="${active}"
      style="left:0;top:0;--pin-bg:${c.bg};--pin-fg:${c.fg}">
      <span class="map-pin-new__tail"></span>
      <span class="map-pin-new__circle">
        <span class="map-pin-new__icon">${PIN_ICONS[kind] || ''}</span>
      </span>
      ${num !== '' ? `<span class="map-pin-new__badge">${num}</span>` : ''}
    </button>`;
  }

  function positionPins() {
    if (!pinsEl) return;
    const catalog = window.WA?.catalog || [];
    pinsEl.querySelectorAll('.map-pin-new').forEach(btn => {
      const entry = catalog.find(e => e.id === btn.dataset.id);
      if (!entry) return;
      const s = worldToScreen(entry.world_x, entry.world_y);
      btn.style.left = `${s.x}px`;
      btn.style.top  = `${s.y}px`;
    });
  }

  function renderPins() {
    if (!pinsEl) return;
    pinsEl.innerHTML = getVisibleEntries().map(pinHTML).join('');
    positionPins();
    pinsEl.querySelectorAll('.map-pin-new').forEach(btn => {
      btn.addEventListener('pointerdown', e => e.stopPropagation());
      btn.addEventListener('click', () => {
        if (dragged) return;
        const id = btn.dataset.id;
        activeId = (activeId === id) ? null : id;
        renderPins();
        if (activeId) {
          const entry = (window.WA?.catalog || []).find(e => e.id === activeId);
          if (entry) openDetail(entry);
        } else {
          closeDetail();
        }
      });
    });
  }

  // ── User location puck ────────────────────────────────────────
  function positionPuck() {
    if (!userPuckEl || !userLoc) return;
    const s = worldToScreen(userLoc.worldX, userLoc.worldY);
    userPuckEl.style.left = `${s.x}px`;
    userPuckEl.style.top  = `${s.y}px`;
  }

  function showPuck() {
    if (!userPuckEl) {
      userPuckEl = document.createElement('div');
      userPuckEl.className = 'map-user-puck';
      userPuckEl.innerHTML = `<span class="map-user-puck__pulse"></span><span class="map-user-puck__halo"></span><span class="map-user-puck__dot"></span>`;
      pinsEl.appendChild(userPuckEl);
    }
    userPuckEl.hidden = false;
    positionPuck();
  }

  // ── Locate FAB ────────────────────────────────────────────────
  function initLocate() {
    const btn = document.getElementById('btn-locate');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (locStatus === 'on') {
        locStatus = 'off'; userLoc = null;
        if (userPuckEl) userPuckEl.hidden = true;
        btn.classList.remove('map-locate-fab--on', 'map-locate-fab--locating');
        return;
      }
      if (!navigator.geolocation) return;
      locStatus = 'locating';
      btn.classList.add('map-locate-fab--locating');
      navigator.geolocation.getCurrentPosition(pos => {
        const w = (window.WA?.geoToWorld || (() => ({ x: 1030, y: 580 })))(pos.coords.latitude, pos.coords.longitude);
        userLoc = { worldX: Math.max(20, Math.min(WORLD_W-20, w.x)), worldY: Math.max(20, Math.min(WORLD_H-20, w.y)) };
        locStatus = 'on';
        btn.classList.remove('map-locate-fab--locating');
        btn.classList.add('map-locate-fab--on');
        showPuck();
        const rect = viewport.getBoundingClientRect();
        const s = worldToScreen(userLoc.worldX, userLoc.worldY);
        tx += rect.width / 2 - s.x;
        ty += rect.height / 2 - s.y;
        applyTransform();
      }, () => {
        locStatus = 'error';
        btn.classList.remove('map-locate-fab--locating');
      }, { enableHighAccuracy: true, timeout: 8000 });
    });
  }

  // ── Detail sheet / panel ──────────────────────────────────────
  function detailHTML(entry) {
    const kind = normaliseKind(entry.kind);
    const catC = window.WA?.MAP_CAT || {};
    const c = catC[kind] || { bg:'#444', fg:'#fff', label: entry.kind };
    const eyebrow = entry.pin?.eyebrow || c.label || '';
    const meta = [entry.neighborhood, entry.kind, entry.time].filter(Boolean).join(' · ');
    const img = entry.imageUrl
      ? `<img src="${entry.imageUrl}" alt="" class="map-detail__img" loading="lazy"/>`
      : `<div class="map-detail__img-ph" style="--ph-bg:${c.bg}"></div>`;
    const q = entry.quote
      ? `<blockquote class="map-detail__quote">&ldquo;${entry.quote}&rdquo;<br><cite class="handle">— ${entry.handle}</cite></blockquote>`
      : '';
    return `<div class="map-detail__head">
        <span class="map-detail__eyebrow">${eyebrow}</span>
        <button class="map-detail__close" id="detail-close" aria-label="Close">&times;</button>
      </div>
      <h2 class="map-detail__title"><a href="venue.html?id=${entry.id}">${entry.title}</a></h2>
      <p class="meta">${meta}</p>
      <div class="map-detail__media">${img}</div>
      ${q}
      <div class="map-detail__foot">
        <a class="btn-primary map-detail__cta" href="venue.html?id=${entry.id}">I&rsquo;m going &rarr;</a>
        <label class="btn-secondary bookmark">
          <input type="checkbox" class="bookmark__check" data-id="${entry.id}" aria-label="Save"/>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3z"/></svg>
          Save
        </label>
      </div>`;
  }

  function syncBookmarks(root) {
    if (!window.WA?.bookmarks?.isBookmarked) return;
    root.querySelectorAll('.bookmark__check').forEach(cb => {
      cb.checked = WA.bookmarks.isBookmarked(cb.dataset.id);
    });
  }

  function openDetail(entry) {
    const html = detailHTML(entry);
    const isDesktop = window.matchMedia('(min-width:768px)').matches;
    if (isDesktop) {
      detailEl.innerHTML = html;
      detailEl.hidden = false;
      sheetEl.hidden = true;
      syncBookmarks(detailEl);
    } else {
      sheetEl.innerHTML = `<div class="map-sheet__handle" aria-hidden="true"></div>${html}`;
      sheetEl.hidden = false;
      detailEl.hidden = true;
      syncBookmarks(sheetEl);
      initSheetDrag();
    }
    document.getElementById('detail-close')?.addEventListener('click', () => {
      closeDetail(); activeId = null; renderPins();
    });
    [sheetEl, detailEl].forEach(el => {
      el.addEventListener('change', e => {
        const cb = e.target.closest('.bookmark__check');
        if (!cb || !window.WA?.bookmarks) return;
        cb.checked ? WA.bookmarks.add(cb.dataset.id) : WA.bookmarks.remove(cb.dataset.id);
      });
    });
  }

  function closeDetail() {
    sheetEl.hidden = true;
    detailEl.hidden = true;
    sheetEl.style.transform = '';
  }

  function initSheetDrag() {
    const handle = sheetEl.querySelector('.map-sheet__handle');
    if (!handle) return;
    let startY = null;
    handle.addEventListener('pointerdown', e => { startY = e.clientY; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointermove', e => {
      if (startY == null) return;
      const dy = e.clientY - startY;
      if (dy > 0) sheetEl.style.transform = `translateY(${dy}px)`;
    });
    handle.addEventListener('pointerup', e => {
      const dy = e.clientY - startY;
      sheetEl.style.transform = '';
      startY = null;
      if (dy > 80) { closeDetail(); activeId = null; renderPins(); }
    });
  }

  // ── Boot ──────────────────────────────────────────────────────
  function boot() {
    viewport  = document.getElementById('map-viewport');
    worldWrap = document.getElementById('map-world-wrap');
    pinsEl    = document.getElementById('map-pins');
    sheetEl   = document.getElementById('map-sheet');
    detailEl  = document.getElementById('map-detail');
    if (!viewport || !worldWrap || !pinsEl) return;

    // Inject illustrated SVG world
    if (window.WA?.mapWorldSVG) worldWrap.innerHTML = WA.mapWorldSVG();

    initPanZoom();
    initZoomControls();
    initLocate();

    document.addEventListener('wa:bookmarks-synced', () => {
      syncBookmarks(sheetEl); syncBookmarks(detailEl);
    });

    renderTimeChips();
    renderCatChips();

    function onCatalogReady() {
      renderPins();
      fitView();
    }

    if (window.WA?.catalog?.length) onCatalogReady();
    document.addEventListener('wa:catalog-ready', onCatalogReady);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
