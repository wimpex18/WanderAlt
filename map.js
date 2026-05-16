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
  let textQuery = '';            // free-text filter; '' = no text filter
  let searchMode = 'search';     // 'search' | 'match'  (AI mode is opt-in via toggle)
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
    const fitW = rect.width  / WORLD_W;
    const fitH = rect.height / WORLD_H;
    // Mobile: zoom up so districts read at a usable scale (pan reveals the rest).
    // Desktop: fit the whole island in view.
    const isWide = rect.width >= 768;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
      isWide ? Math.min(fitW * 1.15, fitH * 1.15)
             : Math.min(fitW * 1.55, fitH * 1.10)));
    zoom = z;
    // Centre on Old Town (~900, 580 in world units) — most interesting district.
    tx = (rect.width  / 2) - 900 * z;
    ty = (rect.height / 2) - 580 * z;
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
      if (!dragged && Math.hypot(dx, dy) > 12) {
        dragged = true;
        document.body.classList.add('map-panning');
      }
      tx = drag.tx + dx;
      ty = drag.ty + dy;
      applyTransform();
    });
    viewport.addEventListener('pointerup', () => {
      drag = null;
      document.body.classList.remove('map-panning');
    });

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
  // 'drink' and 'art' are intentionally absent — reserved for future pipeline
  // kinds (craft bar, street art) that the Telegram ingest will produce.
  const KIND_MAP = {
    'gig': 'music', 'club': 'music', 'noise': 'music',
    'talk': 'culture', 'lecture': 'culture', 'exhibition': 'culture', 'gallery': 'culture',
    'record store': 'vinyl', 'bookshop': 'vinyl',
    'thrift': 'market',
  };
  function normaliseKind(k) { return KIND_MAP[k] || k; }

  // ── Filters ───────────────────────────────────────────────────
  function matchesText(e, q) {
    if (!q) return true;
    return [e.title, e.venue, e.neighborhood, e.kind, e.handle, e.quote]
      .some(f => f && f.toLowerCase().includes(q));
  }

  function getVisibleEntries() {
    const q = textQuery.toLowerCase();
    return (window.WA?.catalog || []).filter(e => {
      if (!e.world_x || !e.world_y) return false;
      if (timeFilter === 'tonight'  && !e.tonight) return false;
      if (timeFilter === 'thisweek' && !e.thisWeek && !e.tonight) return false;
      if (timeFilter === 'places'   && e.day) return false;
      if (catFilters.size > 0 && !catFilters.has(normaliseKind(e.kind))) return false;
      if (q && !matchesText(e, q)) return false;
      return true;
    });
  }

  // ── URL sync ──────────────────────────────────────────────────
  // Map ↔ Search coupling: ?q= seeds the text filter; ?id= focuses a pin.
  function readUrlState() {
    const sp = new URLSearchParams(window.location.search);
    return {
      q:    sp.get('q')    || '',
      id:   sp.get('id')   || '',
      day:  sp.get('day')  || '',
      mood: sp.get('mood') || '',
    };
  }
  function writeUrlState() {
    const sp = new URLSearchParams();
    if (textQuery)                        sp.set('q',    textQuery);
    if (activeId)                         sp.set('id',   activeId);
    if (timeFilter && timeFilter !== 'all') sp.set('day',  timeFilter);
    if (catFilters.size)                  sp.set('mood', [...catFilters].join(','));
    const qs = sp.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState(null, '', url);
  }

  // ── Map search bar ────────────────────────────────────────────
  function updateSearchCount() {
    const countEl = document.getElementById('map-search-count');
    const clearEl = document.getElementById('map-search-clear');
    const wrap    = document.querySelector('.map-search');
    if (!countEl) return;
    if (!textQuery) {
      countEl.hidden = true;
      if (clearEl) clearEl.hidden = true;
      if (wrap)    wrap.dataset.active = '0';
      return;
    }
    const n = getVisibleEntries().length;
    countEl.textContent = `${n} pin${n === 1 ? '' : 's'}`;
    countEl.hidden = false;
    if (clearEl) clearEl.hidden = false;
    if (wrap)    wrap.dataset.active = '1';
  }

  function setTextQuery(q) {
    textQuery = (q || '').trim();
    renderPins();
    updateSearchCount();
    writeUrlState();
  }

  // Call match-pick and focus the top hit on the map. Falls back to opening
  // search.html for the prompt when the matched pick has no world_x/y.
  async function runMapMatch(prompt) {
    const countEl = document.getElementById('map-search-count');
    const base    = window.WA && window.WA.BASE_URL;
    const city    = (window.WA && window.WA.CITY) || 'tallinn';
    if (!base) {
      if (countEl) { countEl.textContent = 'AI offline'; countEl.hidden = false; }
      return;
    }
    if (countEl) { countEl.textContent = 'matching…'; countEl.hidden = false; }
    const tasteParams = window.WA?.taste?.matchParams() || {};
    try {
      const r = await fetch(`${base}/functions/v1/match-pick`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ city, prompt, mode: 'find_one', ...tasteParams }),
      });
      const data = await r.json();
      if (!data.ok || !data.pick) {
        if (countEl) countEl.textContent = 'no match';
        return;
      }
      const hit = data.pick;
      const local = (window.WA?.catalog || []).find(e => e.id === hit.id);
      if (local && local.world_x && local.world_y) {
        focusPin(hit.id);
        if (countEl) countEl.textContent = `→ ${hit.venue || hit.title}`;
      } else {
        // No coords on the map — open the venue page directly.
        if (countEl) countEl.textContent = 'opening…';
        window.location.href = `venue.html?id=${encodeURIComponent(hit.id)}`;
      }
    } catch (_) {
      if (countEl) countEl.textContent = 'match failed';
    }
  }

  function setSearchMode(mode) {
    searchMode = mode;
    const wrap   = document.querySelector('.map-search');
    const input  = document.getElementById('map-search-input');
    const toggle = document.getElementById('map-match-toggle');
    if (wrap)   wrap.dataset.mode = mode;
    if (input)  {
      input.placeholder = mode === 'match'
        ? 'Tell me what you want…'
        : 'Filter pins by name, kind, curator…';
      input.setAttribute('enterkeyhint', mode === 'match' ? 'go' : 'search');
    }
    if (toggle) toggle.textContent = mode === 'match' ? '← keyword' : 'match me →';
  }

  function initMapSearch() {
    const input  = document.getElementById('map-search-input');
    const clear  = document.getElementById('map-search-clear');
    const toggle = document.getElementById('map-match-toggle');
    if (!input) return;

    input.addEventListener('input', () => {
      /* In match mode, typing doesn't filter — it just waits for Enter. */
      if (searchMode === 'match') return;
      setTextQuery(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || searchMode !== 'match') return;
      e.preventDefault();
      const prompt = input.value.trim();
      if (prompt) runMapMatch(prompt);
    });
    if (clear) {
      clear.addEventListener('click', () => {
        input.value = '';
        setTextQuery('');
        input.focus();
      });
    }
    if (toggle) {
      toggle.addEventListener('click', () => {
        if (searchMode === 'match') {
          setSearchMode('search');
          /* Re-apply current input as text filter when switching back. */
          setTextQuery(input.value);
        } else {
          setSearchMode('match');
          /* Drop the text filter while in match mode (don't surprise-hide pins). */
          textQuery = '';
          renderPins();
          updateSearchCount();
          writeUrlState();
        }
        input.focus();
      });
    }
  }

  // Centre + zoom on a specific pin (called when ?id= is in the URL or from a deep link).
  function focusPin(id) {
    const entry = (window.WA?.catalog || []).find(e => e.id === id);
    if (!entry || !entry.world_x || !entry.world_y) return false;
    const rect = viewport.getBoundingClientRect();
    const z = Math.max(zoom, 0.9);  // zoom in a bit so the pin reads
    zoom = z;
    tx = (rect.width  / 2) - entry.world_x * z;
    ty = (rect.height / 2) - entry.world_y * z;
    applyTransform();
    activeId = id;
    renderPins();
    openDetail(entry);
    writeUrlState();
    return true;
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
        writeUrlState();
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
        writeUrlState();
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
    const closed = !!entry.isClosed;
    const num = entry.pin?.num ?? '';
    const cls = [
      'map-pin-new',
      active ? 'map-pin-new--active' : '',
      closed ? 'map-pin-new--closed' : '',
    ].filter(Boolean).join(' ');
    const ariaLbl = closed ? `${entry.title} (closed)` : entry.title;
    return `<button class="${cls}"
      data-id="${entry.id}" type="button"
      aria-label="${ariaLbl}" aria-pressed="${active}"
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
        writeUrlState();
      });
    });
    updateSearchCount();
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
    const baseEyebrow = entry.pin?.eyebrow || c.label || '';
    const eyebrow = entry.isClosed
      ? `<span class="map-detail__closed">closed</span> ${baseEyebrow}`
      : baseEyebrow;
    const meta = [entry.neighborhood, entry.kind, entry.time].filter(Boolean).join(' · ');
    const img = entry.imageUrl
      ? `<img src="${entry.imageUrl}" alt="" class="map-detail__img" loading="lazy"/>`
      : `<div class="map-detail__img-ph" style="--ph-bg:${c.bg}"><span class="map-detail__img-ph-init">${entry.thumbInitials || ''}</span></div>`;
    const q = entry.quote
      ? `<blockquote class="map-detail__quote">&ldquo;${entry.quote}&rdquo;<br><cite class="handle">— ${entry.handle}</cite></blockquote>`
      : '';
    /* Map → Search affordances: jump from the pin into search.html. */
    const listVisible = getVisibleEntries();
    const listHref = textQuery
      ? `search.html?q=${encodeURIComponent(textQuery)}`
      : 'search.html';
    const listLabel = textQuery
      ? `View list (${listVisible.length}) &rarr;`
      : 'View list &rarr;';
    const moreLinks = `<nav class="map-detail__more" aria-label="Related searches">
        <a class="map-detail__more-link map-detail__more-link--list" href="${listHref}">${listLabel}</a>
        <a class="map-detail__more-link" href="search.html?q=${encodeURIComponent(entry.handle)}">More by ${entry.handle}</a>
        ${entry.kind ? `<a class="map-detail__more-link" href="search.html?q=${encodeURIComponent(entry.kind)}">More like this</a>` : ''}
      </nav>`;
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
      </div>
      ${moreLinks}`;
  }

  function syncBookmarks(root) {
    if (!window.WA?.Bookmarks?.get) return;
    const saved = WA.Bookmarks.get();
    root.querySelectorAll('.bookmark__check').forEach(cb => {
      cb.checked = !!saved[cb.dataset.id];
    });
  }

  function openDetail(entry) {
    const html = detailHTML(entry);
    const isDesktop = window.matchMedia('(min-width:768px)').matches;
    document.body.classList.add('map-detail-open');
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
      closeDetail(); activeId = null; renderPins(); writeUrlState();
    });
    [sheetEl, detailEl].forEach(el => {
      el.addEventListener('change', e => {
        const cb = e.target.closest('.bookmark__check');
        if (!cb || !window.WA?.Bookmarks) return;
        WA.Bookmarks.set(cb.dataset.id, cb.checked);
      });
    });
  }

  function closeDetail() {
    sheetEl.hidden = true;
    detailEl.hidden = true;
    sheetEl.style.transform = '';
    document.body.classList.remove('map-detail-open');
  }

  function initSheetDrag() {
    const handle = sheetEl.querySelector('.map-sheet__handle');
    if (!handle) return;
    let startY = null;
    handle.addEventListener('pointerdown', e => {
      e.stopPropagation();
      startY = e.clientY;
      handle.setPointerCapture(e.pointerId);
    });
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
    initMapSearch();

    document.addEventListener('wa:bookmarks-synced', () => {
      syncBookmarks(sheetEl); syncBookmarks(detailEl);
    });

    // Seed state from URL params before rendering chips/pins. The pin focus
    // happens after the catalog loads (?id= needs the entry to exist).
    const urlState = readUrlState();
    if (urlState.q) {
      textQuery = urlState.q;
      const input = document.getElementById('map-search-input');
      if (input) input.value = urlState.q;
    }
    if (urlState.day && urlState.day !== 'all') {
      timeFilter = urlState.day;
    }
    if (urlState.mood) {
      urlState.mood.split(',').filter(Boolean).forEach(c => catFilters.add(c));
    }

    renderTimeChips();
    renderCatChips();

    function onCatalogReady() {
      renderPins();
      updateSearchCount();
      // ?id= takes precedence over fitView so deep links land on the pin.
      if (urlState.id && focusPin(urlState.id)) return;
      fitView();
    }

    if (window.WA?.catalog?.length) onCatalogReady();
    document.addEventListener('wa:catalog-ready', onCatalogReady);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
