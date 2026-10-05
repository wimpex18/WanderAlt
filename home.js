/* ============================================================
   home.js — Now, the home screen.
   ------------------------------------------------------------
   The search field, then one answer: the next few hours as a short walk
   (route.js plan()), with Walk it and Another. One key opens the mood
   and price sheet (moods.js); Near me turns walking from where you are on
   and off. Under the answer, the day's listings in time order (nearest first
   with Near me), those with no time last, with one row of the kinds in them.
   A day tab with nothing in it is not shown. Never empty: when today has
   nothing, the next listed day takes its place.
   ============================================================ */
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

  /* ── Near me ───────────────────────────────────────────────────
     One key under the headline, a switch. On, it asks for the location (only
     on a tap) and then everything walks from you: the route starts a short
     walk away and says how far, the day's list comes nearest first with a
     walk on every row, and the picked places come closest first. Off, the
     list is back in time order. The choice is kept (wa:near:v1). */
  const NEAR_KEY = 'wa:near:v1';
  let near = (() => { try { return localStorage.getItem(NEAR_KEY) === '1'; } catch (_) { return false; } })();
  const setNear = (on) => {
    near = on;
    try { if (on) localStorage.setItem(NEAR_KEY, '1'); else localStorage.removeItem(NEAR_KEY); } catch (_) { /* this page only */ }
  };
  const nearOn = () => near && !!G().currentLoc();
  /* The key's words, each its own piece so the page's language can read it:
     "Records, Jazz · up to €20", "Art & film +2 · free", "Any mood · any price". */
  const moodSet = () => { const p = pref(); return !!(p.moods.length || p.cap != null); };
  const moodWords = () => {
    const p = pref(), w = M().words(p);
    const what = !w.length ? '<span>Any mood</span>'
      : w.length <= 2 ? w.map(x => `<span>${esc(x)}</span>`).join(', ')
        : `<span>${esc(w[0])}</span> +${w.length - 1}`;
    return `${what} · <span>${esc(M().capText(p.cap))}</span>`;
  };
  let nearBusy = false, nearOff = false;
  const acts = () => {
    const host = $('home-acts');
    if (!host) return;
    const on = nearOn();
    const mood = M() ? `<button class="wa-chip home-mood__key${moodSet() ? ' is-set' : ''}" type="button" data-mood-open aria-haspopup="dialog">${I('filter')}<span>${moodWords()}</span></button>` : '';
    const denied = nearOff && G().locationError() === 1;
    host.innerHTML = mood + (denied
      ? `<span class="wa-act wa-act--off">${I('nav')}Location is off</span><p class="wa-note home-acts__note">Walking from you needs location. Allow it for this site in your browser settings.</p>`
      : `<button class="wa-act${on ? ' is-on' : ''}" type="button" data-near aria-pressed="${on}"${nearBusy ? ' disabled' : ''}>${I('nav')}${nearBusy ? 'Finding you' : 'Near me'}${on ? I('check') : ''}</button>${nearOff && !nearBusy ? '<p class="wa-note home-acts__note">Could not find your location. Try Near me again, or choose a starting place on You.</p>' : ''}`);
  };

  /* ── Mood and price: one key, one sheet ─────────────────────────
     Moods as a short list, each with its Label disc; tap one or a few (none
     means anything). A chosen mood opens its narrower picks as chips under
     it (Records, Books…), all optional. Then Tickets: Free, Up to €20, Any. */
  let draft = null;
  const CAPS = [[0, 'Free'], [20, 'Up to €20'], [null, 'Any']];
  /* The choice as it stands at this hour: a mood the hour does not offer (Club nights at noon) is set aside, not lost. */
  const pref = () => {
    if (!M()) return { moods: [], subs: [], cap: null };
    const p = M().pref(), here = new Set(M().available().map(m => m.id));
    return { moods: p.moods.filter(id => here.has(id)), subs: p.subs, cap: p.cap };
  };
  const sheetBody = () => {
    const moods = M().available();
    const P = window.WA.Picto;
    const item = (m) => {
      const on = draft.moods.includes(m.id);
      const subs = m.subs.length > 1 ? `<div class="mood-subs" data-subs-of="${esc(m.id)}" role="group" aria-label="Narrow it down"${on ? '' : ' hidden'}>${m.subs.map(x =>
        `<button class="wa-chip" type="button" data-sub="${esc(x.id)}" aria-pressed="${draft.subs.includes(x.id)}">${esc(x.label)}</button>`).join('')}</div>` : '';
      return `<li class="mood-item"><button class="mood-row" type="button" data-mood="${esc(m.id)}" aria-pressed="${on}">${P(m.picto)}<span class="mood-row__t"><b>${esc(m.label)}</b><small>${esc(m.hint)}</small></span><span class="mood-row__tick">${I('check')}</span></button>${subs}</li>`;
    };
    return `<p class="mood-lead">Pick one or a few. None means anything.</p>
      <ul class="mood-list" role="group" aria-label="Moods">${moods.map(item).join('')}</ul>
      <h3 class="mood-h">Tickets</h3>
      <div class="mood-seg" role="group" aria-label="Ticket price limit">${CAPS.map(([c, label]) => `<button type="button" data-cap="${c == null ? '' : c}" aria-pressed="${draft.cap === c}">${label}</button>`).join('')}</div>
      <p class="wa-note">Shows with no listed price stay in.</p>`;
  };
  const sheetFoot = () => `${draft.moods.length || draft.cap != null ? '<button class="wa-btn wa-btn--quiet" type="button" id="mood-clear">Clear</button>' : ''}<button class="wa-btn wa-btn--primary" type="button" id="mood-apply">Show the next few hours</button>`;
  const openSheet = () => {
    if (!M()) return;
    draft = pref();
    const sheet = $('sheet');
    sheet.classList.add('wa-sheet--mood');
    $('sheet-title').textContent = "What's the mood?";
    $('sheet-body').innerHTML = sheetBody();
    $('sheet-foot').innerHTML = sheetFoot();
    sheet.addEventListener('close', () => sheet.classList.remove('wa-sheet--mood'), { once: true });
    sheet.showModal();
  };

  /* ── The next few hours ─────────────────────────────────────── */
  let plans = [], planIdx = 0, planKey = '';
  const readPlans = () => {
    const p = pref();
    const key = `${p.moods}|${p.subs}|${p.cap}|${nearOn()}`;
    const next = window.WA.Route.plan({ want: p, cap: p.cap, near: nearOn() });
    if (key !== planKey || !plans.length) planIdx = 0;
    planKey = key; plans = next;
    if (planIdx >= plans.length) planIdx = 0;
    return p;
  };
  const planCard = (p) => {
    if (plans[planIdx]) return window.WA.Route.card(plans[planIdx], { actions: true, more: plans.length > 1 });
    const narrowed = p.moods.length || p.cap != null || nearOn();
    return `<section class="rt-card rt-card--empty"><p class="rt-card__title">${narrowed ? 'Nothing fits that right now.' : 'No route for the next few hours.'}</p>
      <p class="rt-card__sub">${narrowed ? (nearOn() && !p.moods.length && p.cap == null ? 'Nothing is a short walk from you. Turn Near me off for the whole city.' : 'Try another mood or a higher price limit.') : 'The Guide has the places; the Programme has the listings.'}</p>
      <div class="rt-card__acts">${narrowed ? '<button class="wa-btn wa-btn--pill" type="button" data-mood-open>Change</button>' : '<a class="wa-btn wa-btn--pill" href="places.html">Guide</a>'}</div></section>`;
  };

  /* The next day after today with anything listed. */
  const nextDay = (all) => {
    const groups = R().byDay(all.filter(e => { const k = W().resolveKey(e); return k && k > W().todayKey(); }));
    return groups.length ? { key: groups[0][0], items: groups[0][1] } : null;
  };

  /* Today is a list, in time order: what is on now, then what starts, then what has
     no time listed. Tomorrow and one more stretch are a tap away: the weekend from
     Monday to Thursday, the rest of the week from Friday, when the weekend is
     already today or tomorrow. A tab with nothing in it is not shown; everything
     else is the Programme. When today is empty the next day listed opens instead. */
  let dayTab = '';
  const days = () => {
    const dow = new Date(`${W().todayKey()}T12:00:00Z`).getUTCDay();
    return [['tonight', 'Today'], ['tomorrow', 'Tomorrow'], dow >= 1 && dow <= 4 ? ['weekend', 'Weekend'] : ['thisweek', 'This week']];
  };
  const dayList = (all, tab, p) => {
    let list = tab === 'tonight' ? all.filter(e => W().isTonight(e))
      : tab === 'tomorrow' ? all.filter(e => W().matches(e, 'tomorrow') && !W().isTonight(e))
        : all.filter(e => W().matches(e, tab) && !W().isTonight(e) && !W().matches(e, 'tomorrow'));
    list = sortSoon(list);
    if (M() && p.moods.length) list = list.filter(e => M().wantsEvent(p, e));
    if (p.cap != null) list = list.filter(e => R().isFree(e) || e.priceMin == null || Number(e.priceMin) <= p.cap);
    const timed = (e) => W().statedMinutes(e) != null;
    const ordered = [...list.filter(e => !R().isOff(e) && timed(e)), ...list.filter(e => !R().isOff(e) && !timed(e)), ...list.filter(e => R().isOff(e))];
    if (!nearOn()) return ordered;
    /* Near me: nearest first; a listing we cannot place goes last, in time order. */
    const far = (e) => { const d = R().isOff(e) ? null : G().distanceTo(e); return d == null ? Infinity : d; };
    return ordered.map((e, i) => [e, far(e), i]).sort((a, b) => (a[1] - b[1]) || (a[2] - b[2])).map(x => x[0]);
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
    const from = G().currentLoc() || centre();
    const d = (v) => { const m = from ? G().distanceTo(v, from) : null; return m == null ? 1e9 : m; };
    return R().places().filter(v => v.picked)
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
    const from = G().currentLoc() || centre();
    const note = `${openN ? `${openN} open now · ` : ''}${G().currentLoc() ? 'nearest to you first' : 'nearest the centre first'}`;
    return `${row}<p class="wa-note home-day__note">${esc(note)}</p>
      <ul class="home-places">${list.slice(0, cap).map(v => R().placeRow(v, { from })).join('')}</ul>
      <div class="home-day__foot">${list.length > cap && cap < MOST ? `<button class="wa-btn wa-btn--pill home-day__all" type="button" data-day-all>${I('down')}Show ${Math.min(list.length, MOST) - cap} more</button>` : ''}
      <a class="wa-linkbtn home-day__more" href="places.html${placeGroup ? `?kind=${esc(placeGroup)}` : ''}">The Guide ${I('arrow')}</a></div>`;
  };
  const viewSwitch = (nEvents, places) => {
    const open = places.filter(isOpen).length;
    const btn = (id, label, n, cls = '') => `<button type="button" data-view="${id}" aria-pressed="${view === id}">${label} <span class="home-view__n${cls}">${n}</span></button>`;
    return `<div class="mood-seg home-view" role="group" aria-label="Show">${btn('events', 'Events', nEvents)}${places.length ? btn('places', 'Places', open ? `${open} open` : places.length, open ? ' is-open' : '') : ''}</div>`;
  };

  const main = () => {
    const all = R().live();
    const tonight = sortSoon(all.filter(e => W().isTonight(e)));
    const liveNow = tonight.filter(e => R().isLive(e));
    const next = nextDay(all);
    hero(tonight, liveNow, next);
    acts();
    const p = readPlans();
    const DAYS = days();
    const lists = Object.fromEntries(DAYS.map(([k]) => [k, dayList(all, k, p)]));
    const tabs = DAYS.filter(([k]) => lists[k].length);
    const tab = dayTab && lists[dayTab] && lists[dayTab].length ? dayTab : (tabs[0] || DAYS[0])[0];
    const full = lists[tab];
    const shown = facets(full);
    if (facet && !shown.some(([id]) => id === facet)) facet = '';
    const list = facet ? full.filter(e => inFacet(facet, e)) : full;
    const cap = expanded || facet ? MOST : SHOWN;
    const out = [`<section class="wa-sect rt-sect" id="plan">${planCard(p)}</section>`];

    const places = pickedPlaces();
    if (!places.length && view === 'places') view = 'events';
    if (view === 'places') {
      out.push(`<section class="wa-sect home-day">${viewSwitch(full.length, places)}${placesPart(places)}</section>`);
    } else if (all.length) {
      const q = new URLSearchParams({ time: tab });
      if (facet === 'comedy') q.set('q', 'comedy'); else if (facet) q.set('cat', facet);
      if (nearOn()) q.set('sort', 'nearest');
      out.push(`<section class="wa-sect home-day">${viewSwitch(full.length, places)}
        ${tabs.length ? `<div class="home-tabs" role="tablist" aria-label="Day">${tabs.map(([k, label]) => `<button class="home-tab" type="button" role="tab" data-day="${k}" aria-selected="${k === tab}">${label}</button>`).join('')}</div>` : ''}
        ${facetRow(full, shown)}
        ${nearOn() && list.length ? '<p class="wa-note home-day__note">Nearest first, walking from you</p>' : ''}
        ${list.length ? `<ul class="wa-rows">${list.slice(0, cap).map(e => R().row(e, { since: visit.prev })).join('')}</ul>` : ''}
        <div class="home-day__foot">${list.length > cap && cap < MOST ? `<button class="wa-btn wa-btn--pill home-day__all" type="button" data-day-all>${I('down')}Show ${Math.min(list.length, MOST) - cap} more</button>` : ''}
        <a class="wa-linkbtn home-day__more" href="discover.html?${esc(q.toString())}">${list.length > cap ? `All ${list.length}` : 'Programme'} ${I('arrow')}</a></div>
      </section>`);
    } else {
      out.push(R().empty(window.WA.DATA_LIVE === false
        ? { icon: 'offline', title: "We can't reach the listings right now.", body: 'Your saves still work. Try again in a moment.', actions: [{ act: 'reload', label: 'Try again' }, { href: 'saved.html', label: 'Saved' }] }
        : { icon: 'calendar', title: `Nothing is listed in ${R().cityName()} yet.`, body: 'The sources are read every six hours. The places are open regardless.', actions: [{ href: 'places.html', label: 'Guide' }] }));
    }
    $('home-main').innerHTML = out.join('');
    if (window.WA.UI.edges) window.WA.UI.edges();
    return all;
  };

  /* Another: the next route in line, the card drawn again. Only the card changes. */
  const another = () => {
    if (plans.length < 2) return;
    planIdx = (planIdx + 1) % plans.length;
    const host = $('plan');
    if (host) { host.dataset.again = '1'; host.innerHTML = planCard(pref()); }
  };

  /* ── Side (desktop): the map ─────────────────────────────────── */
  const side = () => {
    const mapCard = `<section class="wa-sect"><a class="wa-mapcard" href="map.html">
      <img class="wa-mapcard__art" src="assets/tallinn-overview.svg" alt="" loading="lazy">
      <span class="wa-mapcard__glass"><span class="wa-mapcard__title">${I('map')}Show the map</span>
      <span class="wa-mapcard__sub">Today's events and the places open now, by walking time.</span></span></a></section>`;
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
    acts();
    const all = main();
    side();
    since(all);
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    const dt = hit('[data-day]');
    if (dt) { dayTab = dt.dataset.day; expanded = false; main(); return; }
    const vw = hit('[data-view]');
    if (vw) {
      view = vw.dataset.view; expanded = false; main();
      const q = new URLSearchParams(location.search);
      if (view === 'places') q.set('view', 'places'); else q.delete('view');
      history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
      return;
    }
    const gp = hit('[data-group]');
    if (gp) { placeGroup = placeGroup === gp.dataset.group ? '' : gp.dataset.group; expanded = false; main(); return; }
    const fc = hit('[data-facet]');
    if (fc) { facet = facet === fc.dataset.facet ? '' : fc.dataset.facet; expanded = false; main(); return; }
    if (hit('[data-day-all]')) {
      expanded = true; main();
      const rows = document.querySelectorAll('.home-day .wa-rows > li, .home-places > li');
      const first = rows[SHOWN] && rows[SHOWN].querySelector('a');
      if (first) first.focus({ preventScroll: true });
      return;
    }
    if (hit('[data-near]')) {
      if (nearOn()) { setNear(false); render(); return; }
      setNear(true);
      if (G().currentLoc()) { render(); return; }
      nearBusy = true; acts();
      G().userLoc().then((loc) => { nearBusy = false; nearOff = !loc; if (!loc) setNear(false); render(); });
      return;
    }
    if (hit('[data-mood-open]')) { openSheet(); return; }
    const mt = hit('.mood-row');
    if (mt && draft) {
      const id = mt.dataset.mood, on = !draft.moods.includes(id);
      draft.moods = on ? [...draft.moods, id] : draft.moods.filter(x => x !== id);
      const subs = $('sheet-body').querySelector(`[data-subs-of="${CSS.escape(id)}"]`);
      if (!on && subs) { const mine = [...subs.querySelectorAll('[data-sub]')].map(b => b.dataset.sub); draft.subs = draft.subs.filter(x => !mine.includes(x)); subs.querySelectorAll('[data-sub]').forEach(b => b.setAttribute('aria-pressed', 'false')); }
      mt.setAttribute('aria-pressed', String(on));
      if (subs) subs.hidden = !on;
      $('sheet-foot').innerHTML = sheetFoot();
      return;
    }
    const sb = hit('.mood-subs [data-sub]');
    if (sb && draft) {
      const id = sb.dataset.sub, on = !draft.subs.includes(id);
      draft.subs = on ? [...draft.subs, id] : draft.subs.filter(x => x !== id);
      sb.setAttribute('aria-pressed', String(on));
      return;
    }
    const cp = hit('.mood-seg [data-cap]');
    if (cp && draft) {
      draft.cap = cp.dataset.cap === '' ? null : Number(cp.dataset.cap);
      $('sheet-body').querySelectorAll('.mood-seg [data-cap]').forEach(b => b.setAttribute('aria-pressed', String(b === cp)));
      $('sheet-foot').innerHTML = sheetFoot();
      return;
    }
    if (hit('#mood-clear') && draft) { draft = { moods: [], subs: [], cap: null }; $('sheet-body').innerHTML = sheetBody(); $('sheet-foot').innerHTML = sheetFoot(); return; }
    if (hit('#mood-apply')) {
      /* Moods set aside for this hour stay chosen; only what the sheet showed changes. */
      const was = M().pref(), here = new Set(M().available().map(m => m.id));
      const kept = was.moods.filter(id => !here.has(id));
      M().setPref({ moods: [...draft.moods, ...kept], subs: [...draft.subs, ...was.subs.filter(x => kept.some(k => M().get(k).subs.some(s => s.id === x)))], cap: draft.cap });
      $('sheet').close();
      return;
    }
    if (hit('[data-another]')) { another(); return; }
    if (hit('#sheet-done') || hit('#sheet-close')) { $('sheet').close(); return; }
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
  document.addEventListener('wa:location-ready', render);
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
