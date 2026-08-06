/* ============================================================
   walk.js — a route, and walking it (6b).

   6b is a TEST, not a feature: "Hand-write three Tallinn routes. Ship
   them as flat content. No generator, no opening-hours pipeline, no
   route solver — three JSON objects with an ordered list of existing
   pick ids, a title and a sentence."

   So this file is deliberately small. It reads walks.json, resolves each
   stop id against the venues already in memory, and does the one piece
   of real logic the idea needs: work out whether the doors will still be
   open when you get there.

   That timing is the whole promise. 6b's risk flag: "the whole promise
   is 'every door is open when you reach it'. That needs reliable
   opening hours, which is the weakest field in your catalogue. If hours
   are missing for a third of places, the walk-in-progress screen lies to
   people outdoors — worse than not shipping."

   Hours are missing for HALF the Tallinn catalogue, which is why the
   routes are hand-written around the stops that have them. A stop whose
   hours vanish later is not guessed at — it says so, and the route stops
   claiming a leave-by time it can no longer stand behind.

   ?id=<route id>. ?stop=<n> puts it in walk-in-progress at that stop.
   ============================================================ */
(() => {
  'use strict';

  const UI  = () => window.WA.UI;
  const esc = (s) => UI().esc(s);
  const $   = (id) => document.getElementById(id);
  const main = () => $('main');

  const toast = (msg, label, undo) => {
    if (window.WA.Toast && window.WA.Toast.show) window.WA.Toast.show(msg, label, undo);
  };

  /* Walking speed is the one shared with every distance on the site, so
     a route's "6 min" and a row's "6 min" mean the same thing. */
  const WALK_M_PER_MIN = 80;
  const MINS_AT_STOP = 15;   /* an honest guess, stated in the copy */

  let ROUTES = null;
  let skipped = new Set();

  const routeId = () => new URLSearchParams(location.search).get('id') || '';
  const stopParam = () => {
    const n = parseInt(new URLSearchParams(location.search).get('stop') || '', 10);
    return Number.isFinite(n) ? n : 0;
  };

  const venueById = (id) =>
    (window.WA._venuesAll || window.WA.venues || []).find(v => v.id === id) ||
    (window.WA._catalogAll || window.WA.catalog || []).find(e => e.id === id) || null;

  /* Resolve a route's stops. A delisted venue is DROPPED rather than
     rendered as a hole — the route re-times itself around it, which is
     the same rule the walk-in-progress screen applies when you skip. */
  const resolve = () => {
    const r = (ROUTES || []).find(x => x.id === routeId());
    if (!r) return null;
    const stops = r.stops
      .map(s => ({ ...s, venue: venueById(s.id) }))
      .filter(s => s.venue);
    return { ...r, stops, dropped: r.stops.length - stops.length };
  };

  const metresBetween = (a, b) => {
    const G = window.WA.Geo;
    const ca = G.coordsFor(a), cb = G.coordsFor(b);
    if (!ca || !cb) return null;
    return G.haversineM
      ? G.haversineM(ca.lat, ca.lng, cb.lat, cb.lng)
      : null;
  };

  const walkMins = (m) => (m == null ? null : Math.max(1, Math.round(m / WALK_M_PER_MIN)));

  /* ── The timing, which is the whole idea ─────────────────────
     Walk the route forward from now, 15 minutes inside each door plus
     the walk between, and ask each stop whether it is still open when
     you would arrive. Returns the first stop that would be shut and the
     latest departure that still works. */
  const schedule = (stops, startAt) => {
    const H = window.WA.Hours;
    const now = startAt || new Date();
    let t = new Date(now.getTime());
    const out = [];
    let firstShut = null;
    let anyUnknown = false;

    stops.forEach((s, i) => {
      if (i > 0) {
        const m = metresBetween(stops[i - 1].venue, s.venue);
        t = new Date(t.getTime() + ((walkMins(m) ?? 8) + MINS_AT_STOP) * 60000);
      }
      const raw = s.venue.openingHours;
      const st = raw ? H.state(raw, t) : { known: false };
      if (!st.known) anyUnknown = true;
      if (st.known && !st.open && firstShut === null) firstShut = i;
      out.push({
        ...s,
        arriveAt: new Date(t.getTime()),
        metres: i > 0 ? metresBetween(stops[i - 1].venue, s.venue) : null,
        state: st,
      });
    });

    return { stops: out, firstShut, anyUnknown, endsAt: t };
  };

  /* The latest you could leave and still find every door open. Walks
     the clock forward in 10-minute steps until a stop would be shut --
     crude, and honest about being crude, but it is three routes of four
     stops, not a solver. */
  const leaveBy = (stops) => {
    const now = new Date();
    let best = null;
    for (let i = 0; i <= 12 * 6; i++) {
      const t = new Date(now.getTime() + i * 10 * 60000);
      const s = schedule(stops, t);
      if (s.firstShut === null && !s.anyUnknown) best = t; else break;
    }
    return best;
  };

  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const totalMetres = (stops) => {
    let m = 0;
    for (let i = 1; i < stops.length; i++) {
      const d = metresBetween(stops[i - 1].venue, stops[i].venue);
      if (d == null) return null;
      m += d;
    }
    return m;
  };

  /* ── Route detail ────────────────────────────────────────────── */
  const renderRoute = (r) => {
    const sch = schedule(r.stops);
    const total = totalMetres(r.stops);
    const mins = r.stops.length * MINS_AT_STOP + (walkMins(total) ?? 0);
    const by = leaveBy(r.stops);

    /* The status line is the promise, stated to whatever standard the
       data actually supports. Three outcomes, and only the first is the
       one 6b draws. */
    let status, tone;
    if (sch.anyUnknown) {
      status = 'Some hours are not filed, so this route cannot promise every door is open.';
      tone = 'warn';
    } else if (sch.firstShut !== null) {
      const shut = sch.stops[sch.firstShut];
      status = `Too late today — ${shut.venue.name} would be shut by the time you reach it.`;
      tone = 'warn';
    } else {
      status = `Good to start now. All ${r.stops.length} are open · it's ${hhmm(new Date())}`;
      tone = 'ok';
    }

    main().innerHTML = `
      <p class="wa-detail__eyebrow">Walk · ${esc(String(r.stops.length))} stops${
        total ? ` · ${esc(window.WA.Geo.format(total))}` : ''} · about ${esc(String(Math.round(mins / 30) / 2))} hr</p>
      <h1 class="wa-display wa-detail__title">${esc(r.title)}</h1>
      <p class="wa-detail__desc" style="margin-top:var(--s-4)">${esc(r.blurb)}</p>

      <p class="wa-note wa-note--${esc(tone)}" style="margin-top:var(--s-5)">
        <span>${esc(status)}${by && tone === 'ok' ? ` &middot; leave by ${esc(hhmm(by))} or the last stops will have closed.` : ''}</span>
      </p>

      ${r.dropped ? `<p class="wa-detail__note">${esc(
        `${r.dropped} stop${r.dropped === 1 ? '' : 's'} dropped — no longer listed. The route re-timed itself around them.`)}</p>` : ''}

      <ol class="wa-walk__stops">
        ${sch.stops.map((s, i) => stopRow(s, i)).join('')}
      </ol>

      <div class="wa-btn-row" style="margin-top:var(--s-6)">
        <button class="wa-btn wa-btn--primary" type="button" id="start" style="flex:1">Start the walk</button>
      </div>

      <p class="wa-detail__note" style="margin-top:var(--s-5)">
        Nothing is booked, so leaving halfway costs nothing. Times assume about
        ${MINS_AT_STOP} minutes inside each door.
      </p>`;
  };

  const stopRow = (s, i) => {
    const H = window.WA.Hours;
    const st = s.state;
    const when = !st.known ? 'hours not filed'
      : st.open ? (st.closesAt == null ? 'open 24 hours' : `closes ${H.clock(st.closesAt)}`)
      : 'shut when you would arrive';
    const walk = s.metres != null ? `${walkMins(s.metres)} min walk` : '';
    return `<li class="wa-walk__stop">
      <span class="wa-walk__num" aria-hidden="true">${i + 1}</span>
      <span class="wa-walk__body">
        <a class="wa-walk__name" href="detail.html?id=${esc(encodeURIComponent(s.venue.id))}"
           data-stop-open="${esc(String(i + 1))}">${esc(s.venue.name)}</a>
        ${s.note ? `<span class="wa-walk__note">${esc(s.note)}</span>` : ''}
        <span class="wa-walk__facts">${esc([when, walk].filter(Boolean).join(' · '))}</span>
      </span>
    </li>`;
  };

  /* ── Walk in progress ────────────────────────────────────────── */
  const renderProgress = (r, n) => {
    const live = r.stops.filter((_, i) => !skipped.has(i));
    const idx = Math.min(Math.max(n, 1), live.length) - 1;
    const sch = schedule(live);
    const s = sch.stops[idx];
    const next = sch.stops[idx + 1];
    const H = window.WA.Hours;
    const st = s.state;

    main().innerHTML = `
      <div class="wa-walk__bar">
        <span class="wa-fact wa-fact--strong">Stop ${idx + 1} of ${live.length} · ${esc(r.title)}</span>
        <a class="wa-btn wa-btn--quiet" href="walk.html?id=${esc(encodeURIComponent(r.id))}">End walk</a>
      </div>

      <h1 class="wa-display wa-detail__title">${esc(s.venue.name)}</h1>
      ${s.note ? `<p class="wa-detail__desc" style="margin-top:var(--s-3)">${esc(s.note)}</p>` : ''}

      <div class="wa-cells">
        <div class="wa-cell"><span class="wa-cell__label">Walk</span>
          <span class="wa-cell__value">${esc(s.metres != null ? `${walkMins(s.metres)} min` : '—')}</span></div>
        <div class="wa-cell"><span class="wa-cell__label">${esc(st.known && st.open ? 'Closes' : 'Hours')}</span>
          <span class="wa-cell__value">${esc(
            !st.known ? 'not filed' : st.open ? (st.closesAt == null ? '24h' : H.clock(st.closesAt)) : 'shut')}</span></div>
        <div class="wa-cell"><span class="wa-cell__label">Entry</span>
          <span class="wa-cell__value">Free</span></div>
      </div>

      <div class="wa-btn-row">
        <a class="wa-btn wa-btn--primary" href="${esc(mapsHref(s.venue))}"
           target="_blank" rel="noopener noreferrer">Walk me there</a>
        <button class="wa-btn" type="button" id="skip" data-i="${esc(String(idx))}">Skip</button>
        ${next ? `<a class="wa-btn" href="walk.html?id=${esc(encodeURIComponent(r.id))}&stop=${idx + 2}">Next stop</a>` : ''}
      </div>

      ${next ? `<section class="wa-section">
        <h2 class="wa-section-title">Next after this</h2>
        <p class="wa-section-sub">${esc(next.venue.name)}</p>
        <p class="wa-detail__note">${esc([
          next.metres != null ? `${walkMins(next.metres)} min` : '',
          next.state.known && next.state.open && next.state.closesAt != null
            ? `closes ${H.clock(next.state.closesAt)}` : '',
        ].filter(Boolean).join(' · '))}</p>
      </section>` : `<p class="wa-detail__note" style="margin-top:var(--s-6)">Last stop. Nothing is booked, so stop whenever you like.</p>`}

      <p class="wa-detail__note" style="margin-top:var(--s-5)">
        Skipping a stop re-times the rest of the walk.
      </p>`;
  };

  const mapsHref = (v) => {
    const c = window.WA.Geo.coordsFor(v);
    return c
      ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=walking`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name || '')}`;
  };

  /* ── Boot ────────────────────────────────────────────────────── */
  const render = () => {
    const r = resolve();
    if (!r) {
      main().innerHTML = `<div class="wa-empty" style="margin-top:var(--s-8)">
        <p class="wa-empty__title">That walk is not here.</p>
        <p class="wa-empty__body">There are three, and they are all in Tallinn. Explore has them.</p>
        <div class="wa-empty__actions">
          <a class="wa-btn wa-btn--primary" href="./index.html">Explore</a>
          <a class="wa-btn" href="./discover.html">Tonight</a>
        </div>
      </div>`;
      return;
    }
    document.title = `WanderAlt — ${r.title}`;
    const n = stopParam();
    if (n > 0) renderProgress(r, n); else renderRoute(r);
  };

  document.addEventListener('click', (e) => {
    const start = e.target.closest && e.target.closest('#start');
    if (start) {
      const r = resolve();
      if (r) location.search = `?id=${encodeURIComponent(r.id)}&stop=1`;
      return;
    }
    const skip = e.target.closest && e.target.closest('#skip');
    if (skip) {
      skipped.add(+skip.dataset.i);
      toast('Stop skipped — the rest re-timed', 'Undo', () => { skipped.delete(+skip.dataset.i); render(); });
      render();
      return;
    }
    /* 6b's decision number is third-stop opens, so opening a stop from
       inside a route is the event worth logging. WA.Seen already records
       opens; this just makes sure a route stop counts as one. */
    const so = e.target.closest && e.target.closest('[data-stop-open]');
    if (so && window.WA.Seen) window.WA.Seen.mark(so.getAttribute('href').split('id=')[1]);
  });

  const load = async () => {
    try {
      const res = await fetch('./walks.json');
      ROUTES = res.ok ? (await res.json()).routes : [];
    } catch (_) { ROUTES = []; }
    render();
  };

  document.addEventListener('wa:catalog-ready', () => { render(); window.WA.Geo.userLoc(); });
  document.addEventListener('wa:location-ready', render);
  load();
})();
