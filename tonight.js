/* ============================================================
   tonight.js — Tonight: results, map mode, filter sheet.
   ------------------------------------------------------------
   The capsule's three chips plus one filter sheet, whose key states the
   outcome. The map is a mode: below 1024 it replaces the list; from 1024
   it sits beside it. Pins are time · distance labels, paired both ways
   with their row.

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
    /* An exact YYYY-MM-DD from the density strip. When set it overrides
       `when`, because "Thursday" is a more specific answer than "this
       week" and the reader picked it deliberately. */
    day:    '',
    what:   'all',
    kinds:  new Set(),
    within: 0,
    doors:  'any',        /* any | now | 21:00 | 23:00 */
    free:   false,
    hideSeen: false,
    followed: false,
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

  /* ── URL contract ────────────────────────────────────────────
     Live: ?q ?cat ?time ?type ?sort ?id ?view=map ?within=
     Retired ?ai= ?nhood= #mood= are read and discarded, so old links
     still render a list. */
  const readParams = () => {
    const sp = new URLSearchParams(location.search);

    if (sp.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(sp.get('date'))) state.day = sp.get('date');
    /* Only known windows; "anytime" is the label people type for "all".
       An unknown value would leave the list on its skeleton. */
    const time = sp.get('time') === 'anytime' ? 'all' : sp.get('time');
    if (time && WHEN_LABEL[time]) state.when = time;
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
    /* A picked day is a filter, so it round-trips like one. */
    if (state.day)                sp.set('date', state.day);
    else if (state.when !== 'tonight') sp.set('time', state.when);
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

  /* ── Followed sources ────────────────────────────────────────
     A pick belongs to a followed source if either its venue or its handle
     is in WA.Follows: `?venue=` follows the venue name, and `?handle=`
     follows the venue name when the feed's picks share exactly one venue,
     else the raw handle. Follows.has() is city-scoped. */
  const isFollowed = (e) => {
    const F = window.WA.Follows;
    if (!F) return false;
    return F.has(e.venue) || F.has(e.handle);
  };

  const followCount = () => (window.WA.Follows ? window.WA.Follows.keys().length : 0);

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
    /* skip === 'when' is what the density strip passes: it needs the
       whole week under the OTHER filters, then counts each day itself. */
    let out = skip === 'when'
      ? list.slice()
      : state.day
        ? list.filter(e => window.WA.when.isOnDate(e, state.day))
        : list.filter(e => window.WA.when.matches(e, state.when));
    if (skip !== 'kind' && state.kinds.size) {
      out = out.filter(e => state.kinds.has(String(e.kind || '').toLowerCase()));
    }
    if (skip !== 'free' && state.free)      out = out.filter(isFreeish);
    if (skip !== 'doors')                   out = out.filter(doorsPass);
    if (skip !== 'within' && state.within)  out = geo.withinFilter(out, state.within);
    if (skip !== 'seen' && state.hideSeen)  out = window.WA.Seen.filter(out);
    if (skip !== 'followed' && state.followed) out = out.filter(isFollowed);
    if (skip !== 'bounds' && state.bounds) {
      const b = state.bounds;
      /* Unplaceable entries are dropped: "search this area" must match the
         map. The map bar states the coverage gap and the empty state offers
         "Search everywhere". */
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

  /* ── The row ─────────────────────────────────────────────────
     The rail always prints something: a clock, NOW, the day, or OPEN. */
  const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  /* A rail prints a clock only when the source stated one
     (WA.when.statedMinutes); a midnight timestamp is a date without a
     time. Otherwise the rail falls back to the day (TON / SAT), then OPEN. */
  const hasStatedTime = (e) => window.WA.when.statedMinutes(e) != null;

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

    /* TON is "dated today, no door time stated". Not "now", so not lime. */
    if (isToday) return { time: 'TON', now: false };
    const key = window.WA.when.resolveKey(e);
    if (key) return { time: DAY_ABBR[new Date(`${key}T12:00:00Z`).getUTCDay()], now: false };
    /* A place with filed hours says when it shuts (→02), or SHUT. */
    const h = e.openingHours && window.WA.Hours.rail(e.openingHours);
    if (h) return { time: h, now: h === '24H' || h.charAt(0) === '\u2192' };

    /* No hours, no time, no date: OPEN, meaning ongoing, not open now. */
    return { time: 'OPEN', now: false };
  };

  /* The pipeline writes placeholders ("Unknown", "TBA", "N/A", 'other')
     when the LLM could not read a field; the gap is stated in words
     instead of shown as a dead value. */
  const PLACEHOLDER = /^(unknown|tba|tbc|n\/a|none|null|other|-)$/i;
  const real = (v) => {
    const s = String(v == null ? '' : v).trim();
    return s && !PLACEHOLDER.test(s) ? s : '';
  };

  /* `areaInRail` is set when the rail has already taken the
     neighbourhood as its distance fallback, so the meta line drops it
     rather than printing the same word twice on one row. */
  const metaFor = (e, areaInRail) => {
    const venue = real(e.venue);
    const area  = real(e.neighborhood);
    const price = UI().priceLabel ? UI().priceLabel(e) : '';
    const where = venue || (area ? '' : 'venue not yet named');
    /* The desktop metadata line closes with provenance: "via fienta". */
    const via = real(e.handle) ? `via ${real(e.handle).replace(/^@/, '')}` : '';
    return [real(e.kind), where, areaInRail ? '' : area, price, via].filter(Boolean).join(' · ');
  };

  /* The optional far-right photo, desktop only (CSS hides it below
     1024). Emitted only for a real image, so a photoless row has no third
     grid cell. */
  const media = (e) => {
    const src = e.imageUrl ? window.WA.UI.safeUrl(e.imageUrl) : '';
    if (!src) return '';
    return `<span class="wa-row__media"><img class="wa-mark__photo" alt=""
      loading="lazy" decoding="async" data-mark="${esc(window.WA.Marks.markFor(e.kind))}"
      src="${esc(window.WA.img ? window.WA.img(src, 200) : src)}"></span>`;
  };

  const row = (e) => {
    const rail = railFor(e);
    /* Location refused: the distance slot degrades to the neighbourhood,
       so the rail keeps two lines and nothing reflows later. */
    const measured = window.WA.Geo.distanceLabel(e);
    const area     = real(e.neighborhood);
    const dist     = measured || area;
    /* A missing description gets a sentence, not blank space. */
    /* A line that only paraphrases the title falls through to the
       sentence below. */
    const venueWord = real(e.venue);
    const filed = window.WA.UI.descriptionOr(e.description, e.title)
               || window.WA.UI.descriptionOr(e.quote, e.title);
    const desc = filed ||
      (venueWord ? `No description filed. ${venueWord}'s own listing is one line long.`
                 : 'No description filed by the source.');
    return `<li><a class="wa-row" href="detail.html?id=${esc(encodeURIComponent(e.id))}" data-row="${esc(e.id)}">
      <span class="wa-row__rail">
        <span class="wa-row__time${rail.now ? ' wa-row__time--now' : ''}">${esc(rail.time)}</span>
        <span class="wa-row__dist">${esc(dist)}</span>
      </span>
      <span class="wa-row__body">
        <span class="wa-row__title">${esc(e.title || '')}</span>
        ${desc ? `<span class="wa-row__desc" data-desc>${esc(desc)}</span>` : ''}
        ${desc.length > 150 ? `<button class="wa-row__more" type="button" data-more>more</button>` : ''}
        <span class="wa-row__meta">${esc(metaFor(e, !measured && !!area))}</span>
      </span>
      ${media(e)}
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
    if (state.followed)   drops.push({ label: 'Any source', act: 'clear-followed', n: sorted(applyFilters(picks(), 'followed')).length });
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
      /* Thin city: admit the coverage gap and fall back to places. */
      const placeCount = (window.WA.venues || []).length;
      title = `${city} has no listings tonight.`;
      body  = placeCount
        ? `None of the sources filed anything. ${placeCount} places are open regardless.`
        : `Nothing has come in for this city yet.`;
    }

    return `<div class="wa-empty">
      <p class="wa-empty__title">${esc(title)}</p>
      <p class="wa-empty__body">${esc(body)}</p>
      <div class="wa-empty__actions">
        ${best ? `<button class="wa-btn wa-btn--primary" type="button" data-act="${esc(best.act)}">${esc(best.label)}</button>` : ''}
        ${state.when !== 'all' ? `<button class="wa-btn" type="button" data-act="when-all">Any time</button>` : ''}
        <!-- The two 3a names them: somewhere else to look, and another
             city. "Explore" alone made the reader go and find Places. -->
        <a class="wa-btn${best ? '' : ' wa-btn--primary'}" href="./index.html?scope=places">Show places</a>
        <button class="wa-btn" type="button" data-act="change-city">Change city</button>
      </div>
    </div>`;
  };

  /* ── Render ──────────────────────────────────────────────────── */
  const activeFilterCount = () =>
    (state.kinds.size ? 1 : 0) + (state.within ? 1 : 0) +
    (state.free ? 1 : 0) + (state.doors !== 'any' ? 1 : 0) + (state.hideSeen ? 1 : 0) +
    (state.followed ? 1 : 0);

  /* "Friday" reads better than a date, and "tomorrow" better than
     either when it is in fact tomorrow. */
  const DAY_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayWord = (key) => {
    const when = window.WA.when;
    if (key === when.todayKey()) return 'tonight';
    if (key === when.keyPlus(1))  return 'tomorrow';
    return DAY_FULL[new Date(`${key}T12:00:00Z`).getUTCDay()];
  };

  const headline = (n) => {
    const kinds = [...state.kinds];
    const noun = kinds.length === 1 ? `${kinds[0]}${n === 1 ? '' : 's'}`
               : kinds.length > 1  ? kinds.join(' and ')
               : (n === 1 ? 'thing' : 'things');
    /* An exact day from the density strip outranks the When window. */
    /* "on Friday" but "tomorrow" -- the preposition belongs before a
       weekday name and nowhere else. */
    const w = state.day ? dayWord(state.day) : '';
    const whenWord = state.day
      ? (w === 'tonight' || w === 'tomorrow' ? ` ${w}` : ` on ${w}`)
      : state.when === 'all' ? '' : ` ${WHEN_LABEL[state.when].toLowerCase()}`;
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
    renderDensity();

    $('results-title').textContent = list.length ? headline(list.length) : 'Nothing matches';
    $('results-sub').textContent   = subline(list.length);

    $('rows').innerHTML = list.length ? list.map(row).join('') : '';
    const pane = $('list-pane');
    const existing = pane.querySelector('.wa-empty');
    if (existing) existing.remove();
    if (!list.length) pane.insertAdjacentHTML('beforeend', emptyState());

    $('chip-where').textContent = CITY_LABEL();
    $('chip-when').textContent  = state.day
      ? dayWord(state.day).replace(/^./, c => c.toUpperCase())
      : (WHEN_LABEL[state.when] || 'Anytime');
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
     A thin pin layer over the WA.MapTiles façade. */
  const Pins = (() => {
    let started = false, entries = [], activeId = '', lastClusters = [], lastDrawerHtml = null;

    const T = () => window.WA.MapTiles;

    const start = () => {
      if (started) return;
      started = true;
      const t = T();
      if (!t) return;
      t.init('map-canvas');
      t.onReady(() => { place(); fit(); });
      /* The layer is positioned in projected pixel space, so pins redraw
         on `move` to stay glued during a drag. Only the pins: the drawer is
         on `moveend` (see placeDrawer). */
      t.on && t.on('move', placePins);
      t.on && t.on('moveend', () => { $('search-area').hidden = false; placeDrawer(); });
    };

    const placePins = () => {
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
      /* ── Clustering ────────────────────────────────────────
         Pins are ~90px DOM labels, so they cluster in projected pixel space
         (not MapLibre's GeoJSON clustering, which would break pin↔row
         pairing). Greedy single pass in list order, so a cluster's first pin
         is the soonest. The ACTIVE pin never clusters. */
      const CLUSTER_PX = 56;
      const placed = entries
        .map(e => ({ e, p: t.project(e.lng, e.lat) }))
        .filter(x => x.p);

      const clusters = [];
      for (const item of placed) {
        if (item.e.id === activeId) { clusters.push({ ...item, members: [item.e] }); continue; }
        const near = clusters.find(c =>
          c.e.id !== activeId &&
          Math.abs(c.p.x - item.p.x) < CLUSTER_PX &&
          Math.abs(c.p.y - item.p.y) < CLUSTER_PX);
        if (near) near.members.push(item.e);
        else clusters.push({ ...item, members: [item.e] });
      }
      /* A cluster button carries its INDEX into this array rather than a
         serialised id list, since ids carry no character-set guarantee. */
      lastClusters = clusters;

      layer.innerHTML = clusters.map((c, i) => {
        const { e, p, members } = c;
        /* A count, so it is mono and petrol. Never lime. */
        if (members.length > 1) {
          return `<button class="wa-pin wa-pin--cluster" type="button"
            data-cluster="${i}"
            aria-label="${esc(`${members.length} listings here`)}"
            style="left:${p.x}px;top:${p.y}px">
            <span>${members.length}</span>
          </button>`;
        }
        const rail = railFor(e);
        const dist = window.WA.Geo.distanceLabel(e);
        return `<button class="wa-pin${rail.now ? ' wa-pin--now' : ''}" type="button"
          data-pin="${esc(e.id)}" aria-current="${e.id === activeId}"
          style="left:${p.x}px;top:${p.y}px">
          <span>${esc(rail.time || '·')}</span>${dist ? `<span class="wa-pin__dist">${esc(dist)}</span>` : ''}
        </button>`;
      }).join('');
      /* State the coverage gap: not every pick resolves to a coordinate. */
      const n = entries.length;
      const total = lastResults.length;
      $('map-count').textContent = n === total
        ? `${n} ${n === 1 ? 'pin' : 'pins'}`
        : `${n} of ${total} placed`;
    };

    /* The drawer: the same row component as the list, clipped to what the
       viewport holds. Separate from placePins and bound to `moveend`:
       rewriting it per frame of a drag costs time and throws away focus
       and scroll. */
    const placeDrawer = () => {
      const t = T();
      if (!t || !t.isReady || !t.isReady()) return;
      const drawer = $('map-drawer');
      if (!drawer) return;
      /* Same source "search this area" reads, so the drawer and that
         button can never disagree about what "in view" means. */
      const m = t.getMap && t.getMap();
      const mb = m && m.getBounds && m.getBounds();
      const b = mb ? { west: mb.getWest(), east: mb.getEast(), south: mb.getSouth(), north: mb.getNorth() } : null;
      const inView = b
        ? entries.filter(e => {
            const c = window.WA.Geo.coordsFor(e);
            return c && c.lng >= b.west && c.lng <= b.east && c.lat >= b.south && c.lat <= b.north;
          })
        : entries;
      const html = inView.slice(0, 12).map(row).join('');
      /* Panning within the same set of visible picks is the common case,
         and rewriting identical markup would still blow away focus and
         scroll for no change on screen. */
      if (html === lastDrawerHtml) return;
      lastDrawerHtml = html;
      drawer.innerHTML = html;
    };

    const place = () => { placePins(); placeDrawer(); };

    /* The foot (bar + drawer) sits ON the canvas, so the camera is padded
       per side by what it actually covers, measured live (its height varies
       with the drawer). Capped so padding never exceeds the canvas: MapLibre
       cannot satisfy a fit whose padding leaves no room. */
    const fitPad = (base) => {
      const el = document.querySelector('.tonight-map');
      const foot = document.querySelector('.tonight-map__foot');
      if (!el || !foot) return base;
      const m = el.getBoundingClientRect();
      const f = foot.getBoundingClientRect();
      const covered = Math.max(0, Math.round(m.bottom - f.top));
      if (!covered) return base;
      const room = Math.max(0, Math.round(m.height) - base - 40);
      return { top: base, right: base, left: base, bottom: Math.min(base + covered, room) };
    };

    const fit = () => { const t = T(); if (t && t.fitToPicks) t.fitToPicks(entries, { padding: fitPad(48) }); };

    return {
      sync(list) {
        entries = list.filter(e => window.WA.Geo.coordsFor(e));
        if (state.map) { start(); place(); }
      },
      open() { start(); place(); fit(); },
      /* Zoom to exactly the picks the cluster was hiding. Reuses the
         same fit the mode already opens with, so there is no second
         camera implementation to keep in step -- only the ceiling
         differs: fitToPicks defaults to maxZoom 15, which is the right
         opening frame for a whole city but leaves venues on one street
         still clustered, so a cluster tap raises it to 17. */
      zoomTo(index) {
        const t = T();
        const c = lastClusters[Number(index)];
        const mine = c ? c.members : [];
        if (!mine.length || !t || !t.fitToPicks) return;
        t.fitToPicks(mine, { maxZoom: 17, padding: fitPad(72) });
      },
      focus(id) {
        activeId = id || '';
        /* Pins only: the drawer's contents do not depend on which pin is
           current, so rebuilding it here would drop focus and scroll on
           every row hover for no visible change. */
        placePins();
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
    /* On the body rather than #split, because the chips and Filters key
       live above the split and stick under the top bar in map mode. */
    document.body.classList.toggle('tonight-mapmode', state.map);
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

    /* Every kind the city has appears; zero counts are disabled below,
       never hidden. */
    /* A placeholder is not a kind (one pick carries the string "null"). */
    const NOT_A_KIND = /^(null|undefined|unknown|tba|tbc|n\/a|none|other|-)$/i;
    for (const e of picks()) {
      const k = String(e.kind || '').toLowerCase().trim();
      if (k && !NOT_A_KIND.test(k)) map.set(k, 0);
    }
    for (const e of base) {
      const k = String(e.kind || '').toLowerCase();
      if (k) map.set(k, (map.get(k) || 0) + 1);
    }
    for (const k of state.kinds) if (!map.has(k)) map.set(k, 0);
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };

  const sheetBody = () => {
    const kinds = kindOptions();
    const freeN = applyFilters(picks(), 'free').filter(isFreeish).length;
    const totalN = applyFilters(picks(), 'free').length;
    const seenN = applyFilters(picks(), 'seen').length - applyFilters(picks(), null).length;
    const mins = state.within ? window.WA.Geo.walkMinutes(state.within) : null;
    /* Counted off the same chain as every other option, minus this
       facet, so the switch's own sub can never disagree with the list
       it produces. */
    const followBase = applyFilters(picks(), 'followed');
    const followBaseN = followBase.length;
    const followedN = followBase.filter(isFollowed).length;
    const follows = followCount();

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
             aria-pressed="${state.kinds.has(k)}" data-count="${n}"
             ${n === 0 && !state.kinds.has(k) ? 'disabled aria-disabled="true"' : ''}><svg class="wa-chip__mark" aria-hidden="true"><use href="#wa-mark-${esc(window.WA.Marks.markFor(k))}"></use></svg>${esc(k)}
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
      </div>

      <div class="wa-field">
        <button class="wa-switch" type="button" data-toggle="followed"
                aria-pressed="${state.followed}"
                ${follows === 0 && !state.followed ? 'disabled aria-disabled="true"' : ''}>
          <span class="wa-switch__text">
            <span class="wa-switch__title">Only sources I follow</span>
            <span class="wa-switch__sub">${follows
              ? `${followedN} of ${followBaseN} ${followedN === 1 ? 'is' : 'are'} from ${follows} you follow`
              : 'Follow a venue from its page to use this'}</span>
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

    const cityRow = (c) => {
      const on = c.id === window.WA.CITY;
      const n = (window.WA._catalogAll || []).filter(e => e.city === c.id && window.WA.when.isTonight(e)).length;
      const places = (window.WA._venuesAll || []).filter(v => v.city === c.id).length;
      const coverage = c.status === 'internal'
        ? `internal testing · ${places} places`
        : `${n ? `${n} tonight` : 'nothing tonight'} · ${places} places`;
      return `<button class="wa-sheet__parked" type="button" data-city="${esc(c.id)}"
        style="margin-top:var(--s-2);${on ? 'border-color:var(--petrol);background:var(--petrol-tint)' : ''}">
        <img src="${esc(c.thumb)}" alt="" width="40" height="27" style="border-radius:6px;object-fit:cover" />
        <span class="wa-sheet__parked-label">${esc(c.label.charAt(0) + c.label.slice(1).toLowerCase())}</span>
        <span class="wa-sheet__parked-value">${esc(coverage)}</span>
      </button>`;
    };

    const all = window.WA.CITIES || [];
    const live = all.filter(c => c.status !== 'internal');
    const testing = all.filter(c => c.status === 'internal');

    /* Nearby / Around me, then Live cities, then the internal one below. */
    $('sheet-body').innerHTML = `
      <div class="wa-field">
        <span class="wa-field__label">Nearby</span>
        <button class="wa-sheet__parked" type="button" id="around-me" style="margin-top:var(--s-2)">
          <span class="wa-sheet__parked-label">Around me</span>
          <span class="wa-sheet__parked-value">${esc(
            state.sort === 'nearest' ? 'sorting by distance' : 'sort by how far you would walk')}</span>
        </button>
      </div>

      <div class="wa-field" style="margin-top:var(--s-5)">
        <span class="wa-field__label">Live cities</span>
        ${live.map(cityRow).join('')}
      </div>

      ${testing.length ? `<div class="wa-field" style="margin-top:var(--s-5)">
        <span class="wa-field__label">Not live yet</span>
        ${testing.map(cityRow).join('')}
      </div>` : ''}`;
    $('sheet-foot').innerHTML = sheetFoot();
    if (!sheet.open) sheet.showModal();
  };

  const openWhen = () => {
    $('sheet-title').textContent = 'When?';
    const opts = ['tonight', 'tomorrow', 'weekend', 'thisweek', 'all'];
    $('sheet-body').innerHTML = `<div class="wa-field"><span class="wa-field__label">When</span><div class="wa-chips">${
      opts.map(v => {
        const n = picks().filter(e => window.WA.when.matches(e, v)).length;
        return `<button class="wa-chip" type="button" data-when="${esc(v)}" aria-pressed="${state.when === v}" data-count="${n}"${n === 0 && state.when !== v ? ' disabled aria-disabled="true"' : ''}>${esc(WHEN_LABEL[v])} <span class="wa-chip__count">${n}</span></button>`;
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

    /* "Around me" is the one Where answer that is not a city: it asks
       for location and sorts by how far you would walk. Falls back to
       soonest if permission is refused, which is what the sort control
       already says it does. */
    if (hit('#around-me')) {
      state.sort = 'nearest';
      window.WA.Geo.userLoc().then(() => render());
      if (sheet.open) sheet.close();
      writeParams();
      render();
      return;
    }
    if (hit('#open-filters')) { openSheet('filters'); return; }
    const slot = hit('[data-slot]');
    if (slot) { openSheet(slot.dataset.slot); return; }
    if (hit('#sheet-close') || hit('#sheet-apply')) { sheet.close(); return; }

    if (hit('#toggle-map'))  { setMap(!state.map); return; }
    if (hit('#show-list'))   { setMap(false); return; }

    /* "Search this area" clips the results to the viewport; the same key
       releases it. */
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
      state.doors = 'any'; state.hideSeen = false; state.followed = false;
      state.q = ''; state.bounds = null; state.day = '';
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
      if (a === 'clear-followed') state.followed = false;
      if (a === 'when-all')     state.when = 'all';
      /* Not a filter reset -- it reopens the Where sheet, which is the
         one control that can actually change city. */
      if (a === 'change-city')  { openSheet('where'); return; }
      /* A picked day is a filter too; clearing filters must clear it or
         the empty state offers escapes that cannot fire. */
      if (a === 'clear-day')    state.day = '';
      render(); return;
    }

    /* The row is an <a>, so this stops the navigation it sits inside, and
       toggles back to "more" so an expanded row can re-collapse. */
    const more = hit('[data-more]');
    if (more) {
      e.preventDefault();
      e.stopPropagation();
      const d = more.parentElement.querySelector('[data-desc]');
      if (d) {
        const open = d.classList.toggle('wa-row__desc--open');
        more.textContent = open ? 'less' : 'more';
      }
      return;
    }

    /* A cluster is not a pick, so it does not open one -- it zooms to
       what it is hiding. The drawer below already lists these rows, so
       nothing here is reachable only by this tap. */
    const cluster = hit('[data-cluster]');
    if (cluster) {
      Pins.zoomTo(cluster.dataset.cluster);
      return;
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

  /* The strip is a filter as well as a picture. Clicking the selected
     day again clears back to the current When rather than stranding the
     reader on a single date with no visible way out. */
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-day]');
    if (!b) return;
    const key = b.dataset.day;
    /* Today is the "tonight" window rather than a date, so selecting it
       clears the exact-date filter instead of setting one. Otherwise the
       strip and the headline would count today two different ways. */
    if (b.classList.contains('wa-density__day--today')) {
      state.day = '';
      state.when = 'tonight';
    } else {
      state.day = (state.day === key) ? '' : key;
    }
    state.bounds = null;
    writeParams();
    render();
    if (state.map) mapMode.sync(lastResults);
  });

  /* Row → pin pairing, the cheap direction: hovering a row marks its pin
     without re-rendering the layer. */
  document.addEventListener('pointerover', (e) => {
    const r = e.target.closest && e.target.closest('[data-row]');
    if (r && state.map) Pins.focus(r.dataset.row);
  });

  /* ── The seven-day density strip ─────────────────────────────
     Says what a list cannot: Monday is dead, wait for Friday. Counts come
     from the same applyFilters chain as the list, minus the time facet.
     Clicking a day sets an exact-date filter; clicking the selected day
     again clears it back to the current When. */
  const densityDays = () => {
    const when = window.WA.when;
    const base = applyFilters(picks(), 'when');
    const today = when.todayKey();
    return Array.from({ length: 7 }, (_, i) => {
      const key = i === 0 ? today : when.keyPlus(i);
      /* TODAY counts with the same predicate the list uses for "tonight",
         not by date, so the bar matches the headline. */
      const n = i === 0
        ? base.filter(e => when.matches(e, 'tonight')).length
        : base.filter(e => when.isOnDate(e, key)).length;
      return {
        key, n, isToday: i === 0,
        label: i === 0 ? 'TODAY' : DAY_ABBR[new Date(`${key}T12:00:00Z`).getUTCDay()],
      };
    });
  };

  const renderDensity = () => {
    const host = $('density');
    if (!host) return;
    const days = densityDays();
    const peak = Math.max(...days.map(d => d.n), 1);
    /* 4px floor so one event reads as one event, not as none. A true
       zero gets no bar — that is the signal, not a rendering gap. */
    const H = 34;
    host.innerHTML = days.map(d => `
      <li><button class="wa-density__day${d.isToday ? ' wa-density__day--today' : ''}${d.n ? '' : ' wa-density__day--empty'}"
              type="button" data-day="${esc(d.key)}"
              aria-pressed="${d.isToday ? (!state.day && state.when === 'tonight') : state.day === d.key}"
              aria-label="${esc(`${d.n} on ${d.label.toLowerCase()}`)}">
        <span class="wa-density__count">${d.n}</span>
        <span class="wa-density__bar" style="height:${d.n ? Math.max(4, Math.round((d.n / peak) * H)) : 0}px"></span>
        <span class="wa-density__label">${esc(d.label)}</span>
      </button></li>`).join('');
  };

  /* ── Loading ─────────────────────────────────────────────────
     Six skeleton rows with the real row's shape (52px rail, then body),
     so the swap to live rows moves nothing. */
  const skeleton = () =>
    Array.from({ length: 6 }, () => `<li><span class="wa-row" aria-hidden="true">
      <span class="wa-row__rail"><span class="wa-skel wa-skel--rail"></span></span>
      <span class="wa-row__body">
        <span class="wa-skel wa-skel--title"></span>
        <span class="wa-skel wa-skel--line"></span>
        <span class="wa-skel wa-skel--line"></span>
      </span>
    </span></li>`).join('');

  /* ── Boot ────────────────────────────────────────────────────── */
  readParams();

  const boot = () => {
    render();
    if (state.map) setMap(true);
    window.WA.Geo.userLoc();
  };

  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', render);
  /* Following happens on another page, so refresh the sheet's counts on
     return via bfcache. */
  document.addEventListener('wa:follows-changed', () => { refreshSheet(); render(); });
  if (window.WA && window.WA.catalog && window.WA.catalog.length) {
    boot();
  } else {
    /* Nothing to show yet, and the list is the whole page. */
    $('rows').innerHTML = skeleton();
  }
})();
