/* ============================================================
   home.js — Now, the home screen.
   ------------------------------------------------------------
   The search field, then one answer: the next few hours as a short walk
   (route.js plan()), with Walk it and Another. One key opens the mood
   and price sheet (moods.js); there is no row of kinds to scroll. Under
   the answer, the day's listings in time order, those with no time last.
   Never empty: when today has nothing, the next listed day takes its place.
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
    const q = $('home-q').value.trim();
    location.href = q ? `discover.html?q=${encodeURIComponent(q)}` : 'discover.html?focus=search';
  };

  /* ── Near me ───────────────────────────────────────────────────
     One key under the headline. It asks for the location (only on a tap);
     once known, walking times appear on every row and the picked places
     beside the list come closest first. */
  let nearBusy = false, nearOff = false;
  const acts = () => {
    const host = $('home-acts');
    if (!host) return;
    const here = !!G().currentLoc();
    const mood = M() ? `<button class="wa-chip home-mood__key" type="button" data-mood-open aria-haspopup="dialog">${I('filter')}<span>${esc(M().summary())}</span></button>` : '';
    host.innerHTML = mood + (here ? '' : (nearOff
      ? `<span class="wa-act wa-act--off">${I('nav')}Location is off</span><p class="wa-note home-acts__note">Walking times need location. Allow it for this site in your browser settings.</p>`
      : `<button class="wa-act" type="button" data-near${nearBusy ? ' disabled' : ''}>${I('nav')}${nearBusy ? 'Finding you' : 'Near me'}</button>`));
  };

  /* ── Mood and price: one key, one sheet ─────────────────────── */
  let draft = null;
  const CAPS = [[0, 'Free'], [10, '€10'], [20, '€20'], [null, 'Any']];
  const sheetBody = () => {
    const moods = M().available();
    const tile = (id, icon, label, hint) => `<button class="mood-tile" type="button" data-mood="${esc(id)}" aria-pressed="${draft.mood === id}"><span class="mood-tile__d mood-tile__d--${esc(id || 'any')}">${I(icon)}</span><b>${esc(label)}</b><small>${esc(hint)}</small></button>`;
    return `<p class="mood-lead">Moods follow the hour and what the city has. Leave it on Anything and the route decides.</p>
      <div class="mood-grid" role="group" aria-label="Mood">${tile('', 'shuffle', 'Anything', 'Let the route decide')}${moods.map(m => tile(m.id, m.id, m.label, m.hint)).join('')}</div>
      <h3 class="mood-h">Tickets up to</h3>
      <div class="mood-seg" role="group" aria-label="Ticket price limit">${CAPS.map(([c, label]) => `<button type="button" data-cap="${c == null ? '' : c}" aria-pressed="${draft.cap === c}">${label}</button>`).join('')}</div>
      <p class="wa-note">With a limit set, shows with no price listed stay in and say “Price not listed”. Shops and bars have no price, so only tickets count.</p>`;
  };
  const openSheet = () => {
    if (!M()) return;
    draft = M().pref();
    const sheet = $('sheet');
    sheet.classList.add('wa-sheet--mood');
    $('sheet-title').textContent = 'What are you in the mood for?';
    $('sheet-body').innerHTML = sheetBody();
    $('sheet-foot').innerHTML = '<button class="wa-btn wa-btn--primary wa-btn--wide" type="button" id="mood-apply">Show the next few hours</button>';
    sheet.addEventListener('close', () => sheet.classList.remove('wa-sheet--mood'), { once: true });
    sheet.showModal();
  };

  /* ── The next few hours ─────────────────────────────────────── */
  let plans = [], planIdx = 0, planKey = '';
  const readPlans = () => {
    const p = M() ? M().pref() : { mood: '', cap: null };
    const key = `${p.mood}|${p.cap}`;
    const next = window.WA.Route.plan({ mood: p.mood || '', cap: p.cap });
    if (key !== planKey || !plans.length) planIdx = 0;
    planKey = key; plans = next;
    if (planIdx >= plans.length) planIdx = 0;
    return p;
  };
  const planCard = (p) => {
    if (plans[planIdx]) return window.WA.Route.card(plans[planIdx], { actions: true, more: plans.length > 1 });
    const narrowed = p.mood || p.cap != null;
    return `<section class="rt-card rt-card--empty"><p class="rt-card__title">${narrowed ? 'Nothing fits that right now.' : 'No route for the next few hours.'}</p>
      <p class="rt-card__sub">${narrowed ? 'Try another mood or a higher price limit.' : 'The Guide has the places; the Programme has the listings.'}</p>
      <div class="rt-card__acts">${narrowed ? '<button class="wa-btn wa-btn--pill" type="button" data-mood-open>Change</button>' : '<a class="wa-btn wa-btn--pill" href="places.html">Guide</a>'}</div></section>`;
  };

  /* The next day after today with anything listed. */
  const nextDay = (all) => {
    const groups = R().byDay(all.filter(e => { const k = W().resolveKey(e); return k && k > W().todayKey(); }));
    return groups.length ? { key: groups[0][0], items: groups[0][1] } : null;
  };

  /* Today is a list, in time order: what is on now, then what starts, then what has
     no time listed. Tomorrow and the weekend are one tap away; everything else is the
     Programme. When today is empty the next day listed opens instead. */
  let dayTab = '';
  const DAYS = [['tonight', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend']];
  const dayList = (all, tab, p) => {
    let list = tab === 'tonight' ? sortSoon(all.filter(e => W().isTonight(e)))
      : sortSoon(all.filter(e => W().matches(e, tab) && !W().isTonight(e)));
    if (p.mood && M()) list = list.filter(e => M().matchesEvent(p.mood, e));
    if (p.cap != null) list = list.filter(e => R().isFree(e) || e.priceMin == null || Number(e.priceMin) <= p.cap);
    const timed = (e) => W().statedMinutes(e) != null;
    return [...list.filter(e => !R().isOff(e) && timed(e)), ...list.filter(e => !R().isOff(e) && !timed(e)), ...list.filter(e => R().isOff(e))];
  };
  const SHOWN = 12;

  const main = () => {
    const all = R().live();
    const tonight = sortSoon(all.filter(e => W().isTonight(e)));
    const liveNow = tonight.filter(e => R().isLive(e));
    const next = nextDay(all);
    hero(tonight, liveNow, next);
    acts();
    const p = readPlans();

    const lists = Object.fromEntries(DAYS.map(([k]) => [k, dayList(all, k, p)]));
    const tab = dayTab && lists[dayTab] ? dayTab : (DAYS.find(([k]) => lists[k].length) || DAYS[0])[0];
    const list = lists[tab];
    const out = [`<section class="wa-sect rt-sect" id="plan">${planCard(p)}</section>`];

    if (all.length) {
      const href = tab === 'tonight' ? 'discover.html?time=tonight' : `discover.html?time=${tab}`;
      out.push(`<section class="wa-sect home-day">
        <div class="home-tabs" role="tablist" aria-label="Day">${DAYS.map(([k, label]) => `<button class="home-tab" type="button" role="tab" data-day="${k}" aria-selected="${k === tab}"${lists[k].length ? '' : ' disabled'}>${label}</button>`).join('')}</div>
        ${list.length ? `<ul class="wa-rows">${list.slice(0, SHOWN).map(e => R().row(e, { since: visit.prev })).join('')}</ul>` : ''}
        <a class="wa-linkbtn home-day__more" href="${href}">${list.length > SHOWN ? `All ${list.length}` : 'Programme'} ${I('arrow')}</a>
      </section>`);
    } else {
      out.push(R().empty(window.WA.DATA_LIVE === false
        ? { icon: 'offline', title: "We can't reach the listings right now.", body: 'Your saves still work. Try again in a moment.', actions: [{ act: 'reload', label: 'Try again' }, { href: 'saved.html', label: 'Saved' }] }
        : { icon: 'calendar', title: `Nothing is listed in ${R().cityName()} yet.`, body: 'The sources are read every six hours. The places are open regardless.', actions: [{ href: 'places.html', label: 'Guide' }] }));
    }
    $('home-main').innerHTML = out.join('');
    return all;
  };

  /* Another: the next route in line, the card drawn again. Only the card changes. */
  const another = () => {
    if (plans.length < 2) return;
    planIdx = (planIdx + 1) % plans.length;
    const host = $('plan');
    if (host) { host.dataset.again = '1'; host.innerHTML = planCard(M() ? M().pref() : { mood: '', cap: null }); }
  };

  /* ── Side: picked places, and the map ───────────────────────── */
  const side = () => {
    const picked = R().places().filter(v => v.picked);
    const rank = (v) => { const d = G().distanceTo(v); return d == null ? 1e9 : d; };
    const list = picked.slice().sort((a, b) =>
      G().currentLoc() ? rank(a) - rank(b)
        : (R().openState(b).open === true) - (R().openState(a).open === true) || String(a.name).localeCompare(String(b.name), 'et')).slice(0, 5);
    const places = list.length ? `<section class="wa-sect">${R().sect({ title: 'Worth the walk', sub: G().currentLoc() ? 'Picked places, closest first' : 'Picked places', href: 'places.html', more: 'The Guide' })}
        <ul>${list.map(v => R().placeRow(v)).join('')}</ul></section>` : '';
    const mapCard = `<section class="wa-sect"><a class="wa-mapcard" href="map.html">
      <img class="wa-mapcard__art" src="assets/tallinn-overview.svg" alt="" loading="lazy">
      <span class="wa-mapcard__glass"><span class="wa-mapcard__title">${I('map')}Show the map</span>
      <span class="wa-mapcard__sub">Today's events and the places open now, by walking time.</span></span></a></section>`;
    $('home-side').innerHTML = places + mapCard;
  };

  /* ── New since the last visit ──────────────────────────────── */
  const since = (all) => {
    const host = $('since');
    const prev = visit.prev;
    const n = prev ? all.filter(e => R().isNewSince(e, prev)).length : 0;
    if (!n) { host.innerHTML = ''; return; }
    const d = new Date(prev);
    const when = (Date.now() - prev) < 86400000 * 6
      ? d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/Tallinn' })
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
    if (dt) { dayTab = dt.dataset.day; main(); return; }
    if (hit('[data-near]')) {
      nearBusy = true; acts();
      G().userLoc().then((loc) => { nearBusy = false; if (!loc) nearOff = true; acts(); });
      return;
    }
    if (hit('[data-mood-open]')) { openSheet(); return; }
    const mt = hit('.mood-tile');
    if (mt && draft) {
      draft.mood = mt.dataset.mood;
      $('sheet-body').querySelectorAll('.mood-tile').forEach(b => b.setAttribute('aria-pressed', String(b === mt)));
      return;
    }
    const cp = hit('.mood-seg [data-cap]');
    if (cp && draft) {
      draft.cap = cp.dataset.cap === '' ? null : Number(cp.dataset.cap);
      $('sheet-body').querySelectorAll('.mood-seg [data-cap]').forEach(b => b.setAttribute('aria-pressed', String(b === cp)));
      return;
    }
    if (hit('#mood-apply')) { M().setPref(draft); $('sheet').close(); return; }
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
})();
