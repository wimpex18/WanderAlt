/* ============================================================
   home.js — Tonight, the home screen.
   ------------------------------------------------------------
   The search field and the category bar first. Then card shelves: what is on now, what starts soon (or late, after
   21:30), what fits your interests, this weekend, and on the side the
   places open now and the areas. Never empty: when tonight has
   nothing, the next listed day takes its place.
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const G = () => window.WA.Geo;
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
    return `${R().dateShort(k)} · ${window.WA.Hours.clock(m)}${heroCount ? ` · ${heroCount} on` : ''}`;
  };

  let heroCount = 0;
  const hero = (tonight, liveNow, next) => {
    $('hero-kicker').textContent = R().cityName();
    const t = $('hero-title');
    const n = tonight.length;
    heroCount = liveNow.length || n;
    if (isLate() && (liveNow.length || n)) t.textContent = 'Still going';
    else if (n) t.textContent = 'Tonight';
    else t.textContent = next ? 'Quiet tonight' : "What's on tonight";
    $('hero-clock').textContent = clockText();
  };

  /* ── The pill and the category bar ──────────────────────── */
  const CATS = [
    ['all', 'All', 'discover.html'], ['gig', 'Gigs', 'discover.html?cat=gig'], ['club', 'Club nights', 'discover.html?cat=club'],
    ['film', 'Film', 'discover.html?cat=film'], ['theatre', 'Stage', 'discover.html?cat=theatre'],
    ['art', 'Art', 'discover.html?cat=exhibition'], ['talk', 'Talks', 'discover.html?cat=talk'],
    ['workshop', 'Workshops', 'discover.html?cat=workshop'], ['festival', 'Festivals', 'discover.html?cat=festival'],
    ['records', 'Places', 'places.html'],
  ];
  const cats = () => {
    const host = $('cats');
    if (!host || host.childElementCount) return;
    host.innerHTML = CATS.map(([p, label, href], i) => `<a class="wa-cat" href="${esc(href)}"${i === 0 ? ' aria-current="true"' : ''}>${window.WA.Picto(p)}<span>${esc(label)}</span></a>`).join('');
    peek();
  };

  /* The kind row must show that it goes on. Whatever the screen width, the
     first item that does not fit is left half in view: the gap between the
     kinds is set so it lands about half over the edge (2 to 24px). From 1024
     the whole row fits and the gap is left alone. */
  const peek = () => {
    const nav = $('cats');
    if (!nav || !nav.childElementCount) return;
    nav.style.removeProperty('--cat-gap');
    if (matchMedia('(min-width: 1024px)').matches) return;
    const items = [...nav.children];
    const w = items.map(a => a.getBoundingClientRect().width);
    const g0 = parseFloat(getComputedStyle(nav).columnGap) || 4;
    const edge = nav.clientWidth;
    const pad = parseFloat(getComputedStyle(nav).paddingLeft) || 0;
    /* Which item to leave half in view: the first that does not fit, or one
       either side when the gap would leave 2..24px. The kinds differ in width
       (labels, text size), so this is worked out from what is on screen. */
    const total = w.reduce((x, y) => x + y, 0) + g0 * (items.length - 1) + 2 * pad;
    if (total <= edge + 1) return;
    let k0 = 0, left = pad;
    while (k0 < items.length && left + w[k0] <= edge + 1) { left += w[k0] + g0; k0++; }
    let best = null;
    for (const k of [k0, k0 - 1, k0 + 1]) {
      if (k < 1 || k >= items.length) continue;
      const before = w.slice(0, k).reduce((x, y) => x + y, 0);
      const g = (edge - w[k] * 0.5 - pad - before) / k;
      if (g >= 2 && g <= 24) { best = g; break; }
    }
    if (best != null) nav.style.setProperty('--cat-gap', `${best.toFixed(1)}px`);
  };
  /* Text size changes (Dynamic Type, Android font scale) resize the tiles
     without resizing the window. */
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => peek()); const hook = () => { const n = $('cats'); if (n && n.firstElementChild) ro.observe(n.firstElementChild); }; hook(); setTimeout(hook, 500); }
  window.addEventListener('resize', peek);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(peek);

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
    host.innerHTML = here ? '' : (nearOff
      ? `<span class="wa-act wa-act--off">${I('nav')}Location is off</span><p class="wa-note home-acts__note">Walking times need location. Allow it for this site in your browser settings.</p>`
      : `<button class="wa-act" type="button" data-near${nearBusy ? ' disabled' : ''}>${I('nav')}${nearBusy ? 'Finding you' : 'Near me'}</button>`);
  };

  /* The next day after today with anything listed. */
  const nextDay = (all) => {
    const groups = R().byDay(all.filter(e => { const k = W().resolveKey(e); return k && k > W().todayKey(); }));
    return groups.length ? { key: groups[0][0], items: groups[0][1] } : null;
  };

  /* Tonight is a list, in time order: what is on now, then what starts.
     Tomorrow and the weekend are one tap away; everything else is the
     Programme. When tonight is empty the next day listed opens instead. */
  let dayTab = '';
  const DAYS = [['tonight', 'Tonight'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend']];
  const dayList = (all, tab) => {
    const list = tab === 'tonight' ? sortSoon(all.filter(e => W().isTonight(e)))
      : sortSoon(all.filter(e => W().matches(e, tab) && !W().isTonight(e)));
    return [...list.filter(e => !R().isOff(e)), ...list.filter(e => R().isOff(e))];
  };
  const SHOWN = 12;

  const main = () => {
    const all = R().live();
    const tonight = sortSoon(all.filter(e => W().isTonight(e)));
    const liveNow = tonight.filter(e => R().isLive(e));
    const next = nextDay(all);
    hero(tonight, liveNow, next);

    const lists = Object.fromEntries(DAYS.map(([k]) => [k, dayList(all, k)]));
    const tab = dayTab && lists[dayTab] ? dayTab : (DAYS.find(([k]) => lists[k].length) || DAYS[0])[0];
    const list = lists[tab];
    const out = [];
    /* An evening in a few stops, when tonight has one worth walking. */
    const evening = window.WA.Route && window.WA.Route.best();
    if (evening) out.push(`<section class="wa-sect rt-sect">${window.WA.Route.card(evening)}</section>`);

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
      <span class="wa-mapcard__sub">Tonight's events and the places open now, by walking time.</span></span></a></section>`;
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
    cats();
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
  document.addEventListener('wa:location-ready', render);
  /* The clock ticks; the lists redraw every five minutes so "on now"
     and "starting soon" stay true on a phone left open. */
  setInterval(() => { $('hero-clock').textContent = clockText(); }, 30000);
  setInterval(() => { if (document.visibilityState === 'visible' && window.WA.catalog) render(); }, 300000);

  const skeleton = () => {
    $('hero-clock').textContent = clockText();
    cats();
    acts();
    $('home-main').innerHTML = `<section class="wa-sect">${R().skelRows(5)}</section>`;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', skeleton, { once: true });
  else skeleton();
})();
