/* ============================================================
   WanderAlt — Discover page
   ------------------------------------------------------------
   Unified search/filter/map surface. Replaced the old standalone
   map.html and search.html pages (both now redirect stubs).

   Layout: mobile shows one pane at a time (FAB toggles list↔map);
   desktop ≥1024px splits the panes side-by-side.

   This module orchestrates the URL state, filter pipeline, list
   rendering and AI "match me" mode. The embedded map pane is
   driven via window.WA.MapView (exposed by map.js).
   ============================================================ */
(() => {
  /* ── State ──────────────────────────────────────────────── */
  const state = {
    type:   'events',    /* 'events' (picks) | 'places' (venues) — scope switch */
    q:      '',          /* keyword query */
    time:   'all',       /* all | tonight | thisweek | places */
    cats:   new Set(),   /* Events: WA.MAP_CATEGORIES ids (+ 'free'). Places: venue kinds. */
    nhoods: new Set(),   /* neighborhood names */
    mood:   [],          /* mood tag ids from mood-chips */
    sort:   'relevance', /* events: relevance|newest · places: featured|nearest */
    within: 0,           /* walking-radius filter in minutes (0 = off | 5 | 15 | 30) */
    mode:   'search',    /* 'search' | 'match' */
    ai:     '',          /* the last AI prompt, persisted in URL */
    view:   'list',      /* 'list' | 'map' — mobile only; desktop is split */
    id:     '',          /* active pin id — persisted in URL for deep linking */
  };

  /* Sort options per scope. A->Z and by-curator were dropped (curator is
     already a browse section); we keep only the intent-based sorts. */
  const SORT_OPTS = {
    events: [['relevance', 'Relevance'], ['newest', 'Soonest']],
    places: [['featured', 'Featured'],  ['nearest', 'Nearest']],
  };
  const DEFAULT_SORT = { events: 'relevance', places: 'featured' };

  /* ── DOM refs ───────────────────────────────────────────── */
  let input, matchToggle, matchWrap, matchResult, matchAgain, copyLinkBtn,
      resultsSection, resultsList, resultsCount, emptyState,
      sheet, sheetBackdrop, filtersBtn, filterCount,
      catChipsEl, nhoodChipsEl, sortEl, withinEl,
      browseSects, panesEl, viewToggleBtn;

  /* When true, the next renderList() skips the staggered entrance. Set while
     the user is typing so the results list doesn't re-animate per keystroke;
     view-level renders (load, filter/sort/mode change) leave it false and the
     list animates. Reset on every render. */
  let suppressEntrance = false;

  /* ── Utility helpers (lifted/adapted from search.js) ───── */
  /* Shared render helpers — single implementation in ui-helpers.js (P1). */
  const { esc, buildMeta, isEchoQuote, rowMedia, thumb, socialButtons } = window.WA.UI;

  /* Multi-word AND + field-weight relevance (from search.js:26). */
  const keywordFilter = (corpus, term) => {
    const t = term.toLowerCase();
    const words = t.split(/\s+/).filter(Boolean);
    const fields = (e) => [
      [e.title, 4], [e.venue, 3], [e.neighborhood, 2],
      [e.kind, 2],  [e.handle, 1], [e.quote, 1],
    ];
    const hits = [];
    for (const e of corpus) {
      const parts = fields(e).map(([v, w]) => [(v || '').toLowerCase(), w]);
      const hay = parts.map(([v]) => v).join(' ');
      if (!words.every(w => hay.includes(w))) continue;
      let score = 0;
      for (const [v, w] of parts) for (const word of words) if (v.includes(word)) score += w;
      if ((parts[0][0] || '').startsWith(t)) score += 5;
      hits.push([score, e]);
    }
    hits.sort((a, b) => b[0] - a[0]);
    return hits.map(([, e]) => e);
  };

  /* Kind normalisation matches map.js so 'free' / 'music' chips line up. */
  const KIND_MAP = {
    'gig': 'music', 'club': 'music', 'noise': 'music',
    'talk': 'culture', 'lecture': 'culture', 'exhibition': 'culture', 'gallery': 'culture',
    'record store': 'vinyl', 'bookshop': 'vinyl',
    'thrift': 'market',
  };
  const normaliseKind = (k) => KIND_MAP[k] || k;

  /* Apply time / category / free / neighborhood / mood filters. */
  const applyStructuredFilters = (entries) => {
    const kindCats = new Set([...state.cats].filter(id => id !== 'free'));
    const wantFree = state.cats.has('free');
    return entries.filter(e => {
      if (state.time === 'tonight'  && !e.tonight) return false;
      if (state.time === 'thisweek' && !e.thisWeek && !e.tonight) return false;
      if (state.time === 'places'   && e.day) return false;
      if (kindCats.size > 0 && !kindCats.has(normaliseKind(e.kind))) return false;
      if (wantFree && !(e.moodTags || []).includes('free')) return false;
      if (state.nhoods.size > 0 && !state.nhoods.has(e.neighborhood)) return false;
      if (state.mood.length > 0 && !state.mood.every(t => (e.moodTags || []).includes(t))) return false;
      return true;
    });
  };

  /* Gentle on-device taste nudge (shared idea with Today's This Week, B-5).
     When the reader has set a taste profile, reorder the default Relevance
     results by tasteScore as a SECONDARY signal — a stable sort, so the many
     0-score ties keep the curated/recency order and curation stays primary.
     Deliberately NOT applied when a search query is active (keywordFilter
     already ranked by match strength, and an explicit query is a stronger
     intent than taste) nor in Places mode (venues carry no mood_tags). A
     quiet nudge, never an override; nothing leaves the device. */
  const tastePrefsSet = () =>
    Object.keys(window.WA?.taste?.getPrefs?.() || {}).length > 0;
  const tasteApplies = () =>
    state.sort === 'relevance' && !state.q && tastePrefsSet();
  const tasteOrder = (arr) => {
    const ts = window.WA?.taste?.tasteScore;
    if (!ts || !tasteApplies()) return arr;
    return [...arr].sort((a, b) => ts(b) - ts(a));
  };

  /* Sort options (from search.js:504). */
  const DAY_RANK = { Tonight: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const sortEntries = (entries) => {
    const arr = [...entries];
    switch (state.sort) {
      case 'newest':
        return arr.sort((a, b) => {
          const ra = DAY_RANK[a.day] ?? 99;
          const rb = DAY_RANK[b.day] ?? 99;
          if (ra !== rb) return ra - rb;
          return (a.time || '').localeCompare(b.time || '');
        });
      case 'title':
        return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'curator':
        return arr.sort((a, b) => (a.handle || '').localeCompare(b.handle || ''));
      default:
        /* Relevance: keep curation/recency order, then fold in the taste nudge. */
        return tasteOrder(arr);
    }
  };



  /* Row rendering matches search.js's list-row markup, plus data-id so
     the pin↔card sync handler can find the matching card.              */
  const renderRow = (e) => {
    const hasCoords = !!(e.lat && e.lng);
    /* "on map" is a JS-handled action on Discover (no navigation); the
       href is a fallback for users with JS disabled. data-focus-pin tells
       the click handler to call WA.MapView.focusPin instead.           */
    const mapLinkA = hasCoords
      ? `<a class="list-row__map" href="discover.html?id=${encodeURIComponent(e.id)}&view=map" data-focus-pin="${esc(e.id)}" aria-label="Show on map">on map &rarr;</a>`
      : '';
    const closedBadge = e.isClosed ? ` <span class="list-row__closed">closed</span>` : '';
    const isFree = (e.moodTags || []).includes('free');
    const freeBadge = isFree ? ` <span class="list-row__free">free</span>` : '';
    const rowCls = e.isClosed ? 'list-row list-row--closed list-row--card' : 'list-row list-row--card';

    /* Photo-forward card (June 2026): a venue photo on the left reusing the
       app's shared .thumb--lg treatment (consistent with the home picks +
       venue page), so disparate event photos still read as one editorial
       set. rowMedia() falls back to the initials tile when the pick has no
       image_url (or the photo URL 403s). The media is a decorative
       supplementary link (the title link is the keyboard tab stop). */
    const media = rowMedia(e);

    return `<li class="${rowCls}" data-id="${esc(e.id)}">
       ${media}
       <div class="list-row__body">
         <p class="list-row__title">
           <a href="venue.html?id=${e.id}">${esc(e.title)}</a>${closedBadge}${freeBadge}${mapLinkA}
         </p>
         <p class="list-row__meta">${esc(buildMeta(e))}</p>
         ${isEchoQuote(e)
           ? `<p class="list-row__quote">via <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${esc(e.handle)}</a></p>`
           : `<p class="list-row__quote">&mdash; ${esc(e.quote)} <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${esc(e.handle)}</a></p>`}
       </div>
     </li>`;
  };

  const renderList = (entries) => {
    if (!resultsList || !emptyState) return;
    /* Opt the list into the staggered entrance unless we're mid-typing.
       toggleAttribute keeps the @starting-style fade-up from re-firing on
       every keystroke (run() is called per input event, no debounce). */
    resultsList.toggleAttribute('data-animate', !suppressEntrance);
    suppressEntrance = false;
    if (!entries.length) {
      resultsList.innerHTML = '';
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    /* F-11 guard: consecutive rows sharing one photo read as a rendering
       bug — repeats drop to the initials tile (first occurrence keeps it). */
    let prevImg = null;
    const dupImg = new Set();
    for (const e of entries) {
      const img = e.imageUrl || e.image_url || null;
      if (img && img === prevImg) dupImg.add(e.id);
      if (img) prevImg = img;
    }
    resultsList.innerHTML = entries
      .map(e => renderRow(dupImg.has(e.id) ? { ...e, imageUrl: null, image_url: null } : e))
      .join('');
  };

  /* ── Places (venues) ─────────────────────────────────── */
  const VENUE_KIND_LABELS = {
    'record store': 'Record store', 'bookshop': 'Bookshop', 'gallery': 'Gallery',
    'club': 'Club', 'thrift': 'Flea & thrift', 'arts centre': 'Arts centre',
    'cinema': 'Cinema', 'community': 'Community space',
  };
  const venueKindLabel = (k) => VENUE_KIND_LABELS[k] || (k ? k[0].toUpperCase() + k.slice(1) : '');

  /* A place is a permanent venue, not a dated pick — no curator quote.
     Card shows name, kind + neighborhood, and a small row of social
     glyphs (website / Facebook / Instagram) when present. Reuses the
     shared WA.UI.socialButtons() → .social-icon system (one impl, 22px,
     filled-mobile/outline-desktop) instead of a local glyph fork. */
  const renderVenueRow = (v) => {
    const meta = [v.neighborhood, venueKindLabel(v.kind)].filter(Boolean).join(' · ');
    const social = socialButtons({ name: v.name, website: v.website, facebook: v.facebook, instagram: v.instagram });
    const onMap = (v.lat != null && v.lng != null)
      ? `<a class="list-row__map" href="place.html?id=${encodeURIComponent(v.id)}&view=map" data-focus-pin="${esc(v.id)}" aria-label="Show ${esc(v.name)} on map">on map &rarr;</a>`
      : '';
    return `<li class="list-row list-row--venue" data-id="${esc(v.id)}">
       <p class="list-row__title"><a href="place.html?id=${encodeURIComponent(v.id)}">${esc(v.name)}</a>${onMap}</p>
       <p class="list-row__meta">${esc(meta)}</p>
       ${social}
     </li>`;
  };

  const renderVenueList = (venues) => {
    if (!resultsList || !emptyState) return;
    resultsList.toggleAttribute('data-animate', !suppressEntrance);
    suppressEntrance = false;
    if (!venues.length) { resultsList.innerHTML = ''; emptyState.hidden = false; return; }
    emptyState.hidden = true;
    resultsList.innerHTML = venues.map(renderVenueRow).join('');
  };

  /* Nearest + the walking-radius filter need the visitor's location;
     request it lazily and cache. _locDenied records a failed/declined
     attempt so the UI can explain why a radius isn't filtering. */
  let _userLoc = null;
  let _locDenied = false;
  const ensureLocation = (cb) => {
    if (_userLoc || !navigator.geolocation) { cb(); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { _userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude }; _locDenied = false; cb(); },
      ()  => { _locDenied = true; cb(); },    /* denied → fall back gracefully */
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  };
  /* Either spatial control needs the visitor's location before running. */
  const needsLocation = () =>
    state.within > 0 || (state.type === 'places' && state.sort === 'nearest');

  /* Walking-radius filter. ~80 m/min (a relaxed 4.8 km/h stroll), so
     5/15/30 min ≈ 400/1200/2400 m. Haversine against each entry's
     lat/lng; entries without coords drop out once a radius is set. */
  const WALK_M_PER_MIN = 80;
  const haversineM = (aLat, aLng, bLat, bLng) => {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  const withinFilter = (list) => {
    if (!state.within || !_userLoc) return list;   /* off, or location unknown → no-op */
    const max = state.within * WALK_M_PER_MIN;
    return list.filter(e => e.lat != null && e.lng != null &&
      haversineM(_userLoc.lat, _userLoc.lng, e.lat, e.lng) <= max);
  };
  const sortVenues = (list) => {
    const arr = list.slice();
    if (state.sort === 'nearest' && _userLoc) {
      const d = (v) => (v.lat == null || v.lng == null) ? Infinity
        : (v.lat - _userLoc.lat) ** 2 + (v.lng - _userLoc.lng) ** 2;
      return arr.sort((a, b) => d(a) - d(b));
    }
    /* Featured = a stable, scannable alphabetical order. */
    return arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  const runPlaces = () => {
    const venues = (window.WA && window.WA.venues) || [];
    let list = venues.slice();
    if (state.cats.size)   list = list.filter(v => state.cats.has(v.kind));
    if (state.nhoods.size) list = list.filter(v => state.nhoods.has(v.neighborhood));
    if (state.q) {
      const t = state.q.toLowerCase();
      list = list.filter(v => `${v.name} ${v.neighborhood} ${venueKindLabel(v.kind)}`.toLowerCase().includes(t));
    }
    list = withinFilter(list);
    list = sortVenues(list);

    /* Places always shows its list (browsing places is the job) — no
       "empty until filtered" gate like Events has. */
    browseSects.forEach(s => { s.hidden = true; });
    resultsSection.hidden = false;
    if (resultsCount) resultsCount.textContent = list.length === 1 ? '1 place' : `${list.length} places`;
    if (emptyState) {
      emptyState.textContent = state.q
        ? `No places found for "${state.q}"`
        : 'No places match the active filters.';
    }
    renderVenueList(list);
    renderApplied();

    /* Drive the map's Places layer with the same filtered set (pins on
       load — a finite venue set is scannable). setPlaces stashes the
       state the map reads on its own boot, so call it even before the
       map is ready; only render/fit once it is. */
    const mv = window.WA && window.WA.MapView;
    if (mv && mv.setPlaces) {
      mv.setPlaces(list);
      if (mv.isReady()) { mv.render(); mv.fitView(); }
    }
  };

  /* ── Browse sections (populated from live catalog) ───── */
  const KIND_LABELS = {
    gig: 'Gigs & noise', talk: 'Lectures & talks', exhibition: 'Exhibitions',
    club: 'Clubs & late bars', bookshop: 'Bookshops & records', film: 'Film & cinema',
    market: 'Markets & fairs', festival: 'Festivals',
  };
  const topN = (entries, accessor, max) => {
    const counts = {};
    entries.forEach(e => { const k = accessor(e); if (k) counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, max);
  };

  const populateBrowse = (catalog) => {
    const curatorData = (window.WA && window.WA.curators) || [];
    const BIOS = Object.fromEntries(curatorData.map(c => [c.handle, c.tagline]).filter(([, t]) => t));

    /* Curators */
    const curators = topN(catalog.filter(e => e.handle !== '@discovery'), e => e.handle, 6);
    const curSect = document.getElementById('curators-label')?.closest('section');
    if (curSect) {
      const metaEl = curSect.querySelector('.meta');
      const listEl = curSect.querySelector('.curator-rows');
      if (metaEl) metaEl.textContent = `${curators.length} writer${curators.length !== 1 ? 's' : ''}`;
      if (listEl) { listEl.removeAttribute('aria-busy'); listEl.innerHTML = curators.map(([handle, n]) => {
        const bio = BIOS[handle];
        return `<li><button type="button" class="curator-row" data-search="${esc(handle)}">
          <span class="curator-row__handle">${esc(handle)}</span>
          ${bio ? `<span class="curator-row__quote">&mdash; ${esc(bio)}</span>` : ''}
          <span class="curator-row__count">${n} pick${n !== 1 ? 's' : ''}</span>
        </button></li>`;
      }).join(''); }
    }

    /* Neighborhoods */
    const nhoods = topN(catalog, e => e.neighborhood, 8);
    const nhSect = document.getElementById('neighborhoods-label')?.closest('section');
    if (nhSect) {
      const metaEl = nhSect.querySelector('.meta');
      const listEl = nhSect.querySelector('.browse-rows');
      if (metaEl) metaEl.textContent = `${nhoods.length} area${nhoods.length !== 1 ? 's' : ''}`;
      if (listEl) listEl.removeAttribute('aria-busy');
      if (listEl) listEl.innerHTML = nhoods.map(([name, n]) =>
        `<li><button type="button" class="browse-row" data-nhood="${esc(name)}">
          <span class="browse-row__label">${esc(name)}</span>
          <span class="browse-row__count">${n} picks</span>
        </button></li>`
      ).join('');
    }

    /* Kinds */
    const kinds = topN(catalog, e => e.kind, 8);
    const kindSect = document.getElementById('kinds-label')?.closest('section');
    if (kindSect) {
      const metaEl = kindSect.querySelector('.meta');
      const listEl = kindSect.querySelector('.browse-rows');
      if (metaEl) metaEl.textContent = `${kinds.length} type${kinds.length !== 1 ? 's' : ''}`;
      if (listEl) listEl.removeAttribute('aria-busy');
      if (listEl) listEl.innerHTML = kinds.map(([kind, n]) => {
        const label = KIND_LABELS[kind] || (kind.charAt(0).toUpperCase() + kind.slice(1));
        return `<li><button type="button" class="browse-row" data-search="${esc(kind)}">
          <span class="browse-row__label">${esc(label)}</span>
          <span class="browse-row__count">${n} place${n !== 1 ? 's' : ''}</span>
        </button></li>`;
      }).join('');
    }
  };

  /* ── Filter sheet rendering ─────────────────────────── */
  /* Category chips are mode-aware: Events uses WA.MAP_CATEGORIES; Places
     uses the alt-culture venue kinds (WA.VENUE_KINDS). Same data-cat
     mechanism — the meaning of a "category" just depends on scope. */
  const renderCatChips = () => {
    if (!catChipsEl) return;
    /* Per-city chips (June 2026, parked-exploration shipped early): only
       offer categories/kinds that actually have matches in the current
       city's data — Tallinn's "Street art" chip shouldn't dead-end a
       Helsinki reader. A currently-SELECTED category always keeps its
       chip so an active filter can be cleared. Falls back to the full
       list while the catalog is still empty (pre-data paint). */
    const catalog = (window.WA && window.WA.catalog) || [];
    const venues  = (window.WA && window.WA.venues)  || [];
    const hasCat = (id) => id === 'free'
      ? catalog.some(e => (e.moodTags || []).includes('free'))
      : catalog.some(e => normaliseKind(e.kind) === id);
    const hasKind = (k) => venues.some(v => v.kind === k);
    let pairs = state.type === 'places'
      ? ((window.WA && window.WA.VENUE_KINDS) || []).map(k => [k, venueKindLabel(k)])
      : ((window.WA && window.WA.MAP_CATEGORIES) || []).map(c => [c.id, c.label]);
    const present = state.type === 'places' ? hasKind : hasCat;
    const dataReady = state.type === 'places' ? venues.length > 0 : catalog.length > 0;
    if (dataReady) pairs = pairs.filter(([id]) => present(id) || state.cats.has(id));
    catChipsEl.innerHTML = pairs.map(([id, label]) => {
      const on = state.cats.has(id);
      return `<button type="button" class="sheet-chip${on ? ' sheet-chip--on' : ''}" data-cat="${esc(id)}" aria-pressed="${on}">${esc(label)}</button>`;
    }).join('');
  };

  const renderNhoodChips = () => {
    if (!nhoodChipsEl) return;
    const catalog = (window.WA && window.WA.catalog) || [];
    const nhoods = topN(catalog, e => e.neighborhood, 12);
    nhoodChipsEl.innerHTML = nhoods.map(([name]) => {
      const on = state.nhoods.has(name);
      return `<button type="button" class="sheet-chip${on ? ' sheet-chip--on' : ''}" data-nhood="${esc(name)}" aria-pressed="${on}">${esc(name)}</button>`;
    }).join('');
  };

  /* ── URL read/write ─────────────────────────────────── */
  const writeUrlState = () => {
    const sp = new URLSearchParams();
    if (state.type === 'places')     sp.set('type', 'places');
    if (state.q)                     sp.set('q', state.q);
    if (state.time && state.time !== 'all') sp.set('time', state.time);
    if (state.cats.size)             sp.set('cat', [...state.cats].join(','));
    if (state.nhoods.size)           sp.set('nhood', [...state.nhoods].join(','));
    if (state.within)                sp.set('within', String(state.within));
    if (state.sort && state.sort !== DEFAULT_SORT[state.type]) sp.set('sort', state.sort);
    if (state.ai)                    sp.set('ai', state.ai);
    if (state.mode === 'match')      sp.set('mode', 'match');
    if (state.view === 'map')        sp.set('view', 'map');
    if (state.id)                    sp.set('id', state.id);
    const qs = sp.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState(null, '', url);
  };

  const readUrlState = () => {
    const sp = new URLSearchParams(window.location.search);
    state.type   = sp.get('type') === 'places' ? 'places' : 'events';
    state.q      = sp.get('q')     || '';
    state.time   = sp.get('time')  || 'all';
    state.cats   = new Set((sp.get('cat')   || '').split(',').filter(Boolean));
    state.nhoods = new Set((sp.get('nhood') || '').split(',').filter(Boolean));
    state.within = [5, 15, 30].includes(parseInt(sp.get('within'), 10)) ? parseInt(sp.get('within'), 10) : 0;
    state.sort   = sp.get('sort')  || DEFAULT_SORT[state.type];
    state.ai     = sp.get('ai')    || '';
    state.mode   = sp.get('mode') === 'match' ? 'match' : 'search';
    state.view   = sp.get('view')  === 'map' ? 'map'   : 'list';
    state.id     = sp.get('id')    || '';
  };

  /* ── Pill row state reflection ──────────────────────── */
  const reflectPills = () => {
    document.querySelectorAll('.discover-pill[data-pill]').forEach(btn => {
      const pill = btn.dataset.pill;
      let on = false;
      if (pill === 'tonight' || pill === 'thisweek') on = state.time === pill;
      else if (pill === 'free') on = state.cats.has('free');
      else if (pill.startsWith('kind:')) on = state.cats.has(pill.slice(5));
      btn.classList.toggle('discover-pill--on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const n = state.cats.size + state.nhoods.size + (state.within ? 1 : 0) + (state.sort !== DEFAULT_SORT[state.type] ? 1 : 0);
    if (filterCount && filtersBtn) {
      if (n > 0) { filterCount.hidden = false; filterCount.textContent = String(n); }
      else       { filterCount.hidden = true; }
    }
    /* Desktop rail's "Clear" appears only when something is active. */
    const railClear = document.getElementById('discover-rail-clear');
    if (railClear) railClear.hidden = n === 0;
    updateFacetPills();
  };

  /* ── Facet pills (desktop, F-15b) ────────────────────────────
     Label each dropdown-pill with its current selection so the row is
     scannable without opening anything: "Category · 2", "≤ 15 min",
     "Sort: Soonest". CSS hides the pills on mobile (the sheet shows
     the groups expanded there). */
  const updateFacetPills = () => {
    document.querySelectorAll('.discover-sheet__field[data-facet]').forEach(field => {
      const pill = field.querySelector('.facet-pill');
      if (!pill) return;
      const facet = field.dataset.facet;
      let label = '';
      let on = false;
      if (facet === 'cat') {
        const n = state.cats.size;
        label = n ? `Category · ${n}` : 'Category';
        on = n > 0;
      } else if (facet === 'nhood') {
        const n = state.nhoods.size;
        label = n ? `Neighborhood · ${n}` : 'Neighborhood';
        on = n > 0;
      } else if (facet === 'within') {
        label = state.within ? `≤ ${state.within} min` : 'Distance';
        on = !!state.within;
      } else if (facet === 'sort') {
        const opts = SORT_OPTS[state.type] || SORT_OPTS.events;
        const cur = opts.find(([v]) => v === state.sort);
        label = `Sort: ${cur ? cur[1] : ''}`.trim();
        on = state.sort !== DEFAULT_SORT[state.type];
      }
      pill.textContent = label;
      pill.classList.toggle('facet-pill--on', on);
    });
  };

  const closeFacetPanels = (except) => {
    document.querySelectorAll('.discover-sheet__field[data-open]').forEach(f => {
      if (f === except) return;
      delete f.dataset.open;
      const pill = f.querySelector('.facet-pill');
      if (pill) pill.setAttribute('aria-expanded', 'false');
    });
  };

  /* Reflect the active scope (events | places) across the chrome:
     scope buttons, which pills are visible, sort options, the search
     placeholder, and the map (events-only; Places renders via setPlaces()). */
  const reflectType = () => {
    const places = state.type === 'places';
    document.querySelectorAll('.discover-scope__btn').forEach(b => {
      const on = b.dataset.type === state.type;
      b.classList.toggle('discover-scope__btn--on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.discover-pill[data-mode]').forEach(b => {
      b.hidden = b.dataset.mode !== state.type;
    });
    if (input) {
      input.placeholder = places ? 'Search places…' : 'Search anything…';
    }
    document.body.classList.toggle('discover-places', places);
    /* Render the filter controls now (not just on sheet-open) so the
       desktop persistent rail is populated and refreshes on mode switch. */
    renderCatChips();
    renderNhoodChips();
    renderWithinChips();
    buildSortOptions();
  };

  const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;
  /* On desktop the filter rail is always visible → apply changes live. */
  const liveApply = () => {
    if (!isDesktop()) return;
    reflectPills();
    writeUrlState();
    if (needsLocation()) ensureLocation(run);
    else run();
  };

  /* (Re)build the sort <select> for the active scope. */
  const buildSortOptions = () => {
    if (!sortEl) return;
    const opts = SORT_OPTS[state.type] || SORT_OPTS.events;
    if (!opts.some(([v]) => v === state.sort)) state.sort = DEFAULT_SORT[state.type];
    /* Radio list (not a <select>): all options visible, one tap. */
    sortEl.innerHTML = opts.map(([v, label]) =>
      `<label class="discover-sort__opt">
         <input type="radio" name="discover-sort-radio" value="${v}"${v === state.sort ? ' checked' : ''}>
         <span class="discover-sort__label">${esc(label)}</span>
       </label>`).join('');
  };
  const selectedSort = () => {
    const sel = sortEl && sortEl.querySelector('input[name="discover-sort-radio"]:checked');
    return sel ? sel.value : DEFAULT_SORT[state.type];
  };

  /* Walking-radius control — single-select chips (Any / 5 / 15 / 30 min
     walk). Applies to both Events and Places (both carry lat/lng). */
  const WITHIN_OPTS = [[0, 'Any'], [5, '5 min'], [15, '15 min'], [30, '30 min']];
  const renderWithinChips = () => {
    if (!withinEl) return;
    withinEl.innerHTML = WITHIN_OPTS.map(([v, label]) => {
      const on = state.within === v;
      return `<button type="button" class="sheet-chip${on ? ' sheet-chip--on' : ''}" data-within="${v}" aria-pressed="${on}">${esc(label)}</button>`;
    }).join('');
    const note = document.getElementById('discover-within-note');
    if (note) note.hidden = !(state.within > 0 && _locDenied);
  };

  /* ── Map sync ───────────────────────────────────────── */
  /* Pushes Discover's filter state into the embedded map view. All five
     filter dimensions (q, time, cats, mood, nhoods) round-trip so the
     list and map panes always show the same set of picks.               */
  let _mapSyncQueued = false;
  const syncMap = () => {
    const mv = window.WA && window.WA.MapView;
    if (!mv) return;
    if (!mv.isReady()) {
      /* MapLibre boots lazily after first paint (maplibre-loader.js) —
         with the old early-return the filter state pushed during run()
         never reached the map and pins stayed empty until the next user
         interaction. Queue ONE re-sync for the moment the map is ready. */
      if (!_mapSyncQueued && window.WA.MapTiles?.onReady) {
        _mapSyncQueued = true;
        window.WA.MapTiles.onReady(() => { _mapSyncQueued = false; syncMap(); });
      }
      return;
    }
    mv.setFilters({
      q:      state.q,
      time:   state.time,
      cats:   [...state.cats],
      mood:   state.mood,
      nhoods: [...state.nhoods],
      within: state.within,
      userLoc: _userLoc,
    });
    mv.render();
  };

  /* ── Main run loop ──────────────────────────────────── */
  const isAnyFilterActive = () =>
    state.q || state.time !== 'all' || state.cats.size || state.nhoods.size || state.mood.length || state.within;

  const run = () => {
    /* Places has its own pipeline: runPlaces() filters venues and calls
       MapView.setPlaces() to render venue pins on the map. */
    if (state.type === 'places') { runPlaces(); return; }

    /* Keep the map in sync with every filter change, regardless of mode. */
    syncMap();

    if (state.mode === 'match') return; /* AI mode handles its own list rendering */

    const catalog = (window.WA && window.WA.catalog) || [];
    const filterActive = isAnyFilterActive();

    if (!filterActive) {
      /* No filters → show browse sections, hide results. */
      resultsSection.hidden = true;
      browseSects.forEach(s => { s.hidden = false; });
      renderApplied();   /* clears the applied-filters row when emptied */
      return;
    }

    browseSects.forEach(s => { s.hidden = true; });
    resultsSection.hidden = false;

    /* Pipeline: structured filters → walking radius → keyword filter → sort. */
    const structured = withinFilter(applyStructuredFilters(catalog));
    const textHit    = state.q ? keywordFilter(structured, state.q) : structured;
    const sorted     = sortEntries(textHit);

    if (resultsCount) {
      const n = sorted.length;
      const base = n === 1 ? '1 result' : `${n} results`;
      /* One quiet cue, only when the taste nudge actually reordered the list
         (Relevance sort · no query · prefs set) — no per-card badges. The
         "tuned to you" text links to the taste check on Today so the reader
         can adjust what's biasing the order. */
      if (tasteApplies()) {
        resultsCount.innerHTML =
          `${base} · <a class="taste-cue" href="index.html#taste-onboarding">tuned to you</a>`;
      } else {
        resultsCount.textContent = base;
      }
    }
    if (emptyState) {
      emptyState.textContent = state.q
        ? `Nothing found for "${state.q}"`
        : 'No picks match the active filters.';
    }
    renderList(sorted);
    renderApplied();
  };

  /* Applied-filters overview — removable chips for the sheet-set
     category + neighborhood filters (the ones that are otherwise
     invisible once the sheet closes). "free" is omitted because the
     Free pill already shows it. Hidden when nothing's active. */
  const catLabel = (id) => {
    if (state.type === 'places') return venueKindLabel(id);
    const cats = (window.WA && window.WA.MAP_CATEGORIES) || [];
    return (cats.find(c => c.id === id) || {}).label || id;
  };
  const renderApplied = () => {
    const el = document.getElementById('discover-applied');
    if (!el) return;
    const chips = [];
    state.cats.forEach(id => {
      if (id === 'free') return;
      chips.push({ type: 'cat', val: id, label: catLabel(id) });
    });
    state.nhoods.forEach(name => chips.push({ type: 'nhood', val: name, label: name }));
    if (state.within) chips.push({ type: 'within', val: String(state.within), label: `${state.within} min walk` });
    if (!chips.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = chips.map(c =>
      `<button type="button" class="discover-applied__chip"` +
      ` data-applied-type="${c.type}" data-applied-val="${esc(c.val)}"` +
      ` aria-label="Remove filter: ${esc(c.label)}">${esc(c.label)}` +
      ` <span class="discover-applied__x" aria-hidden="true">&times;</span></button>`
    ).join('');
  };

  /* Count of picks the current (pending) filter state would yield.
     Drives the sheet's live "Show N picks" Apply label — Baymard's
     product-list benchmark recommends an explicit apply button with a
     live result count rather than refreshing the list mid-selection.
     Sort doesn't change the count, so it's left out. */
  const pendingCount = () => {
    if (state.type === 'places') {
      let list = (window.WA && window.WA.venues) || [];
      if (state.cats.size)   list = list.filter(v => state.cats.has(v.kind));
      if (state.nhoods.size) list = list.filter(v => state.nhoods.has(v.neighborhood));
      if (state.q) {
        const t = state.q.toLowerCase();
        list = list.filter(v => `${v.name} ${v.neighborhood} ${venueKindLabel(v.kind)}`.toLowerCase().includes(t));
      }
      return withinFilter(list).length;
    }
    const catalog    = (window.WA && window.WA.catalog) || [];
    const structured = withinFilter(applyStructuredFilters(catalog));
    const textHit    = state.q ? keywordFilter(structured, state.q) : structured;
    return textHit.length;
  };
  const updateApplyCount = () => {
    const btn = document.getElementById('discover-sheet-apply');
    if (!btn) return;
    const n = pendingCount();
    const noun = state.type === 'places' ? 'place' : 'pick';
    btn.textContent = `Show ${n} ${noun}${n === 1 ? '' : 's'}`;
  };

  /* ── View toggle (mobile) ───────────────────────────── */
  const reflectView = () => {
    if (panesEl) panesEl.dataset.view = state.view;
    if (viewToggleBtn) {
      const isMap = state.view === 'map';
      viewToggleBtn.querySelectorAll('.discover-view-fab__seg').forEach(seg => {
        seg.classList.toggle('discover-view-fab__seg--on',
          (seg.dataset.seg === 'map') === isMap);
      });
      viewToggleBtn.setAttribute('aria-label', isMap ? 'Switch to list view' : 'Switch to map view');
      viewToggleBtn.classList.toggle('discover-view-fab--map-active', isMap);
    }
    /* Tag body so CSS can hide chrome that doesn't belong over the map. */
    document.body.classList.toggle('discover-map-view', state.view === 'map');
  };

  const setView = (newView) => {
    state.view = newView === 'map' ? 'map' : 'list';
    reflectView();
    writeUrlState();
    /* When switching to map, the viewport just became visible — its
       getBoundingClientRect() now returns real dimensions, so fit. */
    if (state.view === 'map') {
      requestAnimationFrame(() => {
        syncMap();
        const mv = window.WA && window.WA.MapView;
        if (mv && mv.isReady()) mv.fitView();
      });
    }
  };

  /* ── AI "match me" mode ─────────────────────────────── */

  /* Sync all mode-specific DOM state from the current state object.
     Called by setMode() and also directly from popstate so the DOM
     always reflects the restored URL without running side-effects. */
  const reflectModeDOM = () => {
    const isMatch = state.mode === 'match';
    const wrap = document.querySelector('.discover-search');
    if (wrap) wrap.dataset.mode = state.mode;
    if (matchToggle) matchToggle.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    /* Body class hides pills + mood strip in AI mode (they do nothing there). */
    document.body.classList.toggle('discover-ai-mode', isMatch);
    if (input) {
      input.placeholder = isMatch ? 'Describe your night…'
        : (state.type === 'places' ? 'Search places…' : 'Search anything…');
      input.setAttribute('enterkeyhint', isMatch ? 'go' : 'search');
    }
  };

  /* Show the example-prompt row only when AI mode is active AND the field
     is empty — so it doesn't compete with the user's own text. */
  const reflectAiExamples = () => {
    const el = document.getElementById('discover-ai-examples');
    if (el) el.hidden = !(state.mode === 'match' && !input.value);
  };

  const renderMatchHero = (pick, why) => {
    const whyText  = why || pick.why || pick.quote || '';
    return `<div class="match-card">
       <p class="match-card__why">&ldquo;${esc(whyText)}&rdquo;</p>
       <p class="match-card__attr">
         <span class="match-card__attr-line" aria-hidden="true"></span>
         <a class="handle" href="curator.html?handle=${encodeURIComponent(pick.handle)}">${esc(pick.handle)}</a>
       </p>
       <a class="tonight__venue" href="venue.html?id=${encodeURIComponent(pick.id)}">
         ${thumb(pick, true)}
         <span class="tonight__venue-body">
           <span class="tonight__venue-name">${esc(pick.title)}</span>
           <span class="meta">${esc(pick.neighborhood || '')} &middot; ${esc(pick.kind || '')}${pick.time ? ' &middot; ' + esc(pick.time) : ''}</span>
         </span>
       </a>
     </div>`;
  };

  const renderMatchSecondary = (pick, why) => {
    const meta = [pick.neighborhood, pick.kind, pick.time].filter(Boolean).join(' · ');
    /* Photo-forward card, consistent with every other pick list (Discover
       results / Saved / Curator / venue / place). Renders on the white page
       below the petrol search box, so the standard card treatment applies. */
    return `<li class="list-row list-row--card" data-id="${esc(pick.id)}">
       ${rowMedia(pick)}
       <div class="list-row__body">
         <p class="list-row__title">
           <a href="venue.html?id=${encodeURIComponent(pick.id)}">${esc(pick.title)}</a>
         </p>
         <p class="list-row__meta">${esc(meta)}</p>
         <p class="list-row__quote">&mdash; ${esc(why || pick.quote || '')} <a class="handle" href="curator.html?handle=${encodeURIComponent(pick.handle)}">${esc(pick.handle)}</a></p>
       </div>
     </li>`;
  };

  const runMatch = async (prompt) => {
    if (!matchWrap || !matchResult) return;
    matchWrap.hidden = false;
    if (matchAgain)   matchAgain.hidden   = true;
    if (copyLinkBtn)  copyLinkBtn.hidden  = true;
    /* Skeleton mirrors the hero card layout so the page doesn't shift
       when the result arrives. Static — no animation per brand brief. */
    matchResult.innerHTML = `
      <div class="match-skeleton" role="status" aria-label="Matching…">
        <div class="match-skeleton__quote"></div>
        <div class="match-skeleton__attr"></div>
        <div class="match-skeleton__venue">
          <div class="match-skeleton__thumb-sq"></div>
          <div class="match-skeleton__venue-text">
            <div class="match-skeleton__name"></div>
            <div class="match-skeleton__sub"></div>
          </div>
        </div>
      </div>`;

    const base = window.WA && window.WA.BASE_URL;
    const city = (window.WA && window.WA.CITY) || 'tallinn';
    if (!base) {
      matchResult.innerHTML = '<p class="match-error">Match-me is not available in offline mode.</p>';
      return;
    }
    const tasteParams = window.WA?.taste?.matchParams() || {};
    try {
      const res = await fetch(`${base}/functions/v1/match-pick`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ city, prompt, mode: 'find_many', ...tasteParams }),
      });
      const data = await res.json();
      if (!data.ok) {
        matchResult.innerHTML = `<p class="match-error">Couldn't match right now — try rephrasing.</p>`;
        return;
      }
      const hits = Array.isArray(data.hits) && data.hits.length
        ? data.hits
        : (data.pick ? [{ pick: data.pick, why: data.pick.why || '' }] : []);
      if (!hits.length) {
        matchResult.innerHTML = `
          <p class="match-error">No curated picks match &ldquo;${esc(prompt)}&rdquo;.</p>
          <p class="match-error-hint">Try:
            <button type="button" class="discover-ai-example discover-ai-example--inline" data-prompt="quiet wine bar tonight">quiet wine bar tonight</button> &middot;
            <button type="button" class="discover-ai-example discover-ai-example--inline" data-prompt="vinyl and late night dancing">vinyl &amp; dancing</button> &middot;
            <button type="button" class="discover-ai-example discover-ai-example--inline" data-prompt="something free this week">something free</button>
          </p>`;
        return;
      }
      const [first, ...rest] = hits;
      const hero = renderMatchHero(first.pick, first.why);
      const list = rest.length
        ? `<ol class="match-list list-rows" role="list">${rest.map(h => renderMatchSecondary(h.pick, h.why)).join('')}</ol>`
        : '';
      matchResult.innerHTML = hero + list;
      if (matchAgain)  matchAgain.hidden  = false;
      if (copyLinkBtn) copyLinkBtn.hidden = false;
      if (window.WA?.taste) {
        window.WA.taste.recordSeen(hits.map(h => h.pick?.id).filter(Boolean));
      }
    } catch (_) {
      matchResult.innerHTML = `<p class="match-error">Match-me is unreachable — try the keyword search instead.</p>`;
    }
  };

  const setMode = (newMode) => {
    state.mode = newMode;
    reflectModeDOM();
    if (newMode === 'match') {
      resultsSection.hidden = true;
      browseSects.forEach(s => { s.hidden = true; });
    } else {
      if (matchWrap)  matchWrap.hidden  = true;
      if (matchAgain) matchAgain.hidden = true;
      if (copyLinkBtn) copyLinkBtn.hidden = true;
      run();
    }
    reflectAiExamples();
    writeUrlState();
  };

  /* ── Sheet open/close (mobile only; desktop rail is always visible) ── */
  const openSheet = () => {
    /* The sheet lives in the list pane (so it can be the desktop rail).
       In mobile map view that pane is display:none, which would hide the
       fixed sheet too — switch to list view first. */
    if (state.view === 'map' && !isDesktop()) setView('list');
    renderCatChips();
    renderNhoodChips();
    buildSortOptions();          /* mode-aware options + current selection */
    updateApplyCount();
    sheet.hidden = false;
    sheetBackdrop.hidden = false;
    document.body.classList.add('discover-sheet-open');
  };
  const closeSheet = () => {
    sheet.hidden = true;
    sheetBackdrop.hidden = true;
    document.body.classList.remove('discover-sheet-open');
  };

  /* ── Init ───────────────────────────────────────────── */
  /* Two-phase: bindOnce() wires DOM handlers exactly once; renderAll()
     can re-run on every catalog refresh (static → live).               */

  /* Highlight the card matching state.id (if any). Called after every
     renderList() so the active card tracks the open pin even on first
     load — map.js fires wa:map-pin-changed before discover.js binds
     its listener, so we can't rely on the event for the initial paint. */
  const highlightActiveCard = () => {
    if (!resultsList || !state.id) return;
    resultsList.querySelectorAll('.list-row--active').forEach(el =>
      el.classList.remove('list-row--active'));
    const card = resultsList.querySelector(`.list-row[data-id="${CSS.escape(state.id)}"]`);
    if (card) card.classList.add('list-row--active');
  };

  const renderAll = () => {
    populateBrowse((window.WA && window.WA.catalog) || []);
    if (state.mode === 'match' && state.ai) {
      runMatch(state.ai);
    } else if (needsLocation()) {
      /* A deep-linked radius (or Places "nearest") needs the visitor's
         location before the first paint can filter correctly. */
      ensureLocation(() => { renderWithinChips(); run(); });
    } else {
      run();
    }
    highlightActiveCard();
    /* If we booted into map view (URL: ?view=map), refit once after the
       map module has had a tick to inject its SVG world. */
    if (state.view === 'map') {
      requestAnimationFrame(() => {
        const mv = window.WA && window.WA.MapView;
        if (mv && mv.isReady()) mv.fitView();
      });
    }
  };

  let _bound = false;
  const init = () => {
    if (_bound) { renderAll(); return; }
    _bound = true;
    input          = document.getElementById('discover-q');
    matchToggle    = document.getElementById('discover-match-toggle');
    matchWrap      = document.getElementById('discover-match-wrap');
    matchResult    = document.getElementById('discover-match-result');
    matchAgain     = document.getElementById('discover-match-again');
    copyLinkBtn    = document.getElementById('discover-match-copy-link');
    resultsSection = document.getElementById('discover-results-section');
    resultsList    = document.getElementById('discover-results');
    resultsCount   = document.getElementById('discover-results-count');
    emptyState     = document.getElementById('discover-empty');
    sheet          = document.getElementById('discover-sheet');
    sheetBackdrop  = document.getElementById('discover-sheet-backdrop');
    filtersBtn     = document.getElementById('discover-filters-btn');
    filterCount    = document.getElementById('discover-filter-count');
    catChipsEl     = document.getElementById('discover-cat-chips');
    nhoodChipsEl   = document.getElementById('discover-nhood-chips');
    sortEl         = document.getElementById('discover-sort');
    withinEl       = document.getElementById('discover-within');
    panesEl        = document.getElementById('discover-panes');
    viewToggleBtn  = document.getElementById('discover-view-toggle');
    browseSects    = Array.from(document.querySelectorAll('.discover-browse-section'));

    if (!input || !resultsSection) return;

    readUrlState();

    /* Seed input + mood from URL/mood-chips. */
    if (state.q) input.value = state.q;
    if (window.WA?.MoodChips) state.mood = [...window.WA.MoodChips.active()];

    reflectType();
    reflectPills();
    reflectView();

    /* Events | Places scope switch. Switching clears the controls that
       don't translate across scopes (category means different things;
       time/AI are events-only) but keeps neighborhood + query. */
    document.querySelectorAll('.discover-scope__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.type;
        if (t === state.type) return;
        state.type = t;
        state.cats.clear();
        state.time = 'all';
        state.mode = 'search';
        state.ai   = '';
        state.sort = DEFAULT_SORT[t];
        reflectType();
        reflectModeDOM();
        reflectPills();
        reflectAiExamples();
        writeUrlState();
        run();
      });
    });

    /* View toggle FAB (mobile only — desktop always shows both panes). */
    if (viewToggleBtn) {
      viewToggleBtn.addEventListener('click', () => {
        setView(state.view === 'map' ? 'list' : 'map');
      });
    }

    /* Pill clicks. */
    document.querySelectorAll('.discover-pill[data-pill]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pill = btn.dataset.pill;
        if (pill === 'tonight' || pill === 'thisweek') {
          state.time = (state.time === pill) ? 'all' : pill;
        } else if (pill === 'free') {
          if (state.cats.has('free')) state.cats.delete('free');
          else                        state.cats.add('free');
        } else if (pill.startsWith('kind:')) {
          const k = pill.slice(5);
          if (state.cats.has(k)) state.cats.delete(k);
          else                   state.cats.add(k);
        }
        reflectPills();
        writeUrlState();
        run();
      });
    });

    /* Applied-filters overview: tap a chip's × to drop that one filter. */
    document.getElementById('discover-applied')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-applied-type]');
      if (!chip) return;
      if (chip.dataset.appliedType === 'cat')  state.cats.delete(chip.dataset.appliedVal);
      if (chip.dataset.appliedType === 'nhood') state.nhoods.delete(chip.dataset.appliedVal);
      if (chip.dataset.appliedType === 'within') { state.within = 0; renderWithinChips(); }
      reflectPills();
      writeUrlState();
      run();
    });

    /* Filter sheet trigger. */
    if (filtersBtn) filtersBtn.addEventListener('click', openSheet);
    document.getElementById('discover-sheet-close')?.addEventListener('click', closeSheet);
    sheetBackdrop?.addEventListener('click', closeSheet);

    /* Facet dropdown-pills (desktop, F-15b): toggle the group's panel,
       one open at a time; outside click / Escape closes. */
    document.querySelectorAll('.facet-pill[data-facet-toggle]').forEach(pill => {
      pill.addEventListener('click', () => {
        const field = pill.closest('.discover-sheet__field');
        if (!field) return;
        const opening = !field.dataset.open;
        closeFacetPanels(field);
        if (opening) { field.dataset.open = 'true'; pill.setAttribute('aria-expanded', 'true'); }
        else         { delete field.dataset.open;   pill.setAttribute('aria-expanded', 'false'); }
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.discover-sheet__field')) closeFacetPanels();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeFacetPanels();
    });

    /* Sheet category / neighborhood chip clicks. */
    catChipsEl?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cat]');
      if (!chip) return;
      const id = chip.dataset.cat;
      if (state.cats.has(id)) state.cats.delete(id);
      else                    state.cats.add(id);
      renderCatChips();
      updateApplyCount();
      liveApply();           /* desktop rail applies immediately */
    });
    nhoodChipsEl?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-nhood]');
      if (!chip) return;
      const name = chip.dataset.nhood;
      if (state.nhoods.has(name)) state.nhoods.delete(name);
      else                        state.nhoods.add(name);
      renderNhoodChips();
      updateApplyCount();
      liveApply();
    });
    /* Walking-radius chips — single-select. Picking a radius lazily
       requests the visitor's location, then applies (live on desktop;
       reflected in the "Show N" count on mobile until Apply). */
    withinEl?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-within]');
      if (!chip) return;
      state.within = +chip.dataset.within || 0;
      renderWithinChips();
      const after = () => { renderWithinChips(); reflectPills(); updateApplyCount(); liveApply(); };
      if (state.within > 0) ensureLocation(after);
      else after();
    });
    /* Sort radio change — applies live on the desktop rail. */
    sortEl?.addEventListener('change', () => {
      state.sort = selectedSort();
      liveApply();
    });

    /* Sheet footer. Places + "Nearest" needs the visitor's location, so
       request it lazily before running (falls back to Featured if denied). */
    document.getElementById('discover-sheet-apply')?.addEventListener('click', () => {
      state.sort = selectedSort();
      reflectPills();
      writeUrlState();
      closeSheet();
      if (needsLocation()) ensureLocation(run);
      else run();
    });
    const clearFilters = () => {
      state.cats.clear();
      state.nhoods.clear();
      state.within = 0;
      state.sort = DEFAULT_SORT[state.type];
      renderCatChips();
      renderNhoodChips();
      renderWithinChips();
      buildSortOptions();
      reflectPills();
      writeUrlState();
      run();
      updateApplyCount();
    };
    document.getElementById('discover-sheet-clear')?.addEventListener('click', clearFilters);  /* mobile footer */
    document.getElementById('discover-rail-clear')?.addEventListener('click', clearFilters);   /* desktop rail header */

    /* Clear (×) button: visible only when the field has text. */
    const clearBtn = document.getElementById('discover-clear');
    const reflectClear = () => { if (clearBtn) clearBtn.hidden = !input.value; };
    clearBtn?.addEventListener('click', () => {
      input.value = '';
      reflectClear();
      reflectAiExamples();
      if (state.mode === 'match') {
        state.ai = '';
        if (matchWrap)   matchWrap.hidden   = true;
        if (matchAgain)  matchAgain.hidden  = true;
        if (copyLinkBtn) copyLinkBtn.hidden = true;
      } else {
        state.q = '';
      }
      writeUrlState();
      run();
      input.focus();
    });

    /* Keyword input. */
    /* Keystroke filtering is debounced 150ms (ROADMAP P2): run() does a
       full keywordFilter over the catalog + map sync, fine at ~1,000
       picks but the first thing to jank as cities multiply. 150ms is
       under the perception threshold for "instant". */
    let typeTimer = null;
    input.addEventListener('input', () => {
      reflectClear();
      reflectAiExamples();
      if (state.mode === 'match') return;
      state.q = input.value.trim();
      writeUrlState();
      suppressEntrance = true;   /* typing — don't re-animate the list per keystroke */
      clearTimeout(typeTimer);
      typeTimer = setTimeout(run, 150);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || state.mode !== 'match') return;
      e.preventDefault();
      const prompt = input.value.trim();
      if (!prompt) return;
      state.ai = prompt;
      writeUrlState();
      runMatch(prompt);
    });

    /* Match mode toggle. */
    if (matchToggle) {
      matchToggle.addEventListener('click', () => {
        setMode(state.mode === 'match' ? 'search' : 'match');
        input.focus();
      });
    }
    if (matchAgain) {
      matchAgain.addEventListener('click', () => {
        const prompt = (state.ai || input.value).trim();
        if (prompt) runMatch(prompt);
      });
    }

    /* Share-link button — shares the current URL (which already has
       ?mode=match&ai=…) via the native OS share sheet, falling back to a
       clipboard copy. Shows a brief confirm label then reverts. */
    if (copyLinkBtn) {
      const confirmLabel = (text) => {
        copyLinkBtn.classList.add('match-copy-link--copied');
        const label = copyLinkBtn.childNodes[copyLinkBtn.childNodes.length - 1]; /* text node */
        const orig = label.textContent;
        label.textContent = text;
        setTimeout(() => {
          label.textContent = orig;
          copyLinkBtn.classList.remove('match-copy-link--copied');
        }, 2000);
      };
      copyLinkBtn.addEventListener('click', async () => {
        const share = window.WA && window.WA.Share;
        if (share) {
          const r = await share.url({ title: 'WanderAlt', text: 'A WanderAlt match', url: window.location.href });
          if (r === 'shared') confirmLabel(' ✓ Shared');
          else if (r === 'copied') confirmLabel(' ✓ Copied');
        } else {
          navigator.clipboard?.writeText(window.location.href).then(() => confirmLabel(' ✓ Copied'));
        }
      });
    }

    /* Example prompt clicks — appear in the empty-state bar and in the
       match-error hint copy. Tap to pre-fill the field and run AI match. */
    document.addEventListener('click', (e) => {
      const ex = e.target.closest('.discover-ai-example[data-prompt]');
      if (ex) {
        const prompt = ex.dataset.prompt;
        input.value = prompt;
        if (state.mode !== 'match') setMode('match'); /* setMode calls reflectModeDOM + reflectAiExamples */
        state.ai = prompt;
        writeUrlState();
        runMatch(prompt);
        reflectClear();
        reflectAiExamples();
        return;
      }
    });

    /* Browse-row clicks: curators set ?q=, neighborhoods toggle the nhood filter,
       kinds set ?q= so multi-word kinds resolve via keyword search.            */
    document.addEventListener('click', (e) => {
      const cur = e.target.closest('.curator-row[data-search]');
      if (cur) {
        input.value = cur.dataset.search;
        state.q = cur.dataset.search;
        writeUrlState();
        run();
        input.focus();
        return;
      }
      const nh = e.target.closest('.browse-row[data-nhood]');
      if (nh) {
        state.nhoods = new Set([nh.dataset.nhood]);
        reflectPills();
        writeUrlState();
        run();
        return;
      }
      const k = e.target.closest('.browse-row[data-search]');
      if (k) {
        input.value = k.dataset.search;
        state.q = k.dataset.search;
        writeUrlState();
        run();
        input.focus();
      }
    });

    /* Mood-chips integration. */
    document.addEventListener('wa:mood-changed', (e) => {
      state.mood = e.detail.tags;
      if (state.mode === 'search') run();
    });

    /* "on map →" link on a card → focus the pin instead of navigating.
       Desktop split view shows both panes, so just focusPin.
       Mobile (single pane): switch to map view first, then focusPin
       once the map pane has laid out.                                   */
    if (resultsList) {
      resultsList.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-focus-pin]');
        if (!trigger) return;
        e.preventDefault();
        const id = trigger.dataset.focusPin;
        const mv = window.WA && window.WA.MapView;
        if (!mv || !mv.isReady()) return;
        const isMobile = window.matchMedia('(max-width: 1023px)').matches;
        if (isMobile) {
          setView('map');
          requestAnimationFrame(() => mv.focusPin(id));
        } else {
          mv.focusPin(id);
        }
      });
    }

    /* Pin click in the embedded map → highlight + scroll card + update URL. */
    document.addEventListener('wa:map-pin-changed', (e) => {
      const id = e.detail?.id || '';
      /* Keep URL in sync so the open pin is deep-linkable / shareable. */
      state.id = id;
      writeUrlState();
      if (!resultsList) return;
      resultsList.querySelectorAll('.list-row--active').forEach(el =>
        el.classList.remove('list-row--active'));
      if (!id) return;
      const card = resultsList.querySelector(`.list-row[data-id="${CSS.escape(id)}"]`);
      if (card) {
        card.classList.add('list-row--active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    /* Seed mode from URL (input value already set above). */
    if (state.mode === 'match' && state.ai) {
      input.value = state.ai;
      setMode('match');   /* calls reflectModeDOM + reflectAiExamples */
    } else {
      reflectModeDOM();   /* ensure DOM matches URL-seeded search mode */
    }
    reflectClear();       /* reflect any URL-seeded ?q= / ?ai= value */
    reflectAiExamples();  /* hide examples unless AI mode + empty field */

    /* Browser back/forward: re-read the URL and re-render so filter state,
       view, and active pin all match whatever the history entry says.      */
    window.addEventListener('popstate', () => {
      readUrlState();
      input.value = state.q || (state.mode === 'match' ? state.ai : '');
      reflectClear();
      reflectModeDOM();
      reflectAiExamples();
      if (window.WA?.MoodChips) state.mood = [...window.WA.MoodChips.active()];
      reflectPills();
      renderWithinChips();
      reflectView();
      renderAll();
      if (state.id) {
        const mv = window.WA?.MapView;
        if (mv && mv.isReady()) mv.focusPin(state.id);
      }
    });

    /* Now render whatever catalog is currently in memory. */
    renderAll();
  };

  if (window.WA?.catalog?.length) init();
  document.addEventListener('wa:catalog-ready', init);
})();
