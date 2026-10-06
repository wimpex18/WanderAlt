/* Now: direct search, shared discovery filters, a compact walk disclosure,
   then Events/Places. Explicit empty days stay selected. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const G = () => window.WA.Geo;
  const M = () => window.WA.Moods;
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n, c) => window.WA.Icon(n, c);

  const visit = window.WA.R.visit();

  const nowMin = () => window.WA.Hours.cityNow().minutes;
  const isLate = () => { const m = nowMin(); return m >= 21 * 60 + 30 || m < 5 * 60; };

  const sortSoon = (list) => list.slice().sort(G().byDateThenSoonest());

  /* ── Hero ───────────────────────────────────────────────────── */
  const clockText = () => {
    const k = W().todayKey();
    const m = window.WA.Hours.cityNow().minutes;
    return `${R().dateShort(k)} · ${window.WA.Hours.clock(m)}${heroCount ? ` · ${heroCount}` : ''}`;
  };

  let heroCount = '';
  const hero = (tonight, liveNow, next) => {
    $('hero-kicker').textContent = R().cityName();
    const t = $('hero-title');
    const n = tonight.length;
    heroCount = liveNow.length ? `${liveNow.length} on now` : n ? `${n} today` : '';
    if (isLate() && (liveNow.length || n)) t.textContent = 'Still going';
    else if (n || nowMin() < 21 * 60) t.textContent = 'The next few hours';
    else t.textContent = next ? 'Quiet tonight' : "What's on";
    $('hero-clock').textContent = clockText();
  };

  /* The field is a real one: Enter or the key sends the words to the
     Programme, whose ask field reads a sentence as well as a title. */
  const search = (e) => {
    e.preventDefault();
    const q = $('home-q').value.trim().slice(0, 140);
    location.href = q ? `discover.html?q=${encodeURIComponent(q)}` : 'discover.html?focus=search';
  };

  const D = () => window.WA.Discovery;
  const pref = () => D().pref();
  const nearOn = () => D().nearOn();
  const acts = () => {
    const host = $('home-acts');
    if (host) host.innerHTML = window.WA.DiscoveryControls.keys();
  };

  /* ── The next few hours ─────────────────────────────────────── */
  let plans = [], planIdx = 0, planKey = '';
  const readPlans = () => {
    const p = pref();
    const origin = G().currentLoc();
    const key = `${p.moods}|${p.subs}|${p.cap}|${nearOn()}|${origin ? origin.lat + ',' + origin.lng : ''}`;
    const available = new Set(M().available().map(m => m.id));
    const next = window.WA.Route.plan({ want: { ...p, moods: p.moods.filter(id => available.has(id)) }, cap: p.cap, near: nearOn() });
    if (key !== planKey || !plans.length) planIdx = 0;
    planKey = key; plans = next;
    if (planIdx >= plans.length) planIdx = 0;
    return p;
  };
  const planCard = (p) => {
    if (plans[planIdx]) return window.WA.Route.card(plans[planIdx], { actions: true, more: plans.length > 1, origin: window.WA.StartFrom.originMarkup() });
    const narrowed = p.moods.length || p.cap != null || nearOn();
    return `<section class="rt-card rt-card--empty"><div class="rt-card__origin-wrap">${window.WA.StartFrom.originMarkup()}</div><p class="rt-card__title">${narrowed ? 'Nothing fits that right now.' : 'No route for the next few hours.'}</p>
      <p class="rt-card__sub">${narrowed ? (nearOn() && !p.moods.length && p.cap == null ? 'Nothing is a short walk from here. Choose another starting point or Whole city.' : 'Try another mood or a higher price limit.') : 'The Guide has the places; the Programme has the listings.'}</p>
      <div class="rt-card__acts">${narrowed ? '<button class="wa-btn wa-btn--pill" type="button" data-filter-open>Change</button>' : '<a class="wa-btn wa-btn--pill" href="places.html">Guide</a>'}</div></section>`;
  };

  /* The next day after today with anything listed. */
  const nextDay = (all) => {
    const groups = R().byDay(all.filter(e => { const k = W().resolveKey(e); return k && k > W().todayKey(); }));
    return groups.length ? { key: groups[0][0], items: groups[0][1] } : null;
  };

  /* Stable shortcuts; the calendar provides any other filed day. */
  const days = () => {
    const dow = new Date(`${W().todayKey()}T12:00:00Z`).getUTCDay();
    return [['tonight', 'Today'], ['tomorrow', 'Tomorrow'], dow >= 1 && dow <= 4 ? ['weekend', 'Weekend'] : ['thisweek', 'This week']];
  };
  const dayList = (all, date, p) => {
    const list = sortSoon(all.filter(e => D().matchesDate(e, date) && D().matchesEvent(e, p)));
    const timed = e => W().statedMinutes(e) != null;
    const ordered = [...list.filter(e => !R().isOff(e) && timed(e)), ...list.filter(e => !R().isOff(e) && !timed(e)), ...list.filter(e => R().isOff(e))];
    if (!nearOn()) return ordered;
    const far = e => R().isOff(e) ? Infinity : G().distanceTo(e) ?? Infinity;
    return ordered.map((e,i) => [e,far(e),i]).sort((a,b) => a[1]-b[1] || a[2]-b[2]).map(x => x[0]);
  };
  /* The list is short on purpose: the next five, then "Show N more" opens the rest
     here (up to thirty; past that the Programme). A kind chosen above shows all of it. */
  const SHOWN = 5, MOST = 30;
  let expanded = false;

  /* One row of the kinds in the day's list, with how many of each, so all the
     workshops or all the comedy are a tap away. Only kinds that are there, most
     first; none when the list holds one kind. Comedy is read from tags, since
     sources file it under theatre or nothing. */
  const COMEDY = ['comedy', 'standup', 'stand-up', 'improv'];
  const FACETS = [
    ['gig', 'Gigs'], ['club', 'Club nights'], ['film', 'Film'], ['theatre', 'Stage'], ['comedy', 'Comedy'],
    ['exhibition', 'Art'], ['workshop', 'Workshops'], ['talk', 'Talks'], ['festival', 'Festivals'], ['market', 'Markets'],
  ];
  const inFacet = (id, e) => (id === 'comedy'
    ? (e.tags || []).some(t => COMEDY.includes(String(t).toLowerCase()))
    : String(e.kind || '').toLowerCase() === id);
  let facet = '';
  const facets = (list) => FACETS.map(([id, label]) => [id, label, list.filter(e => inFacet(id, e)).length]).filter(x => x[2] > 0).sort((a, b) => b[2] - a[2]);
  const facetRow = (list, shown) => {
    if (shown.length < 2) return '';
    const P = window.WA.Picto;
    const chip = (id, label, n, art) => `<button class="wa-chip" type="button" data-facet="${esc(id)}" aria-pressed="${facet === id}">${art}${esc(label)} <span class="wa-chip__n">${n}</span></button>`;
    return `<div class="wa-chips wa-chips--scroll home-kinds" role="group" aria-label="Kind">${chip('', 'All', list.length, '')}${shown.map(([id, label, n]) => chip(id, label, n, P.kind(id === 'comedy' ? 'theatre' : id))).join('')}</div>`;
  };

  /* ── Events | Places ──────────────────────────────────────────
     Under the answer, one switch: the day's listings, or the picked places
     (the Guide in brief). Places come open-now first, then nearest (from you,
     or the city's centre), with one row of place types; the Guide page holds
     them all, as the Programme holds every listing. ?view=places opens on them. */
  let view = new URLSearchParams(location.search).get('view') === 'places' ? 'places' : 'events';
  let placeGroup = '';
  const centre = () => { const c = (window.WA.CITIES || []).find(x => x.id === window.WA.CITY); return c && c.centre ? c.centre : null; };
  const isOpen = (v) => R().openState(v).open === true;
  const pickedPlaces = () => {
    const from = (nearOn() ? G().currentLoc() : null) || centre();
    const d = (v) => { const m = from ? G().distanceTo(v, from) : null; return m == null ? 1e9 : m; };
    return R().places().filter(v => v.picked && D().matchesPlace(v))
      .map(v => [v, isOpen(v) ? 0 : 1, d(v)]).sort((a, b) => (a[1] - b[1]) || (a[2] - b[2])).map(x => x[0]);
  };
  const inGroup = (v, id) => { const g = R().placeGroups.find(x => x.id === id); return !g || g.kinds.includes(String(v.kind || '').toLowerCase()); };
  const placesPart = (all) => {
    const groups = R().placeGroups.map(g => [g, all.filter(v => inGroup(v, g.id)).length]).filter(x => x[1] > 0);
    if (placeGroup && !groups.some(([g]) => g.id === placeGroup)) placeGroup = '';
    const list = all.filter(v => inGroup(v, placeGroup));
    const cap = expanded || placeGroup ? MOST : SHOWN;
    const openN = list.filter(isOpen).length;
    const chip = (id, label, n, art) => `<button class="wa-chip" type="button" data-group="${esc(id)}" aria-pressed="${placeGroup === id}">${art}${esc(label)} <span class="wa-chip__n">${n}</span></button>`;
    const row = groups.length > 1 ? `<div class="wa-chips wa-chips--scroll home-kinds" role="group" aria-label="Kind of place">${chip('', 'All', all.length, '')}${groups.map(([g, n]) => chip(g.id, g.label, n, window.WA.Picto(g.picto))).join('')}</div>` : '';
    const from = (nearOn() ? G().currentLoc() : null) || centre();
    const note = `${openN ? `${openN} open now · ` : ''}${nearOn() ? 'nearest to your start first' : 'nearest the centre first'}`;
    return `${row}<p class="wa-note home-day__note">${esc(note)}</p><p class="wa-note">Place hours are for now.</p>
      ${list.length ? '' : '<p class="wa-note">No places match these choices.</p>'}<ul class="home-places">${list.slice(0, cap).map(v => R().placeRow(v, { from })).join('')}</ul>
      <div class="home-day__foot">${list.length > cap && cap < MOST ? `<button class="wa-btn wa-btn--pill home-day__all" type="button" data-day-all>${I('down')}Show ${Math.min(list.length, MOST) - cap} more</button>` : ''}
      <a class="wa-linkbtn home-day__more" href="places.html${placeGroup ? `?kind=${esc(placeGroup)}` : ''}">The Guide ${I('arrow')}</a></div>`;
  };
  // Keep one segment through redraws, including its gesture listeners.
  const viewSwitch = document.createElement('div');
  viewSwitch.className = 'map-seg home-view';
  viewSwitch.setAttribute('role','group'); viewSwitch.setAttribute('aria-label','Show');
  viewSwitch.innerHTML = '<button class="map-seg__opt" type="button" data-view="events" aria-pressed="true"><span>Events</span><span class="home-view__n" id="home-events-n"></span></button><button class="map-seg__opt" type="button" data-view="places" aria-pressed="false"><span>Places</span><span class="home-view__n" id="home-places-n"></span></button>';
  const setView = value => {
    view = value; expanded = false; main();
    const q = new URLSearchParams(location.search);
    if (view === 'places') q.set('view', 'places'); else q.delete('view');
    history.replaceState(null, '', `${location.pathname}${q.size ? '?' + q : ''}${location.hash}`);
  };
  const viewGlass = window.WA.glassDrop(viewSwitch, { name:'map-seg', item:'.map-seg__opt', itemClass:'map-seg__opt',
    current: () => view === 'events' ? 0 : 1, commit: i => setView(i === 0 ? 'events' : 'places') });
  let walkOpen = false;
  const walkFold = p => `<section class="wa-sect rt-sect" id="plan-fold"><button class="home-walk__key" type="button" data-walk-toggle aria-expanded="${walkOpen}" aria-controls="plan">${I('walk')}<span><b>A walk for now</b><small>${esc(plans[planIdx] ? plans[planIdx].title || 'Two or three stops on foot' : 'See the next few hours')}</small></span>${I('down')}</button><div id="plan"${walkOpen ? '' : ' hidden'}>${planCard(p)}</div></section>`;
  let walkMotion = null;
  const toggleWalk = () => {
    const host = $('plan'), key = document.querySelector('[data-walk-toggle]');
    if (!host || !key) return;
    if (walkMotion) { walkMotion.cancel(); walkMotion = null; }
    walkOpen = !walkOpen; key.setAttribute('aria-expanded',walkOpen);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (walkOpen) {
      host.hidden = false;
      if (!still) walkMotion = host.animate([{ height:'0px', opacity:0 },{ height:host.offsetHeight + 'px', opacity:1 }], { duration:260, easing:'ease-out' });
    } else if (still) host.hidden = true;
    else {
      walkMotion = host.animate([{ height:host.offsetHeight + 'px', opacity:1 },{ height:'0px', opacity:0 }], { duration:140, easing:'ease-in' });
      walkMotion.onfinish = () => { if (!walkOpen) host.hidden = true; };
    }
  };

  const main = () => {
    const all = R().live();
    const tonight = sortSoon(all.filter(e => W().isTonight(e)));
    const liveNow = tonight.filter(e => R().isLive(e));
    const next = nextDay(all);
    hero(tonight, liveNow, next);
    acts();
    const p = readPlans();
    const date = D().dates(), tab = date.date ? 'custom' : date.when;
    const tabs = days();
    if (tab !== 'custom' && !tabs.some(([k]) => k === tab)) tabs.push([tab, D().label()]);
    const full = dayList(all,date,p);
    const shown = facets(full);
    if (facet && !shown.some(([id]) => id === facet)) facet = '';
    const list = facet ? full.filter(e => inFacet(facet, e)) : full;
    const cap = expanded || facet ? MOST : SHOWN;
    const out = [walkFold(p)];

    const places = pickedPlaces();
    if (view === 'places') {
      out.push(`<section class="wa-sect home-day"><div id="home-view-slot"></div>${placesPart(places)}</section>`);
    } else {
      const q = D().params();
      if (facet === 'comedy') q.set('q', 'comedy'); else if (facet) q.set('cat', facet);
      if (nearOn()) q.set('sort', 'nearest');
      out.push(`<section class="wa-sect home-day"><div id="home-view-slot"></div>
        <div class="home-tabs" role="group" aria-label="Day">${tabs.map(([k,label]) => `<button class="home-tab" type="button" data-day="${k}" aria-pressed="${k === tab}">${esc(label)}</button>`).join('')}${window.WA.DiscoveryControls.dateKey('home-calendar')}</div>
        ${facetRow(full, shown)}
        ${nearOn() && list.length ? `<p class="wa-note home-day__note">${G().anchor() ? 'Nearest first, walking from here' : 'Nearest first, walking from you'}</p>` : ''}
        ${list.length ? `<ul class="wa-feed">${list.slice(0,cap).map(e => R().feedItem(e, { day:tab !== 'tonight', since:visit.prev })).join('')}</ul>` : `<div class="home-empty"><p>No listings match these choices.</p><button class="wa-linkbtn" type="button" data-pick-dates>Pick dates</button><button class="wa-linkbtn" type="button" data-filter-open>Change filters</button></div>`}
        <div class="home-day__foot">${list.length > cap && cap < MOST ? `<button class="wa-btn wa-btn--pill home-day__all" type="button" data-day-all>${I('down')}Show ${Math.min(list.length, MOST) - cap} more</button>` : ''}
        <a class="wa-linkbtn home-day__more" href="discover.html?${esc(q.toString())}">${list.length > cap ? `All ${list.length}` : 'Programme'} ${I('arrow')}</a></div>
      </section>`);
    }
    if (!all.length && window.WA.DATA_LIVE === false) out.push(R().empty({ icon:'offline', title:"We can't reach the listings right now.", body:'Your saves still work. Try again in a moment.', actions:[{ act:'reload', label:'Try again' },{ href:'saved.html', label:'Saved' }] }));
    const focused = document.activeElement;
    const focusKey = focused && focused.dataset ? ['day','facet','group'].find(k => k in focused.dataset) : null;
    const focusValue = focusKey ? focused.dataset[focusKey] : '';
    const hadViewFocus = viewSwitch.contains(focused);
    $('home-main').innerHTML = out.join('');
    const slot = $('home-view-slot');
    if (slot) {
      slot.replaceWith(viewSwitch);
      $('home-events-n').textContent = String(full.length);
      $('home-places-n').textContent = String(places.length);
      viewSwitch.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed',b.dataset.view === view));
      viewGlass.sync();
    }
    if (focusKey) document.querySelector(`[data-${focusKey}="${CSS.escape(focusValue)}"]`)?.focus({ preventScroll:true });
    if (hadViewFocus) focused.focus({ preventScroll:true });
    if (window.WA.UI.edges) window.WA.UI.edges();
    return all;
  };

  /* Another: the next route in line, the card drawn again. Only the card changes. */
  const another = () => {
    if (plans.length < 2) return;
    planIdx = (planIdx + 1) % plans.length;
    const host = $('plan');
    if (host) {
      const focused = !!document.activeElement?.matches('[data-another]');
      host.dataset.again = '1'; host.innerHTML = planCard(pref());
      document.querySelector('[data-walk-toggle] small').textContent = plans[planIdx].title || 'Two or three stops on foot';
      if (focused) host.querySelector('[data-another]')?.focus({ preventScroll:true });
    }
  };

  /* ── Side (desktop): the map ─────────────────────────────────── */
  const side = () => {
    const mapCard = `<section class="wa-sect"><a class="wa-mapcard" href="map.html">
      <img class="wa-mapcard__art" src="assets/tallinn-overview.svg" alt="" loading="lazy">
      <span class="wa-mapcard__glass"><span class="wa-mapcard__title">${I('map')}Show the map</span>
      <span class="wa-mapcard__sub">The selected listings and places, by walking time.</span></span></a></section>`;
    $('home-side').innerHTML = mapCard;
  };

  /* ── New since the last visit ──────────────────────────────── */
  const since = (all) => {
    const host = $('since');
    const prev = visit.prev;
    const n = prev ? all.filter(e => R().isNewSince(e, prev)).length : 0;
    if (!n) { host.innerHTML = ''; return; }
    const d = new Date(prev);
    const when = (Date.now() - prev) < 86400000 * 6
      ? d.toLocaleDateString((window.WA.Lang ? window.WA.Lang.locale() : 'en-GB'), { weekday: 'long', timeZone: 'Europe/Tallinn' })
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/Tallinn' });
    host.innerHTML = `<a class="wa-since" href="discover.html?new=1&time=all"><span class="wa-since__n">${n}</span><span>new since ${esc(when)}</span>${I('arrow')}</a>`;
  };

  /* ── Render and events ─────────────────────────────────────── */
  const render = () => {
    const all = main();
    side();
    since(all);
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    const dt = hit('[data-day]');
    if (dt) { expanded = false; D().setDates({ when:dt.dataset.day }); D().writeURL(); return; }
    if (hit('[data-walk-toggle]')) { toggleWalk(); return; }
    const vw = hit('[data-view]');
    if (vw) {
      setView(vw.dataset.view);
      return;
    }
    const gp = hit('[data-group]');
    if (gp) { placeGroup = placeGroup === gp.dataset.group ? '' : gp.dataset.group; expanded = false; main(); return; }
    const fc = hit('[data-facet]');
    if (fc) { facet = facet === fc.dataset.facet ? '' : fc.dataset.facet; expanded = false; main(); return; }
    if (hit('[data-day-all]')) {
      expanded = true; main();
      const rows = document.querySelectorAll('.home-day .wa-feed > li, .home-places > li');
      const first = rows[SHOWN] && rows[SHOWN].querySelector('a');
      if (first) first.focus({ preventScroll: true });
      return;
    }
    if (hit('[data-near]')) { window.WA.StartFrom.open(hit('[data-near]')); return; }
    if (hit('[data-another]')) { another(); return; }
    if (hit('[data-act="reload"]')) { location.reload(); return; }
    const r = hit('[data-row]');
    if (r) window.WA.Seen.mark(r.dataset.row);
  });

  const boot = () => { render(); R().locateIfGranted(); };
  /* Once the page has moved, the pill's bar gets its hairline. Only a
     border colour changes, so nothing about the layout depends on it. */
  let scrolled = false;
  window.addEventListener('scroll', () => {
    const f = window.scrollY > 4;
    if (f !== scrolled) { scrolled = f; document.body.classList.toggle('is-scrolled', f); }
  }, { passive: true });
  $('home-search').addEventListener('submit', search);
  document.addEventListener('wa:catalog-ready', () => { boot(); if (window.WA.Route) window.WA.Route.loadStored(); });
  document.addEventListener('wa:routes-ready', () => { if (window.WA.catalog) main(); });
  document.addEventListener('wa:mood-changed', () => { if (window.WA.catalog) main(); });
  document.addEventListener('wa:start-state', () => {
    const origin = document.querySelector('.rt-card__origin-wrap');
    if (origin) origin.innerHTML = window.WA.StartFrom.originMarkup(); else render();
  });
  document.addEventListener('wa:discovery-changed', () => { if (window.WA.catalog) { expanded = false; render(); } });
  document.addEventListener('wa:discovery-applied', () => {
    if (viewSwitch.isConnected) viewSwitch.scrollIntoView({ block:'center', behavior:'auto' });
  });
  document.addEventListener('wa:location-ready', () => {
    const city = !G().anchor() && G().deviceLoc() && window.WA.cityForLocation(G().deviceLoc());
    if (city && city.id !== window.WA.CITY) { window.WA.setCity(city.id); return; }
    render();
  });
  /* The clock ticks; the lists redraw every five minutes so "on now"
     and "starting soon" stay true on a phone left open. */
  setInterval(() => { $('hero-clock').textContent = clockText(); }, 30000);
  setInterval(() => { if (document.visibilityState === 'visible' && window.WA.catalog) render(); }, 300000);

  const skeleton = () => {
    $('hero-clock').textContent = clockText();
    acts();
    $('home-main').innerHTML = `<section class="wa-sect">${R().skelRows(5)}</section>`;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', skeleton, { once: true });
  else skeleton();
  document.addEventListener('wa:language-changed', () => { $('hero-clock').textContent = clockText(); render(); });
})();
