/* Now: a walking shortlist, shared discovery filters, a compact walk disclosure,
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
      <p class="rt-card__sub">${narrowed ? (nearOn() && !p.moods.length && p.cap == null ? 'Nothing is a short walk from here. Choose another starting point or Whole city.' : 'Try another mood or a higher price limit.') : 'All places and All events have the complete listings.'}</p>
      <div class="rt-card__acts">${narrowed ? '<button class="wa-btn wa-btn--pill" type="button" data-filter-open>Change</button>' : '<a class="wa-btn wa-btn--pill" href="places.html">Guide</a>'}</div></section>`;
  };

  /* The next day after today with anything listed. */
  const nextDay = (all) => {
    const groups = R().byDay(all.filter(e => { const k = W().resolveKey(e); return k && k > W().todayKey(); }));
    return groups.length ? { key: groups[0][0], items: groups[0][1] } : null;
  };

  const days = [['tonight', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend']];
  const dayList = (all, date, p) => {
    const list = sortSoon(all.filter(e => D().matchesDate(e, date) && D().matchesEvent(e, p)));
    const timed = e => W().statedMinutes(e) != null;
    const ordered = [...list.filter(e => !R().isOff(e) && timed(e)), ...list.filter(e => !R().isOff(e) && !timed(e)), ...list.filter(e => R().isOff(e))];
    if (!nearOn()) return ordered;
    const far = e => R().isOff(e) ? Infinity : G().distanceTo(e) ?? Infinity;
    return ordered.map((e,i) => [e,far(e),i]).sort((a,b) => a[1]-b[1] || a[2]-b[2]).map(x => x[0]);
  };
  /* Keep browsing the current selection in batches. The URL restores enough
     rows for the browser to return to the same spot after opening a listing. */
  const PAGE_SIZE = 25;
  const readShown = () => {
    const n = Number(new URLSearchParams(location.search).get('shown'));
    return Number.isSafeInteger(n) && n >= PAGE_SIZE && n % PAGE_SIZE === 0 ? n : PAGE_SIZE;
  };
  let shown = readShown();
  const writeShown = () => {
    const q = new URLSearchParams(location.search);
    if (shown > PAGE_SIZE) q.set('shown', shown); else q.delete('shown');
    history.replaceState(null, '', `${location.pathname}${q.size ? '?' + q : ''}${location.hash}`);
  };
  const more = (total) => total > shown ? `<div class="home-day__foot"><button class="wa-btn wa-btn--pill home-day__all" type="button" data-day-all>${I('down')}Show ${Math.min(PAGE_SIZE, total - shown)} more</button></div>` : '';

  /* Events and picked places browse the current selection; All events and
     All places open the complete catalogues. */
  let view = new URLSearchParams(location.search).get('view') === 'places' ? 'places' : 'events';
  const centre = () => { const c = (window.WA.CITIES || []).find(x => x.id === window.WA.CITY); return c && c.centre ? c.centre : null; };
  const isOpen = (v) => R().openState(v).open === true;
  const pickedPlaces = () => {
    const from = (nearOn() ? G().currentLoc() : null) || centre();
    const d = (v) => { const m = from ? G().distanceTo(v, from) : null; return m == null ? 1e9 : m; };
    return R().places().filter(v => v.picked && D().matchesPlace(v))
      .map(v => [v, isOpen(v) ? 0 : 1, d(v)]).sort((a, b) => (a[1] - b[1]) || (a[2] - b[2])).map(x => x[0]);
  };
  const placesPart = (list) => {
    const openN = list.filter(isOpen).length;
    const from = (nearOn() ? G().currentLoc() : null) || centre();
    const note = `${openN ? `${openN} open now · ` : ''}${nearOn() ? 'Nearest to here first' : 'Nearest the centre first'}`;
    return `<div class="home-browse-head"><h2 class="wa-sr">Places</h2><a class="wa-linkbtn" href="places.html">All places ${I('arrow')}</a></div>
      <p class="wa-note home-day__note">${esc(note)}</p><p class="wa-note">Hours shown for now</p>
      ${list.length ? '' : '<p class="wa-note">No places match these choices.</p>'}<ul class="home-places">${list.slice(0,shown).map(v => R().placeRow(v,{ from })).join('')}</ul>
      ${more(list.length)}`;
  };
  // Keep one segment through redraws, including its gesture listeners.
  const viewSwitch = document.createElement('div');
  viewSwitch.className = 'map-seg home-view';
  viewSwitch.setAttribute('role','group'); viewSwitch.setAttribute('aria-label','Show');
  viewSwitch.innerHTML = '<button class="map-seg__opt" type="button" data-view="events" aria-pressed="true"><span>Events</span><span class="home-view__n" id="home-events-n"></span></button><button class="map-seg__opt" type="button" data-view="places" aria-pressed="false"><span>Places</span><span class="home-view__n" id="home-places-n"></span></button>';
  const setView = value => {
    view = value; shown = PAGE_SIZE;
    const q = new URLSearchParams(location.search);
    if (view === 'places') q.set('view', 'places'); else q.delete('view');
    history.replaceState(null, '', `${location.pathname}${q.size ? '?' + q : ''}${location.hash}`);
    main();
  };
  const viewGlass = window.WA.glassDrop(viewSwitch, { name:'map-seg', item:'.map-seg__opt', itemClass:'map-seg__opt',
    current: () => view === 'events' ? 0 : 1, commit: i => setView(i === 0 ? 'events' : 'places') });
  // Preserve the day bar through renders so a slide keeps its pointer capture.
  const daySwitch = document.createElement('div');
  daySwitch.className = 'map-seg home-tabs';
  daySwitch.setAttribute('role','group'); daySwitch.setAttribute('aria-label','Day');
  daySwitch.innerHTML = days.map(([key,label]) => `<button class="map-seg__opt home-tab" type="button" data-day="${key}" aria-pressed="false"><span>${label}</span></button>`).join('')
    + window.WA.DiscoveryControls.dateKey('map-seg__opt home-calendar');
  const dayButtons = [...daySwitch.querySelectorAll('[data-day]')];
  const calendar = daySwitch.querySelector('[data-pick-dates]');
  const dayIndex = () => {
    const s = D().dates(), i = s.date ? -1 : days.findIndex(([key]) => key === s.when);
    return i < 0 ? days.length : i;
  };
  const chooseDay = button => { D().setDates({ when:button.dataset.day }); D().writeURL(); };
  const touchDays = matchMedia('(max-width: 1023px), (pointer: coarse)');
  const dayGlass = window.WA.glassDrop(daySwitch, { name:'map-seg', item:'.map-seg__opt', itemClass:'map-seg__opt home-tab',
    current:dayIndex, enabled:() => touchDays.matches, commitSame:true,
    commit: (i, button) => {
      if (i === days.length) { dayGlass.sync(); window.WA.DiscoveryControls.openDates(button); }
      else chooseDay(button);
    } });
  touchDays.addEventListener('change', () => dayGlass.reset());
  const syncDays = () => {
    const i = dayIndex();
    dayButtons.forEach((b,n) => b.setAttribute('aria-pressed',n === i));
    calendar.setAttribute('aria-pressed',i === days.length);
    calendar.querySelector('span').textContent = i === days.length ? D().label() : 'Pick dates';
    dayGlass.sync();
  };
  let walkOpen = false;
  const walkFold = p => `<section class="wa-sect rt-sect" id="plan-fold"><button class="home-walk__key" type="button" data-walk-toggle aria-expanded="${walkOpen}" aria-controls="plan">${I('walk')}<span><b>A walk for now</b><small>${esc(plans[planIdx] ? plans[planIdx].title || 'Two or three stops on foot' : 'See the next few hours')}</small></span>${I('down')}</button><div id="plan"${walkOpen ? '' : ' hidden'}>${planCard(p)}</div></section>`;
  let walkMotion = null;
  const toggleWalk = () => {
    const host = $('plan'), key = document.querySelector('[data-walk-toggle]');
    if (!host || !key) return;
    const fromHeight = host.hidden ? 0 : host.getBoundingClientRect().height;
    const fromOpacity = host.hidden ? 0 : Number(getComputedStyle(host).opacity);
    if (walkMotion) { walkMotion.cancel(); walkMotion = null; }
    walkOpen = !walkOpen; key.setAttribute('aria-expanded',walkOpen);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const easing = getComputedStyle(key).getPropertyValue('--ease').trim();
    if (walkOpen) {
      host.hidden = false;
      if (!still) walkMotion = host.animate([{ height:fromHeight + 'px', opacity:fromOpacity },{ height:host.offsetHeight + 'px', opacity:1 }], { duration:260, easing });
    } else if (still) host.hidden = true;
    else {
      walkMotion = host.animate([{ height:fromHeight + 'px', opacity:fromOpacity },{ height:'0px', opacity:0 }], { duration:140, easing });
      walkMotion.onfinish = () => { if (!walkOpen) host.hidden = true; };
    }
  };

  const main = () => {
    writeShown();
    const all = R().live();
    const tonight = sortSoon(all.filter(e => W().isTonight(e)));
    const liveNow = tonight.filter(e => R().isLive(e));
    const next = nextDay(all);
    hero(tonight, liveNow, next);
    acts();
    const p = readPlans();
    const date = D().dates(), tab = date.date ? 'custom' : date.when;
    const list = dayList(all,date,p);
    const out = [walkFold(p)];

    const places = pickedPlaces();
    if (view === 'places') {
      out.push(`<section class="wa-sect home-day"><div id="home-view-slot"></div>${placesPart(places)}</section>`);
    } else {
      out.push(`<section class="wa-sect home-day"><div id="home-view-slot"></div>
        <div class="home-browse-head"><h2 class="wa-sr">Events</h2><a class="wa-linkbtn" href="discover.html">All events ${I('arrow')}</a></div>
        <div id="home-day-slot"></div>

        ${nearOn() && list.length ? `<p class="wa-note home-day__note">${G().anchor() ? 'Nearest to here first' : 'Nearest to you first'}</p>` : ''}
        ${list.length ? `<ul class="wa-feed">${list.slice(0,shown).map(e => R().feedItem(e, { day:tab !== 'tonight', since:visit.prev })).join('')}</ul>` : `<div class="home-empty"><p>No listings match these choices.</p><button class="wa-linkbtn" type="button" data-pick-dates>Pick dates</button><button class="wa-linkbtn" type="button" data-filter-open>Change filters</button></div>`}
        ${more(list.length)}
      </section>`);
    }
    if (!all.length && window.WA.DATA_LIVE === false) out.push(R().empty({ icon:'offline', title:"We can't reach the listings right now.", body:'Your saves still work. Try again in a moment.', actions:[{ act:'reload', label:'Try again' },{ href:'saved.html', label:'Saved' }] }));
    const focused = document.activeElement;
    const hadDayFocus = daySwitch.contains(focused);
    const hadViewFocus = viewSwitch.contains(focused);
    $('home-main').innerHTML = out.join('');
    const slot = $('home-view-slot');
    if (slot) {
      slot.replaceWith(viewSwitch);
      $('home-events-n').textContent = String(list.length);
      $('home-places-n').textContent = String(places.length);
      viewSwitch.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed',b.dataset.view === view));
      viewGlass.sync();
    }
    const daySlot = $('home-day-slot');
    if (daySlot) { daySlot.replaceWith(daySwitch); syncDays(); }
    if (hadDayFocus || hadViewFocus) focused.focus({ preventScroll:true });
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
  const desktop = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
  const side = () => {
    $('home-side').innerHTML = desktop.matches ? `<section class="wa-sect"><a class="wa-mapcard" href="map.html">
      <img class="wa-mapcard__art" src="assets/tallinn-overview.svg" alt="" loading="lazy">
      <span class="wa-mapcard__glass"><span class="wa-mapcard__title">${I('map')}Show the map</span>
      <span class="wa-mapcard__sub">The selected listings and places, by walking time.</span></span></a></section>` : '';
  };
  desktop.addEventListener('change', side);

  /* ── New since the last visit ──────────────────────────────── */
  const since = (all) => {
    const host = $('since');
    const prev = visit.prev;
    const n = prev ? all.filter(e => R().isNewSince(e, prev)).length : 0;
    if (!n) { host.innerHTML = ''; return; }
    host.innerHTML = `<a class="wa-since" href="discover.html?new=1&time=all"><span class="wa-since__n">${n}</span><span>New since last visit</span>${I('arrow')}</a>`;
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
    if (dt) { chooseDay(dt); return; }
    // Opening the calendar is an action, not a committed day selection.
    if (hit('[data-pick-dates]') === calendar) dayGlass.sync();
    if (hit('[data-walk-toggle]')) { toggleWalk(); return; }
    const vw = hit('[data-view]');
    if (vw) {
      setView(vw.dataset.view);
      return;
    }
    if (hit('[data-day-all]')) {
      const previous = shown;
      shown += PAGE_SIZE; main();
      const rows = document.querySelectorAll('.home-day .wa-feed > li, .home-places > li');
      const first = rows[previous] && rows[previous].querySelector('a');
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
  document.addEventListener('wa:catalog-ready', () => { boot(); if (window.WA.Route) window.WA.Route.loadStored(); });
  document.addEventListener('wa:routes-ready', () => { if (window.WA.catalog) main(); });
  document.addEventListener('wa:mood-changed', e => {
    if (!window.WA.catalog) return;
    shown = e.detail?.restore ? readShown() : PAGE_SIZE;
    main();
  });
  document.addEventListener('wa:start-state', () => {
    const origin = document.querySelector('.rt-card__origin-wrap');
    if (origin) origin.innerHTML = window.WA.StartFrom.originMarkup(); else render();
  });
  document.addEventListener('wa:discovery-changed', e => {
    if (!window.WA.catalog) return;
    shown = e.detail?.restore ? readShown() : PAGE_SIZE;
    if (e.detail?.restore) view = new URLSearchParams(location.search).get('view') === 'places' ? 'places' : 'events';
    render();
  });
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
