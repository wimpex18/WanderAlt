/* All events and search results: one query contract, removable active filters
   and a Refine dialog at every width. Search previews and Map use SearchData. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const G = () => window.WA.Geo;
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n, c) => window.WA.Icon(n, c);

  const engine = window.WA.SearchData.create(location.search);
  const state = engine.state;
  const submitted = new URLSearchParams(location.search).get('submit') === '1';
  let placeHits = [], placeOnly = false, evenings = [];
  /* The list is paged: a screenful of days first, more on request. Running
     exhibitions show five until asked. Both reset when any filter changes. */
  const PAGE = 30;
  let limit = PAGE, runsOpen = false, lastSig = '';
  const WHEN = window.WA.SearchData.WHEN;
  const DOORS = window.WA.SearchData.DOORS;
  const write = () => {
    const qs = engine.params().toString();
    history.replaceState({ ...history.state, resultLimit:limit, runningOpen:runsOpen }, '', qs ? `?${qs}` : location.pathname);
  };
  const since = R().previousVisit();
  const dayLabel = (k) => (k === W().todayKey() ? 'Today' : `${R().dateShort(k)}${k.slice(0,4) === W().todayKey().slice(0,4) ? '' : ' ' + k.slice(0,4)}`);
  const daysLabel = () => (state.dayTo ? `${dayLabel(state.day)} to ${dayLabel(state.dayTo)}` : dayLabel(state.day));

  const apply = (list, skip) => engine.apply(list,skip);
  const base = () => R().live();
  const results = () => engine.events();

  /* Only selected filters occupy the page. The full choices live in Refine. */
  const kindCounts = () => {
    const pool = apply(base(), 'kind');
    const m = new Map();
    for (const e of base()) { const k = String(e.kind || '').toLowerCase(); if (R().real(k)) m.set(k, 0); }
    for (const e of pool) { const k = String(e.kind || '').toLowerCase(); if (m.has(k)) m.set(k, m.get(k) + 1); }
    const comedy = pool.filter(e => window.WA.SearchData.kindMatches(e,new Set(['comedy']))).length;
    if (base().some(e => window.WA.SearchData.kindMatches(e,new Set(['comedy'])))) m.set('comedy',comedy);
    for (const k of state.kinds) if (!m.has(k)) m.set(k, 0);
    return [...m.entries()].sort((a, b) => Number(state.kinds.has(b[0])) - Number(state.kinds.has(a[0])) || b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const quick = () => {
    const oldFocus = document.activeElement;
    const restoreFocus = oldFocus && $('quick').contains?.(oldFocus);
    const key = oldFocus?.dataset?.act ? 'act' : 'kind', value = oldFocus?.dataset?.[key];
    const on = (label, act) => `<button class="wa-chip wa-chip--on" type="button" data-act="${esc(act)}" aria-label="${esc(`Remove ${label}`)}">${esc(label)}${I('close')}</button>`;
    const chosen = [];
    if (placeOnly) {
      if (wantsOpen()) chosen.push(on('Open now','clear-open'));
    } else {
      if (state.day || state.when !== 'all') chosen.push(on(state.day ? daysLabel() : WHEN[state.when],'clear-when'));
      for (const k of state.kinds) chosen.push(`<button class="wa-chip wa-chip--on" type="button" data-kind="${esc(k)}" aria-label="${esc(`Remove ${R().kindLabel(k)}`)}">${esc(R().kindLabel(k))}${I('close')}</button>`);
      if (state.taste) chosen.push(on(window.WA.Moods.words(state.taste).join(', '),'clear-taste'));
      if (state.free) chosen.push(on('Free','clear-free'));
      if (state.maxPrice != null) chosen.push(on(`Up to €${state.maxPrice}`,'clear-price'));
      if (state.english) chosen.push(on('In English','clear-english'));
      if (state.doors !== 'any') chosen.push(on(DOORS[state.doors],'clear-doors'));
      if (state.hideSeen) chosen.push(on("Hide what I've opened",'clear-seen'));
      if (state.followed) chosen.push(on('Followed places only','clear-followed'));
      if (state.fresh) chosen.push(on('New since last visit','clear-fresh'));
    }
    if (state.area) chosen.push(on(state.area,'clear-area'));
    if (state.within) chosen.push(on(G().format(state.within),'clear-within'));
    if (state.sort === 'nearest' && !placeOnly) chosen.push(on('Nearest','clear-sort'));
    put($('quick'),chosen.join(''));
    $('quick').hidden = !chosen.length;
    if (restoreFocus) ($('quick').querySelector(`[data-${key}="${CSS.escape(value || '')}"]`) || $('open-filters')).focus({ preventScroll:true });
    $('result-date').hidden = placeOnly;
    $('result-date').querySelector?.('span').replaceChildren(document.createTextNode(state.day || state.when !== 'all' ? 'When' : 'All dates'));
  };

  /* A single filter dialog for both desktop and mobile. */
  const areaCounts = () => {
    const pool = apply(base(), 'area');
    const m = new Map();
    /* The areas people look under (render.js AREA_LIST) in geographic order;
       any other filed name shows only while it is the chosen one. */
    for (const e of pool) { const a = R().areaOf(e); if (a && (R().AREA_LIST.includes(a) || a === state.area)) m.set(a, (m.get(a) || 0) + 1); }
    if (state.area && !m.has(state.area)) m.set(state.area, 0);
    const rank = (a) => { const i = R().AREA_LIST.indexOf(a); return i < 0 ? 99 : i; };
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  };

  const placeOrigin = () => window.WA.SearchData.origin();
  const wantsOpen = () => engine.wantsOpen();
  const placeView = skipArea => engine.places(skipArea);
  const PLACE_QUERY = { records: 'record shops', books: 'bookshops', galleries: 'galleries museums', thrift: 'thrift shops',
    beer: 'craft beer', clubs: 'clubs bars', cinema: 'cinemas', theatres: 'theatres' };
  const placePanel = (scope) => {
    const areas = [...new Set(placeView(true).map(v => R().areaOf(v)).filter(Boolean))];
    if (state.area && !areas.includes(state.area)) areas.push(state.area);
    const selected = A().places(state.q).kinds;
    const groups = (R().placeGroups || []).filter(g => PLACE_QUERY[g.id] && (window.WA.venues || []).some(v => g.kinds.includes(v.kind)));
    return `<div class="wa-field"><span class="wa-field__label">Place types</span><div class="wa-chips">${groups.map(g =>
      `<button class="wa-chip" type="button" data-place-query="${esc(PLACE_QUERY[g.id])}" aria-pressed="${g.kinds.some(k => selected.includes(k))}">${esc(g.label)}</button>`).join('')}</div></div>
      <div class="wa-field"><button class="wa-switch" type="button" data-place-open aria-pressed="${wantsOpen()}">
        <span class="wa-switch__text"><span class="wa-switch__title">Open now</span><span class="wa-switch__sub">With known hours</span></span><span class="wa-switch__track"></span></button></div>
      <div class="wa-field"><span class="wa-field__label">Area</span><div class="wa-chips"><button class="wa-chip" type="button" data-area="" aria-pressed="${!state.area}">Anywhere</button>${areas.map(a =>
        `<button class="wa-chip" type="button" data-area="${esc(a)}" aria-pressed="${state.area === a}">${esc(a)}</button>`).join('')}</div></div>
      <div class="wa-field"><span class="wa-field__label">Walking distance</span><input class="wa-range" type="range" data-within min="0" max="4000" step="250" value="${state.within}" aria-label="Maximum walking distance" />
        <span class="wa-field__consequence" data-within-note>${placeWithinNote()}</span></div>
      ${anchorField(scope === 'sheet' ? 'sheet-anchor' : 'anchor')}<a class="wa-linkbtn" href="places.html">All place types in the Guide</a>`;
  };
  const placeWithinNote = () => state.within ? `${G().format(state.within)} · ${G().minutesFor(state.within)} min on foot` : 'Anywhere in the city';
  const placeOriginText = () => {
    const label = placeOrigin().label;
    const t = text => window.WA.Lang ? window.WA.Lang.t(text) : text;
    const origin = ['where you are', 'the city centre'].includes(label) ? t(label) : label;
    return t(`Walking from ${origin}`);
  };

  let advancedOpen = false;
  const panel = (scope = 'sheet') => {
    if (state.q && placeOnly) return placePanel(scope);
    const freeN = apply(base(), 'free').filter(R().isFree).length;
    const follows = window.WA.Follows ? window.WA.Follows.keys().length : 0;
    const fb = apply(base(), 'followed');
    const hasLoc = !!G().currentLoc();
    return `
      <div class="wa-field"><span class="wa-field__label">Kind</span><div class="wa-chips">
        <button class="wa-chip" type="button" data-kind="" aria-pressed="${!state.kinds.size}">All</button>
        ${kindCounts().map(([k,n]) => `<button class="wa-chip" type="button" data-kind="${esc(k)}" aria-pressed="${state.kinds.has(k)}"${n || state.kinds.has(k) ? '' : ' disabled'}>${esc(R().kindLabel(k))} <span class="wa-chip__n">${n}</span></button>`).join('')}
      </div></div>
      <div class="wa-field"><span class="wa-field__label">Price per ticket</span>
        <input class="wa-range" type="range" data-price min="0" max="100" step="5" value="${state.maxPrice ?? 100}" aria-label="Maximum price per ticket" />
        <span class="wa-field__consequence" data-price-note>${state.maxPrice == null ? 'Any price' : `Up to €${state.maxPrice}`}</span>
        <button class="wa-switch" type="button" data-toggle="free" aria-pressed="${state.free}">
          <span class="wa-switch__text"><span class="wa-switch__title">Free entry</span><span class="wa-switch__sub">${freeN} free</span></span>
          <span class="wa-switch__track"></span>
        </button>

      </div>
      <details class="prog-options" data-advanced${advancedOpen ? ' open' : ''}><summary>More options</summary>
      <div class="wa-field">
        <span class="wa-field__label">Area</span>
        <div class="wa-chips">
          <button class="wa-chip" type="button" data-area="" aria-pressed="${!state.area}">Anywhere</button>
          ${areaCounts().map(([a, n]) => `<button class="wa-chip" type="button" data-area="${esc(a)}" aria-pressed="${state.area === a}"${n || state.area === a ? '' : ' disabled'}>${esc(a)} <span class="wa-chip__n">${n}</span></button>`).join('')}
        </div>
      </div>
      <div class="wa-field">
        <span class="wa-field__label">Order</span>
        <div class="wa-seg">
          <button class="wa-seg__opt" type="button" data-sort="soonest" aria-pressed="${state.sort === 'soonest'}">Soonest</button>
          <button class="wa-seg__opt" type="button" data-sort="nearest" aria-pressed="${state.sort === 'nearest'}">Nearest</button>
        </div>
        ${state.sort === 'nearest' && !hasLoc ? '<span class="wa-field__consequence">Location needed; showing soonest</span>' : ''}
      </div>
      <div class="wa-field">
        <span class="wa-field__label">Starts</span>
        <div class="wa-chips">${Object.keys(DOORS).map(v => `<button class="wa-chip" type="button" data-doors="${esc(v)}" aria-pressed="${state.doors === v}">${esc(DOORS[v])}</button>`).join('')}</div>
      </div>
      <div class="wa-field">
        <span class="wa-field__label">Walking distance</span>
        <input class="wa-range" type="range" data-within min="0" max="4000" step="250" value="${state.within}" aria-label="Maximum walking distance" />
        <span class="wa-field__consequence" data-within-note>${withinNote()}</span>
      </div>
      ${anchorField(scope === 'sheet' ? 'sheet-anchor' : 'anchor')}
      <div class="wa-field">
        <button class="wa-switch" type="button" data-toggle="english" aria-pressed="${state.english}">
          <span class="wa-switch__text"><span class="wa-switch__title">In English</span><span class="wa-switch__sub">With a listed language</span></span><span class="wa-switch__track"></span>
        </button>
        <button class="wa-switch" type="button" data-toggle="hideSeen" aria-pressed="${state.hideSeen}">
          <span class="wa-switch__text"><span class="wa-switch__title">Hide what I've opened</span><span class="wa-switch__sub">${window.WA.Seen.count()} opened or saved</span></span>
          <span class="wa-switch__track"></span>
        </button>
        <button class="wa-switch" type="button" data-toggle="followed" aria-pressed="${state.followed}"${follows || state.followed ? '' : ' disabled'}>
          <span class="wa-switch__text"><span class="wa-switch__title">Followed places only</span><span class="wa-switch__sub">${follows
            ? `${fb.filter(R().isFollowed).length} from followed places` : 'Follow venues first'}</span></span>
          <span class="wa-switch__track"></span>
        </button>
        ${since ? `<button class="wa-switch" type="button" data-toggle="fresh" aria-pressed="${state.fresh}">
          <span class="wa-switch__text"><span class="wa-switch__title">New since last visit</span><span class="wa-switch__sub">${apply(base(), 'fresh').filter(e => R().isNewSince(e, since)).length} new listings</span></span>
          <span class="wa-switch__track"></span>
        </button>` : ''}
      </div>
      ${searchAct()}
      </details>
      <div class="wa-field"><button class="wa-btn wa-btn--quiet wa-btn--sm" type="button" data-clear style="justify-self:start;padding:0">Clear all filters</button></div>`;
  };
  const withinNote = () => !G().currentLoc() && state.within ? 'Choose a starting point' : state.within
    ? `${G().format(state.within)} · ${G().minutesFor(state.within)} min on foot` : 'Anywhere in the city';

  /* A named spot to measure from, picked from places we hold, so walking
     times work without location permission (a hotel, a friend's street). */
  const anchorField = (id = 'anchor') => {
    const spots = (window.WA._venuesAll || []).filter(v => v.name && v.lat != null && v.lng != null && !v.isClosed)
      .map(v => v.name).filter((n, i, a) => a.indexOf(n) === i).sort((a, b) => a.localeCompare(b)).slice(0, 400);
    const a = G().anchor();
    return `<div class="wa-field">
      <label class="wa-field__label" for="${id}">Measure from</label>
      <input class="wa-input" data-anchor id="${id}" list="${id}-spots" type="text" autocomplete="off" placeholder="My location" value="${esc(a ? a.label : '')}" />
      <datalist id="${id}-spots">${spots.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <span class="wa-field__consequence">${a ? 'Clear for device location' : 'Choose a starting point'}</span>
    </div>`;
  };

  const activeCount = () => placeOnly ? Number(!!wantsOpen()) + Number(!!state.area) + Number(!!state.within) : state.kinds.size + (state.taste ? 1 : 0) + (state.english ? 1 : 0) + (state.maxPrice != null ? 1 : 0) + (state.area ? 1 : 0) + (state.within ? 1 : 0) + (state.doors !== 'any' ? 1 : 0) +
    (state.free ? 1 : 0) + (state.hideSeen ? 1 : 0) + (state.followed ? 1 : 0) + (state.fresh ? 1 : 0) +
    (state.sort !== 'soonest' ? 1 : 0) + (!state.day && state.when !== 'all' ? 1 : 0) + (state.day ? 1 : 0);

  /* ── Empty state: name the filter, offer the drop that helps most ── */
  const emptyState = () => {
    if (state.q && placeOnly) {
      return R().empty({ icon: 'store', title: wantsOpen() && !state.area && !state.within ? 'None with filed hours are open now.' : 'No places match this search.',
        body: wantsOpen() && !state.area && !state.within ? "Places without filed hours aren't included." : 'Try another area, a longer walk or another kind of place.',
        actions: [{ act: 'clear-place-filters', label: 'Show all matching places' }, { act: 'clear-q', label: 'Clear search' }, { href: 'places.html', label: 'The Guide' }] });
    }
    const drops = [];
    const add = (on, label, act, skip) => { if (on) drops.push({ label, act, n: apply(base(), skip).length }); };
    add(state.q, 'Clear search', 'clear-q', 'q');
    add(state.kinds.size, 'Any kind', 'clear-kinds', 'kind');
    add(state.area, 'Anywhere in the city', 'clear-area', 'area');
    add(state.day || state.when !== 'all', 'Any day', 'clear-when', 'when');
    add(state.free, 'Include paid', 'clear-free', 'free');
    add(state.maxPrice != null, 'Any price', 'clear-price', 'price');
    add(state.english, 'Any language', 'clear-english', 'english');
    add(state.doors !== 'any', 'Any start time', 'clear-doors', 'doors');
    add(state.within, 'Any distance', 'clear-within', 'within');
    add(state.hideSeen, "Include what I've opened", 'clear-seen', 'seen');
    add(state.followed, 'Every source', 'clear-followed', 'followed');
    add(state.fresh, 'Not only new', 'clear-fresh', 'fresh');
    drops.sort((a, b) => b.n - a.n);
    const best = drops.find(d => d.n > 0);
    if (state.q && drops.length === 1) {
      return R().empty({ icon: 'search', title: 'No listings match this search.',
        body: 'Searches English and original titles, venues and areas, with or without Estonian letters.',
        actions: [{ act: 'clear-q', label: 'Clear search' }, { href: 'places.html', label: 'All places' }] });
    }
    if (best) {
      return R().empty({ icon: 'filter', title: 'Nothing matches all of that.',
        body: `${best.n} ${best.n === 1 ? 'listing is' : 'listings are'} available if you ${best.act === 'clear-q' ? 'remove the search words' : 'relax this filter'}. Your other filters stay selected.`,
        actions: [{ act: best.act, label: best.label }] });
    }
    if (drops.length) {
      return R().empty({ icon: 'filter', title: 'Nothing matches all of that.',
        body: 'Try a different day or start a new search.', actions: [{ act: 'clear-all', label: 'Start over' }] });
    }
    return R().empty({ icon: 'calendar', title: `Nothing is listed in ${R().cityName()} for the coming days.`,
      body: 'The sources are read every six hours. The Guide has picked places.', actions: [{ href: 'places.html', label: 'Guide' }] });
  };

  /* ── Reading a sentence ─────────────────────────────────────
     A title or a venue is searched as typed. A sentence is read into
     the filters it names; what it set shows as chips, each removable,
     and "Search the words" puts everything back. The model is asked only
     when words are left that the page could not place and nothing
     matches without them. */
  const A = () => window.WA.Ask;
  const cancelAsk = () => engine.cancel();
  /* Evenings for a plan question: the stored ones that still hold, for the
     day the words name (today when they name none), else one worked out here. */
  const eveningsFor = (p) => {
    const R2 = window.WA.Route;
    if (!R2) return [];
    const all = R2.upcoming();
    const dow = (k) => new Date(`${k}T12:00:00`).getDay();
    let pick = all;
    if (p && p.day) pick = all.filter(r => r.day === p.day);
    else if (p && p.when === 'tomorrow') pick = all.filter(r => r.off === 1);
    else if (p && p.when === 'weekend') pick = all.filter(r => dow(r.day) === 6 || dow(r.day) === 0);
    else pick = all.filter(r => r.off === 0);
    if (!pick.length && (!p || (!p.day && p.when !== 'tomorrow' && p.when !== 'weekend'))) { const one = R2.compose(); if (one) pick = [one]; }
    return pick.slice(0, 3);
  };
  const dayWord = (r) => (r.off === 0 || r.off == null ? 'Tonight' : r.off === 1 ? 'Tomorrow' : R().dayName(r.day));

  const syncPlaces = () => { placeHits = engine.places(); placeOnly = engine.placeOnly; };
  const onQuery = (raw, submit = false) => {
    engine.query(raw);
    if (String(raw || '').length > 140) $('q').value = state.q;
    $('q-clear').hidden = !state.q;
    syncPlaces(); evenings = [];
    if (state.q && A().places(state.q).plan && window.WA.Route) {
      window.WA.Route.loadStored(); evenings = eveningsFor(A().local(state.q));
    }
    render();
    if (submit) engine.enhance().then(changed => { if (changed) { syncPlaces(); render(); } });
  };

  const askNote = () => {
    const n = $('ask-note');
    if (!state.read) { n.hidden = true; n.innerHTML = ''; return; }
    const words = [...state.read.must, ...state.read.any].slice(0, 3).map(w => `“${w}”`).join(', ');
    n.hidden = false;
    n.innerHTML = `<span>${words ? `<span>Keywords</span>: <span data-notranslate>${esc(words)}</span>` : '<span>Filters from your search</span>'}</span><button type="button" data-act="undo-read">Search the words</button>`;
  };

  /* ── Render ─────────────────────────────────────────────────── */
  const summary = (n) => {
    if (placeOnly) {
      const list = placeView();
      put($('summary'), `<strong>${list.length} ${list.length === 1 ? 'place' : 'places'}</strong> · picked first${wantsOpen() ? ' · open now' : A().places(state.q).openNow ? ' · including closed places' : ''} · ${esc(placeOriginText())}`);
      return;
    }
    const order = state.sort === 'nearest' && G().currentLoc() ? 'nearest first' : 'soonest first';
    const pl = state.q && placeHits.length ? `<strong>${placeHits.length} ${placeHits.length === 1 ? 'place' : 'places'}</strong> and ` : '';
    const unknown = state.maxPrice != null && !state.free && latest.some(e => !R().isFree(e) && e.priceMin == null);
    put($('summary'), `${pl}<strong>${n} ${n === 1 ? 'listing' : 'listings'}</strong> · <span>${order}</span>${unknown ? '<br><span class="wa-note">Unknown prices included</span>' : ''}`);
  };

  /* Follow this search: kinds, free entry and English are facts on the
     event, so a saved search can be a calendar and an email without any
     reading of words. Shown only when one of them is set. */
  const searchLabel = () => [[...state.kinds].map(k => R().kindLabel(k)).join(', '), state.free ? 'free' : '', state.english ? 'in English' : ''].filter(Boolean).join(' · ');
  const searchAct = () => {
    const F = window.WA.Follows;
    if (!F) return '';
    const id = F.searchId({ kinds: state.kinds, free: state.free, english: state.english });
    if (!id) return '';
    const on = F.has(id), feed = on ? F.feedUrl(id) : '';
    return `<div class="wa-field"><span class="wa-field__label">Keep this search</span><button class="wa-linkbtn" type="button" data-follow-search="${esc(id)}" aria-pressed="${on}">${esc(on ? 'Following this search' : 'Follow this search')}</button>${feed ? ` <a class="wa-linkbtn" href="${esc(feed.replace(/^https?:/, 'webcal:'))}">Add to calendar</a>` : ''}</div>`;
  };

  /* Nearest order is one flat list; soonest order groups by day. */
  const eveningsBlock = () => {
    if (!state.q || !evenings.length || !window.WA.Route) return '';
    return `<section class="prog-places" aria-label="Evenings"><h2 class="wa-kicker">Evenings</h2>${evenings.map(r => `<div class="rt-more__item">${window.WA.Route.card(r, dayWord(r))}</div>`).join('')}</section>`;
  };
  const placesBlock = (listLen) => {
    if (!state.q || !placeHits.length) return '';
    const pool = placeOnly ? placeView() : placeHits;
    const shown = pool.slice(0,limit);
    const all = pool.length > shown.length ? `<button class="wa-btn wa-btn--quiet" type="button" data-act="more-places">Show ${Math.min(PAGE,pool.length - shown.length)} more places</button>` : '';
    return `<section class="prog-places" aria-label="Places"><h2 class="wa-kicker">Places</h2><ul class="places-grid">${shown.map(v => R().placeRow(v, { from: placeOrigin().from })).join('')}</ul>${all}</section>` +
      (listLen ? '<h2 class="wa-kicker">Listings</h2>' : '');
  };
  const media = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false, addEventListener() {} });
  const asRows = media('(min-width: 1024px)');
  asRows.addEventListener('change', () => { if (window.WA.catalog) render(); });
  /* From 1280 px the choosing sits in a rail beside the list, as on Now: plain options with how many each
     would show. Kind and the toggles use the Refine sheet's own handlers; Refine keeps the rest. */
  const railWide = media('(min-width: 1280px)');
  railWide.addEventListener('change', () => { if (window.WA.catalog) render(); });
  const progRail = () => {
    if (!railWide.matches || placeOnly) return '';
    const opt = (attrs, on, label, n) => `<button class="home-rail__opt" type="button" ${attrs} aria-pressed="${on}"><span>${esc(label)}</span>${n == null ? '' : `<span class="home-rail__n${n ? '' : ' is-none'}">${n}</span>`}</button>`;
    const group = (id, title, body) => `<div class="home-rail__group" role="group" aria-labelledby="${id}"><p class="home-rail__h" id="${id}">${esc(title)}</p>${body}</div>`;
    const dated = apply(base(), 'when');
    const nWhen = (w) => (w === 'all' ? dated.length : dated.filter(e => window.WA.Discovery.matchesDate(e, { when: w })).length);
    const when = ['all', 'tonight', 'tomorrow', 'weekend'].map(w => opt(`data-rail-when="${w}"`, !state.day && state.when === w, WHEN[w], nWhen(w))).join('')
      + opt('data-rail-dates aria-haspopup="dialog"', !!state.day, state.day ? daysLabel() : 'Pick dates', state.day ? results().length : null);
    const kinds = opt('data-kind=""', !state.kinds.size, 'All', apply(base(), 'kind').length)
      + kindCounts().filter(([k, n]) => n || state.kinds.has(k)).map(([k, n]) => opt(`data-kind="${esc(k)}"`, state.kinds.has(k), R().kindLabel(k), n)).join('');
    const only = opt('data-toggle="free"', state.free, 'Free', apply(base(), 'free').filter(R().isFree).length) + opt('data-toggle="english"', state.english, 'In English', null);
    return group('prog-rail-when', 'When', when) + group('prog-rail-kind', 'Kind', kinds) + group('prog-rail-only', 'Filters', only);
  };

  const listHtml = (list) => {
    if (state.q && placeOnly) return placeView().length ? placesBlock(0) : emptyState();
    if (!list.length) return state.q && (placeHits.length || evenings.length)
      ? `${eveningsBlock()}${placesBlock(0)}<p class="wa-note">${placeOnly ? 'Nothing is listed at these places in the coming days.' : 'No listings match this search.'}</p>` : emptyState();
    const days = list.filter(e => !R().isRun(e));
    const rest = days.length - limit;
    const more = rest > 0 ? `<div class="prog-more"><button class="wa-btn wa-btn--quiet" type="button" data-act="more">Show ${Math.min(PAGE, rest)} more</button><span class="wa-note">${rest} more after these</span></div>` : '';
    /* Desktop reads the same rows as Now, time first; phones and tablets keep the posters. */
    const rows = asRows.matches, opts = rows ? { rowsClass: 'home-rows', heart: true, unknownPrice: true } : { feed: true };
    if (state.sort === 'nearest' && G().currentLoc()) return `${eveningsBlock()}${placesBlock(list.length)}<ul class="${rows ? 'wa-rows home-rows' : 'wa-feed'}">${list.slice(0, limit).map(e => R().row(e, { ...opts, day: true, since })).join('')}</ul>${list.length > limit ? `<div class="prog-more"><button class="wa-btn wa-btn--quiet" type="button" data-act="more">Show ${Math.min(PAGE, list.length - limit)} more</button></div>` : ''}`;
    return eveningsBlock() + placesBlock(list.length) + R().grouped(list, { ...opts, since, limit, runningLimit: runsOpen ? undefined : 5 }) + more;
  };

  /* Write markup only when it changed, so an unchanged list keeps its
     pictures and scroll position instead of being rebuilt. The last string
     is remembered on the element, so everything that fills #list,
     #sheet-body, #sheet-foot, #quick and #summary goes through here. */
  const put = (el, html) => { if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; } };

  /* A tap answers in the same frame with what is small (the chips, the
     count, the summary). The list and the panel, which are large, follow
     in the next task; taps that arrive meanwhile are drawn once. */
  let bigFrame = 0, latest = [], moreFrom = -1;
  const drawBig = () => {
    bigFrame = 0;
    const list = latest;
    window.WA.UI.keepFocus($('list'), () => put($('list'), listHtml(list)));
    /* Show more: focus moves to the first of the new rows, as on Now. */
    if (moreFrom >= 0) {
      const first = $('list').querySelectorAll('a[data-row]')[moreFrom];
      moreFrom = -1;
      if (first) first.focus({ preventScroll: true });
    }
    const sheet = $('sheet');
    if (sheet && sheet.open) {
      const active = document.activeElement;
      const key = active?.dataset && ['kind','area','sort','doors','toggle','placeOpen','placeQuery','within','price','advanced','followSearch'].find(k => k in active.dataset);
      const value = key && active.dataset[key];
      put($('sheet-body'), panel('sheet')); put($('sheet-foot'), foot(list.length));
      if (key) {
        const attr = key.replace(/[A-Z]/g,c => '-' + c.toLowerCase());
        const node = sheet.querySelector(`[data-${attr}="${CSS.escape(value || '')}"]`);
        (key === 'advanced' ? node?.querySelector('summary') : node)?.focus({ preventScroll:true });
      }
    }
  };
  const filterSig = () => JSON.stringify([state.q, state.day, state.dayTo, state.when, [...state.kinds], state.area, state.sort, state.within, state.doors,
    state.free, state.hideSeen, state.followed, state.fresh, state.english, state.maxPrice, state.placeOpen, state.taste]);
  const render = () => {
    const sig = filterSig();
    if (sig !== lastSig) { lastSig = sig; limit = PAGE; runsOpen = false; }
    syncPlaces();
    const list = latest = results();
    quick();
    askNote();
    summary(list.length);
    const title = placeOnly ? 'Places' : state.q ? 'Search results' : 'All events';
    $('prog-title').textContent = title;
    document.title = `${window.WA.Lang ? window.WA.Lang.t(title) : title} · WanderAlt`;
    const label = document.querySelector?.('label[for="q"]');
    if (label) label.textContent = 'Search events or places';
    $('to-map').hidden = false;
    const fc = activeCount();
    $('filter-count').hidden = !fc;
    $('filter-count').textContent = fc ? String(fc) : '';
    if (!bigFrame) bigFrame = requestAnimationFrame(() => setTimeout(drawBig, 0));
    const mapContext = engine.params();
    mapContext.set('context','search');
    $('to-map').href = `map.html?${mapContext}`;
    const railHost = $('prog-rail');
    if (railHost) window.WA.UI.keepFocus(railHost, () => put(railHost, progRail()));
    stickyOffset();
    write();
  };

  const foot = (n) => { if (placeOnly) n = placeView().length; return `<button class="wa-btn wa-btn--primary wa-btn--wide" type="button" id="sheet-apply">Show ${n} ${placeOnly ? (n === 1 ? 'place' : 'places') : n === 1 ? 'listing' : 'listings'}</button>`; };

  /* Day headings stick under the controls, which stick under the top bar. */
  const stickyOffset = () => {
    const c = $('prog-controls');
    /* From 1280 px the controls are a rail beside the list, so headings stick under the top bar only. */
    const h = c && !media('(min-width: 1280px)').matches && getComputedStyle(c).position === 'sticky' ? c.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--sticky-extra', `${Math.round(h)}px`);
  };
  window.addEventListener('resize', stickyOffset);

  /* ── Events ─────────────────────────────────────────────────── */
  const sheet = () => $('sheet');
  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    if (hit('[data-kind], [data-area], [data-sort], [data-doors], [data-place-open], [data-place-query], [data-toggle], [data-clear], [data-act], #q-clear')) cancelAsk();
    const fs = hit('[data-follow-search]');
    if (fs && window.WA.Follows) {
      const on = window.WA.Follows.toggle(fs.dataset.followSearch, searchLabel());
      render();
      if (window.WA.Toast) window.WA.Toast.show(on ? 'Following this search' : 'Stopped following this search');
      return;
    }
    const rw = hit('[data-rail-when]');
    if (rw) { cancelAsk(); state.when = rw.dataset.railWhen; state.day = ''; state.dayTo = ''; engine.override('when'); render(); return; }
    if (hit('#result-date') || hit('[data-rail-dates]')) {
      cancelAsk();
      window.WA.DiscoveryControls.openDates(hit('#result-date') || hit('[data-rail-dates]'), {
        dates:{ when:state.when, date:state.day, to:state.dayTo },
        apply: value => {
          state.when = value.when || 'all'; state.day = value.date || ''; state.dayTo = value.to || '';
          engine.override('when'); render();
        } });
      return;
    }
    if (hit('#open-filters')) {
      $('sheet-title').textContent = 'Refine';
      put($('sheet-body'), panel('sheet'));
      put($('sheet-foot'), foot(results().length));
      document.body.classList.add('search-open');
      sheet().showModal();
      return;
    }
    if (hit('#sheet-close') || hit('#sheet-apply')) { sheet().close(); return; }
    if (hit('#q-clear')) { $('q').value = ''; onQuery(''); $('q').focus(); return; }

    const k = hit('[data-kind]');
    if (k) {
      const v = k.dataset.kind;
      if (!v) state.kinds.clear();
      else if (state.kinds.has(v)) state.kinds.delete(v); else state.kinds.add(v);
      engine.override('kind'); render(); return;
    }
    const a = hit('[data-area]');
    if (a) { state.area = a.dataset.area; state.areaExplicit = true; render(); return; }
    const s = hit('[data-sort]');
    if (s) {
      state.sort = s.dataset.sort;
      if (state.sort === 'nearest') G().userLoc().then(render);
      render(); return;
    }
    const pq = hit('[data-place-query]');
    if (pq) { const q = pq.dataset.placeQuery + (wantsOpen() ? ' open now' : ''); $('q').value = q; onQuery(q, true); return; }
    if (hit('[data-place-open]')) { state.placeOpen = !wantsOpen(); render(); return; }
    const dr = hit('[data-doors]');
    if (dr) { state.doors = dr.dataset.doors; render(); return; }
    const t = hit('[data-toggle]');
    if (t) { state[t.dataset.toggle] = !state[t.dataset.toggle]; engine.override(t.dataset.toggle); render(); return; }
    if (hit('[data-clear]') || hit('[data-act="clear-all"]')) {
      engine.reset(); syncPlaces(); evenings = [];
      $('q').value = ''; $('q-clear').hidden = true; render(); return;
    }
    const act = hit('[data-act]');
    if (act) {
      const x = act.dataset.act;
      if (x === 'clear-place-filters') { state.placeOpen = false; state.area = ''; state.areaExplicit = true; state.within = 0; }
      if (x === 'clear-q') { $('q').value = ''; onQuery(''); return; }
      if (x === 'clear-taste') state.taste = null;
      if (x === 'clear-kinds') state.kinds.clear();
      if (x === 'clear-area') { state.area = ''; state.areaExplicit = true; }
      if (x === 'clear-when') { state.day = ''; state.dayTo = ''; state.when = 'all'; }
      if (x === 'clear-free') state.free = false;
      if (x === 'clear-price') state.maxPrice = null;
      if (x === 'clear-english') state.english = false;
      if (x === 'undo-read') engine.undo();
      if (x === 'more' || x === 'more-places') { moreFrom = $('list').querySelectorAll('a[data-row]').length; limit += PAGE; }
      if (x === 'more-running') runsOpen = true;
      if (x === 'clear-open') state.placeOpen = false;
      if (x === 'clear-sort') state.sort = 'soonest';
      if (x === 'clear-doors') state.doors = 'any';
      if (x === 'clear-within') state.within = 0;
      if (x === 'clear-seen') state.hideSeen = false;
      if (x === 'clear-followed') state.followed = false;
      if (x === 'clear-fresh') state.fresh = false;
      const overrides = { 'clear-kinds':'kind','clear-when':'when','clear-free':'free','clear-price':'price','clear-english':'english' };
      if (overrides[x]) engine.override(overrides[x]);
      render(); return;
    }
    const r = hit('[data-row]');
    if (r) window.WA.Seen.mark(r.dataset.row);
  });

  document.addEventListener('toggle',e => { if (e.target.matches?.('[data-advanced]')) advancedOpen = e.target.open; },true);

  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') { onQuery(e.target.value, false); return; }
    if (e.target.matches && e.target.matches('[data-price]')) {
      state.maxPrice = Number(e.target.value) === 100 ? null : Number(e.target.value);
      engine.override('price');
      document.querySelectorAll('[data-price-note]').forEach(n => { n.textContent = state.maxPrice == null ? 'Any price' : `Up to €${state.maxPrice}`; });
      latest = results(); summary(latest.length); put($('list'),listHtml(latest)); quick(); write();
      if (sheet()?.open) put($('sheet-foot'),foot(latest.length));
      return;
    }
    if (e.target.matches && e.target.matches('[data-within]')) {
      cancelAsk();
      state.within = parseInt(e.target.value, 10) || 0;
      if (state.within && !placeOnly) G().userLoc();
      document.querySelectorAll('[data-within-note]').forEach(n => { n.textContent = placeOnly ? placeWithinNote() : withinNote(); });
      /* Redraw the list but leave the slider being dragged alone. */
      const list = latest = results();   /* a pending drawBig must not paint older results over this */
      summary(list.length);
      put($('list'), listHtml(list));
      quick();
      if (sheet() && sheet().open) put($('sheet-foot'), foot(list.length));
      write();
    }
  });
  document.addEventListener('change', (e) => {
    if (!e.target.matches) return;
    if (e.target.matches('[data-anchor]')) {
      const name = e.target.value.trim().toLowerCase();
      const v = name ? (window.WA._venuesAll || []).find(x => String(x.name).toLowerCase() === name && x.lat != null && x.lng != null) : null;
      G().setAnchor(v ? { lat: v.lat, lng: v.lng, label: v.name } : null);
      return;
    }
    if (e.target.matches('[data-within], [data-price]')) { render(); return; }
  });
  document.addEventListener('submit', (e) => { if (e.target.id === 'search-form') { e.preventDefault(); onQuery($('q').value, true); $('q').blur(); } });
  /* Preserve the expanded list through detail-page round trips. */
  const restore = history.state || {};
  const boot = () => {
    if (state.q) onQuery(state.q,submitted); else render();
    if (restore.resultLimit > PAGE) { limit = restore.resultLimit; runsOpen = !!restore.runningOpen; render(); }
    R().locateIfGranted();
  };
  const pre = () => {
    $('q').value = state.q;
    $('q-clear').hidden = !state.q;
    put($('list'), R().skelRows(6));
    if (new URLSearchParams(location.search).get('focus') === 'search') $('q').focus();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pre, { once: true }); else pre();
  document.addEventListener('wa:catalog-ready', boot);
  $('sheet').addEventListener?.('close',() => { document.body.classList.remove('search-open'); });
  $('sheet').addEventListener?.('click',e => { if (e.target === $('sheet')) $('sheet').close(); });
  document.addEventListener('wa:location-ready', render);
  document.addEventListener('wa:follows-changed', render);
  document.addEventListener('wa:routes-ready', () => { if (evenings.length || (state.q && A().places(state.q).plan)) { evenings = eveningsFor(A().local(state.q)); render(); } });
  document.addEventListener('wa:language-changed', render);
})();
