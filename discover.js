/* ============================================================
   WanderAlt — Discover page
   ------------------------------------------------------------
   The full run of picks for a city, narrowable. Replaced the old
   standalone map.html and search.html pages (both now redirect
   stubs).

   Shape (Jul 2026 redesign):
     · The list is the page. It renders the whole catalogue on
       load — there is no "filter first to see anything" gate,
       which used to leave both the list and the map empty until
       you touched a control.
     · One filter language at every width: each facet is a button
       that opens its own anchored menu (click again / click away
       / Escape to dismiss). No quick-pill row duplicating the
       facets, no full-screen modal to back out of.
     · The map answers "where", so it is a companion, not the
       stage: a sticky column beside the list from 1024px up, an
       overlay you summon below that.

   The embedded map is driven via window.WA.MapView (map.js).
   ============================================================ */
(() => {
  /* ── State ──────────────────────────────────────────────── */
  const state = {
    type:   'events',    /* 'events' (picks) | 'places' (venues) — scope switch */
    q:      '',          /* keyword query */
    time:   'all',       /* all | tonight | thisweek */
    cats:   new Set(),   /* Events: WA.MAP_CATEGORIES ids (+ 'free'). Places: venue kinds. */
    nhoods: new Set(),   /* neighborhood names */
    mood:   [],          /* mood tag ids from mood-chips */
    sort:   'relevance', /* events: relevance|newest · places: featured|nearest */
    within: 0,           /* walking-radius filter in minutes (0 = off | WALK_MIN) */
    /* The concierge is an action on the query, not a mode the field is in:
       `ai` holds the prompt currently answered, '' when no answer is up. */
    ai:     '',          /* the answered Concierge prompt, persisted in URL */
    view:   'list',      /* 'list' | 'map' — below 1024 the map is an overlay */
    id:     '',          /* active pin id — persisted in URL for deep linking */
  };

  /* Sort options per scope. */
  const SORT_OPTS = {
    events: [['relevance', 'Relevance'], ['newest', 'Soonest']],
    places: [['featured', 'Featured'],  ['nearest', 'Nearest']],
  };
  const DEFAULT_SORT = { events: 'relevance', places: 'featured' };

  /* One walking radius, not four. "Near me" is a yes/no question at this
     catalogue size; 5/15/30 was three ways to ask it. ~80 m/min is a
     relaxed 4.8 km/h stroll, so 15 min ≈ 1200 m. */
  const WALK_MIN = 15;
  const WALK_M_PER_MIN = 80;

  /* ── DOM refs ───────────────────────────────────────────── */
  let input, suggestEl, matchWrap, matchResult, matchPromptEl, matchBackBtn,
      matchAgain, copyLinkBtn,
      resultsSection, resultsList, resultsCount, emptyState,
      catChipsEl, areaChipsEl, sortEl, whenEl, clearBtn,
      curatorsSect, mapEl, mapOpenBtn;

  /* When true, the next renderList() skips the staggered entrance — set
     while the user is typing so the list doesn't re-animate per keystroke. */
  let suppressEntrance = false;

  /* ── Shared render helpers (one implementation, ui-helpers.js) ── */
  const { esc, buildMeta, isEchoQuote, rowMedia, thumb, socialButtons, bookmarkSVG, kindIconSvg } = window.WA.UI;

  /* Multi-word AND + field-weight relevance. */
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

  /* Shared impl in map-venues.js (loads first) so the map pins and these
     category chips can never drift apart again. */
  const normaliseKind = window.WA?.normaliseKind || ((k) => k);

  /* Apply time / category / free / neighborhood / mood filters. */
  const applyStructuredFilters = (entries) => {
    const kindCats = new Set([...state.cats].filter(id => id !== 'free'));
    const wantFree = state.cats.has('free');
    return entries.filter(e => {
      if (state.time === 'tonight'  && !e.tonight) return false;
      if (state.time === 'thisweek' && !e.thisWeek && !e.tonight) return false;
      if (kindCats.size > 0 && !kindCats.has(normaliseKind(e.kind))) return false;
      if (wantFree && !(e.moodTags || []).includes('free')) return false;
      if (state.nhoods.size > 0 && !state.nhoods.has(e.neighborhood)) return false;
      if (state.mood.length > 0 && !state.mood.every(t => (e.moodTags || []).includes(t))) return false;
      return true;
    });
  };

  /* Gentle on-device taste nudge: when the reader has set a taste profile,
     reorder the default Relevance results by tasteScore as a SECONDARY
     signal — a stable sort, so ties keep the curated order and curation
     stays primary. Not applied over an active query (an explicit search is
     a stronger intent) nor in Places mode (venues carry no mood_tags). */
  const tastePrefsSet = () =>
    Object.keys(window.WA?.taste?.getPrefs?.() || {}).length > 0;
  const tasteApplies = () =>
    state.sort === 'relevance' && !state.q && tastePrefsSet();
  const tasteOrder = (arr) =>
    (tasteApplies() && window.WA?.taste) ? window.WA.taste.orderByTaste(arr) : arr;

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
      default:
        return tasteOrder(arr);
    }
  };

  /* ── Rows ───────────────────────────────────────────────── */
  const renderRow = (e) => {
    const hasCoords = !!(e.lat && e.lng);
    /* "on map" is a JS-handled action here (no navigation); the href is a
       fallback for users with JS disabled. The arrow is aria-hidden so the
       accessible name keeps the visible text (WCAG 2.5.3 Label in Name). */
    const mapLinkA = hasCoords
      ? `<a class="list-row__map" href="discover.html?id=${encodeURIComponent(e.id)}&view=map" data-focus-pin="${esc(e.id)}" aria-label="Show on map">on map <span aria-hidden="true">&rarr;</span></a>`
      : '';
    const closedBadge = e.isClosed ? ` <span class="list-row__closed">closed</span>` : '';
    const isFree = (e.moodTags || []).includes('free');
    const freeBadge = isFree ? ` <span class="list-row__free">free</span>` : '';
    const rowCls = (e.isClosed ? 'list-row list-row--closed list-row--card' : 'list-row list-row--card')
      + ' list-row--bookmarkable';

    const media = rowMedia(e);
    const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[e.id]);

    /* The quote and the meta each ellipsize, but the byline and the map
       link must not: they used to ride at the END of those lines and were
       the first things truncation ate, so every row lost the curator's
       name — the one thing this product is. Both now sit outside the
       shrinking text as their own flex items. */
    const handleA = `<a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${esc(e.handle)}</a>`;
    return `<li class="${rowCls}" data-id="${esc(e.id)}">
       ${media}
       <div class="list-row__body">
         <p class="list-row__title">
           <a href="venue.html?id=${e.id}">${esc(e.title)}</a>${closedBadge}${freeBadge}
         </p>
         <p class="list-row__meta"><span class="list-row__meta-text">${esc(buildMeta(e))}</span>${mapLinkA}</p>
         ${isEchoQuote(e)
           ? `<p class="list-row__quote"><span class="list-row__quote-text">via</span> ${handleA}</p>`
           : `<p class="list-row__quote"><span class="list-row__quote-text">&mdash; ${esc(e.quote)}</span> ${handleA}</p>`}
       </div>
       <label class="bookmark" title="Save this pick">
         <input type="checkbox" class="bookmark__check" data-id="${esc(e.id)}"
                aria-label="Bookmark: ${esc(e.title)}" ${isMarked ? 'checked' : ''}>
         ${bookmarkSVG()}
       </label>
     </li>`;
  };

  /* Consecutive rows sharing one photo read as a rendering bug — repeats
     drop to the glyph tile (the first occurrence keeps the photo). */
  const dupPhotoIds = (list) => {
    let prev = null;
    const dup = new Set();
    for (const e of list) {
      const img = e.imageUrl || e.image_url || null;
      if (img && img === prev) dup.add(e.id);
      if (img) prev = img;
    }
    return dup;
  };

  /* The staggered entrance is opt-in per render (.list-rows[data-animate]).
     It has to stay OFF for any render that happens while the page is still
     loading: rows inserted before the browser has resolved a rendered
     style for the list keep their @starting-style opacity:0 forever, and
     the whole list stays invisible. Discover renders at least twice during
     load (the static catalogue seed, then wa:catalog-ready), so "skip the
     first one" is not enough — the gate opens once the page has painted.
     Renders after that (filter, sort, scope switch) animate normally. */
  let entranceReady = false;
  const openEntranceGate = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => { entranceReady = true; }));
  if (document.readyState === 'complete') openEntranceGate();
  else window.addEventListener('load', openEntranceGate, { once: true });

  const paintList = (html) => {
    resultsList.toggleAttribute('data-animate', !suppressEntrance && entranceReady);
    suppressEntrance = false;
    resultsList.innerHTML = html;
  };

  const renderList = (entries) => {
    if (!resultsList || !emptyState) return;
    if (!entries.length) { paintList(''); emptyState.hidden = false; return; }
    emptyState.hidden = true;
    const dup = dupPhotoIds(entries);
    paintList(entries
      .map(e => renderRow(dup.has(e.id) ? { ...e, imageUrl: null, image_url: null } : e))
      .join(''));
  };

  /* ── Places (venues) ────────────────────────────────────── */
  const VENUE_KIND_LABELS = {
    'record store': 'Record store', 'bookshop': 'Bookshop', 'gallery': 'Gallery',
    'club': 'Club', 'thrift': 'Flea & thrift', 'arts centre': 'Arts centre',
    'cinema': 'Cinema', 'community': 'Community space',
  };
  const venueKindLabel = (k) => VENUE_KIND_LABELS[k] || (k ? k[0].toUpperCase() + k.slice(1) : '');

  /* A place is a permanent venue, not a dated pick — no curator quote (no
     single curator is attached the way one is to a pick). Same photo/glyph
     treatment and same bookmark store as picks. */
  const renderVenueRow = (v, isDup) => {
    const meta = [v.neighborhood, venueKindLabel(v.kind)].filter(Boolean).join(' · ');
    const social = socialButtons({ name: v.name, website: v.website, facebook: v.facebook, instagram: v.instagram });
    const onMap = (v.lat != null && v.lng != null)
      ? `<a class="list-row__map" href="place.html?id=${encodeURIComponent(v.id)}&view=map" data-focus-pin="${esc(v.id)}" aria-label="Show ${esc(v.name)} on map">on map <span aria-hidden="true">&rarr;</span></a>`
      : '';
    const media = `<a class="list-row__media" href="place.html?id=${encodeURIComponent(v.id)}" tabindex="-1" aria-hidden="true">${thumb(isDup ? { ...v, imageUrl: null, image_url: null } : v, true)}</a>`;
    const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[v.id]);
    return `<li class="list-row list-row--venue list-row--card list-row--bookmarkable" data-id="${esc(v.id)}">
       ${media}
       <div class="list-row__body">
         <p class="list-row__title"><a href="place.html?id=${encodeURIComponent(v.id)}">${esc(v.name)}</a></p>
         <p class="list-row__meta"><span class="list-row__meta-text">${esc(meta)}</span>${onMap}</p>
         ${social}
       </div>
       <label class="bookmark" title="Save this place">
         <input type="checkbox" class="bookmark__check" data-id="${esc(v.id)}"
                aria-label="Save: ${esc(v.name)}" ${isMarked ? 'checked' : ''}>
         ${bookmarkSVG()}
       </label>
     </li>`;
  };

  const renderVenueList = (venues) => {
    if (!resultsList || !emptyState) return;
    if (!venues.length) { paintList(''); emptyState.hidden = false; return; }
    emptyState.hidden = true;
    const dup = dupPhotoIds(venues);
    paintList(venues.map(v => renderVenueRow(v, dup.has(v.id))).join(''));
  };

  /* ── Location (Near me + the Places "Nearest" sort) ─────── */
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
  const needsLocation = () =>
    state.within > 0 || (state.type === 'places' && state.sort === 'nearest');

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

  const filteredPlaces = () => {
    let list = ((window.WA && window.WA.venues) || []).slice();
    if (state.cats.size)   list = list.filter(v => state.cats.has(v.kind));
    if (state.nhoods.size) list = list.filter(v => state.nhoods.has(v.neighborhood));
    if (state.q) {
      const t = state.q.toLowerCase();
      list = list.filter(v => `${v.name} ${v.neighborhood} ${venueKindLabel(v.kind)}`.toLowerCase().includes(t));
    }
    return withinFilter(list);
  };

  const runPlaces = () => {
    const list = sortVenues(filteredPlaces());

    if (resultsCount) resultsCount.textContent = list.length === 1 ? '1 place' : `${list.length} places`;
    if (emptyState) emptyState.innerHTML = emptyCopy();
    renderVenueList(list);

    /* Drive the map's Places layer with the same filtered set. setPlaces
       stashes the state the map reads on its own boot, so call it even
       before the map is ready; only render/fit once it is. */
    const mv = window.WA && window.WA.MapView;
    if (mv && mv.setPlaces) {
      mv.setPlaces(list);
      if (mv.isReady()) { mv.render(); mv.fitView(); }
    }
  };

  /* ── Curators (browse aid, below the picks) ─────────────── */
  const topN = (entries, accessor, max) => {
    const counts = {};
    entries.forEach(e => { const k = accessor(e); if (k) counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, max);
  };

  const populateCurators = (catalog) => {
    if (!curatorsSect) return;
    const curatorData = (window.WA && window.WA.curators) || [];
    const TAGLINES = Object.fromEntries(curatorData.map(c => [c.handle, c.tagline]).filter(([, t]) => t));
    const curators = topN(catalog.filter(e => e.handle !== '@discovery'), e => e.handle, 8);

    curatorsSect.hidden = curators.length === 0;
    const metaEl = curatorsSect.querySelector('.disc-browse__meta');
    const listEl = curatorsSect.querySelector('.disc-browse__rows');
    if (metaEl) metaEl.textContent = `${curators.length} writer${curators.length !== 1 ? 's' : ''}`;
    if (!listEl) return;
    listEl.innerHTML = curators.map(([handle, n]) => {
      const tagline = TAGLINES[handle];
      return `<li><a class="disc-curator" href="curator.html?handle=${encodeURIComponent(handle)}">
        <span class="disc-curator__handle">${esc(handle)}</span>
        ${tagline ? `<span class="disc-curator__tagline">${esc(tagline)}</span>` : '<span class="disc-curator__tagline"></span>'}
        <span class="disc-curator__count">${n} pick${n !== 1 ? 's' : ''}</span>
      </a></li>`;
    }).join('');
  };

  /* ── Facet menus ────────────────────────────────────────
     One pattern at every width: the button opens its own menu, and the
     menu closes on a second click, an outside click, or Escape. Selections
     apply immediately — there is no Apply step to forget. */
  const closeMenus = (except) => {
    document.querySelectorAll('.disc-facet[data-open]').forEach(f => {
      if (f === except) return;
      delete f.dataset.open;
      const btn  = f.querySelector('.disc-facet__btn');
      const menu = f.querySelector('.disc-facet__menu');
      if (btn)  btn.setAttribute('aria-expanded', 'false');
      if (menu) menu.hidden = true;
    });
  };
  const toggleMenu = (facet) => {
    const opening = !facet.dataset.open;
    closeMenus(facet);
    const btn  = facet.querySelector('.disc-facet__btn');
    const menu = facet.querySelector('.disc-facet__menu');
    if (opening) {
      facet.dataset.open = 'true';
      if (btn)  btn.setAttribute('aria-expanded', 'true');
      if (menu) menu.hidden = false;
    } else {
      delete facet.dataset.open;
      if (btn)  btn.setAttribute('aria-expanded', 'false');
      if (menu) menu.hidden = true;
    }
  };

  /* Label each facet button with its own current selection, so the whole
     filter state is readable without opening anything. This is what the
     separate "applied filters" chip row used to do. */
  const catLabel = (id) => {
    if (state.type === 'places') return venueKindLabel(id);
    const cats = (window.WA && window.WA.MAP_CATEGORIES) || [];
    return (cats.find(c => c.id === id) || {}).label || id;
  };
  const WHEN_LABELS = { tonight: 'Tonight', thisweek: 'This week' };

  const reflectFacets = () => {
    const set = (facet, text, on) => {
      const el = document.querySelector(`.disc-facet[data-facet="${facet}"]`);
      if (!el) return;
      const label = el.querySelector('.disc-facet__label');
      if (label) label.textContent = text;
      el.classList.toggle('disc-facet--on', !!on);
    };

    set('when', WHEN_LABELS[state.time] || 'When', state.time !== 'all');

    const nCat = state.cats.size;
    set('cat', nCat === 1 ? catLabel([...state.cats][0]) : nCat ? `Category · ${nCat}` : 'Category', nCat);

    const areaBits = [...state.nhoods];
    if (state.within) areaBits.unshift('Near me');
    set('area', areaBits.length === 1 ? areaBits[0]
              : areaBits.length ? `Area · ${areaBits.length}` : 'Area', areaBits.length);

    const nMood = state.mood.length;
    set('mood', nMood === 1 ? state.mood[0] : nMood ? `Mood · ${nMood}` : 'Mood', nMood);

    const opts = SORT_OPTS[state.type] || SORT_OPTS.events;
    const cur  = opts.find(([v]) => v === state.sort);
    set('sort', cur ? cur[1] : 'Sort', state.sort !== DEFAULT_SORT[state.type]);

    /* Governs the facets only. The query has its own × in the field, and a
       "Clear filters" button that appeared because you typed but then left
       the text sitting there is a button that lies. */
    if (clearBtn) clearBtn.hidden = !hasActiveFilters();
  };

  /* ── Chip rendering ─────────────────────────────────────── */
  const chip = (attr, val, label, on, icon) =>
    `<button type="button" class="sheet-chip${on ? ' sheet-chip--on' : ''}" ${attr}="${esc(val)}" aria-pressed="${on}">${icon || ''}${esc(label)}</button>`;

  const WHEN_OPTS = [['all', 'Any time'], ['tonight', 'Tonight'], ['thisweek', 'This week']];
  const renderWhenChips = () => {
    if (!whenEl) return;
    whenEl.innerHTML = WHEN_OPTS
      .map(([v, label]) => chip('data-when', v, label, state.time === v || (v === 'all' && !state.time)))
      .join('');
  };

  /* Category chips are scope-aware: Events uses WA.MAP_CATEGORIES, Places
     the alt-culture venue kinds. Per-city: only offer categories that have
     matches in this city's data, so Tallinn's chips can't dead-end a
     Helsinki reader. A SELECTED category always keeps its chip so an
     active filter stays clearable. */
  const renderCatChips = () => {
    if (!catChipsEl) return;
    const catalog = (window.WA && window.WA.catalog) || [];
    const venues  = (window.WA && window.WA.venues)  || [];
    const hasCat = (id) => id === 'free'
      ? catalog.some(e => (e.moodTags || []).includes('free'))
      : catalog.some(e => normaliseKind(e.kind) === id);
    const hasKind = (k) => venues.some(v => v.kind === k);
    let pairs = state.type === 'places'
      ? ((window.WA && window.WA.VENUE_KINDS) || []).map(k => [k, venueKindLabel(k)])
      : ((window.WA && window.WA.MAP_CATEGORIES) || []).map(c => [c.id, c.label]);
    const present   = state.type === 'places' ? hasKind : hasCat;
    const dataReady = state.type === 'places' ? venues.length > 0 : catalog.length > 0;
    if (dataReady) pairs = pairs.filter(([id]) => present(id) || state.cats.has(id));
    /* A venue kind is a recognisable shape at a glance, so Places chips
       carry an icon; Events categories stay text-only. */
    catChipsEl.innerHTML = pairs.map(([id, label]) =>
      chip('data-cat', id, label, state.cats.has(id),
           state.type === 'places' ? kindIconSvg(id) : '')).join('');
  };

  /* Area and walking distance both answer "where", so they share one menu:
     "Near me" ANDs with whatever neighborhoods are selected. */
  const renderAreaChips = () => {
    if (!areaChipsEl) return;
    const source = state.type === 'places'
      ? ((window.WA && window.WA.venues) || []).map(v => ({ neighborhood: v.neighborhood }))
      : ((window.WA && window.WA.catalog) || []);
    const nhoods = topN(source, e => e.neighborhood, 12);
    const near = chip('data-within', String(WALK_MIN), `Near me · ${WALK_MIN} min walk`, state.within > 0);
    areaChipsEl.innerHTML = near +
      nhoods.map(([name]) => chip('data-nhood', name, name, state.nhoods.has(name))).join('');
    const note = document.getElementById('discover-within-note');
    if (note) note.hidden = !(state.within > 0 && _locDenied);
  };

  const buildSortOptions = () => {
    if (!sortEl) return;
    const opts = SORT_OPTS[state.type] || SORT_OPTS.events;
    if (!opts.some(([v]) => v === state.sort)) state.sort = DEFAULT_SORT[state.type];
    sortEl.innerHTML = opts.map(([v, label]) =>
      `<label class="disc-sort__opt">
         <input type="radio" name="discover-sort-radio" value="${v}"${v === state.sort ? ' checked' : ''}>
         <span class="disc-sort__label">${esc(label)}</span>
       </label>`).join('');
  };

  const updateScopeCounts = () => {
    const counts = {
      events: ((window.WA && window.WA.catalog) || []).length,
      places: ((window.WA && window.WA.venues)  || []).length,
    };
    document.querySelectorAll('.disc-scope__count').forEach(el => {
      const n = counts[el.dataset.count] || 0;
      el.textContent = String(n);
      el.hidden = n === 0;
    });
  };

  /* ── URL read/write ─────────────────────────────────────── */
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
    /* Legacy links carried 5 / 15 / 30; they all mean "near me" now. */
    state.within = parseInt(sp.get('within'), 10) > 0 ? WALK_MIN : 0;
    state.sort   = sp.get('sort')  || DEFAULT_SORT[state.type];
    state.ai     = sp.get('ai')    || '';
    state.view   = sp.get('view')  === 'map' ? 'map'   : 'list';
    state.id     = sp.get('id')    || '';
  };

  /* ── Scope reflection ───────────────────────────────────── */
  const reflectType = () => {
    const places = state.type === 'places';
    document.querySelectorAll('.disc-scope__btn').forEach(b => {
      const on = b.dataset.type === state.type;
      b.classList.toggle('disc-scope__btn--on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    /* When and Mood are properties of a dated pick — a permanent venue has
       neither, so those facets leave the row entirely in Places. */
    document.querySelectorAll('.disc-facet[data-mode]').forEach(f => {
      f.hidden = f.dataset.mode !== state.type;
    });
    updateScopeCounts();
    if (input) {
      input.placeholder = places
        ? 'Search places, or ask for what you want'
        : 'Search, or ask for what you want';
    }
    document.body.classList.toggle('discover-places', places);
    renderCatChips();
    renderAreaChips();
    renderWhenChips();
    buildSortOptions();
  };

  const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

  /* Every control applies immediately. */
  const apply = () => {
    reflectFacets();
    writeUrlState();
    if (needsLocation()) ensureLocation(run);
    else run();
  };

  /* ── Map sync ───────────────────────────────────────────── */
  let _mapSyncQueued = false;
  const syncMap = () => {
    const mv = window.WA && window.WA.MapView;
    if (!mv) return;
    if (!mv.isReady()) {
      /* MapLibre boots lazily after first paint (maplibre-loader.js) — the
         filter state pushed during run() would otherwise never reach the
         map. Queue ONE re-sync for the moment it is ready. */
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

  /* ── Map view (overlay below 1024, sticky column above) ─── */
  const reflectView = () => {
    const open = state.view === 'map';
    document.body.classList.toggle('disc-map-open', open && !isDesktop());
    if (mapOpenBtn) mapOpenBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (mapEl) mapEl.setAttribute('aria-hidden', (!open && !isDesktop()) ? 'true' : 'false');
  };

  const setView = (newView) => {
    const wasOpen = state.view === 'map';
    state.view = newView === 'map' ? 'map' : 'list';
    reflectView();
    writeUrlState();
    /* Focus follows the overlay, both ways — otherwise opening the map
       leaves the keyboard behind on the page underneath, and closing it
       drops focus on <body>. */
    if (state.view !== 'map') {
      if (wasOpen && !isDesktop()) mapOpenBtn?.focus();
      return;
    }
    if (!isDesktop()) document.getElementById('disc-map-close')?.focus();
    /* The container only just got its size — let MapLibre remeasure before
       fitting, or it fits to a zero-width box. */
    requestAnimationFrame(() => {
      window.WA?.MapTiles?.getMap?.()?.resize?.();
      syncMap();
      const mv = window.WA && window.WA.MapView;
      if (mv && mv.isReady()) mv.fitView();
    });
  };

  /* ── Main run loop ──────────────────────────────────────── */
  /* Facets only — what "Clear filters" is able to undo. */
  const hasActiveFilters = () =>
    !!(state.time !== 'all' || state.cats.size || state.nhoods.size ||
       state.mood.length || state.within || state.sort !== DEFAULT_SORT[state.type]);

  /* Curator voice, never system voice — and never "No results found". */
  const emptyCopy = () => {
    const noun = state.type === 'places' ? 'place' : 'pick';
    if (state.q) {
      return `<p class="disc-empty__line">Nothing answers to &ldquo;${esc(state.q)}&rdquo;.</p>` +
             `<p class="disc-empty__hint">Try fewer words, or <button type="button" class="disc-empty__btn" data-clear-all>start over</button>.</p>`;
    }
    return `<p class="disc-empty__line">No ${noun} fits that combination yet.</p>` +
           `<p class="disc-empty__hint">Curators are still writing &mdash; <button type="button" class="disc-empty__btn" data-clear-all>loosen a filter</button>.</p>`;
  };

  const run = () => {
    if (state.type === 'places') { runPlaces(); return; }

    /* Keep the map in step with every filter change. */
    syncMap();

    const catalog = (window.WA && window.WA.catalog) || [];
    /* Pipeline: structured filters → walking radius → keyword → sort. */
    const structured = withinFilter(applyStructuredFilters(catalog));
    const textHit    = state.q ? keywordFilter(structured, state.q) : structured;
    const sorted     = sortEntries(textHit);

    if (resultsCount) {
      const n = sorted.length;
      const base = n === 1 ? '1 pick' : `${n} picks`;
      /* One quiet cue, only when the taste nudge actually reordered the
         list — no per-card badges. It links to the taste check on Today so
         the reader can adjust what is biasing the order. Nothing to have
         tuned when the list came back empty. */
      if (tasteApplies() && n > 0) {
        resultsCount.innerHTML =
          `${base} · <a class="taste-cue" href="index.html#taste-onboarding">tuned to you</a>`;
      } else {
        resultsCount.textContent = base;
      }
    }
    if (emptyState) emptyState.innerHTML = emptyCopy();
    renderList(sorted);
  };

  /* ── Search suggestions ─────────────────────────────────
     The one place the concierge is offered. With text in the field it
     proposes asking about that text; with the field empty it shows a few
     phrasings, because "you can ask this in words" is not discoverable
     from a search box alone. Always dismissable. */
  const EXAMPLES = [
    'quiet wine bar tonight',
    'vinyl and late night dancing',
    'something free this week',
  ];

  const closeSuggest = () => {
    if (!suggestEl) return;
    suggestEl.hidden = true;
    suggestEl.innerHTML = '';
    input?.setAttribute('aria-expanded', 'false');
  };

  const renderSuggest = () => {
    if (!suggestEl || document.activeElement !== input) return;
    /* match-pick searches curated picks, not the venue table, so in Places
       scope the offer would promise an answer it can't give. The field
       still filters places as you type. */
    if (state.type === 'places') { closeSuggest(); return; }
    const q = input.value.trim();
    let html = '';
    if (q) {
      html = `<button type="button" role="option" aria-selected="false" class="disc-suggest__ask" data-ask="${esc(q)}">
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 2.5l1.4 3.6L14 7.5l-3.6 1.4L9 12.5 7.6 8.9 4 7.5l3.6-1.4z"/>
            <path d="M15 12l.7 1.8L17.5 14.5l-1.8.7L15 17l-.7-1.8L12.5 14.5l1.8-.7z"/>
          </svg>
          <span class="disc-suggest__ask-text">Ask the concierge for <b>${esc(q)}</b></span>
          <span class="disc-suggest__key" aria-hidden="true">&crarr;</span>
        </button>`;
    } else {
      html = `<p class="disc-suggest__hint">Or ask for it in words</p>` +
        EXAMPLES.map(p =>
          `<button type="button" role="option" aria-selected="false" class="disc-suggest__example" data-ask="${esc(p)}">${esc(p)}</button>`
        ).join('');
    }
    suggestEl.innerHTML = html;
    suggestEl.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  /* The answer is a list of picks like every other list on the site. It
     used to lead with a quote-as-hero card at --fs-quote, but that
     treatment is scoped to single-item detail views where there is no peer
     to compare against — the concierge returns up to five. So the top hit
     leads with its photo and title like its peers, and the concierge's
     'why' takes the caption line where a curator quote normally sits. One
     row pattern, no bespoke card. */
  const renderMatchRow = (pick, why) => {
    const meta = [pick.neighborhood, pick.kind, pick.time].filter(Boolean).join(' · ');
    const isMarked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[pick.id]);
    return `<li class="list-row list-row--card list-row--bookmarkable" data-id="${esc(pick.id)}">
       ${rowMedia(pick)}
       <div class="list-row__body">
         <p class="list-row__title">
           <a href="venue.html?id=${encodeURIComponent(pick.id)}">${esc(pick.title)}</a>
         </p>
         <p class="list-row__meta"><span class="list-row__meta-text">${esc(meta)}</span></p>
         <p class="list-row__quote"><span class="list-row__quote-text">&mdash; ${esc(why || pick.quote || '')}</span>
           <a class="handle" href="curator.html?handle=${encodeURIComponent(pick.handle)}">${esc(pick.handle)}</a></p>
       </div>
       <label class="bookmark" title="Save this pick">
         <input type="checkbox" class="bookmark__check" data-id="${esc(pick.id)}"
                aria-label="Bookmark: ${esc(pick.title)}" ${isMarked ? 'checked' : ''}>
         ${bookmarkSVG()}
       </label>
     </li>`;
  };

  /* `retry` skips the server-side cache. match-pick keys answers by query
     hash for 24h, so "Try again" on a cached prompt used to re-serve the
     identical five picks — a button that promises another go and returns
     the same one. */
  const runMatch = async (prompt, { retry = false } = {}) => {
    if (!matchWrap || !matchResult) return;
    state.ai = prompt;
    matchWrap.hidden = false;
    if (matchPromptEl) matchPromptEl.textContent = `“${prompt}”`;
    if (matchAgain)  matchAgain.hidden  = true;
    if (copyLinkBtn) copyLinkBtn.hidden = true;
    closeSuggest();
    /* The answer is an addition to the page, not a takeover — scroll it
       into view and leave the list underneath it. */
    matchWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    /* Skeleton rows match the shape of the answer, so nothing shifts when
       it lands. Static — no animation, per the brand brief. */
    const skeletonRow =
      '<li class="skeleton-row" aria-hidden="true">' +
        '<span class="skeleton-row__line skeleton-row__line--label"></span>' +
        '<span class="skeleton-row__line skeleton-row__line--tagline"></span>' +
        '<span class="skeleton-row__line skeleton-row__line--count"></span>' +
      '</li>';
    matchResult.innerHTML =
      '<ol class="list-rows" role="status" aria-label="Asking the concierge…">' +
      skeletonRow.repeat(3) + '</ol>';

    const base = window.WA && window.WA.BASE_URL;
    const city = (window.WA && window.WA.CITY) || 'tallinn';
    if (!base) {
      matchResult.innerHTML = '<p class="match-error">Concierge is not available in offline mode.</p>';
      return;
    }
    const tasteParams = window.WA?.taste?.matchParams() || {};
    try {
      const res = await fetch(`${base}/functions/v1/match-pick`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          city, prompt, mode: 'find_many',
          ...(retry ? { bypass_cache: true } : {}),
          ...tasteParams,
        }),
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
          <p class="match-error-hint">Try: ${EXAMPLES.map(p =>
            `<button type="button" class="disc-ask-inline" data-ask="${esc(p)}">${esc(p)}</button>`
          ).join(' &middot; ')}</p>`;
        return;
      }
      matchResult.innerHTML =
        `<ol class="list-rows" role="list">${hits.map(h => renderMatchRow(h.pick, h.why)).join('')}</ol>`;
      /* Point the map at the answer. Left on the keyword filter it showed
         one set of pins beside a list of five different picks — the two
         halves of the screen disagreeing about what you were looking at.
         match-pick's response carries no lat/lng, so resolve each hit
         against the local catalogue for the coordinates (and the kind the
         pin colours by); anything not in it simply doesn't plot. */
      const mv = window.WA && window.WA.MapView;
      if (mv && mv.setPicks) {
        const byId = new Map(((window.WA && window.WA.catalog) || []).map(e => [e.id, e]));
        mv.setPicks(hits.map(h => byId.get(h.pick.id)).filter(Boolean));
        if (mv.isReady()) { mv.render(); mv.fitView(); }
      }
      if (matchAgain)  matchAgain.hidden  = false;
      if (copyLinkBtn) copyLinkBtn.hidden = false;
      if (window.WA?.taste) {
        window.WA.taste.recordSeen(hits.map(h => h.pick?.id).filter(Boolean));
      }
    } catch (_) {
      matchResult.innerHTML = `<p class="match-error">Concierge is unreachable — try the keyword search instead.</p>`;
    }
  };

  /* Ask the concierge about `prompt`. The keyword filter underneath is left
     exactly as it was, so dismissing the answer returns you to the list you
     already had. */
  const askConcierge = (prompt) => {
    const p = (prompt || '').trim();
    if (!p || state.type === 'places') return;   /* picks only — see renderSuggest */
    writeUrlState();
    runMatch(p).then(writeUrlState);
  };

  /* The way out. */
  const dismissConcierge = () => {
    state.ai = '';
    if (matchWrap)   matchWrap.hidden   = true;
    if (matchAgain)  matchAgain.hidden  = true;
    if (copyLinkBtn) copyLinkBtn.hidden = true;
    if (matchResult) matchResult.innerHTML = '';
    writeUrlState();
    /* Hand the map back to the filters and refit to what the list shows. */
    syncMap();
    const mv = window.WA && window.WA.MapView;
    if (mv && mv.isReady()) mv.fitView();
  };

  /* ── Clear ──────────────────────────────────────────────── */
  const clearFilters = () => {
    state.cats.clear();
    state.nhoods.clear();
    state.within = 0;
    state.time = 'all';
    state.sort = DEFAULT_SORT[state.type];
    /* Mood lives in the URL hash; clearing fires wa:mood-changed, which
       sets state.mood and re-runs — the guard keeps this single-run. */
    if (state.mood.length) window.WA.MoodChips?.clear?.();
    renderCatChips();
    renderAreaChips();
    renderWhenChips();
    buildSortOptions();
    apply();
  };

  /* ── Init ───────────────────────────────────────────────── */
  const highlightActiveCard = () => {
    if (!resultsList || !state.id) return;
    resultsList.querySelectorAll('.list-row--active').forEach(el =>
      el.classList.remove('list-row--active'));
    const card = resultsList.querySelector(`.list-row[data-id="${CSS.escape(state.id)}"]`);
    if (card) card.classList.add('list-row--active');
  };

  const renderAll = () => {
    updateScopeCounts();
    renderCatChips();
    renderAreaChips();
    populateCurators((window.WA && window.WA.catalog) || []);
    if (needsLocation()) ensureLocation(() => { renderAreaChips(); run(); });
    else run();
    /* A shared ?ai= link re-asks the same question over the live list. */
    if (state.ai) runMatch(state.ai);
    reflectFacets();
    highlightActiveCard();
    if (state.view === 'map' || isDesktop()) {
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
    suggestEl      = document.getElementById('disc-suggest');
    matchWrap      = document.getElementById('discover-match-wrap');
    matchResult    = document.getElementById('discover-match-result');
    matchPromptEl  = document.getElementById('discover-match-prompt');
    matchBackBtn   = document.getElementById('discover-match-back');
    matchAgain     = document.getElementById('discover-match-again');
    copyLinkBtn    = document.getElementById('discover-match-copy-link');
    resultsSection = document.getElementById('discover-results-section');
    resultsList    = document.getElementById('discover-results');
    resultsCount   = document.getElementById('discover-results-count');
    emptyState     = document.getElementById('discover-empty');
    catChipsEl     = document.getElementById('discover-cat-chips');
    areaChipsEl    = document.getElementById('discover-area-chips');
    whenEl         = document.getElementById('discover-when');
    sortEl         = document.getElementById('discover-sort');
    clearBtn       = document.getElementById('discover-clear-filters');
    curatorsSect   = document.getElementById('discover-curators');
    mapEl          = document.getElementById('disc-map');
    mapOpenBtn     = document.getElementById('disc-map-open');

    if (!input || !resultsList) return;

    readUrlState();

    if (state.q) input.value = state.q;
    if (window.WA?.MoodChips) state.mood = [...window.WA.MoodChips.active()];

    reflectType();
    reflectView();

    /* Scope switch. Category means different things across scopes, and
       When/Mood don't exist for a permanent venue, so those reset; the
       query and the neighborhood carry over. */
    document.querySelectorAll('.disc-scope__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.type;
        if (t === state.type) return;
        state.type = t;
        state.cats.clear();
        state.time = 'all';
        state.sort = DEFAULT_SORT[t];
        /* The answer was about picks; it doesn't survive a scope change. */
        dismissConcierge();
        reflectType();
        apply();
      });
    });

    /* Facet menus — open/close. */
    document.querySelectorAll('.disc-facet').forEach(facet => {
      facet.querySelector('.disc-facet__btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(facet);
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.disc-facet')) closeMenus();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (suggestEl && !suggestEl.hidden) { closeSuggest(); return; }
      if (document.querySelector('.disc-facet[data-open]')) { closeMenus(); return; }
      if (document.body.classList.contains('disc-map-open')) setView('list');
    });

    /* When — single-select. */
    whenEl?.addEventListener('click', (e) => {
      const c = e.target.closest('[data-when]');
      if (!c) return;
      state.time = c.dataset.when || 'all';
      renderWhenChips();
      apply();
    });

    /* Category — multi-select. */
    catChipsEl?.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cat]');
      if (!c) return;
      const id = c.dataset.cat;
      if (state.cats.has(id)) state.cats.delete(id); else state.cats.add(id);
      renderCatChips();
      apply();
    });

    /* Area — neighborhoods multi-select, "Near me" a toggle alongside them.
       Picking Near me is what asks for location, not page load. */
    areaChipsEl?.addEventListener('click', (e) => {
      const near = e.target.closest('[data-within]');
      if (near) {
        state.within = state.within ? 0 : WALK_MIN;
        renderAreaChips();
        if (state.within) ensureLocation(() => { renderAreaChips(); apply(); });
        else apply();
        return;
      }
      const nh = e.target.closest('[data-nhood]');
      if (!nh) return;
      const name = nh.dataset.nhood;
      if (state.nhoods.has(name)) state.nhoods.delete(name); else state.nhoods.add(name);
      renderAreaChips();
      apply();
    });

    /* Sort — applies immediately, then closes its menu (a radio group has
       exactly one answer, so there is nothing left to do in there). */
    sortEl?.addEventListener('change', () => {
      const sel = sortEl.querySelector('input[name="discover-sort-radio"]:checked');
      state.sort = sel ? sel.value : DEFAULT_SORT[state.type];
      closeMenus();
      apply();
    });

    clearBtn?.addEventListener('click', clearFilters);
    /* The empty state offers the same way out. */
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-clear-all]')) {
        if (state.q) { input.value = ''; state.q = ''; reflectClear(); }
        clearFilters();
      }
    });

    /* Map: summon / dismiss below 1024. */
    mapOpenBtn?.addEventListener('click', () => setView('map'));
    document.getElementById('disc-map-close')?.addEventListener('click', () => setView('list'));

    /* Search clear (×). */
    const clearSearchBtn = document.getElementById('discover-clear');
    const reflectClear = () => { if (clearSearchBtn) clearSearchBtn.hidden = !input.value; };
    clearSearchBtn?.addEventListener('click', () => {
      input.value = '';
      state.q = '';
      reflectClear();
      closeSuggest();
      reflectFacets();
      writeUrlState();
      run();
      input.focus();
    });

    /* Keyword input. Debounced 150ms — run() does a full keywordFilter over
       the catalogue plus a map sync, which is fine at ~1,000 picks but the
       first thing to jank as cities multiply. 150ms reads as instant. */
    let typeTimer = null;
    input.addEventListener('input', () => {
      reflectClear();
      renderSuggest();
      state.q = input.value.trim();
      reflectFacets();
      writeUrlState();
      suppressEntrance = true;
      clearTimeout(typeTimer);
      typeTimer = setTimeout(run, 150);
    });
    /* The list already filters as you type, so Enter has one job left:
       hand the words to the concierge — unless the reader has arrowed onto
       a suggestion, in which case Enter takes that one. A listbox you can
       only reach with a mouse is not a listbox. */
    input.addEventListener('keydown', (e) => {
      const opts = suggestEl && !suggestEl.hidden
        ? [...suggestEl.querySelectorAll('[role="option"]')] : [];
      const active = opts.findIndex(o => o.getAttribute('aria-selected') === 'true');

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && opts.length) {
        e.preventDefault();
        const next = e.key === 'ArrowDown'
          ? (active + 1) % opts.length
          : (active <= 0 ? opts.length - 1 : active - 1);
        opts.forEach((o, i) => o.setAttribute('aria-selected', i === next ? 'true' : 'false'));
        return;
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (active > -1) { opts[active].click(); return; }
      askConcierge(input.value);
    });
    input.addEventListener('focus', renderSuggest);
    /* Let a click on a suggestion land before the blur closes the list. */
    input.addEventListener('blur', () => setTimeout(closeSuggest, 120));
    suggestEl?.addEventListener('mousedown', (e) => e.preventDefault());

    /* Every "ask" affordance — the suggestion row, the example phrasings,
       and the no-match hints — routes through one handler. */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ask]');
      if (!btn) return;
      const prompt = btn.dataset.ask;
      input.value = prompt;
      state.q = prompt;
      reflectClear();
      reflectFacets();
      run();
      askConcierge(prompt);
    });

    matchBackBtn?.addEventListener('click', () => {
      dismissConcierge();
      input.focus();
    });
    matchAgain?.addEventListener('click', () => {
      const prompt = (state.ai || input.value).trim();
      if (prompt) runMatch(prompt, { retry: true });
    });

    /* Share the current URL (which already carries ?ai=…) via
       the OS share sheet, falling back to a clipboard copy. */
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

    document.addEventListener('wa:mood-changed', (e) => {
      state.mood = e.detail.tags;
      reflectFacets();
      run();
    });

    /* "on map →" on a card focuses the pin instead of navigating. Below
       1024 the map is an overlay, so open it first and focus once it has
       laid out. */
    resultsList.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-focus-pin]');
      if (!trigger) return;
      e.preventDefault();
      const id = trigger.dataset.focusPin;
      const mv = window.WA && window.WA.MapView;
      if (!mv || !mv.isReady()) return;
      if (!isDesktop()) {
        setView('map');
        requestAnimationFrame(() => mv.focusPin(id));
      } else {
        mv.focusPin(id);
      }
    });

    /* Bookmark toggles. Delegated on document because both the results list
       and the Concierge secondary list replace their innerHTML on every
       render (per-row listeners would leak). */
    document.addEventListener('change', (e) => {
      const cb = e.target.closest('.bookmark__check');
      if (!cb || !window.WA.Bookmarks) return;
      window.WA.Bookmarks.set(cb.dataset.id, cb.checked);
    });

    /* Pin click → highlight + scroll the matching card, and update the URL
       so the open pin is shareable. */
    document.addEventListener('wa:map-pin-changed', (e) => {
      const id = e.detail?.id || '';
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

    /* Hovering a row lifts its pin, and vice versa. The map got smaller in
       this redesign; being precisely tied to the list is what earns it the
       space it kept. */
    resultsList.addEventListener('pointerover', (e) => {
      const row = e.target.closest('.list-row[data-id]');
      if (!row) return;
      window.WA?.MapView?.hoverPin?.(row.dataset.id);
    });
    resultsList.addEventListener('pointerleave', () => {
      window.WA?.MapView?.hoverPin?.(null);
    });
    document.addEventListener('wa:map-pin-hover', (e) => {
      const id = e.detail?.id || '';
      resultsList.querySelectorAll('.list-row--hover').forEach(el =>
        el.classList.remove('list-row--hover'));
      if (!id) return;
      resultsList.querySelector(`.list-row[data-id="${CSS.escape(id)}"]`)
        ?.classList.add('list-row--hover');
    });

    /* The map column is only laid out at desktop widths; re-fit when the
       breakpoint is crossed so it isn't stuck at an old size. */
    window.matchMedia('(min-width: 1024px)').addEventListener('change', () => {
      reflectView();
      requestAnimationFrame(() => {
        window.WA?.MapTiles?.getMap?.()?.resize?.();
        const mv = window.WA && window.WA.MapView;
        if (mv && mv.isReady()) mv.fitView();
      });
    });

    /* A ?ai= deep link seeds the field so the question is visible, and
       renderAll() re-asks it. */
    if (state.ai && !input.value) input.value = state.ai;
    reflectClear();

    /* Back/forward: re-read the URL and re-render so filters, view and the
       active pin all match whatever the history entry says. */
    window.addEventListener('popstate', () => {
      readUrlState();
      input.value = state.q || state.ai;
      reflectClear();
      closeSuggest();
      if (!state.ai) dismissConcierge();
      if (window.WA?.MoodChips) state.mood = [...window.WA.MoodChips.active()];
      reflectType();
      reflectView();
      renderAll();
      if (state.id) {
        const mv = window.WA?.MapView;
        if (mv && mv.isReady()) mv.focusPin(state.id);
      }
    });

    renderAll();
  };

  if (window.WA?.catalog?.length) init();
  document.addEventListener('wa:catalog-ready', init);
})();
