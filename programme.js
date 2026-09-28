/* ============================================================
   programme.js — Programme: the week, day by day.
   ------------------------------------------------------------
   Search, a seven-day strip (a bar for how busy each day is), kind
   chips, and one filter panel that is a sheet on phones and a sidebar
   from 1024. Every count comes from the same filter chain as the list,
   each facet skipping itself, so a count never disagrees with what
   choosing it would show.

   URL: ?q ?date ?time ?cat ?area ?sort ?within ?new=1 ?focus=search
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const G = () => window.WA.Geo;
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n, c) => window.WA.Icon(n, c);

  const state = {
    q: '', day: '', when: 'all', kinds: new Set(), area: '',
    sort: 'soonest', within: 0, doors: 'any', free: false,
    hideSeen: false, followed: false, fresh: false,
  };
  const WHEN = { tonight: 'Tonight', tomorrow: 'Tomorrow', weekend: 'This weekend', thisweek: 'This week', all: 'Everything ahead' };
  const DOORS = { any: 'Any time', now: 'From now', '21:00': 'After 21:00', '23:00': 'After 23:00' };

  /* ── URL ───────────────────────────────────────────────────── */
  const read = () => {
    const sp = new URLSearchParams(location.search);
    if (/^\d{4}-\d{2}-\d{2}$/.test(sp.get('date') || '')) state.day = sp.get('date');
    const t = sp.get('time') === 'anytime' ? 'all' : sp.get('time');
    if (t && WHEN[t]) state.when = t;
    if (sp.get('q')) state.q = sp.get('q');
    if (sp.get('cat')) sp.get('cat').split(',').filter(Boolean).forEach(c => state.kinds.add(c.toLowerCase()));
    if (sp.get('area')) state.area = sp.get('area');
    if (sp.get('sort') === 'nearest') state.sort = 'nearest';
    if (sp.get('within')) state.within = G().parseWithin(sp.get('within'));
    if (sp.get('new') === '1') state.fresh = true;
  };
  const write = () => {
    const sp = new URLSearchParams();
    if (state.q) sp.set('q', state.q);
    if (state.day) sp.set('date', state.day);
    else if (state.when !== 'all') sp.set('time', state.when);
    if (state.kinds.size) sp.set('cat', [...state.kinds].join(','));
    if (state.area) sp.set('area', state.area);
    if (state.sort !== 'soonest') sp.set('sort', state.sort);
    if (state.within) sp.set('within', String(state.within));
    if (state.fresh) sp.set('new', '1');
    const qs = sp.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  };

  /* ── The filter chain ──────────────────────────────────────── */
  const since = R().previousVisit();
  const doorsPass = (e) => {
    if (state.doors === 'any') return true;
    const m = G().startMinutes(e);
    if (m == null) return false;
    if (state.doors === 'now') return !W().isTonight(e) || m >= window.WA.Hours.cityNow().minutes || R().isLive(e);
    const [h, mm] = state.doors.split(':').map(Number);
    return m >= h * 60 + mm;
  };

  const apply = (list, skip) => {
    let out = list;
    if (skip !== 'when') {
      out = state.day ? out.filter(e => W().isOnDate(e, state.day)) : out.filter(e => W().matches(e, state.when));
    }
    if (skip !== 'kind' && state.kinds.size) out = out.filter(e => state.kinds.has(String(e.kind || '').toLowerCase()));
    if (skip !== 'area' && state.area) out = out.filter(e => R().areaOf(e) === state.area);
    if (skip !== 'free' && state.free) out = out.filter(R().isFree);
    if (skip !== 'doors') out = out.filter(doorsPass);
    if (skip !== 'within' && state.within) out = G().withinFilter(out, state.within);
    if (skip !== 'seen' && state.hideSeen) out = window.WA.Seen.filter(out);
    if (skip !== 'followed' && state.followed) out = out.filter(R().isFollowed);
    if (skip !== 'fresh' && state.fresh) out = out.filter(e => R().isNewSince(e, since));
    if (skip !== 'q' && state.q) out = out.filter(e => R().matches(e, state.q));
    return out;
  };

  const sorted = (list) => {
    if (state.sort === 'nearest' && G().currentLoc()) {
      return list.slice().sort((a, b) => {
        const da = G().distanceTo(a), db = G().distanceTo(b);
        if (da != null && db != null) return da - db;
        return da != null ? -1 : db != null ? 1 : 0;
      });
    }
    return list.slice().sort(G().bySoonestThenDistance());
  };
  const base = () => R().live();
  const results = () => sorted(apply(base()));

  /* ── The seven-day strip ──────────────────────────────────── */
  const week = () => {
    const pool = apply(base(), 'when');
    const days = Array.from({ length: 7 }, (_, i) => {
      const key = W().keyPlus(i);
      return { key, n: pool.filter(e => W().isOnDate(e, key)).length, i };
    });
    const peak = Math.max(1, ...days.map(d => d.n));
    $('week').innerHTML = days.map(d => `<button class="wa-week7__day${d.n ? '' : ' wa-week7__day--empty'}" type="button"
        data-day="${esc(d.key)}" aria-pressed="${state.day === d.key}"
        aria-label="${esc(`${R().dayName(d.key)}, ${R().dateShort(d.key)}: ${d.n} listed`)}">
        <span class="wa-week7__n">${d.n || ''}</span>
        <span class="wa-week7__bar" style="height:${d.n ? Math.max(3, Math.round(d.n / peak * 22)) : 0}px"></span>
        <span class="wa-week7__dow">${esc(d.i === 0 ? 'Today' : R().dow(d.key))}</span>
        <span class="wa-week7__dom">${esc(String(R().dom(d.key)))}</span>
      </button>`).join('');
  };

  /* ── Kind chips ────────────────────────────────────────────── */
  const kindCounts = () => {
    const pool = apply(base(), 'kind');
    const m = new Map();
    for (const e of base()) { const k = String(e.kind || '').toLowerCase(); if (R().real(k)) m.set(k, 0); }
    for (const e of pool) { const k = String(e.kind || '').toLowerCase(); if (m.has(k)) m.set(k, m.get(k) + 1); }
    for (const k of state.kinds) if (!m.has(k)) m.set(k, 0);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const kinds = () => {
    const all = apply(base(), 'kind').length;
    $('kinds').innerHTML = `<button class="wa-chip" type="button" data-kind="" aria-pressed="${!state.kinds.size}">All <span class="wa-chip__n">${all}</span></button>` +
      kindCounts().map(([k, n]) => `<button class="wa-chip" type="button" data-kind="${esc(k)}" aria-pressed="${state.kinds.has(k)}"${n === 0 && !state.kinds.has(k) ? ' disabled' : ''}>
        ${window.WA.Picto.kind(k)}${esc(R().kindLabel(k))} <span class="wa-chip__n">${n}</span></button>`).join('');
  };

  /* ── The filter panel (sheet on phones, sidebar on desktop) ── */
  const areaCounts = () => {
    const pool = apply(base(), 'area');
    const m = new Map();
    for (const e of pool) { const a = R().areaOf(e); if (a) m.set(a, (m.get(a) || 0) + 1); }
    if (state.area && !m.has(state.area)) m.set(state.area, 0);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const panel = () => {
    const whenPool = apply(base(), 'when');
    const freeN = apply(base(), 'free').filter(R().isFree).length;
    const follows = window.WA.Follows ? window.WA.Follows.keys().length : 0;
    const fb = apply(base(), 'followed');
    const hasLoc = !!G().currentLoc();
    return `
      <div class="wa-field">
        <span class="wa-field__label">When</span>
        <div class="wa-chips">${Object.keys(WHEN).map(v => {
          const n = whenPool.filter(e => W().matches(e, v)).length;
          return `<button class="wa-chip" type="button" data-when="${esc(v)}" aria-pressed="${!state.day && state.when === v}"${n || state.when === v ? '' : ' disabled'}>${esc(WHEN[v])} <span class="wa-chip__n">${n}</span></button>`;
        }).join('')}</div>
      </div>
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
        ${state.sort === 'nearest' && !hasLoc ? '<span class="wa-field__consequence">Needs your location. Until you allow it, the list stays soonest first.</span>' : ''}
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
      <div class="wa-field">
        <button class="wa-switch" type="button" data-toggle="free" aria-pressed="${state.free}">
          <span class="wa-switch__text"><span class="wa-switch__title">Free entry</span><span class="wa-switch__sub">${freeN} free in this view</span></span>
          <span class="wa-switch__track"></span>
        </button>
        <button class="wa-switch" type="button" data-toggle="hideSeen" aria-pressed="${state.hideSeen}">
          <span class="wa-switch__text"><span class="wa-switch__title">Hide what I've opened</span><span class="wa-switch__sub">${window.WA.Seen.count()} opened or saved before</span></span>
          <span class="wa-switch__track"></span>
        </button>
        <button class="wa-switch" type="button" data-toggle="followed" aria-pressed="${state.followed}"${follows || state.followed ? '' : ' disabled'}>
          <span class="wa-switch__text"><span class="wa-switch__title">Only places I follow</span><span class="wa-switch__sub">${follows
            ? `${fb.filter(R().isFollowed).length} of ${fb.length} from ${follows} you follow` : 'Follow a venue from its page to use this'}</span></span>
          <span class="wa-switch__track"></span>
        </button>
        ${since ? `<button class="wa-switch" type="button" data-toggle="fresh" aria-pressed="${state.fresh}">
          <span class="wa-switch__text"><span class="wa-switch__title">New since my last visit</span><span class="wa-switch__sub">${apply(base(), 'fresh').filter(e => R().isNewSince(e, since)).length} arrived since</span></span>
          <span class="wa-switch__track"></span>
        </button>` : ''}
      </div>
      <div class="wa-field"><button class="wa-btn wa-btn--quiet wa-btn--sm" type="button" data-clear style="justify-self:start;padding:0">Clear all filters</button></div>`;
  };
  const withinNote = () => (state.within
    ? `Up to ${G().format(state.within)}, about ${G().walkMinutes(state.within)} min on foot`
    : 'Anywhere in the city') + (G().currentLoc() ? '' : '. Needs your location');

  const activeCount = () => (state.area ? 1 : 0) + (state.within ? 1 : 0) + (state.doors !== 'any' ? 1 : 0) +
    (state.free ? 1 : 0) + (state.hideSeen ? 1 : 0) + (state.followed ? 1 : 0) + (state.fresh ? 1 : 0) +
    (state.sort !== 'soonest' ? 1 : 0) + (!state.day && state.when !== 'all' ? 1 : 0);

  /* ── Empty state: name the filter, offer the drop that helps most ── */
  const emptyState = () => {
    const drops = [];
    const add = (on, label, act, skip) => { if (on) drops.push({ label, act, n: apply(base(), skip).length }); };
    add(state.q, `Clear “${state.q}”`, 'clear-q', 'q');
    add(state.kinds.size, 'Any kind', 'clear-kinds', 'kind');
    add(state.area, 'Anywhere in the city', 'clear-area', 'area');
    add(state.day || state.when !== 'all', 'Any day', 'clear-when', 'when');
    add(state.free, 'Include paid', 'clear-free', 'free');
    add(state.doors !== 'any', 'Any start time', 'clear-doors', 'doors');
    add(state.within, 'Any distance', 'clear-within', 'within');
    add(state.hideSeen, "Include what I've opened", 'clear-seen', 'seen');
    add(state.followed, 'Every source', 'clear-followed', 'followed');
    add(state.fresh, 'Not only new', 'clear-fresh', 'fresh');
    drops.sort((a, b) => b.n - a.n);
    const best = drops.find(d => d.n > 0);
    if (state.q && drops.length === 1) {
      return R().empty({ icon: 'search', title: `Nothing listed matches “${state.q}”.`,
        body: 'Search reads English and original titles, venues, areas and tags, with or without Estonian letters.',
        actions: [{ act: 'clear-q', label: 'Clear the search' }, { href: 'places.html', label: 'Search places instead' }] });
    }
    if (best) {
      return R().empty({ icon: 'filter', title: 'Nothing matches all of that.',
        body: `${best.label} brings back ${best.n} ${best.n === 1 ? 'listing' : 'listings'}.`,
        actions: [{ act: best.act, label: best.label }, { act: 'clear-all', label: 'Clear everything' }] });
    }
    return R().empty({ icon: 'calendar', title: `Nothing is listed in ${R().cityName()} for the coming days.`,
      body: 'The sources are read every six hours. The places are open regardless.', actions: [{ href: 'places.html', label: 'Places' }] });
  };

  /* ── Render ─────────────────────────────────────────────────── */
  const summary = (n) => {
    const bits = [];
    if (state.day) bits.push(R().dayName(state.day) === 'Tonight' ? 'tonight' : `on ${R().dateShort(state.day)}`);
    else if (state.when !== 'all') bits.push(WHEN[state.when].toLowerCase());
    if (state.kinds.size) bits.push([...state.kinds].map(k => R().kindLabel(k).toLowerCase()).join(', '));
    if (state.area) bits.push(`in ${state.area}`);
    if (state.q) bits.push(`matching “${state.q}”`);
    bits.push(state.sort === 'nearest' && G().currentLoc() ? 'nearest first' : 'soonest first');
    $('summary').innerHTML = `<strong>${n} ${n === 1 ? 'listing' : 'listings'}</strong> ${esc(bits.join(' · '))}`;
  };

  /* Nearest order is one flat list; soonest order groups by day. */
  const listHtml = (list) => {
    if (!list.length) return emptyState();
    if (state.sort === 'nearest' && G().currentLoc()) return `<ul class="wa-rows">${list.map(e => R().row(e, { day: true, since })).join('')}</ul>`;
    return R().grouped(list, { since });
  };

  const render = () => {
    const list = results();
    week();
    kinds();
    summary(list.length);
    $('list').innerHTML = listHtml(list);
    const fc = activeCount();
    $('filter-count').hidden = !fc;
    $('filter-count').textContent = fc ? String(fc) : '';
    $('aside').innerHTML = panel();
    const sheet = $('sheet');
    if (sheet && sheet.open) { $('sheet-body').innerHTML = panel(); $('sheet-foot').innerHTML = foot(list.length); }
    $('to-map').href = `map.html${state.day === W().todayKey() || state.when === 'tonight' ? '' : state.when === 'weekend' ? '?when=weekend' : ''}`;
    stickyOffset();
    write();
  };

  const foot = (n) => `<button class="wa-btn wa-btn--primary wa-btn--wide" type="button" id="sheet-apply">Show ${n} ${n === 1 ? 'listing' : 'listings'}</button>`;

  /* Day headings stick under the controls, which stick under the top bar. */
  const stickyOffset = () => {
    const c = $('prog-controls');
    const h = c && getComputedStyle(c).position === 'sticky' ? c.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--sticky-extra', `${Math.round(h)}px`);
  };
  window.addEventListener('resize', stickyOffset);

  /* ── Events ─────────────────────────────────────────────────── */
  const sheet = () => $('sheet');
  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    if (hit('#open-filters')) {
      $('sheet-title').textContent = 'Filters';
      $('sheet-body').innerHTML = panel();
      $('sheet-foot').innerHTML = foot(results().length);
      sheet().showModal();
      return;
    }
    if (hit('#sheet-close') || hit('#sheet-apply')) { sheet().close(); return; }
    if (hit('#q-clear')) { state.q = ''; $('q').value = ''; $('q-clear').hidden = true; render(); $('q').focus(); return; }

    const d = hit('[data-day]');
    if (d) { state.day = state.day === d.dataset.day ? '' : d.dataset.day; render(); return; }
    const k = hit('[data-kind]');
    if (k) {
      const v = k.dataset.kind;
      if (!v) state.kinds.clear();
      else if (state.kinds.has(v)) state.kinds.delete(v); else state.kinds.add(v);
      render(); return;
    }
    const w = hit('[data-when]');
    if (w) { state.when = w.dataset.when; state.day = ''; render(); return; }
    const a = hit('[data-area]');
    if (a) { state.area = a.dataset.area; render(); return; }
    const s = hit('[data-sort]');
    if (s) {
      state.sort = s.dataset.sort;
      if (state.sort === 'nearest') G().userLoc().then(render);
      render(); return;
    }
    const dr = hit('[data-doors]');
    if (dr) { state.doors = dr.dataset.doors; render(); return; }
    const t = hit('[data-toggle]');
    if (t) { state[t.dataset.toggle] = !state[t.dataset.toggle]; render(); return; }
    if (hit('[data-clear]') || hit('[data-act="clear-all"]')) {
      Object.assign(state, { q: '', day: '', when: 'all', area: '', sort: 'soonest', within: 0, doors: 'any', free: false, hideSeen: false, followed: false, fresh: false });
      state.kinds.clear(); $('q').value = ''; $('q-clear').hidden = true; render(); return;
    }
    const act = hit('[data-act]');
    if (act) {
      const x = act.dataset.act;
      if (x === 'clear-q') { state.q = ''; $('q').value = ''; $('q-clear').hidden = true; }
      if (x === 'clear-kinds') state.kinds.clear();
      if (x === 'clear-area') state.area = '';
      if (x === 'clear-when') { state.day = ''; state.when = 'all'; }
      if (x === 'clear-free') state.free = false;
      if (x === 'clear-doors') state.doors = 'any';
      if (x === 'clear-within') state.within = 0;
      if (x === 'clear-seen') state.hideSeen = false;
      if (x === 'clear-followed') state.followed = false;
      if (x === 'clear-fresh') state.fresh = false;
      render(); return;
    }
    const r = hit('[data-row]');
    if (r) window.WA.Seen.mark(r.dataset.row);
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') {
      state.q = e.target.value.trim();
      $('q-clear').hidden = !state.q;
      render();
      return;
    }
    if (e.target.matches && e.target.matches('[data-within]')) {
      state.within = parseInt(e.target.value, 10) || 0;
      if (state.within) G().userLoc();
      document.querySelectorAll('[data-within-note]').forEach(n => { n.textContent = withinNote(); });
      /* Redraw the list but leave the slider being dragged alone. */
      const list = results();
      summary(list.length);
      $('list').innerHTML = listHtml(list);
      week(); kinds();
      if (sheet() && sheet().open) $('sheet-foot').innerHTML = foot(list.length);
      write();
    }
  });
  document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('[data-within]')) render(); });
  document.addEventListener('submit', (e) => { if (e.target.id === 'search-form') { e.preventDefault(); $('q').blur(); } });

  /* ── Boot ───────────────────────────────────────────────────── */
  read();
  const boot = () => { render(); R().locateIfGranted(); };
  const pre = () => {
    $('q').value = state.q;
    $('q-clear').hidden = !state.q;
    $('list').innerHTML = R().skelRows(6);
    if (new URLSearchParams(location.search).get('focus') === 'search') $('q').focus();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pre, { once: true }); else pre();
  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', render);
  document.addEventListener('wa:follows-changed', render);
})();
