/* ============================================================
   WanderAlt — Map pin overlay
   ------------------------------------------------------------
   Renders WanderAlt's curated picks as numbered teardrop pins on
   top of the MapLibre basemap (see map-tiles.js).

   This module owns:
     • the pin overlay (pinHTML, clusterPinHTML, positioning)
     • greedy screen-space clustering
     • the bottom-sheet / side-panel pick detail
     • all five filter dimensions (text, time, category, mood, nhood)
     • the WA.MapView public API consumed by discover.js

   It does NOT own pan/zoom — MapLibre handles that natively.
   Pin positions are projected via WA.MapTiles.project(lng, lat).
   ============================================================ */
(() => {
  const CLUSTER_PX = 50;  /* pin-to-pin distance threshold for clustering */

  // ── State ─────────────────────────────────────────────────────
  let activeId   = null;
  let timeFilter = 'all';       /* all | tonight | thisweek | places */
  let catFilters = new Set();   /* set of category ids; empty = show all */
  let moodFilter = [];          /* mood tags; empty = no mood filter */
  let nhoodFilter = new Set();  /* neighborhood names; empty = all */
  let textQuery  = '';          /* free-text filter */

  // ── DOM refs (set in boot) ────────────────────────────────────
  let viewport, pinsEl, sheetEl, detailEl;
  let _reclusterTimer = null;

  // ── Categories / icons ────────────────────────────────────────
  const KIND_MAP = {
    'gig': 'music', 'club': 'music', 'noise': 'music',
    'talk': 'culture', 'lecture': 'culture',
    'exhibition': 'culture', 'gallery': 'culture',
    'record store': 'vinyl', 'bookshop': 'vinyl',
    'thrift': 'market',
  };
  function normaliseKind(k) { return KIND_MAP[k] || k; }

  /* Inline SVG icons keyed by normalised kind. Same set as before. */
  const PIN_ICONS = {
    music:    '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M5 11.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm6-9v8.5a1.5 1.5 0 1 1-1-1.41V4.6l-5 1V11a1.5 1.5 0 1 1-1-1.41V3l7-1.5z" fill="currentColor"/></svg>',
    culture:  '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1.5L1.5 5l2 1V11l-1 .5v1h11v-1l-1-.5V6l2-1L8 1.5zm-3 5l3-1.5 3 1.5V11h-1V7H7v4H6V7H5v4H4V7l1-.5z" fill="currentColor"/></svg>',
    drink:    '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 2h10l-1.5 7H4.5L3 2zm1.2 1l1 4h5.6l1-4H4.2zM6 11h4v1H6v-1zm-1 2h6v1H5v-1z" fill="currentColor"/></svg>',
    food:     '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 1v6h2v8h1V7h2V1H7v4H6V1H5v4H4V1H3zm9 0c-1.5 0-3 1.5-3 4 0 1.5.5 2.5 1.5 3V15h1V8c1-.5 1.5-1.5 1.5-3 0-2.5-1-4-1-4z" fill="currentColor"/></svg>',
    market:   '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 4l1-2h10l1 2v1H2V4zm0 2h12v8h-3v-4H5v4H2V6zm4 5h4v3H6v-3z" fill="currentColor"/></svg>',
    film:     '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 3h12v10H2V3zm1 1v2h1V4H3zm9 0v2h1V4h-1zM3 7v2h1V7H3zm9 0v2h1V7h-1zM3 10v2h1v-2H3zm9 0v2h1v-2h-1zM5 4v8h6V4H5z" fill="currentColor"/></svg>',
    festival: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1L2 5v9h12V5L8 1zm0 1.5L12 5H4l4-2.5zM3 6h10v6H3V6zm2 1v4h2V7H5zm4 0v4h2V7H9z" fill="currentColor"/></svg>',
    vinyl:    '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>',
    default:  '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>',
  };

  // ── Filter logic ──────────────────────────────────────────────
  function matchesText(e, q) {
    if (!q) return true;
    const hay = `${e.title} ${e.venue} ${e.neighborhood} ${e.kind} ${e.handle} ${e.quote || ''}`.toLowerCase();
    return q.split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  }

  /* True when any filter dimension is active. The map renders no pins
     until the user filters — showing 100+ pins by default is cluttered
     and unscanable. The hint overlay in #map-empty-hint communicates
     this state. */
  function isAnyFilterActive() {
    return !!textQuery
        || timeFilter !== 'all'
        || catFilters.size > 0
        || moodFilter.length > 0
        || nhoodFilter.size > 0;
  }

  function getVisibleEntries() {
    if (!isAnyFilterActive()) return [];
    const q = textQuery.toLowerCase();
    const catalog = window.WA?.catalog || [];
    const kindFilters = new Set([...catFilters].filter(id => id !== 'free'));
    const wantFree    = catFilters.has('free');
    return catalog.filter(e => {
      /* Geocoded entries only — entries without lat/lng don't render. */
      if (e.lat == null || e.lng == null) return false;
      if (timeFilter === 'tonight'  && !e.tonight) return false;
      if (timeFilter === 'thisweek' && !e.thisWeek && !e.tonight) return false;
      if (timeFilter === 'places'   && e.day) return false;
      if (kindFilters.size > 0 && !kindFilters.has(normaliseKind(e.kind))) return false;
      if (wantFree && !(e.moodTags || []).includes('free')) return false;
      if (nhoodFilter.size > 0 && !nhoodFilter.has(e.neighborhood)) return false;
      if (moodFilter.length > 0 && !moodFilter.every(t => (e.moodTags || []).includes(t))) return false;
      if (q && !matchesText(e, q)) return false;
      return true;
    });
  }

  // ── URL state (skipped on Discover — discover.js owns the URL) ─
  function writeUrlState() {
    if (document.body?.dataset?.page === 'discover') return;
    /* Standalone map.html no longer exists, but keep the no-op guard. */
  }

  // ── Pin / cluster rendering ───────────────────────────────────
  function pinHTML(entry) {
    const kind = normaliseKind(entry.kind);
    const catC = window.WA?.MAP_CAT || {};
    const c = catC[kind] || { bg: '#333', fg: '#fff' };
    const active = entry.id === activeId;
    const closed = !!entry.isClosed;
    const num    = entry.pin?.num ?? '';
    const cls    = [
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
        <span class="map-pin-new__icon">${PIN_ICONS[kind] || PIN_ICONS.default}</span>
      </span>
      ${num !== '' ? `<span class="map-pin-new__badge">${num}</span>` : ''}
    </button>`;
  }

  function clusterPinHTML(cl) {
    const n = cl.entries.length;
    const counts = {};
    cl.entries.forEach(e => { const k = normaliseKind(e.kind); counts[k] = (counts[k] || 0) + 1; });
    const topKind = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const catC = window.WA?.MAP_CAT || {};
    const c    = catC[topKind] || { bg: '#444' };
    /* Cluster centroid is stored as lat/lng so positionPins() can re-project
       it whenever the map moves. */
    return `<button class="map-cluster" type="button"
      data-lat="${cl.lat}" data-lng="${cl.lng}"
      aria-label="${n} events here" style="left:0;top:0;--cluster-bg:${c.bg}">
      <span class="map-cluster__count">${n}</span>
    </button>`;
  }

  /* Greedy O(n²) screen-distance clustering, identical math to the old
     SVG version — just using MapLibre projection instead of worldToScreen. */
  function computeClusters(entries) {
    const T = window.WA?.MapTiles;
    if (!entries.length || !T || !T.isReady()) return [];
    const pts = entries.map(e => {
      const p = T.project(e.lng, e.lat);
      return p ? { e, x: p.x, y: p.y } : null;
    }).filter(Boolean);

    const used = new Set();
    const clusters = [];
    for (let i = 0; i < pts.length; i++) {
      if (used.has(i)) continue;
      const members = [i];
      used.add(i);
      for (let j = i + 1; j < pts.length; j++) {
        if (used.has(j)) continue;
        if (Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y) <= CLUSTER_PX) {
          members.push(j);
          used.add(j);
        }
      }
      const lat = members.reduce((s, k) => s + pts[k].e.lat, 0) / members.length;
      const lng = members.reduce((s, k) => s + pts[k].e.lng, 0) / members.length;
      clusters.push({
        entries: members.map(k => pts[k].e),
        lat, lng,
        single: members.length === 1,
      });
    }
    return clusters;
  }

  function positionPins() {
    if (!pinsEl) return;
    const T = window.WA?.MapTiles;
    if (!T || !T.isReady()) return;
    const catalog = window.WA?.catalog || [];
    pinsEl.querySelectorAll('.map-pin-new').forEach(btn => {
      const entry = catalog.find(e => e.id === btn.dataset.id);
      if (!entry) return;
      const p = T.project(entry.lng, entry.lat);
      if (!p) return;
      btn.style.left = `${p.x}px`;
      btn.style.top  = `${p.y}px`;
    });
    pinsEl.querySelectorAll('.map-cluster').forEach(btn => {
      const p = T.project(+btn.dataset.lng, +btn.dataset.lat);
      if (!p) return;
      btn.style.left = `${p.x}px`;
      btn.style.top  = `${p.y}px`;
    });
  }

  function renderPins() {
    if (!pinsEl) return;
    const visible  = getVisibleEntries();
    const clusters = computeClusters(visible);

    /* Toggle the empty-state hint: shown when no filters are active so
       users understand why the map is bare. */
    const hint = document.getElementById('map-empty-hint');
    if (hint) hint.hidden = isAnyFilterActive();

    pinsEl.innerHTML = clusters.map(cl =>
      cl.single ? pinHTML(cl.entries[0]) : clusterPinHTML(cl)
    ).join('');
    positionPins();

    pinsEl.querySelectorAll('.map-pin-new').forEach(btn => {
      btn.addEventListener('pointerdown', e => e.stopPropagation());
      btn.addEventListener('click', () => {
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
        document.dispatchEvent(new CustomEvent('wa:map-pin-changed', {
          detail: { id: activeId },
        }));
      });
    });

    /* Cluster pins: clicking zooms in via MapLibre. */
    pinsEl.querySelectorAll('.map-cluster').forEach(btn => {
      btn.addEventListener('pointerdown', e => e.stopPropagation());
      btn.addEventListener('click', () => {
        const T = window.WA?.MapTiles;
        if (!T) return;
        const lat = +btn.dataset.lat;
        const lng = +btn.dataset.lng;
        const m   = T.getMap();
        const nextZoom = Math.min(18, (m?.getZoom() || 12) + 1.6);
        T.flyTo(lng, lat, nextZoom);
      });
    });
  }

  function focusPin(id) {
    const entry = (window.WA?.catalog || []).find(e => e.id === id);
    if (!entry || entry.lat == null || entry.lng == null) return false;
    activeId = id;
    const T = window.WA?.MapTiles;
    if (T && T.isReady()) {
      T.flyTo(entry.lng, entry.lat, 15);
    }
    renderPins();
    openDetail(entry);
    document.dispatchEvent(new CustomEvent('wa:map-pin-changed', {
      detail: { id: activeId },
    }));
    return true;
  }

  // ── Detail sheet / panel (unchanged from before) ─────────────
  function detailHTML(entry) {
    const kind = normaliseKind(entry.kind);
    const catC = window.WA?.MAP_CAT || {};
    const c = catC[kind] || { bg:'#444', fg:'#fff', label: entry.kind };
    const baseEyebrow = entry.pin?.eyebrow || c.label || '';
    const eyebrow = entry.isClosed
      ? `<span class="map-detail__closed">closed</span> ${baseEyebrow}`
      : baseEyebrow;

    const isFree = (entry.moodTags || []).includes('free');
    const priceBadge = isFree ? `<span class="map-detail__price-badge">Free</span>` : '';

    const meta = [entry.neighborhood, entry.kind, entry.time].filter(Boolean).join(' · ');
    const img = entry.imageUrl
      ? `<img src="${entry.imageUrl}" alt="" class="map-detail__img" loading="lazy"/>`
      : `<div class="map-detail__img-ph" style="--ph-bg:${c.bg}"><span class="map-detail__img-ph-init">${entry.thumbInitials || ''}</span></div>`;
    const q = entry.quote
      ? `<blockquote class="map-detail__quote">&ldquo;${entry.quote}&rdquo;<br><cite class="handle">— ${entry.handle}</cite></blockquote>`
      : '';
    const extLink = entry.permalink
      ? `<a class="map-detail__ext-link" href="${entry.permalink}" target="_blank" rel="noopener noreferrer">See event page &rarr;</a>`
      : '';

    const listVisible = getVisibleEntries();
    const listHref = textQuery
      ? `discover.html?q=${encodeURIComponent(textQuery)}`
      : 'discover.html';
    const listLabel = textQuery
      ? `View list (${listVisible.length}) &rarr;`
      : 'View list &rarr;';
    const moreLinks = `<nav class="map-detail__more" aria-label="Related searches">
        ${extLink ? `<span class="map-detail__more-link map-detail__more-link--ext">${extLink}</span>` : ''}
        <a class="map-detail__more-link map-detail__more-link--list" href="${listHref}">${listLabel}</a>
        <a class="map-detail__more-link" href="discover.html?q=${encodeURIComponent(entry.handle)}">More by ${entry.handle}</a>
        ${entry.kind ? `<a class="map-detail__more-link" href="discover.html?q=${encodeURIComponent(entry.kind)}">More like this</a>` : ''}
      </nav>`;
    const addressLine = entry.address
      ? `<p class="map-detail__address">${entry.address}</p>`
      : '';

    return `<div class="map-detail__head">
        <span class="map-detail__eyebrow">${eyebrow}${priceBadge}</span>
        <button class="map-detail__close" id="detail-close" aria-label="Close">&times;</button>
      </div>
      <h2 class="map-detail__title"><a href="venue.html?id=${entry.id}">${entry.title}</a></h2>
      <p class="meta">${meta}</p>
      ${addressLine}
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
    if (!root || !window.WA?.Bookmarks?.get) return;
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
      document.dispatchEvent(new CustomEvent('wa:map-pin-changed', { detail: { id: '' } }));
    });
    [sheetEl, detailEl].forEach(el => {
      el.addEventListener('change', e => {
        const cb = e.target.closest('.bookmark__check');
        if (!cb || !window.WA?.Bookmarks) return;
        WA.Bookmarks.set(cb.dataset.id, cb.checked);
      });
    });

    /* Close when the user clicks the basemap outside the panel + pins. */
    const panel = isDesktop ? detailEl : sheetEl;
    const handleOutside = (e) => {
      if (panel.contains(e.target)) return;
      if (e.target.closest('.map-pin-new, .map-cluster')) return;
      viewport.removeEventListener('pointerdown', handleOutside);
      closeDetail(); activeId = null; renderPins(); writeUrlState();
      document.dispatchEvent(new CustomEvent('wa:map-pin-changed', { detail: { id: '' } }));
    };
    setTimeout(() => viewport.addEventListener('pointerdown', handleOutside), 0);
  }

  function closeDetail() {
    if (sheetEl)  { sheetEl.hidden  = true; sheetEl.style.transform = ''; }
    if (detailEl) { detailEl.hidden = true; }
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
    viewport = document.getElementById('map-viewport');
    pinsEl   = document.getElementById('map-pins');
    sheetEl  = document.getElementById('map-sheet');
    detailEl = document.getElementById('map-detail');
    if (!viewport || !pinsEl) return;

    const T = window.WA?.MapTiles;
    if (!T) {
      console.warn('[map.js] WA.MapTiles not loaded — basemap missing.');
      return;
    }
    T.init('map-canvas', { city: (window.WA && window.WA.CITY) || 'tallinn' });

    /* Reposition pins on every camera move; debounced re-cluster on settle. */
    T.on('move', positionPins);
    T.on('moveend', () => {
      clearTimeout(_reclusterTimer);
      _reclusterTimer = setTimeout(renderPins, 120);
    });
    T.on('zoom',  positionPins);
    T.on('zoomend', () => {
      clearTimeout(_reclusterTimer);
      _reclusterTimer = setTimeout(renderPins, 120);
    });

    /* Zoom controls — wire existing buttons to MapLibre. */
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => T.getMap()?.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => T.getMap()?.zoomOut());
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => T.fitToPicks(getVisibleEntries()));

    /* Locate FAB — use the browser API; MapLibre doesn't add a control. */
    document.getElementById('btn-locate')?.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        pos => T.flyTo(pos.coords.longitude, pos.coords.latitude, 15),
        () => console.warn('[map.js] geolocation denied or unavailable'),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    document.addEventListener('wa:bookmarks-synced', () => {
      syncBookmarks(sheetEl); syncBookmarks(detailEl);
    });

    function onCatalogReady() {
      T.onReady(() => {
        renderPins();
        /* Fit to visible pins once on first load — subsequent fits are
           triggered by Discover when the user explicitly hits "Fit". */
        T.fitToPicks(getVisibleEntries(), { duration: 0 });
        /* If discover.js stashed an ?id= in the URL, focus that pin. */
        const sp = new URLSearchParams(window.location.search);
        const id = sp.get('id');
        if (id) focusPin(id);
      });
    }

    if (window.WA?.catalog?.length) onCatalogReady();
    document.addEventListener('wa:catalog-ready', onCatalogReady);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // ── Public API ────────────────────────────────────────────────
  window.WA = window.WA || {};
  window.WA.MapView = {
    setFilters({ q, time, cats, mood, nhoods } = {}) {
      if (q      !== undefined) textQuery   = q;
      if (time   !== undefined) timeFilter  = time;
      if (cats   !== undefined) catFilters  = new Set(cats);
      if (mood   !== undefined) moodFilter  = Array.isArray(mood) ? [...mood] : [];
      if (nhoods !== undefined) nhoodFilter = new Set(nhoods);
    },
    render:      () => renderPins(),
    fitView:     () => {
      const T = window.WA?.MapTiles;
      if (T) T.fitToPicks(getVisibleEntries());
    },
    focusPin,
    closeDetail: () => {
      closeDetail(); activeId = null; renderPins();
      document.dispatchEvent(new CustomEvent('wa:map-pin-changed', { detail: { id: '' } }));
    },
    isReady:     () => !!viewport && !!window.WA?.MapTiles?.isReady(),
  };
})();
