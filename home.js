/* Now: the night so far, a mood rail, one walk, then Events/Places. Tonight's
   events read as a timeline (on now, starting soon, later); other dates group
   by night. Filters fold into a key once the page scrolls past them. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const G = () => window.WA.Geo;
  const M = () => window.WA.Moods;
  const D = () => window.WA.Discovery;
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n, c) => window.WA.Icon(n, c);

  const visit = window.WA.R.visit();

  const nowMin = () => window.WA.Hours.cityNow().minutes;
  const isLate = () => { const m = nowMin(); return m >= 21 * 60 + 30 || m < W().NIGHT_END; };
  const evening = () => { const m = nowMin(); return m >= 17 * 60 || m < W().NIGHT_END; };
  const startMs = (e) => (e && e.startsAt ? Date.parse(e.startsAt) : NaN);
  const timed = (e) => W().statedMinutes(e) != null && isFinite(startMs(e));
  const pref = () => D().pref();
  const nearOn = () => D().nearOn();
  const TONIGHT = { when: 'tonight' };

  /* ── Hero: the state of the night, and where walking times start ── */
  const hero = (all) => {
    const tonight = all.filter(e => D().matchesDate(e, TONIGHT) && !R().isOff(e));
    const t = $('hero-title');
    if (isLate() && tonight.length) t.textContent = 'Still going';
    else if (tonight.length || nowMin() < 21 * 60) t.textContent = 'The next few hours';
    else t.textContent = all.some(e => W().nightKey(e) > W().nightToday()) ? 'Quiet tonight' : "What's on";
    const a = G().anchor(), on = nearOn();
    window.WA.UI.keepFocus($('home-acts'), () => { $('home-acts').innerHTML = `<button class="wa-chip home-origin" type="button" data-near aria-haspopup="dialog" aria-pressed="${on}">${I('locate')}<span${a ? ' data-notranslate' : ''}>${esc(a ? a.label : on ? 'Near you' : 'Near me')}</span></button>`; });
  };

  /* ── Mood rail: shared with Map (DiscoveryControls.moodRow) ── */
  const rail = document.createElement('div');
  rail.className = 'home-moods wa-chips--scroll';
  rail.setAttribute('role', 'group');
  rail.setAttribute('aria-label', 'Mood');
  const C = () => window.WA.DiscoveryControls;

  /* ── A walk for now: the plan itself, not a label for it ── */
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
  };
  const walkCard = () => {
    const route = plans[planIdx];
    if (!route) return '';
    const Rt = window.WA.Route, first = route.stops[0];
    const from = route.fromYou != null ? (route.fromYou <= 1 ? (G().anchor() ? 'Right by here' : 'Right by you') : `${route.fromYou} min walk from ${G().anchor() ? 'here' : 'you'}`) : '';
    /* Moods chosen before their hours (Club nights at noon) still filter the list; the walk is for
       now, and says when theirs begin. */
    const chosen = pref().moods, later = chosen.length && chosen.every(id => M().startsLater(id) != null)
      ? chosen.map(id => `${M().get(id).label.en} from ${window.WA.Hours.clock(M().startsLater(id))}`).join(' · ') : '';
    const meta = [later, route.area, from].filter(Boolean).join(' · ');
    const facts = [`${route.walkMin} min on foot`, Rt.costText(route) || `${route.stops.length} stops`].join(' · ');
    return `<section class="home-walk" aria-labelledby="home-walk-title">
      <div class="home-walk__head"><span class="home-walk__kicker">${I('walk')}<b>A walk for now</b><span class="home-walk__meta">${esc(meta)}</span></span>
        ${plans.length > 1 ? `<button class="wa-iconbtn home-walk__again" type="button" data-another aria-label="Another walk">${I('refresh')}</button>` : ''}</div>
      <a class="home-walk__main" href="${esc(Rt.href(route))}">
        <span class="home-walk__title" id="home-walk-title">${esc(route.title || 'Two or three stops on foot')}</span>
        <span class="home-walk__discs" aria-hidden="true">${route.stops.slice(0, 3).map(s => window.WA.Picto.kind(s.kind)).join('')}</span>
        <span class="home-walk__stops"><time>${esc(window.WA.Hours.clock(first.minute % 1440))}</time>${route.stops.map(s => `<span data-notranslate>${esc(s.name)}</span>`).join(`<span class="home-walk__to" aria-hidden="true">${I('arrow')}</span>`)}</span>
        <span class="home-walk__foot"><span class="home-walk__cost">${esc(facts)}</span><span class="home-walk__action">View walk ${I('arrow')}</span></span>
      </a></section>`;
  };

  /* ── Events: tonight as a timeline, other dates by night ── */
  const SOON_MS = 2 * 3600 * 1000;
  const byStart = (a, b) => (startMs(a) - startMs(b)) || String(a.id).localeCompare(String(b.id));
  const nearFirst = (list) => {
    if (!nearOn()) return list;
    const far = e => G().distanceTo(e) ?? Infinity;
    return list.map((e, i) => [e, far(e), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
  };
  const dayName = (key) => key === W().nightToday() ? 'Today' : key === W().nightPlus(1) ? 'Tomorrow' : (window.WA.Lang ? window.WA.Lang.daysFull() : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])[new Date(`${key}T12:00:00Z`).getUTCDay()];
  /* [{ id, name, sub, items }] in reading order; a list's rows keep that order. */
  const groups = (list, date) => {
    const out = [];
    const add = (id, name, sub, items) => { if (items.length) out.push({ id, name, sub, items: nearFirst(items) }); };
    const off = list.filter(e => R().isOff(e)), on = list.filter(e => !R().isOff(e));
    if (!date.date && date.when === 'tonight') {
      const now = Date.now();
      /* On now leads with what you can still walk into; a session already under way (a film, a
         talk, a course of several days) is still listed, last, where it cannot be mistaken for one. */
      const live = on.filter(e => R().isLive(e) && !R().isRun(e));
      const open = live.filter(e => R().joinable(e)).sort((a, b) => byStart(b, a));
      const started = live.filter(e => !open.includes(e)).sort(byStart);
      const ahead = on.filter(e => !live.includes(e) && timed(e) && startMs(e) > now).sort(byStart);
      add('live', 'On now', 'You can still walk in', open);
      add('soon', 'Starting soon', 'In the next two hours', ahead.filter(e => startMs(e) <= now + SOON_MS));
      add('later', evening() ? 'Later tonight' : 'Later today', 'Until 05:00', ahead.filter(e => startMs(e) > now + SOON_MS));
      add('also', 'Also today', 'No set time, or running', on.filter(e => !live.includes(e) && !ahead.includes(e)));
      add('started', 'Already under way', 'Late entry may not be possible', started);
    } else {
      const [from] = D().range(date), days = new Map();
      for (const e of on) {
        const k = [W().nightKey(e) || from, from].sort().pop();
        if (!days.has(k)) days.set(k, []);
        days.get(k).push(e);
      }
      for (const [k, items] of [...days].sort((a, b) => a[0].localeCompare(b[0]))) {
        const fresh = items.filter(e => timed(e) && W().nightKey(e) === k).sort(byStart);
        add(k, dayName(k), R().dateShort(k), [...fresh, ...items.filter(e => !fresh.includes(e))]);
      }
    }
    add('off', 'Cancelled or postponed', '', off);
    return out;
  };
  const head = (g) => `<div class="wa-day home-day__head" role="heading" aria-level="2"><span class="wa-day__name">${esc(g.name)}</span>${g.sub ? `<span class="wa-day__date">${esc(g.sub)}</span>` : ''}<span class="wa-day__n">${g.items.length}</span></div>`;

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

  const eventsPart = (list, date) => {
    if (!list.length) {
      const tonight = !date.date && date.when === 'tonight', p = pref();
      const narrowed = p.moods.length || p.cap != null;
      return `<div class="home-empty"><p>${tonight && !narrowed ? 'Nothing else listed tonight.' : 'No listings match these choices.'}</p>
        ${tonight ? '<button class="wa-btn wa-btn--pill" type="button" data-when-pick="tomorrow">Tomorrow</button>' : ''}
        ${narrowed ? '<button class="wa-linkbtn" type="button" data-discovery-clear>Clear filters</button>' : ''}
        ${!tonight ? '<button class="wa-linkbtn" type="button" data-pick-dates aria-haspopup="dialog">Change dates</button>' : ''}
        <a class="wa-linkbtn" href="discover.html">All events</a></div>`;
    }
    let budget = shown;
    const html = groups(list, date).map(g => {
      if (budget <= 0) return '';
      const items = g.items.slice(0, budget); budget -= items.length;
      return `${head(g)}<ul class="wa-rows home-rows">${items.map(e => R().row(e, { since: visit.prev, heart: true, started: g.id === 'live' || g.id === 'started', unknownPrice: true })).join('')}</ul>`;
    }).join('');
    return `${nearOn() ? `<p class="wa-note home-day__note">${G().anchor() ? 'Nearest to here first' : 'Nearest to you first'}</p>` : ''}${html}${more(list.length)}
      <p class="home-day__all-link"><a class="wa-linkbtn" href="discover.html">All events ${I('arrow')}</a></p>`;
  };

  /* ── Places: picked, open first, nearest first ── */
  const centre = () => { const c = (window.WA.CITIES || []).find(x => x.id === window.WA.CITY); return c && c.centre ? c.centre : null; };
  const isOpen = (v) => R().openState(v).open === true;
  const pickedPlaces = () => {
    const from = (nearOn() ? G().currentLoc() : null) || centre();
    const d = (v) => { const m = from ? G().distanceTo(v, from) : null; return m == null ? 1e9 : m; };
    return R().places().filter(v => v.picked && D().matchesPlace(v))
      .map(v => [v, isOpen(v) ? 0 : 1, d(v)]).sort((a, b) => (a[1] - b[1]) || (a[2] - b[2])).map(x => x[0]);
  };
  const placesPart = (list) => {
    const from = (nearOn() ? G().currentLoc() : null) || centre();
    if (!list.length) return '<div class="home-empty"><p>No places match these choices.</p><button class="wa-linkbtn" type="button" data-discovery-clear>Clear filters</button><a class="wa-linkbtn" href="places.html">All places</a></div>';
    return `<p class="wa-note home-day__note">${esc(nearOn() ? 'Nearest to here first' : 'Nearest the centre first')}</p>
      <ul class="home-places">${list.slice(0, shown).map(v => R().placeRow(v, { from, pickLabel: false })).join('')}</ul>
      ${more(list.length)}<p class="home-day__all-link"><a class="wa-linkbtn" href="places.html">All places ${I('arrow')}</a></p>`;
  };

  /* ── Events | Places and When: one line, kept through redraws ── */
  let view = new URLSearchParams(location.search).get('view') === 'places' ? 'places' : 'events';
  const browse = document.createElement('div');
  browse.className = 'home-browse';
  browse.innerHTML = `<div class="home-view" role="group" aria-label="Show"><button class="home-view__opt" type="button" data-view="events" aria-pressed="true"><span>Events</span> <span class="home-view__n" id="home-events-n"></span></button><button class="home-view__opt" type="button" data-view="places" aria-pressed="false"><span>Places</span> <span class="home-view__n" id="home-places-n"></span></button></div><div class="home-browse__end"></div><p class="wa-sr" role="status" id="home-status"></p>`;
  /* A reader's own change (a mood, dates, Events or Places) is announced with its count; the
     five-minute refresh and arriving data stay quiet. */
  let announce = false;
  const syncBrowse = (events, places) => {
    if (announce) { announce = false; browse.querySelector('#home-status').textContent = view === 'places' ? `${places.all} places` : `${events} listings`; }
    browse.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    browse.querySelector('#home-events-n').textContent = String(events);
    const n = browse.querySelector('#home-places-n');
    n.textContent = places.open ? `${places.open} open` : String(places.all);
    n.classList.toggle('is-open', places.open > 0);
    /* The When key is kept, not redrawn, so focus and an open panel stay put. */
    const end = browse.querySelector('.home-browse__end'), key = end.querySelector('[data-when-open]');
    if (view !== 'events') end.innerHTML = '';
    else if (!key) end.innerHTML = window.WA.DiscoveryControls.dateKey('home-when');
    else {
      const s = D().dates();
      key.querySelector('span').textContent = D().label();
      key.classList.toggle('is-set', !!s.date || s.when !== 'tonight');
    }
  };
  const setView = value => {
    view = value; shown = PAGE_SIZE; announce = true;
    const q = new URLSearchParams(location.search);
    if (view === 'places') q.set('view', 'places'); else q.delete('view');
    history.replaceState(null, '', `${location.pathname}${q.size ? '?' + q : ''}${location.hash}`);
    main();
  };

  /* ── Folded filters: past the rail, the controls become one key ── */
  const fold = document.createElement('button');
  fold.type = 'button';
  fold.className = 'home-fold';
  fold.setAttribute('aria-haspopup', 'dialog');
  fold.setAttribute('aria-expanded', 'false');
  fold.hidden = true;
  const foldText = () => {
    const p = pref(), words = M().words(p);
    return [view === 'events' ? D().label() : 'Places', words.length ? (words.length > 1 ? `${words[0]} +${words.length - 1}` : words[0]) : '', p.cap != null && view === 'events' ? C().filterWord(p) : ''].filter(Boolean).join(' · ');
  };
  const syncFold = () => {
    fold.innerHTML = `${I('filter')}<span>${esc(foldText())}</span>`;
    fold.setAttribute('aria-label', `Filters · ${foldText()}`);
    if (folded) document.body.style.setProperty('--fold-w', `${fold.offsetWidth}px`);
  };
  const quickPanel = () => {
    const panel = document.createElement('div');
    panel.className = 'home-quick';
    panel.setAttribute('aria-label', 'Filters');
    const p = pref(), s = D().dates();
    panel.innerHTML = `<div class="home-quick__moods" role="group" aria-label="Mood">${[{ id: '', label: 'All', picto: 'tallinn' }, ...C().moods()].map(m => `<button class="home-mood" type="button" data-mood-pick="${esc(m.id)}" aria-pressed="${m.id ? p.moods.includes(m.id) : !p.moods.length}">${window.WA.Picto(m.picto)}<span>${esc(m.label)}</span></button>`).join('')}</div>
      ${view === 'events' ? `<div class="home-quick__when" role="group" aria-label="When">${[['tonight', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend']].map(([w, l]) => `<button class="wa-chip" type="button" data-when-pick="${w}" aria-pressed="${!s.date && s.when === w}">${esc(l)}</button>`).join('')}</div>` : ''}
      <div class="home-quick__foot"><button class="wa-chip" type="button" data-near aria-pressed="${nearOn()}">${I('locate')}<span>${esc(G().anchor() ? G().anchor().label : nearOn() ? 'Near you' : 'Near me')}</span></button><button class="wa-chip" type="button" data-filter-open aria-haspopup="dialog">${I('filter')}<span>${esc(C().filterWord(p))}</span></button></div>`;
    return panel;
  };
  fold.addEventListener('click', () => {
    if (fold.getAttribute('aria-expanded') === 'true') window.WA.UI.genie.close(true);
    else window.WA.UI.genie(fold, quickPanel());
  });
  let folded = false;
  const foldWatch = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
    folded = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    fold.hidden = !folded;
    document.body.classList.toggle('home-folded', folded);
    if (folded) document.body.style.setProperty('--fold-w', `${fold.offsetWidth}px`);
    if (!folded && fold.getAttribute('aria-expanded') === 'true') window.WA.UI.genie.close(false);
  }, { rootMargin: '-64px 0px 0px 0px' }) : null;

  /* ── Render ─────────────────────────────────────────────────── */
  const wide = matchMedia('(min-width: 1024px)');
  const main = () => {
    writeShown();
    const all = R().live();
    hero(all);
    C().moodRow(rail);
    readPlans();
    const date = D().dates(), p = pref();
    const list = all.filter(e => D().matchesDate(e, date) && D().matchesEvent(e, p));
    const places = pickedPlaces();
    const out = [];
    if (!wide.matches) out.push(walkCard());
    const unavailable = window.WA.DATA_LIVE === false && !(view === 'places' ? R().places().length : all.length);
    const content = unavailable ? R().empty({ icon:'offline', title:"We can't reach the listings right now.", body:'Your saves still work. Try again in a moment.', actions:[{ act:'reload', label:'Try again' },{ href:'saved.html', label:'Saved' }] })
      : view === 'places' ? placesPart(places) : eventsPart(list, date);
    out.push(`<section class="home-list" id="list" aria-label="${view === 'places' ? 'Places' : 'Events'}"><div id="home-browse-slot"></div>${content}</section>`);
    window.WA.UI.keepFocus($('home-main'), () => {
      $('home-main').innerHTML = out.join('');
      $('home-browse-slot').replaceWith(browse);
    });
    if (foldWatch) foldWatch.observe(browse);
    syncBrowse(list.length, { all: places.length, open: places.filter(isOpen).length });
    side(all);
    syncFold();
    if (window.WA.UI.edges) window.WA.UI.edges();
    return all;
  };

  /* Another: the next walk in line; only the card changes. */
  const another = () => {
    if (plans.length < 2) return;
    planIdx = (planIdx + 1) % plans.length;
    const card = document.querySelector('.home-walk');
    if (!card) return;
    const focused = !!document.activeElement?.matches('[data-another]');
    card.outerHTML = walkCard();
    const next = document.querySelector('.home-walk');
    if (next) { next.dataset.again = '1'; if (focused) next.querySelector('[data-another]')?.focus({ preventScroll: true }); }
  };

  /* Wide windows keep a side column beside the list: the walk, the picked
     places open now (on Events) and what is new since the last visit. */
  const openNow = () => {
    if (view !== 'events') return '';
    const open = pickedPlaces().filter(isOpen);
    if (!open.length) return '';
    const from = (nearOn() ? G().currentLoc() : null) || centre();
    return `<section class="home-aside" aria-labelledby="home-open-title">
      <h2 class="home-aside__title" id="home-open-title"><span>Open now</span><span class="home-aside__n">${open.length}</span></h2>
      <ul class="home-aside__list">${open.slice(0, 4).map(v => {
        const m = from ? G().walkMinutes(G().distanceTo(v, from)) : null;
        return `<li><a class="home-aside__row" href="detail.html?id=${esc(encodeURIComponent(v.id))}" data-place="${esc(v.id)}">${window.WA.Picto.kind(v.kind)}
          <span class="home-aside__text"><span class="home-aside__name">${esc(v.name || '')}</span><span class="home-aside__meta">${esc([R().kindLabel(v.kind, true), R().openState(v).text].filter(Boolean).join(' · '))}</span></span>
          ${m != null ? `<span class="home-aside__walk">${I('walk')}${esc(R().walkLabel(m))}</span>` : ''}</a></li>`;
      }).join('')}</ul>
      ${open.length > 4 ? `<button class="wa-linkbtn home-aside__more" type="button" data-view="places">All ${open.length} open</button>` : ''}</section>`;
  };
  const newSince = (all) => {
    const n = visit.prev ? all.filter(e => R().isNewSince(e, visit.prev)).length : 0;
    return n ? `<a class="wa-since" href="discover.html?new=1&time=all"><span class="wa-since__n">${n}</span><span>New since last visit</span>${I('arrow')}</a>` : '';
  };
  const side = (all = R().live()) => {
    $('home-side').innerHTML = wide.matches ? `${walkCard()}${openNow()}${newSince(all)}` : '';
  };
  wide.addEventListener('change', () => { if (window.WA.catalog) render(); });

  /* ── New since the last visit (phones and tablets; wide windows show it beside the list) ── */
  const since = (all) => { $('since').innerHTML = wide.matches ? '' : newSince(all); };

  const render = () => { since(main()); };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    const vw = hit('[data-view]');
    if (vw) { setView(vw.dataset.view); return; }
    if (hit('[data-day-all]')) {
      const previous = shown;
      shown += PAGE_SIZE; main();
      const rows = document.querySelectorAll('.home-list .wa-rows > li, .home-places > li');
      const first = rows[previous] && rows[previous].querySelector('a');
      if (first) first.focus({ preventScroll: true });
      return;
    }
    if (hit('[data-near]')) { window.WA.UI.genie.close(false); window.WA.StartFrom.open(hit('[data-near]')); return; }
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
    announce = !e.detail?.restore;
    main();
  });
  document.addEventListener('wa:start-state', () => { if (window.WA.catalog) render(); });
  document.addEventListener('wa:discovery-changed', e => {
    if (!window.WA.catalog) return;
    shown = e.detail?.restore ? readShown() : PAGE_SIZE;
    announce = !e.detail?.restore;
    if (e.detail?.restore) view = new URLSearchParams(location.search).get('view') === 'places' ? 'places' : 'events';
    render();
  });
  /* After a filter changes from the folded key, show the top of the new list. */
  const toList = () => { if (folded && browse.isConnected) browse.scrollIntoView({ block: 'start', behavior: 'auto' }); };
  document.addEventListener('wa:discovery-applied', toList);
  document.addEventListener('wa:mood-changed', toList);
  document.addEventListener('wa:discovery-changed', toList);
  document.addEventListener('wa:location-ready', () => {
    const city = !G().anchor() && G().deviceLoc() && window.WA.cityForLocation(G().deviceLoc());
    if (city && city.id !== window.WA.CITY) { window.WA.setCity(city.id); return; }
    render();
  });
  /* The lists redraw every five minutes so "on now" and "starting soon"
     stay true on a phone left open. */
  setInterval(() => { if (document.visibilityState === 'visible' && window.WA.catalog) render(); }, 300000);

  const skeleton = () => {
    $('home-moods').replaceWith(rail);
    document.body.append(fold);
    $('home-main').innerHTML = `<section class="wa-sect">${R().skelRows(5)}</section>`;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', skeleton, { once: true });
  else skeleton();
  document.addEventListener('wa:language-changed', () => { if (window.WA.catalog) render(); });
})();
