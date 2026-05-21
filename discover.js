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
    q:      '',          /* keyword query */
    time:   'all',       /* all | tonight | thisweek | places */
    cats:   new Set(),   /* category ids from WA.MAP_CATEGORIES (kinds + 'free') */
    nhoods: new Set(),   /* neighborhood names */
    mood:   [],          /* mood tag ids from mood-chips */
    sort:   'relevance', /* relevance | newest | title | curator */
    mode:   'search',    /* 'search' | 'match' */
    ai:     '',          /* the last AI prompt, persisted in URL */
    view:   'list',      /* 'list' | 'map' — mobile only; desktop is split */
    id:     '',          /* active pin id — persisted in URL for deep linking */
  };

  /* ── DOM refs ───────────────────────────────────────────── */
  let input, matchToggle, matchWrap, matchResult, matchAgain,
      resultsSection, resultsList, resultsCount, emptyState,
      sheet, sheetBackdrop, filtersBtn, filterCount,
      catChipsEl, nhoodChipsEl, sortEl,
      browseSects, panesEl, viewToggleBtn;

  /* ── Utility helpers (lifted/adapted from search.js) ───── */
  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
        return arr;
    }
  };

  const buildMeta = (e) => {
    const parts = [e.neighborhood, e.kind];
    if (e.day && e.day !== 'Tonight') parts.push(e.time ? `${e.day} ${e.time}` : e.day);
    else if (e.time)                  parts.push(e.time);
    return parts.filter(Boolean).join(' · ');
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
    const rowCls = e.isClosed ? 'list-row list-row--closed' : 'list-row';
    return `<li class="${rowCls}" data-id="${esc(e.id)}">
       <p class="list-row__title">
         <a href="venue.html?id=${e.id}">${esc(e.title)}</a>${closedBadge}${freeBadge}${mapLinkA}
       </p>
       <p class="list-row__meta">${esc(buildMeta(e))}</p>
       <p class="list-row__quote">&mdash; ${esc(e.quote || '')} <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${esc(e.handle)}</a></p>
     </li>`;
  };

  const renderList = (entries) => {
    if (!resultsList || !emptyState) return;
    if (!entries.length) {
      resultsList.innerHTML = '';
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    resultsList.innerHTML = entries.map(renderRow).join('');
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
        return `<li class="curator-row" role="button" tabindex="0" data-search="${esc(handle)}">
          <span class="curator-row__handle">${esc(handle)}</span>
          ${bio ? `<span class="curator-row__quote">&mdash; ${esc(bio)}</span>` : ''}
          <span class="curator-row__count">${n}</span>
        </li>`;
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
        `<li class="browse-row" role="button" tabindex="0" data-nhood="${esc(name)}">
          <span class="browse-row__label">${esc(name)}</span>
          <span class="browse-row__count">${n} picks</span>
        </li>`
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
        return `<li class="browse-row" role="button" tabindex="0" data-search="${esc(kind)}">
          <span class="browse-row__label">${esc(label)}</span>
          <span class="browse-row__count">${n}</span>
        </li>`;
      }).join('');
    }
  };

  /* ── Filter sheet rendering ─────────────────────────── */
  const renderCatChips = () => {
    if (!catChipsEl) return;
    const cats = (window.WA && window.WA.MAP_CATEGORIES) || [];
    catChipsEl.innerHTML = cats.map(c => {
      const on = state.cats.has(c.id);
      return `<button type="button" class="sheet-chip${on ? ' sheet-chip--on' : ''}" data-cat="${c.id}" aria-pressed="${on}">${esc(c.label)}</button>`;
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
    if (state.q)                     sp.set('q', state.q);
    if (state.time && state.time !== 'all') sp.set('time', state.time);
    if (state.cats.size)             sp.set('cat', [...state.cats].join(','));
    if (state.nhoods.size)           sp.set('nhood', [...state.nhoods].join(','));
    if (state.sort && state.sort !== 'relevance') sp.set('sort', state.sort);
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
    state.q      = sp.get('q')     || '';
    state.time   = sp.get('time')  || 'all';
    state.cats   = new Set((sp.get('cat')   || '').split(',').filter(Boolean));
    state.nhoods = new Set((sp.get('nhood') || '').split(',').filter(Boolean));
    state.sort   = sp.get('sort')  || 'relevance';
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
      if (pill === 'free') on = state.cats.has('free');
      btn.classList.toggle('discover-pill--on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (filterCount && filtersBtn) {
      const n = state.cats.size + state.nhoods.size + (state.sort !== 'relevance' ? 1 : 0);
      if (n > 0) { filterCount.hidden = false; filterCount.textContent = String(n); }
      else       { filterCount.hidden = true; }
    }
  };

  /* ── Map sync ───────────────────────────────────────── */
  /* Pushes Discover's filter state into the embedded map view. All five
     filter dimensions (q, time, cats, mood, nhoods) round-trip so the
     list and map panes show the same set of picks. Mood/nhoods are
     wired into map.js's getVisibleEntries via Phase 1b.5.                */
  const syncMap = () => {
    const mv = window.WA && window.WA.MapView;
    if (!mv || !mv.isReady()) return;
    mv.setFilters({
      q:      state.q,
      time:   state.time,
      cats:   [...state.cats],
      mood:   state.mood,
      nhoods: [...state.nhoods],
    });
    mv.render();
  };

  /* ── Main run loop ──────────────────────────────────── */
  const isAnyFilterActive = () =>
    state.q || state.time !== 'all' || state.cats.size || state.nhoods.size || state.mood.length;

  const run = () => {
    /* Keep the map in sync with every filter change, regardless of mode. */
    syncMap();

    if (state.mode === 'match') return; /* AI mode handles its own list rendering */

    const catalog = (window.WA && window.WA.catalog) || [];
    const filterActive = isAnyFilterActive();

    if (!filterActive) {
      /* No filters → show browse sections, hide results. */
      resultsSection.hidden = true;
      browseSects.forEach(s => { s.hidden = false; });
      return;
    }

    browseSects.forEach(s => { s.hidden = true; });
    resultsSection.hidden = false;

    /* Pipeline: structured filters → keyword filter → sort. */
    const structured = applyStructuredFilters(catalog);
    const textHit    = state.q ? keywordFilter(structured, state.q) : structured;
    const sorted     = sortEntries(textHit);

    if (resultsCount) {
      const n = sorted.length;
      resultsCount.textContent = n === 1 ? '1 result' : `${n} results`;
    }
    if (emptyState) {
      emptyState.textContent = state.q
        ? `Nothing found for "${state.q}"`
        : 'No picks match the active filters.';
    }
    renderList(sorted);
  };

  /* ── View toggle (mobile) ───────────────────────────── */
  const reflectView = () => {
    if (panesEl) panesEl.dataset.view = state.view;
    if (viewToggleBtn) {
      const isMap = state.view === 'map';
      const label = viewToggleBtn.querySelector('.discover-view-fab__label');
      if (label) label.textContent = isMap ? 'List' : 'Map';
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
  const renderMatchHero = (pick, why) => {
    const imgUrl   = pick.imageUrl || pick.image_url || null;
    const initials = pick.thumbInitials || pick.thumb_initials
      || (pick.venue || pick.title || '??').slice(0, 2).toUpperCase();
    const thumbCls = `thumb thumb--lg${imgUrl ? ' thumb--has-img' : ''}`;
    const thumbSty = imgUrl ? ` style="background-image:url('${imgUrl.replace(/'/g, '%27')}')"` : '';
    const whyText  = why || pick.why || pick.quote || '';
    return `<div class="match-card">
       <p class="match-card__why">&ldquo;${esc(whyText)}&rdquo;</p>
       <p class="match-card__attr">
         <span class="match-card__attr-line" aria-hidden="true"></span>
         <a class="handle" href="curator.html?handle=${encodeURIComponent(pick.handle)}">${esc(pick.handle)}</a>
       </p>
       <a class="tonight__venue" href="venue.html?id=${encodeURIComponent(pick.id)}">
         <span class="${thumbCls}" role="img" aria-label="${esc(pick.venue || pick.title)}"${thumbSty}>
           <span class="thumb__fallback" aria-hidden="${!!imgUrl}">${esc(initials)}</span>
         </span>
         <span class="tonight__venue-body">
           <span class="tonight__venue-name">${esc(pick.title)}</span>
           <span class="meta">${esc(pick.neighborhood || '')} &middot; ${esc(pick.kind || '')}${pick.time ? ' &middot; ' + esc(pick.time) : ''}</span>
         </span>
       </a>
     </div>`;
  };

  const renderMatchSecondary = (pick, why) => {
    const meta = [pick.neighborhood, pick.kind, pick.time].filter(Boolean).join(' · ');
    return `<li class="list-row">
       <p class="list-row__title">
         <a href="venue.html?id=${encodeURIComponent(pick.id)}">${esc(pick.title)}</a>
       </p>
       <p class="list-row__meta">${esc(meta)}</p>
       <p class="list-row__quote">&mdash; ${esc(why || pick.quote || '')} <a class="handle" href="curator.html?handle=${encodeURIComponent(pick.handle)}">${esc(pick.handle)}</a></p>
     </li>`;
  };

  const runMatch = async (prompt) => {
    if (!matchWrap || !matchResult) return;
    matchWrap.hidden = false;
    if (matchAgain) matchAgain.hidden = true;
    matchResult.innerHTML = '<p class="match-loading">Matching&hellip;</p>';

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
        matchResult.innerHTML = `<p class="match-error">No curated picks match &ldquo;${esc(prompt)}&rdquo;.</p>`;
        return;
      }
      const [first, ...rest] = hits;
      const hero = renderMatchHero(first.pick, first.why);
      const list = rest.length
        ? `<ol class="match-list list-rows" role="list">${rest.map(h => renderMatchSecondary(h.pick, h.why)).join('')}</ol>`
        : '';
      matchResult.innerHTML = hero + list;
      if (matchAgain) matchAgain.hidden = false;
      if (window.WA?.taste) {
        window.WA.taste.recordSeen(hits.map(h => h.pick?.id).filter(Boolean));
      }
    } catch (_) {
      matchResult.innerHTML = `<p class="match-error">Match-me is unreachable — try the keyword search instead.</p>`;
    }
  };

  const setMode = (newMode) => {
    state.mode = newMode;
    const wrap = document.querySelector('.discover-search');
    if (wrap) wrap.dataset.mode = newMode;
    if (newMode === 'match') {
      input.placeholder = 'Tell me what you want…';
      input.setAttribute('enterkeyhint', 'go');
      if (matchToggle) matchToggle.textContent = '← back to keyword';
      resultsSection.hidden = true;
      browseSects.forEach(s => { s.hidden = true; });
    } else {
      input.placeholder = 'Search anything…';
      input.setAttribute('enterkeyhint', 'search');
      if (matchToggle) matchToggle.textContent = 'ask in plain English →';
      if (matchWrap) matchWrap.hidden = true;
      if (matchAgain) matchAgain.hidden = true;
      run();
    }
    writeUrlState();
  };

  /* ── Sheet open/close ───────────────────────────────── */
  const openSheet = () => {
    renderCatChips();
    renderNhoodChips();
    if (sortEl) sortEl.value = state.sort;
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
    panesEl        = document.getElementById('discover-panes');
    viewToggleBtn  = document.getElementById('discover-view-toggle');
    browseSects    = Array.from(document.querySelectorAll('.discover-browse-section'));

    if (!input || !resultsSection) return;

    readUrlState();

    /* Seed input + mood from URL/mood-chips. */
    if (state.q) input.value = state.q;
    if (window.WA?.MoodChips) state.mood = [...window.WA.MoodChips.active()];

    reflectPills();
    reflectView();

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
        }
        reflectPills();
        writeUrlState();
        run();
      });
    });

    /* Filter sheet trigger. */
    if (filtersBtn) filtersBtn.addEventListener('click', openSheet);
    document.getElementById('discover-sheet-close')?.addEventListener('click', closeSheet);
    sheetBackdrop?.addEventListener('click', closeSheet);

    /* Sheet category / neighborhood chip clicks. */
    catChipsEl?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cat]');
      if (!chip) return;
      const id = chip.dataset.cat;
      if (state.cats.has(id)) state.cats.delete(id);
      else                    state.cats.add(id);
      renderCatChips();
    });
    nhoodChipsEl?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-nhood]');
      if (!chip) return;
      const name = chip.dataset.nhood;
      if (state.nhoods.has(name)) state.nhoods.delete(name);
      else                        state.nhoods.add(name);
      renderNhoodChips();
    });

    /* Sheet footer. */
    document.getElementById('discover-sheet-apply')?.addEventListener('click', () => {
      if (sortEl) state.sort = sortEl.value;
      reflectPills();
      writeUrlState();
      run();
      closeSheet();
    });
    document.getElementById('discover-sheet-clear')?.addEventListener('click', () => {
      state.cats.clear();
      state.nhoods.clear();
      state.sort = 'relevance';
      renderCatChips();
      renderNhoodChips();
      if (sortEl) sortEl.value = 'relevance';
      reflectPills();
      writeUrlState();
      run();
    });

    /* Keyword input. */
    input.addEventListener('input', () => {
      if (state.mode === 'match') return;
      state.q = input.value.trim();
      writeUrlState();
      run();
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
      setMode('match');
    }

    /* Browser back/forward: re-read the URL and re-render so filter state,
       view, and active pin all match whatever the history entry says.      */
    window.addEventListener('popstate', () => {
      readUrlState();
      input.value = state.q || (state.mode === 'match' ? state.ai : '');
      if (window.WA?.MoodChips) state.mood = [...window.WA.MoodChips.active()];
      reflectPills();
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
