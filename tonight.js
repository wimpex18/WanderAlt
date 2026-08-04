/* ============================================================
   tonight.js — Tonight: results + map mode (5d), filter sheet (5c).
   ------------------------------------------------------------
   Replaces discover.js on this page. Discover opened on five controls
   for a few dozen rows; Tonight opens on the answer. The four facet
   menus collapse to the capsule's three chips plus ONE filter sheet,
   and the sheet's key says the outcome rather than the verb, so you
   know the size of the result before you commit to it.

   Two things that were on Discover are gone with the redesign and are
   not reimplemented here: the Concierge (?ai=) and Mood (#mood=). Their
   params drop silently — see readParams.

   The map is a MODE, not a companion doing triage the rows do better.
   Below 1024 it replaces the list; from 1024 it sits beside it (6f).
   Pins are time · distance labels, paired both ways with their row.

   Everything interpolated is scraped and goes through WA.UI.esc() at
   the interpolation site; URLs go through WA.UI.safeUrl().
   ============================================================ */
(() => {
  'use strict';

  const $  = (id) => document.getElementById(id);
  const UI = () => window.WA.UI;
  const esc = (s) => UI().esc(s);

  /* ── State ───────────────────────────────────────────────────
     `when` and `what` share Explore's vocabulary so a value means the
     same thing on both screens. `within` is metres (the new contract). */
  const state = {
    when:   'tonight',
    what:   'all',
    kinds:  new Set(),
    within: 0,
    doors:  'any',        /* any | now | 21:00 | 23:00 */
    free:   false,
    hideSeen: false,
    sort:   'soonest',
    q:      '',
    map:    false,
    /* Set by "Search this area": a LngLatBounds the results are clipped
       to. Cleared by any other filter change, because a stale viewport
       silently narrowing a fresh search is the worst kind of empty. */
    bounds: null,
  };

  const WHEN_LABEL = { tonight: 'Tonight', tomorrow: 'Tomorrow', weekend: 'This weekend', thisweek: 'This week', all: 'Anytime' };
  const DOORS_LABEL = { any: 'any', now: 'now', '21:00': '21:00', '23:00': '23:00' };

  const CITY_LABEL = () => {
    const c = (window.WA.CITIES || []).find(x => x.id === window.WA.CITY);
    return c ? c.label.charAt(0) + c.label.slice(1).toLowerCase() : 'Tallinn';
  };

  /* ── URL contract (6f) ───────────────────────────────────────
     Live: ?q ?cat ?time ?type ?sort ?id ?view=map ?within=
     Retired: ?ai= (Concierge), #mood= (Mood), ?nhood= (Area facet).
     All three are READ AND DISCARDED. Shared links from the current
     site are in the wild; they must still render a list, never 404 and
     never come back empty. */
  const readParams = () => {
    const sp = new URLSearchParams(location.search);

    if (sp.get('time'))  state.when   = sp.get('time');
    if (sp.get('q'))     state.q      = sp.get('q');
    if (sp.get('sort'))  state.sort   = sp.get('sort');
    if (sp.get('cat'))   sp.get('cat').split(',').filter(Boolean).forEach(c => state.kinds.add(c.toLowerCase()));
    if (sp.get('within')) state.within = window.WA.Geo.parseWithin(sp.get('within'));
    if (sp.get('view') === 'map') state.map = true;

    /* Retired — deliberately read so it is obvious they are handled,
       then dropped. No redirect, no error, no empty result. */
    void sp.get('ai');
    void sp.get('nhood');
    void location.hash.match(/[#&]mood=/);
  };

  const writeParams = () => {
    const sp = new URLSearchParams();
    if (state.when !== 'tonight') sp.set('time', state.when);
    if (state.q)                  sp.set('q', state.q);
    if (state.sort !== 'soonest') sp.set('sort', state.sort);
    if (state.kinds.size)         sp.set('cat', [...state.kinds].join(','));
    if (state.within)             sp.set('within', String(state.within));
    if (state.map)                sp.set('view', 'map');
    const qs = sp.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  };

  /* ── Data ────────────────────────────────────────────────────── */
  const picks = () => (window.WA.catalog || []).filter(e => !e.isClosed);

  const isFreeish = (e) => e.isFree === true ||
    (e.priceMin != null && Number(e.priceMin) === 0);

  const doorsMinutes = (e) => window.WA.Geo.startMinutes(e);

  const doorsPass = (e) => {
    if (state.doors === 'any') return true;
    const m = doorsMinutes(e);
    if (m == null) return false;          /* no time known — cannot claim it */
    if (state.doors === 'now') {
      const n = window.WA.Hours.cityNow();
      return m >= n.minutes;
    }
    const [h, mm] = state.doors.split(':').map(Number);
    return m >= h * 60 + mm;
  };

  /* One filter chain, used by the list, the map and every count in the
     sheet — so a count can never disagree with the list it describes.
     `skip` lets a facet exclude itself when counting its own options. */
  const applyFilters = (list, skip) => {
    const geo = window.WA.Geo;
    let out = list.filter(e => window.WA.when.matches(e, state.when));
    if (skip !== 'kind' && state.kinds.size) {
      out = out.filter(e => state.kinds.has(String(e.kind || '').toLowerCase()));
    }
    if (skip !== 'free' && state.free)      out = out.filter(isFreeish);
    if (skip !== 'doors')                   out = out.filter(doorsPass);
    if (skip !== 'within' && state.within)  out = geo.withinFilter(out, state.within);
    if (skip !== 'seen' && state.hideSeen)  out = window.WA.Seen.filter(out);
    if (skip !== 'bounds' && state.bounds) {
      const b = state.bounds;
      /* Unplaceable entries ARE dropped here. The first cut kept them, on
         the reasoning that "no coordinate" is not "elsewhere" — but the
         reader has just pressed a button on a map asking what is in this
         area, and answering with 157 rows that are not on the map is the
         control not doing what it says. Matching the map is the whole
         point of the action. The map bar prints "1 of 158 placed" and the
         empty state offers "Search everywhere", so the coverage gap is
         stated rather than hidden. */
      out = out.filter((e) => {
        const c = geo.coordsFor(e);
        if (!c) return false;
        return c.lng >= b.west && c.lng <= b.east && c.lat >= b.south && c.lat <= b.north;
      });
    }
    if (state.q) {
      const q = state.q.toLowerCase();
      out = out.filter(e => `${e.title} ${e.venue} ${e.neighborhood} ${e.kind}`.toLowerCase().includes(q));
    }
    return out;
  };

  const sorted = (list) => {
    const geo = window.WA.Geo;
    if (state.sort === 'nearest') {
      return list.slice().sort((a, b) => {
        const da = geo.distanceTo(a), db = geo.distanceTo(b);
        if (da != null && db != null) return da - db;
        if (da != null) return -1;
        if (db != null) return 1;
        return 0;
      });
    }
    return list.slice().sort(geo.bySoonestThenDistance());
  };

  const results = () => sorted(applyFilters(picks()));

  /* ── The row (5d) ────────────────────────────────────────────
     The rail always prints something: a clock time, NOW when it has
     already started, or nothing rather than a guess. That single column
     is what makes the missing-date and missing-photo cases boring. */
  const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  /* An exhibition or a festival has a DATE but no door time, and the
     pipeline stores that as starts_at at midnight — so reading the clock
     off starts_at printed "00:00" on every one of them. That is the rail
     claiming a time we do not have, which 3a forbids outright: it must
     never print a time the source did not give.

     So a clock only appears when the source actually stated one
     (picks.time, or a starts_at that is not exactly midnight). Otherwise
     the rail falls back to the day — the same TON / SAT vocabulary the
     saved rows use — and to nothing at all when there is no date either.
     A dated-but-timeless row is still perfectly scannable; it just does
     not pretend the doors open at midnight. */
  /* "Date only" reaches us as a midnight timestamp, and WHICH midnight
     depends on the ingest: some build the day in local time (00:00+03:00),
     others store plain UTC midnight. Read in Europe/Tallinn those show up
     as 00:00 and as 02:00/03:00 respectively — which is why eleven
     exhibitions were sitting in the list claiming they start at three in
     the morning. Both are the absence of a time, not a time.

     picks.time is the pipeline's own extracted display time, so if that
     is set the source really did state one. Otherwise a timestamp landing
     exactly on midnight in either clock is treated as date-only. */
  const isMidnightUTC = (iso) => {
    const d = new Date(iso);
    return !isNaN(d) && d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  };

  const hasStatedTime = (e) => {
    if (real(e.time)) return true;
    if (!e.startsAt) return false;
    if (isMidnightUTC(e.startsAt)) return false;
    const m = doorsMinutes(e);
    return m != null && m !== 0;
  };

  const railFor = (e) => {
    const isToday = window.WA.when.isTonight(e);

    if (hasStatedTime(e)) {
      const m = doorsMinutes(e);
      const n = window.WA.Hours.cityNow();
      if (isToday && m <= n.minutes) return { time: 'NOW', now: true };
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      return { time: `${hh}:${mm}`, now: false };
    }

    if (isToday) return { time: 'TON', now: true };
    const key = window.WA.when.resolveKey(e);
    if (key) return { time: DAY_ABBR[new Date(`${key}T12:00:00Z`).getUTCDay()], now: false };
    return { time: '', now: false };
  };

  /* The pipeline writes literal placeholders when the LLM could not read
     a field — "Unknown", "TBA", "N/A", and 'other' for the neighbourhood
     bucket. Printing them is worse than printing nothing: 3a's rule is
     that a missing field is content, so the gap gets stated in words
     ("venue not yet named") rather than shown as a dead value. */
  const PLACEHOLDER = /^(unknown|tba|tbc|n\/a|none|null|other|-)$/i;
  const real = (v) => {
    const s = String(v == null ? '' : v).trim();
    return s && !PLACEHOLDER.test(s) ? s : '';
  };

  const metaFor = (e) => {
    const venue = real(e.venue);
    const area  = real(e.neighborhood);
    const price = UI().priceLabel ? UI().priceLabel(e) : '';
    const where = venue || (area ? '' : 'venue not yet named');
    return [real(e.kind), where, area, price].filter(Boolean).join(' · ');
  };

  const row = (e) => {
    const rail = railFor(e);
    const dist = window.WA.Geo.distanceLabel(e);
    const desc = e.description || e.quote || '';
    return `<li><a class="wa-row" href="venue.html?id=${esc(encodeURIComponent(e.id))}" data-row="${esc(e.id)}">
      <span class="wa-row__rail">
        <span class="wa-row__time${rail.now ? ' wa-row__time--now' : ''}">${esc(rail.time)}</span>
        <span class="wa-row__dist">${esc(dist)}</span>
      </span>
      <span class="wa-row__body">
        <span class="wa-row__title">${esc(e.title || '')}</span>
        ${desc ? `<span class="wa-row__desc">${esc(desc)}</span>` : ''}
        <span class="wa-row__meta">${esc(metaFor(e))}</span>
      </span>
    </a></li>`;
  };

  /* ── Empty state (3a) ────────────────────────────────────────
     Names the filter that emptied the list and offers the nearest thing
     that is not empty. "No results found" is banned copy. */
  const emptyState = () => {
    const city = CITY_LABEL();
    const widerWhen = applyFilters(picks().filter(e => true), null).length;
    /* What would come back if we dropped the narrowest filter? */
    const drops = [];
    if (state.kinds.size) drops.push({ label: 'Any kind', act: 'clear-kinds', n: sorted(applyFilters(picks(), 'kind')).length });
    if (state.within)     drops.push({ label: 'Any distance', act: 'clear-within', n: sorted(applyFilters(picks(), 'within')).length });
    if (state.free)       drops.push({ label: 'Include paid', act: 'clear-free', n: sorted(applyFilters(picks(), 'free')).length });
    if (state.doors !== 'any') drops.push({ label: 'Any door time', act: 'clear-doors', n: sorted(applyFilters(picks(), 'doors')).length });
    if (state.hideSeen)   drops.push({ label: 'Include seen', act: 'clear-seen', n: sorted(applyFilters(picks(), 'seen')).length });
    if (state.bounds)     drops.push({ label: 'Search everywhere', act: 'clear-bounds', n: sorted(applyFilters(picks(), 'bounds')).length });
    drops.sort((a, b) => b.n - a.n);
    const best = drops.find(d => d.n > 0);

    const anytime = picks().filter(e => window.WA.when.matches(e, 'all')).length;

    let title, body;
    if (best) {
      title = `Nothing ${WHEN_LABEL[state.when].toLowerCase()} in ${city} matches all of that.`;
      body  = `${best.label} brings back ${best.n} ${best.n === 1 ? 'thing' : 'things'}.`;
    } else if (state.when !== 'all' && anytime) {
      title = `Nothing filed for ${WHEN_LABEL[state.when].toLowerCase()} in ${city}.`;
      body  = `The sources went quiet, which happens. ${anytime} ${anytime === 1 ? 'thing is' : 'things are'} listed across other days.`;
    } else {
      title = `${city} has nothing listed yet.`;
      body  = `We read the sources hourly. Places are open regardless — Explore has them.`;
    }

    return `<div class="wa-empty">
      <p class="wa-empty__title">${esc(title)}</p>
      <p class="wa-empty__body">${esc(body)}</p>
      <div class="wa-empty__actions">
        ${best ? `<button class="wa-btn wa-btn--primary" type="button" data-act="${esc(best.act)}">${esc(best.label)}</button>` : ''}
        ${state.when !== 'all' ? `<button class="wa-btn" type="button" data-act="when-all">Any time</button>` : ''}
        <a class="wa-btn" href="./index.html">Explore</a>
      </div>
    </div>`;
  };

  /* ── Render ──────────────────────────────────────────────────── */
  const activeFilterCount = () =>
    (state.kinds.size ? 1 : 0) + (state.within ? 1 : 0) +
    (state.free ? 1 : 0) + (state.doors !== 'any' ? 1 : 0) + (state.hideSeen ? 1 : 0);

  const headline = (n) => {
    const kinds = [...state.kinds];
    const noun = kinds.length === 1 ? `${kinds[0]}${n === 1 ? '' : 's'}`
               : kinds.length > 1  ? kinds.join(' and ')
               : (n === 1 ? 'thing' : 'things');
    const whenWord = state.when === 'all' ? '' : ` ${WHEN_LABEL[state.when].toLowerCase()}`;
    return `${n} ${noun}${whenWord}`;
  };

  const subline = (n) => {
    const bits = [];
    if (state.within) {
      const mins = window.WA.Geo.walkMinutes(state.within);
      bits.push(`Within ${window.WA.Geo.format(state.within)} of you (${mins} min)`);
    }
    /* A viewport clip is a filter the reader cannot see in the chip row,
       so it has to be named here — an invisible filter is how a list
       goes quietly wrong. */
    if (state.bounds) bits.push('in this map area');
    bits.push(state.sort === 'nearest' ? 'nearest first' : 'soonest first');
    if (!n) bits.length = 0;
    return bits.join(' · ').toUpperCase();
  };

  let lastResults = [];

  const render = () => {
    const list = results();
    lastResults = list;

    $('results-title').textContent = list.length ? headline(list.length) : 'Nothing matches';
    $('results-sub').textContent   = subline(list.length);

    $('rows').innerHTML = list.length ? list.map(row).join('') : '';
    const pane = $('list-pane');
    const existing = pane.querySelector('.wa-empty');
    if (existing) existing.remove();
    if (!list.length) pane.insertAdjacentHTML('beforeend', emptyState());

    $('chip-where').textContent = CITY_LABEL();
    $('chip-when').textContent  = WHEN_LABEL[state.when] || 'Anytime';
    $('chip-what').textContent  = state.kinds.size ? [...state.kinds].join(', ') : 'Anything';
    [...document.querySelectorAll('#scope [data-slot]')].forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.slot === 'what' ? state.kinds.size > 0 : false)));

    const fc = activeFilterCount();
    const badge = $('filter-count');
    badge.hidden = !fc;
    badge.textContent = fc ? String(fc) : '';

    /* The key doubles as the way out of a viewport clip, so it has to say
       which job it is doing, and it stays visible while a clip is active. */
    const area = $('search-area');
    if (state.bounds) { area.hidden = false; area.textContent = 'Search everywhere'; }
    else if (area.textContent !== 'Search this area') { area.textContent = 'Search this area'; }

    writeParams();
    Pins.sync(list);
  };

  /* ── Map mode ────────────────────────────────────────────────
     A thin pin layer over the WA.MapTiles façade. map.js is not reused:
     it is built around the old Discover DOM, Mood and the Concierge,
     and 6e asks for pins to become time · distance labels with row
     pairing, which is a different component rather than a patch. */
  const Pins = (() => {
    let started = false, entries = [], activeId = '';

    const T = () => window.WA.MapTiles;

    const start = () => {
      if (started) return;
      started = true;
      const t = T();
      if (!t) return;
      t.init('map-canvas');
      t.onReady(() => { place(); fit(); });
      t.on && t.on('moveend', () => { $('search-area').hidden = false; });
    };

    const place = () => {
      const t = T();
      if (!t || !t.isReady || !t.isReady()) return;
      /* Mounted on the PANE, not inside the canvas host: MapLibre owns
         that subtree and rewrites it. */
      const pane = $('map-pane');
      let layer = pane.querySelector('.tonight-map__pins');
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'tonight-map__pins';
        pane.appendChild(layer);
      }
      layer.innerHTML = entries.map((e) => {
        const p = t.project(e.lng, e.lat);
        if (!p) return '';
        const rail = railFor(e);
        const dist = window.WA.Geo.distanceLabel(e);
        return `<button class="wa-pin${rail.now ? ' wa-pin--now' : ''}" type="button"
          data-pin="${esc(e.id)}" aria-current="${e.id === activeId}"
          style="left:${p.x}px;top:${p.y}px">
          <span>${esc(rail.time || '·')}</span>${dist ? `<span class="wa-pin__dist">${esc(dist)}</span>` : ''}
        </button>`;
      }).join('');
      /* State the coverage gap rather than implying the map shows the
         whole list. Only 27 of 46 picks resolve to a coordinate today,
         and on a filtered view it can be far fewer — "12 pins" next to
         151 rows reads as a map failure instead of a data one. */
      const n = entries.length;
      const total = lastResults.length;
      $('map-count').textContent = n === total
        ? `${n} ${n === 1 ? 'pin' : 'pins'}`
        : `${n} of ${total} placed`;
    };

    const fit = () => { const t = T(); if (t && t.fitToPicks) t.fitToPicks(entries); };

    return {
      sync(list) {
        entries = list.filter(e => window.WA.Geo.coordsFor(e));
        if (state.map) { start(); place(); }
      },
      open() { start(); place(); fit(); },
      focus(id) {
        activeId = id || '';
        place();
        const e = entries.find(x => x.id === activeId);
        const t = T();
        if (e && t && t.flyTo) t.flyTo(e.lng, e.lat);
      },
      refit: fit,
    };
  })();

  const setMap = (on) => {
    state.map = !!on;
    $('map-pane').hidden = !state.map;
    $('split').classList.toggle('tonight-split--map', state.map);
    $('toggle-map').setAttribute('aria-pressed', String(state.map));
    $('toggle-map-label').textContent = state.map ? 'List' : 'Map';
    if (state.map) Pins.open();
    writeParams();
  };

  /* ── Filter sheet (5c) ───────────────────────────────────────
     Every control prints its consequence, and the key says the outcome.
     Counts come from the same applyFilters chain the list uses, each
     skipping its own facet, so a chip's count is what you would get by
     choosing it — not a count of the current result. */
  const kindOptions = () => {
    const base = applyFilters(picks(), 'kind');
    const map = new Map();
    for (const e of base) {
      const k = String(e.kind || '').toLowerCase();
      if (k) map.set(k, (map.get(k) || 0) + 1);
    }
    /* A zero-count kind that is currently selected still shows, so you
       can see why the list is empty and turn it off. */
    for (const k of state.kinds) if (!map.has(k)) map.set(k, 0);
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };

  const sheetBody = () => {
    const kinds = kindOptions();
    const freeN = applyFilters(picks(), 'free').filter(isFreeish).length;
    const totalN = applyFilters(picks(), 'free').length;
    const seenN = applyFilters(picks(), 'seen').length - applyFilters(picks(), null).length;
    const mins = state.within ? window.WA.Geo.walkMinutes(state.within) : null;

    return `
      <div class="wa-field">
        <label class="wa-field__label" for="q">Search</label>
        <input class="wa-input" type="search" id="q" value="${esc(state.q)}"
               placeholder="Title, venue or area" autocomplete="off" spellcheck="false"
               style="width:100%" />
        <span class="wa-field__consequence" id="q-note">${
          state.q ? `${applyFilters(picks(), null).length} match “${esc(state.q)}”`
                  : 'Filters the list as you type'
        }</span>
      </div>

      <div class="wa-field">
        <span class="wa-field__label">Order</span>
        <div class="wa-segment">
          ${[['soonest', 'Soonest first'], ['nearest', 'Nearest first']].map(([v, label]) =>
            `<button class="wa-segment__opt" type="button" data-sort="${esc(v)}"
               aria-pressed="${state.sort === v}">${esc(label)}</button>`).join('')}
        </div>
        ${state.sort === 'nearest' && !window.WA.Geo.currentLoc()
          ? '<span class="wa-field__consequence">Needs your location — falls back to soonest until you allow it.</span>'
          : ''}
      </div>

      <div class="wa-field">
        <span class="wa-field__label">Kind</span>
        <div class="wa-chips">
          ${kinds.map(([k, n]) => `<button class="wa-chip" type="button" data-kind="${esc(k)}"
             aria-pressed="${state.kinds.has(k)}" data-count="${n}">${esc(k)}
             <span class="wa-chip__count">${n}</span></button>`).join('')
           || '<span class="wa-field__consequence">Nothing filed for this window.</span>'}
        </div>
      </div>

      <div class="wa-field">
        <span class="wa-field__label">How far you'll walk</span>
        <input class="wa-range" type="range" id="within" min="0" max="5000" step="250"
               value="${state.within}" aria-label="Maximum walking distance" />
        <span class="wa-field__consequence" id="within-note">${
          state.within
            ? `Up to ${esc(window.WA.Geo.format(state.within))} — about ${mins} minutes`
            : 'Anywhere in the city'
        }${window.WA.Geo.currentLoc() ? '' : ' · needs your location'}</span>
      </div>

      <div class="wa-field">
        <span class="wa-field__label">Doors after</span>
        <div class="wa-segment">
          ${['now', '21:00', '23:00', 'any'].map(v =>
            `<button class="wa-segment__opt" type="button" data-doors="${esc(v)}"
               aria-pressed="${state.doors === v}">${esc(DOORS_LABEL[v])}</button>`).join('')}
        </div>
        <span class="wa-field__consequence">${
          state.doors === 'any' ? 'Any start time' :
          `${applyFilters(picks(), null).length} start${applyFilters(picks(), null).length === 1 ? 's' : 's'} after ${esc(state.doors)}`
        }</span>
      </div>

      <div class="wa-field">
        <button class="wa-switch" type="button" data-toggle="free" aria-pressed="${state.free}">
          <span class="wa-switch__text">
            <span class="wa-switch__title">Free entry only</span>
            <span class="wa-switch__sub">${freeN} of ${WHEN_LABEL[state.when].toLowerCase()}'s ${totalN} ${totalN === 1 ? 'is' : 'are'} free</span>
          </span>
          <span class="wa-switch__track"><span class="wa-switch__thumb"></span></span>
        </button>
      </div>

      <div class="wa-field">
        <button class="wa-switch" type="button" data-toggle="hideSeen" aria-pressed="${state.hideSeen}">
          <span class="wa-switch__text">
            <span class="wa-switch__title">Hide things I've seen</span>
            <span class="wa-switch__sub">${window.WA.Seen.count()} opened or saved before</span>
          </span>
          <span class="wa-switch__track"><span class="wa-switch__thumb"></span></span>
        </button>
      </div>`;
  };

  const sheetFoot = () => {
    const n = results().length;
    const kinds = [...state.kinds];
    const noun = kinds.length === 1 ? `${kinds[0]}${n === 1 ? '' : 's'}` : (n === 1 ? 'thing' : 'things');
    return `<button class="wa-btn wa-btn--quiet" type="button" id="sheet-clear">Clear all</button>
            <button class="wa-btn wa-btn--primary" type="button" id="sheet-apply" style="flex:1">Show ${n} ${esc(noun)}</button>`;
  };

  const sheet = $('sheet');

  const openSheet = (which) => {
    if (which === 'where') { openWhere(); return; }
    if (which === 'when')  { openWhen(); return; }
    $('sheet-title').textContent = 'Filters';
    $('sheet-body').innerHTML = sheetBody();
    $('sheet-foot').innerHTML = sheetFoot();
    if (!sheet.open) sheet.showModal();
  };

  const openWhere = () => {
    $('sheet-title').textContent = 'Where?';
    $('sheet-body').innerHTML = (window.WA.CITIES || []).map((c) => {
      const on = c.id === window.WA.CITY;
      const n = (window.WA._catalogAll || []).filter(e => e.city === c.id && window.WA.when.isTonight(e)).length;
      const places = (window.WA._venuesAll || []).filter(v => v.city === c.id).length;
      const coverage = c.status === 'internal' ? 'internal testing'
        : `${n ? `${n} tonight` : 'nothing tonight'} · ${places} places`;
      return `<button class="wa-sheet__parked" type="button" data-city="${esc(c.id)}"
        style="margin-top:var(--s-2);${on ? 'border-color:var(--petrol);background:var(--petrol-tint)' : ''}">
        <img src="${esc(c.thumb)}" alt="" width="40" height="27" style="border-radius:6px;object-fit:cover" />
        <span class="wa-sheet__parked-label">${esc(c.label.charAt(0) + c.label.slice(1).toLowerCase())}</span>
        <span class="wa-sheet__parked-value">${esc(coverage)}</span>
      </button>`;
    }).join('');
    $('sheet-foot').innerHTML = sheetFoot();
    if (!sheet.open) sheet.showModal();
  };

  const openWhen = () => {
    $('sheet-title').textContent = 'When?';
    const opts = ['tonight', 'tomorrow', 'weekend', 'thisweek', 'all'];
    $('sheet-body').innerHTML = `<div class="wa-field"><span class="wa-field__label">When</span><div class="wa-chips">${
      opts.map(v => {
        const n = picks().filter(e => window.WA.when.matches(e, v)).length;
        return `<button class="wa-chip" type="button" data-when="${esc(v)}" aria-pressed="${state.when === v}" data-count="${n}">${esc(WHEN_LABEL[v])} <span class="wa-chip__count">${n}</span></button>`;
      }).join('')}</div></div>`;
    $('sheet-foot').innerHTML = sheetFoot();
    if (!sheet.open) sheet.showModal();
  };

  const refreshSheet = () => {
    const t = $('sheet-title').textContent;
    if (t === 'Filters') { $('sheet-body').innerHTML = sheetBody(); }
    else if (t === 'When?') { openWhen(); return; }
    $('sheet-foot').innerHTML = sheetFoot();
  };

  /* ── Events ──────────────────────────────────────────────────── */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const hit = (sel) => t.closest && t.closest(sel);

    if (hit('#open-filters')) { openSheet('filters'); return; }
    const slot = hit('[data-slot]');
    if (slot) { openSheet(slot.dataset.slot); return; }
    if (hit('#sheet-close') || hit('#sheet-apply')) { sheet.close(); return; }

    if (hit('#toggle-map'))  { setMap(!state.map); return; }
    if (hit('#show-list'))   { setMap(false); return; }

    /* "Search this area" clips the results to what the reader is looking
       at, which is the only reason to pan a map on a results screen. The
       same key releases it again — a filter with no visible way off is a
       trap, and once the clipped list is non-empty the empty state's
       "Search everywhere" never appears to offer one. */
    if (hit('#search-area')) {
      if (state.bounds) {
        state.bounds = null;
      } else {
        const m = window.WA.MapTiles && window.WA.MapTiles.getMap && window.WA.MapTiles.getMap();
        if (m) {
          const b = m.getBounds();
          state.bounds = { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() };
        }
      }
      render();
      return;
    }
    if (hit('[data-act="clear-bounds"]')) { state.bounds = null; render(); return; }

    const sortBtn = hit('[data-sort]');
    if (sortBtn) { state.sort = sortBtn.dataset.sort; refreshSheet(); render(); return; }

    const cityBtn = hit('[data-city]');
    if (cityBtn) { window.WA.setCity(cityBtn.dataset.city); return; }

    const kindBtn = hit('[data-kind]');
    if (kindBtn) {
      const k = kindBtn.dataset.kind;
      state.kinds.has(k) ? state.kinds.delete(k) : state.kinds.add(k);
      refreshSheet(); render(); return;
    }

    const whenBtn = hit('[data-when]');
    if (whenBtn) { state.when = whenBtn.dataset.when; refreshSheet(); render(); return; }

    const doorsBtn = hit('[data-doors]');
    if (doorsBtn) { state.doors = doorsBtn.dataset.doors; refreshSheet(); render(); return; }

    const toggle = hit('[data-toggle]');
    if (toggle) {
      const k = toggle.dataset.toggle;
      state[k] = !state[k];
      refreshSheet(); render(); return;
    }

    if (hit('#sheet-clear')) {
      state.kinds.clear(); state.within = 0; state.free = false;
      state.doors = 'any'; state.hideSeen = false;
      state.q = ''; state.bounds = null;
      /* Order lives in this sheet too, so "Clear all" resets it — it is
         not a filter, but leaving it set after a clear is a surprise. */
      state.sort = 'soonest';
      refreshSheet(); render(); return;
    }

    const act = hit('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'clear-kinds')  state.kinds.clear();
      if (a === 'clear-within') state.within = 0;
      if (a === 'clear-free')   state.free = false;
      if (a === 'clear-doors')  state.doors = 'any';
      if (a === 'clear-seen')   state.hideSeen = false;
      if (a === 'when-all')     state.when = 'all';
      render(); return;
    }

    const pin = hit('[data-pin]');
    if (pin) {
      Pins.focus(pin.dataset.pin);
      const r = document.querySelector(`[data-row="${CSS.escape(pin.dataset.pin)}"]`);
      if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    /* Opening a row is the signal "Hide things I've seen" reads. */
    const rowEl = hit('[data-row]');
    if (rowEl) window.WA.Seen.mark(rowEl.dataset.row);
  });

  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'q') {
      state.q = e.target.value.trim();
      /* A viewport clip plus a fresh query is how you get a confusing
         empty list, so searching releases the map bounds. */
      state.bounds = null;
      const note = $('q-note');
      if (note) {
        note.textContent = state.q
          ? `${applyFilters(picks(), null).length} match “${state.q}”`
          : 'Filters the list as you type';
      }
      $('sheet-foot').innerHTML = sheetFoot();
      render();
      return;
    }
    if (e.target && e.target.id === 'within') {
      state.within = parseInt(e.target.value, 10) || 0;
      const mins = state.within ? window.WA.Geo.walkMinutes(state.within) : null;
      const note = $('within-note');
      if (note) {
        note.textContent = (state.within
          ? `Up to ${window.WA.Geo.format(state.within)} — about ${mins} minutes`
          : 'Anywhere in the city')
          + (window.WA.Geo.currentLoc() ? '' : ' · needs your location');
      }
      $('sheet-foot').innerHTML = sheetFoot();
      render();
    }
  });

  /* Row → pin pairing, the cheap direction: hovering a row marks its pin
     without re-rendering the layer. */
  document.addEventListener('pointerover', (e) => {
    const r = e.target.closest && e.target.closest('[data-row]');
    if (r && state.map) Pins.focus(r.dataset.row);
  });

  /* ── Boot ────────────────────────────────────────────────────── */
  readParams();

  const boot = () => {
    render();
    if (state.map) setMap(true);
    window.WA.Geo.userLoc();
  };

  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', render);
  if (window.WA && window.WA.catalog && window.WA.catalog.length) boot();
})();
