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
    return `${R().dateShort(k)} · ${window.WA.Hours.clock(m)}`;
  };

  const hero = (tonight, liveNow, next) => {
    $('hero-kicker').textContent = R().cityName();
    $('hero-clock').textContent = clockText();
    const t = $('hero-title');
    const n = tonight.length;
    if (isLate() && (liveNow.length || n)) {
      const k = liveNow.length || n;
      t.innerHTML = `<em>${k}</em> ${k === 1 ? 'thing' : 'things'} still going`;
    } else if (n) {
      t.innerHTML = `<em>${n}</em> ${n === 1 ? 'thing' : 'things'} on tonight`;
    } else if (next) {
      t.innerHTML = `Quiet tonight. <em>${next.items.length}</em> on ${esc(R().dayName(next.key).toLowerCase() === 'tomorrow' ? 'tomorrow' : R().dayName(next.key))}`;
    } else {
      t.textContent = "What's on tonight";
    }
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

  /* ── Interests ─────────────────────────────────────────────────
     Optional and out of the way: no card on the page. The shelf, or a
     quiet row at the end when there is none, opens a small sheet; each tap
     is saved at once and the shelf behind it follows. */
  const interestSheet = () => {
    const ids = R().interests.ids();
    const full = ids.length >= 3;
    $('sheet').classList.remove('wa-sheet--finder');
    $('sheet-title').textContent = 'Your kinds';
    $('sheet-body').innerHTML = `<p class="wa-note">Pick up to three kinds and Tonight gives them a shelf. Nothing else is hidden.</p>
      <div class="wa-chips" style="margin-top:var(--s-4)">${R().interests.OPTIONS.map(o => `<button class="wa-chip" type="button" data-interest="${esc(o.id)}" aria-pressed="${ids.includes(o.id)}"${full && !ids.includes(o.id) ? ' disabled' : ''}>${o.icon === 'globe' ? I('globe') : window.WA.Picto(o.icon)}${esc(o.label)}</button>`).join('')}</div>`;
    $('sheet-foot').innerHTML = '<button class="wa-btn wa-btn--primary wa-btn--wide" type="button" id="sheet-done">Done</button>';
  };
  const openInterests = () => { interestSheet(); if (!$('sheet').open) $('sheet').showModal(); };

  /* ── Two keys under the headline ───────────────────────────────
     Near me asks for the location (only on a tap) and puts a shelf of what
     is closest on foot first. Pick your kinds opens the sheet above. Both
     are in the accent's tint so they are seen; the row keeps its height
     in every state, so nothing moves when it changes. */
  let nearBusy = false, nearOff = false;
  const acts = () => {
    const host = $('home-acts');
    if (!host) return;
    const n = R().interests.ids().length;
    const here = !!G().currentLoc();
    const near = here ? '' : nearOff
      ? `<span class="wa-act wa-act--off">${I('nav')}Location is off</span>`
      : `<button class="wa-act" type="button" data-near${nearBusy ? ' disabled' : ''}>${I('nav')}${nearBusy ? 'Finding you' : 'Near me'}</button>`;
    host.innerHTML = `${near}<button class="wa-act" type="button" data-interests-open>${I('kinds')}${n ? `Your kinds · ${n}` : 'Pick your kinds'}</button>`
      + (!here && nearOff ? '<p class="wa-note home-acts__note">Walking times need location. Allow it for this site in your browser settings.</p>' : '');
  };

  /* Near you: what is on tonight (else the next listed day), closest on
     foot first; within half an hour's walk when anything is. */
  const nearShelf = (tonight, next) => {
    if (!G().currentLoc()) return '';
    const day = tonight.length ? null : next;
    const pool = (day ? day.items : tonight).filter(e => !R().isOff(e));
    const ranked = pool.map(e => [e, G().distanceTo(e)]).filter(([, d]) => d != null).sort((a, b) => a[1] - b[1]);
    if (!ranked.length) return '';
    const close = ranked.filter(([, d]) => G().walkMinutes(d) <= 30);
    const list = (close.length ? close : ranked.slice(0, 6)).slice(0, 12).map(([e]) => e);
    return shelf({
      title: day ? `Near you, ${R().dayName(day.key)}` : 'Near you tonight', n: list.length,
      sub: close.length ? 'Closest first, on foot from where you are' : 'Nothing within 30 min on foot. Closest first.',
    }, list);
  };

  /* ── Sections ───────────────────────────────────────────────── */
  const section = (head, body, cls) => `<section class="wa-sect${cls ? ` ${cls}` : ''}">${R().sect(head)}${body}</section>`;
  /* A cancelled or postponed show stays listed, labelled, at the end. */
  const cards = (list, opts) => [...list.filter(e => !R().isOff(e)), ...list.filter(e => R().isOff(e))].map(e => R().poster(e, opts)).join('');
  const shelf = (head, list) => R().shelf(head, cards(list, { compact: head.compact }));

  /* The next day after today with anything listed. */
  const nextDay = (all) => {
    const groups = R().byDay(all.filter(e => { const k = W().resolveKey(e); return k && k > W().todayKey(); }));
    return groups.length ? { key: groups[0][0], items: groups[0][1] } : null;
  };

  const main = () => {
    const shown = new Set();
    const fresh = (list) => list.filter(e => !shown.has(e.id));
    const draw = (head, list) => { list.forEach(e => shown.add(e.id)); return shelf(head, list); };
    const all = R().live();
    const tonight = sortSoon(all.filter(e => W().isTonight(e)));
    const liveNow = tonight.filter(e => R().isLive(e));
    const later = tonight.filter(e => !R().isLive(e));
    const next = nextDay(all);
    hero(tonight, liveNow, next);

    const out = [];
    if (liveNow.length) {
      out.push(draw({ title: 'On now', n: liveNow.length, sub: 'Started, and not over yet', compact: true }, liveNow.slice(0, 12)));
    }

    if (later.length) {
      const late = isLate();
      /* Late means 21:00 on, or the small hours once past midnight. */
      const lateOnes = later.filter(e => { const m = W().statedMinutes(e); return m == null || m >= 21 * 60 || m < 5 * 60; });
      const list = late && lateOnes.length ? lateOnes : later;
      out.push(draw({
        title: late ? 'Starting late' : 'Starting soon', n: list.length,
        href: 'discover.html?time=tonight', more: 'All tonight',
      }, list.slice(0, 12)));
    } else if (next) {
      out.push(draw({
        title: `${R().dayName(next.key)}, ${R().dateShort(next.key)}`, n: next.items.length,
        sub: liveNow.length ? 'Nothing else starts tonight, so this is next.' : `Nothing is filed for tonight in ${R().cityName()}, so this is next.`,
        href: `discover.html?date=${next.key}`, more: R().dateShort(next.key),
      }, sortSoon(next.items).slice(0, 12)));
    }

    /* For you: this week's listings that match the chosen interests. */
    const ids = R().interests.ids();
    if (ids.length) {
      const matches = all.filter(e => W().matches(e, 'thisweek') && R().interests.matches(e));
      const mine = sortSoon(fresh(matches));
      const names = R().interests.OPTIONS.filter(o => ids.includes(o.id)).map(o => o.label);
      out.push(mine.length
        ? draw({ title: 'For you this week', n: mine.length, sub: names.join(', ') }, mine.slice(0, 12))
        : section({ title: 'For you this week' }, `<p class="wa-note">${matches.length ? 'Your matches are shown above.' : 'Nothing this week matches yet. New listings arrive every six hours.'}</p>`));
    }

    const weekend = sortSoon(fresh(all).filter(e => W().matches(e, 'weekend') && !W().isTonight(e)));
    if (weekend.length) {
      out.push(draw({ title: 'This weekend', n: weekend.length, href: 'discover.html?time=weekend', more: 'All weekend' }, weekend.slice(0, 12)));
    }

    /* Always a way into the rest of the week. */
    const week = fresh(all).filter(e => W().matches(e, 'thisweek') && !W().isTonight(e) && !W().matches(e, 'weekend'));
    if (week.length) {
      out.push(draw({ title: 'Later this week', n: week.length, href: 'discover.html?time=thisweek', more: 'The week' }, sortSoon(week).slice(0, 12)));
    }

    if (!all.length) {
      out.push(R().empty(window.WA.DATA_LIVE === false
        ? { icon: 'offline', title: "We can't reach the listings right now.", body: 'Your saves still work. Try again in a moment.', actions: [{ act: 'reload', label: 'Try again' }, { href: 'saved.html', label: 'Saved' }] }
        : { icon: 'calendar', title: `Nothing is listed in ${R().cityName()} yet.`, body: 'The sources are read every six hours. The places below are open regardless.', actions: [{ href: 'places.html', label: 'Places' }] }));
    }

    const nearby = nearShelf(tonight, next);
    if (nearby) out.unshift(nearby);
    $('home-main').innerHTML = out.join('');
    return all;
  };

  /* ── Side: places open now, areas, the map ────────────────── */
  const side = (all) => {
    const venues = R().places();
    const byWalk = (a, b) => {
      const da = G().distanceTo(a), db = G().distanceTo(b);
      if (da != null && db != null) return da - db;
      return String(a.name).localeCompare(String(b.name));
    };
    const open = venues.filter(v => R().openState(v).open === true).sort(byWalk);
    const later = venues.filter(v => { const o = R().openState(v); return o.open === false && o.s.opensAt != null; }).sort(byWalk);

    let places;
    if (open.length) {
      places = `<section class="wa-sect">${R().sect({ title: 'Open now', n: open.length, href: 'places.html?open=1', more: 'All places' })}
        <ul>${open.slice(0, 5).map(v => R().placeRow(v)).join('')}</ul></section>`;
    } else {
      /* Nothing confirmed open: say so once, then what opens later and
         the places with listings tonight, which are the ones still going. */
      const hosts = new Set(all.filter(e => W().isTonight(e)).map(e => (e.venueId || '') + '|' + String(e.venue || '').toLowerCase()));
      const tonightVenues = venues.filter(v => hosts.has(`${v.id}|${String(v.name).toLowerCase()}`) || [...hosts].some(h => h.endsWith(`|${String(v.name).toLowerCase()}`)));
      const list = [...later, ...tonightVenues.filter(v => !later.includes(v))].slice(0, 5);
      places = `<section class="wa-sect">${R().sect({ title: list.length ? 'Open later' : 'Places', href: 'places.html', more: 'All places',
        sub: 'None of the places with filed hours is open this minute.' })}
        ${list.length ? `<ul>${list.map(v => R().placeRow(v, { extra: tonightVenues.includes(v) ? 'listing tonight' : '' })).join('')}</ul>`
          : `<ul>${venues.slice().sort(byWalk).slice(0, 5).map(v => R().placeRow(v)).join('')}</ul>`}</section>`;
    }

    /* Areas: where this week's listings are, folded into the few areas a
       visitor looks under (render.js AREA_LIST), west to east. Places count
       too, so a quiet week still shows where the venues are. */
    const counts = new Map();
    for (const e of all.filter(x => W().matches(x, 'thisweek'))) {
      const a = R().areaOf(e);
      if (a && R().AREA_LIST.includes(a)) counts.set(a, (counts.get(a) || 0) + 1);
    }
    const areas = R().AREA_LIST.filter(a => counts.has(a)).map(a => [a, counts.get(a)]);
    const areaHtml = areas.length ? `<section class="wa-sect">${R().sect({ title: 'By area', sub: 'This week', href: 'discover.html?time=thisweek', more: 'All' })}
      <div class="wa-areas">${areas.map(([a, n]) => `<a class="wa-area" href="discover.html?area=${esc(encodeURIComponent(a))}&time=thisweek" title="${esc(R().AREA_SUB[a] || '')}">${esc(a)}<span class="wa-area__n">${n}</span></a>`).join('')}</div></section>` : '';

    const mapCard = `<section class="wa-sect"><a class="wa-mapcard" href="map.html">
      <img class="wa-mapcard__art" src="assets/tallinn-overview.svg" alt="" loading="lazy">
      <span class="wa-mapcard__glass"><span class="wa-mapcard__title">${I('map')}Show the map</span>
      <span class="wa-mapcard__sub">Tonight's events and the places open now, by walking time.</span></span></a></section>`;

    $('home-side').innerHTML = places + areaHtml + mapCard;
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
    side(all);
    since(all);
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    if (hit('[data-interests-open]')) { openInterests(); return; }
    if (hit('[data-near]')) {
      nearBusy = true; acts();
      G().userLoc().then((loc) => { nearBusy = false; if (!loc) nearOff = true; acts(); });
      return;
    }
    const chip = hit('[data-interest]');
    if (chip) {
      const id = chip.dataset.interest;
      const ids = R().interests.ids();
      R().interests.set(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(0, 3), false);
      interestSheet();
      main();
      acts();
      const again = document.querySelector(`[data-interest="${CSS.escape(id)}"]`);
      if (again) again.focus();
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
  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', render);
  /* The clock ticks; the lists redraw every five minutes so "on now"
     and "starting soon" stay true on a phone left open. */
  setInterval(() => { $('hero-clock').textContent = clockText(); }, 30000);
  setInterval(() => { if (document.visibilityState === 'visible' && window.WA.catalog) render(); }, 300000);

  const skeleton = () => {
    $('hero-clock').textContent = clockText();
    cats();
    acts();
    $('home-main').innerHTML = `<section class="wa-sect">${R().sect({ title: 'Starting soon' })}${R().skelCards(4)}</section>`;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', skeleton, { once: true });
  else skeleton();
})();
