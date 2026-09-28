/* ============================================================
   home.js — Tonight, the home screen.
   ------------------------------------------------------------
   The search pill and the category bar first. Then card shelves: what is on now, what starts soon (or late, after
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
  };
  const pillText = (n) => {
    const sub = $('pill-sub');
    if (sub) sub.textContent = `${n ? `Tonight, ${n} listed` : 'This week'} · any kind · anywhere`;
  };

  /* ── Interests, the optional first run ─────────────────────── */
  let picked = [];
  const interestHtml = () => {
    const st = R().interests.get();
    if (st) return '';
    const opts = R().interests.OPTIONS;
    return `<section class="wa-interest" aria-labelledby="interest-title">
      <div class="wa-interest__head">
        <div>
          <h2 class="wa-interest__title" id="interest-title">What are you into?</h2>
          <p class="wa-interest__sub">Pick up to three and they get their own shelf. You can change them on You.</p>
        </div>
        <button class="wa-iconbtn" type="button" data-interest-skip aria-label="Skip">${I('close')}</button>
      </div>
      <div class="wa-chips">${opts.map(o => `<button class="wa-chip" type="button" data-interest="${esc(o.id)}" aria-pressed="${picked.includes(o.id)}">${o.icon === 'globe' ? I('globe') : window.WA.Picto(o.icon === 'talk' ? 'talk' : o.icon)}${esc(o.label)}</button>`).join('')}</div>
      <div class="wa-interest__foot">
        <span class="wa-interest__count">${picked.length} of 3</span>
        <div class="wa-btns">
          <button class="wa-btn wa-btn--quiet wa-btn--sm" type="button" data-interest-skip>Skip</button>
          <button class="wa-btn wa-btn--primary wa-btn--sm" type="button" data-interest-done${picked.length ? '' : ' disabled'}>Done</button>
        </div>
      </div>
    </section>`;
  };
  /* Redraw only the card while choosing, so the page does not jump. */
  const interestCard = () => {
    const el = document.querySelector('.wa-interest');
    const html = interestHtml();
    if (!el) return;
    if (!html) { el.remove(); return; }
    el.outerHTML = html;
  };

  /* ── Sections ───────────────────────────────────────────────── */
  const section = (head, body, cls) => `<section class="wa-sect${cls ? ` ${cls}` : ''}">${R().sect(head)}${body}</section>`;
  /* A cancelled or postponed show stays listed, labelled, at the end. */
  const cards = (list) => [...list.filter(e => !R().isOff(e)), ...list.filter(e => R().isOff(e))].map(e => R().poster(e)).join('');
  const shelf = (head, list) => R().shelf(head, cards(list));

  /* The next day after today with anything listed. */
  const nextDay = (all) => {
    const groups = R().byDay(all.filter(e => { const k = W().resolveKey(e); return k && k > W().todayKey(); }));
    return groups.length ? { key: groups[0][0], items: groups[0][1] } : null;
  };

  const main = () => {
    const all = R().live();
    const tonight = sortSoon(all.filter(e => W().isTonight(e)));
    const liveNow = tonight.filter(e => R().isLive(e));
    const later = tonight.filter(e => !R().isLive(e));
    const next = nextDay(all);
    hero(tonight, liveNow, next);

    const out = [];
    if (liveNow.length) {
      out.push(shelf({ title: 'On now', n: liveNow.length, sub: 'Started, and not over yet' }, liveNow.slice(0, 12)));
    }

    if (later.length) {
      const late = isLate();
      /* Late means 21:00 on, or the small hours once past midnight. */
      const lateOnes = later.filter(e => { const m = W().statedMinutes(e); return m == null || m >= 21 * 60 || m < 5 * 60; });
      const list = late && lateOnes.length ? lateOnes : later;
      out.push(shelf({
        title: late ? 'Starting late' : 'Starting soon', n: list.length,
        href: 'discover.html?time=tonight', more: 'All tonight',
      }, list.slice(0, 12)));
    } else if (next) {
      out.push(shelf({
        title: `${R().dayName(next.key)}, ${R().dateShort(next.key)}`, n: next.items.length,
        sub: liveNow.length ? 'Nothing else starts tonight, so this is next.' : `Nothing is filed for tonight in ${R().cityName()}, so this is next.`,
        href: `discover.html?date=${next.key}`, more: R().dateShort(next.key),
      }, sortSoon(next.items).slice(0, 12)));
    }

    /* For you: this week's listings that match the chosen interests. */
    const ids = R().interests.ids();
    if (ids.length) {
      const mine = sortSoon(all.filter(e => W().matches(e, 'thisweek') && R().interests.matches(e)));
      const names = R().interests.OPTIONS.filter(o => ids.includes(o.id)).map(o => o.label);
      out.push(mine.length
        ? shelf({ title: 'For you this week', n: mine.length, sub: names.join(', '), href: 'profile.html#interests', more: 'Change' }, mine.slice(0, 12))
        : section({ title: 'For you this week', href: 'profile.html#interests', more: 'Change' }, '<p class="wa-note">Nothing this week matches yet. New listings arrive every six hours.</p>'));
    }

    const weekend = sortSoon(all.filter(e => W().matches(e, 'weekend') && !W().isTonight(e)));
    if (weekend.length) {
      out.push(shelf({ title: 'This weekend', n: weekend.length, href: 'discover.html?time=weekend', more: 'All weekend' }, weekend.slice(0, 12)));
    }

    /* Always a way into the rest of the week. */
    const week = all.filter(e => W().matches(e, 'thisweek') && !W().isTonight(e) && !W().matches(e, 'weekend'));
    if (week.length) {
      out.push(shelf({ title: 'Later this week', n: week.length, href: 'discover.html?time=thisweek', more: 'The week' }, sortSoon(week).slice(0, 12)));
    }

    if (!all.length) {
      out.push(R().empty(window.WA.DATA_LIVE === false
        ? { icon: 'offline', title: "We can't reach the listings right now.", body: 'Your saves still work. Try again in a moment.', actions: [{ act: 'reload', label: 'Try again' }, { href: 'saved.html', label: 'Saved' }] }
        : { icon: 'calendar', title: `Nothing is listed in ${R().cityName()} yet.`, body: 'The sources are read every six hours. The places below are open regardless.', actions: [{ href: 'places.html', label: 'Places' }] }));
    }

    /* The optional first run sits after the first shelf, so what is on
       tonight is the first thing on the screen. */
    out.splice(Math.min(1, out.length), 0, interestHtml());
    $('home-main').innerHTML = out.join('');
    pillText(tonight.length);
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
        <ul>${open.slice(0, 5).map(v => R().placeRow(v)).join('')}</ul>${R().locPrompt()}</section>`;
    } else {
      /* Nothing confirmed open: say so once, then what opens later and
         the places with listings tonight, which are the ones still going. */
      const hosts = new Set(all.filter(e => W().isTonight(e)).map(e => (e.venueId || '') + '|' + String(e.venue || '').toLowerCase()));
      const tonightVenues = venues.filter(v => hosts.has(`${v.id}|${String(v.name).toLowerCase()}`) || [...hosts].some(h => h.endsWith(`|${String(v.name).toLowerCase()}`)));
      const list = [...later, ...tonightVenues.filter(v => !later.includes(v))].slice(0, 5);
      places = `<section class="wa-sect">${R().sect({ title: list.length ? 'Open later' : 'Places', href: 'places.html', more: 'All places',
        sub: 'None of the places with filed hours is open this minute.' })}
        ${list.length ? `<ul>${list.map(v => R().placeRow(v, { extra: tonightVenues.includes(v) ? 'listing tonight' : '' })).join('')}</ul>`
          : `<ul>${venues.slice().sort(byWalk).slice(0, 5).map(v => R().placeRow(v)).join('')}</ul>`}${R().locPrompt()}</section>`;
    }

    /* Areas: where this week's listings are, in the names people use. */
    const counts = new Map();
    for (const e of all.filter(x => W().matches(x, 'thisweek'))) {
      const a = R().areaOf(e);
      if (a) counts.set(a, (counts.get(a) || 0) + 1);
    }
    const areas = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const areaHtml = areas.length ? `<section class="wa-sect">${R().sect({ title: 'By area', sub: 'This week' })}
      <div class="wa-areas">${areas.map(([a, n]) => `<a class="wa-area" href="discover.html?area=${esc(encodeURIComponent(a))}&time=thisweek">
        <span>${esc(a)}${R().AREA_SUB[a] ? `<span class="wa-area__sub">${esc(R().AREA_SUB[a])}</span>` : ''}</span><span class="wa-area__n">${n}</span></a>`).join('')}</div></section>` : '';

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
    const all = main();
    side(all);
    since(all);
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    const chip = hit('[data-interest]');
    if (chip) {
      const id = chip.dataset.interest;
      if (picked.includes(id)) picked = picked.filter(x => x !== id);
      else if (picked.length < 3) picked.push(id);
      interestCard();
      const again = document.querySelector(`[data-interest="${CSS.escape(id)}"]`);
      if (again) again.focus();
      return;
    }
    if (hit('[data-interest-done]')) { R().interests.set(picked, false); render(); return; }
    if (hit('[data-interest-skip]')) { R().interests.set([], true); render(); return; }
    if (hit('[data-act="reload"]')) { location.reload(); return; }
    const r = hit('[data-row]');
    if (r) window.WA.Seen.mark(r.dataset.row);
  });

  const boot = () => { render(); R().locateIfGranted(); };
  /* The category bar folds away once you scroll, as the search pill
     keeps its place. */
  let folded = false;
  window.addEventListener('scroll', () => {
    const f = window.scrollY > 140;
    if (f !== folded) { folded = f; document.body.classList.toggle('is-scrolled', f); }
  }, { passive: true });
  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', render);
  /* The clock ticks; the lists redraw every five minutes so "on now"
     and "starting soon" stay true on a phone left open. */
  setInterval(() => { $('hero-clock').textContent = clockText(); }, 30000);
  setInterval(() => { if (document.visibilityState === 'visible' && window.WA.catalog) render(); }, 300000);

  const skeleton = () => {
    $('hero-clock').textContent = clockText();
    cats();
    $('home-main').innerHTML = `<section class="wa-sect">${R().sect({ title: 'Starting soon' })}${R().skelCards(4)}</section>`;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', skeleton, { once: true });
  else skeleton();
})();
