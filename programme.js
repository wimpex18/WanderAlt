/* ============================================================
   programme.js — Programme: the week, day by day.
   ------------------------------------------------------------
   One field for search and for a sentence, one row of quick chips
   (when, then kinds), and one filter panel that is a sheet on phones
   and a sidebar from 1024. A title or a venue is searched as typed. A
   sentence ("free jazz tonight in Kalamaja") is read into those same
   filters, in the page (ask.js); only when the page cannot read it is
   the model asked, and it too only sets filters. Every count comes from
   the same filter chain as the list, each facet skipping itself.

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
    english: false, maxPrice: null,
    read: null,       /* the sentence's reading: { must, any, note, by } */
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
    if (skip !== 'english' && state.english) out = out.filter(e => (e.eventLanguages || []).includes('en'));
    if (skip !== 'price' && state.maxPrice != null) out = out.filter(e => R().isFree(e) || (e.priceMin != null && Number(e.priceMin) <= state.maxPrice));
    if (skip !== 'q' && state.q) out = out.filter(e => (state.read ? window.WA.Ask.match(e, state.read) : R().matches(e, state.q)));
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

  /* ── Quick chips: what the sentence set, then when, then kinds ── */
  const QUICK_WHEN = [['tonight', 'Tonight'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend'], ['thisweek', 'This week']];
  const kindCounts = () => {
    const pool = apply(base(), 'kind');
    const m = new Map();
    for (const e of base()) { const k = String(e.kind || '').toLowerCase(); if (R().real(k)) m.set(k, 0); }
    for (const e of pool) { const k = String(e.kind || '').toLowerCase(); if (m.has(k)) m.set(k, m.get(k) + 1); }
    for (const k of state.kinds) if (!m.has(k)) m.set(k, 0);
    return [...m.entries()].sort((a, b) => Number(state.kinds.has(b[0])) - Number(state.kinds.has(a[0])) || b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const quick = () => {
    const on = (label, act) => `<button class="wa-chip wa-chip--on" type="button" aria-pressed="true" data-act="${esc(act)}" aria-label="${esc(`Remove ${label}`)}">${esc(label)}${I('close')}</button>`;
    const set = [];
    if (state.day) set.push(on(R().dayName(state.day) === 'Tonight' ? 'Tonight' : `${R().dow(state.day)} ${R().dom(state.day)}`, 'clear-when'));
    if (state.free) set.push(on('Free', 'clear-free'));
    if (state.maxPrice != null) set.push(on(`Under €${state.maxPrice}`, 'clear-price'));
    if (state.english) set.push(on('In English', 'clear-english'));
    if (state.area) set.push(on(state.area, 'clear-area'));
    const whenPool = apply(base(), 'when');
    const when = state.day ? [] : QUICK_WHEN.map(([v, label]) => {
      const n = whenPool.filter(e => W().matches(e, v)).length;
      return `<button class="wa-chip" type="button" data-when="${esc(v)}" aria-pressed="${state.when === v}"${n || state.when === v ? '' : ' disabled'}>${esc(label)}</button>`;
    });
    const kinds = kindCounts().map(([k, n]) => `<button class="wa-chip" type="button" data-kind="${esc(k)}" aria-pressed="${state.kinds.has(k)}"${n === 0 && !state.kinds.has(k) ? ' disabled' : ''}>${window.WA.Picto.kind(k)}${esc(R().kindLabel(k))}</button>`);
    put($('quick'), [...set, ...when].join('') + '<span class="prog-quick__sep" aria-hidden="true"></span>' + kinds.join(''));
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
        <div class="wa-chips">${Array.from({ length: 7 }, (_, i) => W().keyPlus(i)).map(k => {
          const n = whenPool.filter(e => W().isOnDate(e, k)).length;
          return `<button class="wa-chip" type="button" data-day="${esc(k)}" aria-pressed="${state.day === k}"${n || state.day === k ? '' : ' disabled'}>${esc(k === W().todayKey() ? 'Today' : `${R().dow(k)} ${R().dom(k)}`)} <span class="wa-chip__n">${n}</span></button>`;
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

  const activeCount = () => (state.english ? 1 : 0) + (state.maxPrice != null ? 1 : 0) + (state.area ? 1 : 0) + (state.within ? 1 : 0) + (state.doors !== 'any' ? 1 : 0) +
    (state.free ? 1 : 0) + (state.hideSeen ? 1 : 0) + (state.followed ? 1 : 0) + (state.fresh ? 1 : 0) +
    (state.sort !== 'soonest' ? 1 : 0) + (!state.day && state.when !== 'all' ? 1 : 0);

  /* ── Empty state: name the filter, offer the drop that helps most ── */
  const emptyState = () => {
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
        body: 'Search reads English and original titles, venues, areas and tags, with or without Estonian letters.',
        actions: [{ act: 'clear-q', label: 'Clear search' }, { href: 'places.html', label: 'Search places' }] });
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
      body: 'The sources are read every six hours. The places are open regardless.', actions: [{ href: 'places.html', label: 'Places' }] });
  };

  /* ── Reading a sentence ─────────────────────────────────────
     A title or a venue is searched as typed. A sentence is read into
     the filters it names; what it set shows as chips, each removable,
     and "Search the words" puts everything back. The model is asked only
     when words are left that the page could not place and nothing
     matches without them. */
  const A = () => window.WA.Ask;
  let before = null, askTimer = 0, asked = '';
  const FILTER_KEYS = ['when', 'day', 'free', 'english', 'maxPrice'];
  const unread = () => {
    if (!state.read) return;
    if (before) { FILTER_KEYS.forEach(k => { state[k] = before[k]; }); state.kinds = new Set(before.kinds); }
    state.read = null; before = null;
  };
  const adopt = (p, by) => {
    if (!before) before = { ...Object.fromEntries(FILTER_KEYS.map(k => [k, state[k]])), kinds: [...state.kinds] };
    else { FILTER_KEYS.forEach(k => { state[k] = before[k]; }); state.kinds = new Set(before.kinds); }
    if (p.day) { state.day = p.day; state.when = 'all'; } else if (p.when) { state.when = p.when; state.day = ''; }
    if (p.kinds.length) state.kinds = new Set(p.kinds);
    if (p.free) state.free = true;
    if (p.english) state.english = true;
    if (p.maxPrice != null) state.maxPrice = p.maxPrice;
    state.read = { must: p.must, any: p.any, note: p.note || '', by };
  };
  const count = () => apply(base()).length;
  const literal = (q) => base().filter(e => R().matches(e, q)).length;

  const onQuery = (raw, now) => {
    const q = String(raw || '').trim();
    state.q = q;
    $('q-clear').hidden = !q;
    $('ask-try').hidden = !!q || document.activeElement !== $('q');
    clearTimeout(askTimer);
    unread();
    if (q && A().isQuestion(q)) {
      const p = A().local(q);
      adopt(p, 'page');
      const strict = count();
      if (!strict) {
        /* Unplaced words that match nothing are dropped before giving up. */
        if (state.read.must.length) state.read = { ...state.read, any: [...state.read.any, ...state.read.must], must: [] };
        if (!count() && literal(q)) unread();
        /* Only then is the model asked, and only about this sentence once. */
        if (p.must.length && asked !== q) askTimer = setTimeout(() => ask(q, p), now ? 0 : 900);
      }
    }
    render();
  };

  const ask = async (q, mine) => {
    asked = q;
    const p = await A().remote(q);
    if (!p || state.q !== q) return;
    unread();
    adopt(p, 'model');
    if (!count() && state.read.must.length) state.read = { ...state.read, any: [...state.read.any, ...state.read.must], must: [] };
    /* The model's reading must find something, or the page's stands. */
    if (!count()) { unread(); adopt(mine, 'page'); if (!count()) state.read = { ...state.read, any: [...state.read.any, ...state.read.must], must: [] }; if (!count() && literal(q)) unread(); }
    render();
  };

  const askNote = () => {
    const n = $('ask-note');
    if (!state.read) { n.hidden = true; n.innerHTML = ''; return; }
    /* Plain words for what the sentence set: "Gigs tonight with “jazz”". */
    const words = [...state.read.must, ...state.read.any].slice(0, 3).map(w => `“${w}”`).join(', ');
    const what = state.kinds.size ? [...state.kinds].map(k => R().kindLabel(k)).join(', ') : 'Anything';
    const when = state.day ? `on ${R().dateShort(state.day)}` : state.when !== 'all' ? WHEN[state.when].toLowerCase() : '';
    const text = state.read.note || [what, when, words ? `with ${words}` : ''].filter(Boolean).join(' ');
    n.hidden = false;
    n.innerHTML = `${state.read.by === 'model' ? I('ai') : ''}<span>${esc(text)}</span><button type="button" data-act="undo-read">Search the words</button>`;
  };

  const TRY = ['Jazz tonight', 'Free art this weekend', 'Club night in Kalamaja', 'Talks in English'];
  const tryShow = () => {
    const t = $('ask-try');
    if (state.q) { t.hidden = true; return; }
    t.innerHTML = TRY.map(x => `<button class="wa-chip" type="button" data-try="${esc(x)}">${I('ai')}${esc(x)}</button>`).join('');
    t.hidden = false;
  };

  /* ── Render ─────────────────────────────────────────────────── */
  const summary = (n) => {
    const bits = [];
    if (state.day) bits.push(R().dayName(state.day) === 'Tonight' ? 'tonight' : `on ${R().dateShort(state.day)}`);
    else if (state.when !== 'all') bits.push(WHEN[state.when].toLowerCase());
    if (state.kinds.size) bits.push([...state.kinds].map(k => R().kindLabel(k).toLowerCase()).join(', '));
    if (state.area) bits.push(`in ${state.area}`);
    if (state.q && !state.read) bits.push(`matching “${state.q}”`);
    bits.push(state.sort === 'nearest' && G().currentLoc() ? 'nearest first' : 'soonest first');
    put($('summary'), `<strong>${n} ${n === 1 ? 'listing' : 'listings'}</strong> ${esc(bits.join(' · '))}`);
  };

  /* Nearest order is one flat list; soonest order groups by day. */
  const listHtml = (list) => {
    if (!list.length) return emptyState();
    if (state.sort === 'nearest' && G().currentLoc()) return `<ul class="wa-rows">${list.map(e => R().row(e, { day: true, since })).join('')}</ul>`;
    return R().grouped(list, { since });
  };

  /* Write markup only when it changed, so an unchanged list keeps its
     pictures and scroll position instead of being rebuilt. The last string
     is remembered on the element, so everything that fills #list, #aside,
     #sheet-body, #sheet-foot, #quick and #summary goes through here. */
  const put = (el, html) => { if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; } };

  /* A tap answers in the same frame with what is small (the chips, the
     count, the summary). The list and the panel, which are large, follow
     in the next task; taps that arrive meanwhile are drawn once. */
  let bigFrame = 0, latest = [];
  const drawBig = () => {
    bigFrame = 0;
    const list = latest;
    put($('list'), listHtml(list));
    put($('aside'), panel());
    const sheet = $('sheet');
    if (sheet && sheet.open) { put($('sheet-body'), panel()); put($('sheet-foot'), foot(list.length)); }
  };
  const render = () => {
    const list = latest = results();
    quick();
    askNote();
    summary(list.length);
    const fc = activeCount();
    $('filter-count').hidden = !fc;
    $('filter-count').textContent = fc ? String(fc) : '';
    if (!bigFrame) bigFrame = requestAnimationFrame(() => setTimeout(drawBig, 0));
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
      put($('sheet-body'), panel());
      put($('sheet-foot'), foot(results().length));
      sheet().showModal();
      return;
    }
    if (hit('#sheet-close') || hit('#sheet-apply')) { sheet().close(); return; }
    if (hit('#q-clear')) { unread(); state.q = ''; $('q').value = ''; $('q-clear').hidden = true; render(); $('q').focus(); return; }
    const tr = hit('[data-try]');
    if (tr) { $('q').value = tr.dataset.try; onQuery(tr.dataset.try, true); $('ask-try').hidden = true; return; }

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
      Object.assign(state, { q: '', day: '', when: 'all', area: '', sort: 'soonest', within: 0, doors: 'any', free: false, hideSeen: false, followed: false, fresh: false, english: false, maxPrice: null, read: null });
      before = null; clearTimeout(askTimer);
      state.kinds.clear(); $('q').value = ''; $('q-clear').hidden = true; render(); return;
    }
    const act = hit('[data-act]');
    if (act) {
      const x = act.dataset.act;
      if (x === 'clear-q') { state.read = null; before = null; clearTimeout(askTimer); state.q = ''; $('q').value = ''; $('q-clear').hidden = true; }
      if (x === 'clear-kinds') state.kinds.clear();
      if (x === 'clear-area') state.area = '';
      if (x === 'clear-when') { state.day = ''; state.when = 'all'; }
      if (x === 'clear-free') state.free = false;
      if (x === 'clear-price') state.maxPrice = null;
      if (x === 'clear-english') state.english = false;
      if (x === 'undo-read') { unread(); asked = state.q; }
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
    if (e.target.id === 'q') { onQuery(e.target.value, false); return; }
    if (e.target.matches && e.target.matches('[data-within]')) {
      state.within = parseInt(e.target.value, 10) || 0;
      if (state.within) G().userLoc();
      document.querySelectorAll('[data-within-note]').forEach(n => { n.textContent = withinNote(); });
      /* Redraw the list but leave the slider being dragged alone. */
      const list = latest = results();   /* a pending drawBig must not paint older results over this */
      summary(list.length);
      put($('list'), listHtml(list));
      quick();
      if (sheet() && sheet().open) put($('sheet-foot'), foot(list.length));
      write();
    }
  });
  document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('[data-within]')) render(); });
  document.addEventListener('submit', (e) => { if (e.target.id === 'search-form') { e.preventDefault(); onQuery($('q').value, true); $('q').blur(); } });
  document.addEventListener('focusin', (e) => { if (e.target.id === 'q') tryShow(); });
  document.addEventListener('focusout', (e) => { if (e.target.id === 'q') setTimeout(() => { if (document.activeElement !== $('q')) $('ask-try').hidden = true; }, 150); });

  /* ── Boot ───────────────────────────────────────────────────── */
  read();
  const boot = () => { if (state.q) onQuery(state.q, true); else render(); R().locateIfGranted(); };
  const pre = () => {
    $('q').value = state.q;
    $('q-clear').hidden = !state.q;
    put($('list'), R().skelRows(6));
    if (new URLSearchParams(location.search).get('focus') === 'search') $('q').focus();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pre, { once: true }); else pre();
  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', render);
  document.addEventListener('wa:follows-changed', render);
})();
