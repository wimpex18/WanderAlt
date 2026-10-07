/* ============================================================
   saved-page.js — Saved.
   ------------------------------------------------------------
   Lists as one row of chips (the only place to make one), a walk through
   one night's saved shows, saved events by night with the same hearted
   rows as Now, places, then what has gone since it was saved, which does
   not look tappable because it is not. A heart unsaves in place, with Undo.
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n, c) => window.WA.Icon(n, c);
  const toast = (m, l, u) => { if (window.WA.Toast) window.WA.Toast.show(m, l, u); };

  let listFilter = '';
  const details = new Map();
  const pending = new Set();
  const failed = new Set();

  const loadMissing = (id) => {
    if (pending.has(id) || failed.has(id) || !window.WA.byId) return;
    pending.add(id);
    window.WA.byId(id).then(found => {
      details.set(id, found);
    }).catch(() => { failed.add(id); }).finally(() => {
      pending.delete(id);
      render();
    });
  };

  const gather = () => {
    const ids = Object.keys((window.WA.Bookmarks && window.WA.Bookmarks.get()) || {});
    const picks = window.WA._catalogAll || [];
    const venues = window.WA._venuesAll || [];
    const out = { dated: [], places: [], gone: [], unavailable: [] };
    for (const id of ids) {
      const p = picks.find(e => e.id === id);
      if (p) {
        if (W().hasEnded(p)) out.gone.push({ id, title: p.title, why: 'it has already happened' });
        else out.dated.push(p);
        continue;
      }
      const v = venues.find(x => x.id === id);
      if (v) { out.places.push(v); continue; }
      /* Recommendations exclude unverified places and archived events.
         A narrower catalogue is not evidence that a save is gone. */
      if (details.has(id)) {
        const found = details.get(id);
        if (found?.kind === 'place') { out.places.push(found.e); continue; }
        if (found?.kind === 'event') {
          if (found.archivedAt || W().hasEnded(found.e)) out.gone.push({ id, title: found.e.title, why: 'it is no longer in the programme' });
          else out.dated.push(found.e);
          continue;
        }
        if (window.WA.DATA_LIVE) { out.gone.push({ id, title: '', why: 'it is no longer listed' }); continue; }
      } else loadMissing(id);
      out.unavailable.push({ id, failed: failed.has(id) });
    }
    out.dated.sort(window.WA.Geo.byDateThenSoonest());
    return out;
  };

  const canonical = (id) => window.WA.canonicalId ? window.WA.canonicalId(id) : id;
  const inList = (x) => !listFilter || !window.WA.Lists || window.WA.Lists.items(listFilter).map(canonical).includes(x.id);

  const listsBar = () => {
    const L = window.WA.Lists;
    if (!L) return '';
    const lists = L.forCity(window.WA.CITY);
    return `<div class="saved-bar wa-chips wa-chips--scroll" role="group" aria-label="Lists">
      ${lists.length ? `<button class="wa-chip" type="button" data-list="" aria-pressed="${!listFilter}">All</button>` : ''}
      ${lists.map(l => `<button class="wa-chip" type="button" data-list="${esc(l.id)}" aria-pressed="${listFilter === l.id}"><span data-notranslate>${esc(l.name)}</span><span class="wa-chip__n">${[...new Set((l.items || []).map(canonical))].length}</span></button>`).join('')}
      <button class="wa-chip saved-bar__new" type="button" id="new-list">${I('plus')}<span>New list</span></button></div>`;
  };

  /* A night of saves, in time order, as a walk: two or more timed shows with a
     place on the map. The route page checks every stop again. */
  const savedWalk = (dated) => {
    const Rt = window.WA.Route, Wn = W();
    if (!Rt || !Rt.fromParam || dated.length < 2) return '';
    const timed = dated.filter(e => !R().isOff(e) && !R().isLive(e) && Wn.statedMinutes(e) != null && window.WA.Geo.coordsFor && window.WA.Geo.coordsFor(e));
    const nights = new Map();
    for (const e of timed) { const k = Wn.nightKey(e); if (!nights.has(k)) nights.set(k, []); nights.get(k).push(e); }
    const night = [...nights.entries()].sort((a, b) => a[0].localeCompare(b[0])).find(([, list]) => list.length >= 2);
    if (!night) return '';
    const list = night[1].slice().sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const base = Wn.resolveKey(list[0]);
    let offset = -1;
    for (let i = 0; i < 7; i++) if (Wn.keyPlus(i) === base) offset = i;
    if (offset < 0) return '';
    const stops = [];
    for (const e of list) {
      const minute = Wn.statedMinutes(e) + (Wn.resolveKey(e) > base ? 1440 : 0);
      if (!stops.length || minute > stops[stops.length - 1].minute) stops.push({ id: e.id, minute });
    }
    const route = stops.length >= 2 ? Rt.fromParam(stops.map(s => `event:${s.id}:${s.minute}`).join(','), offset) : null;
    if (!route) return '';
    const when = night[0] === Wn.nightToday() ? 'Tonight' : night[0] === Wn.nightPlus(1) ? 'Tomorrow' : R().dateShort(night[0]);
    return `<section class="home-walk saved-walk" aria-labelledby="saved-walk-title">
      <div class="home-walk__head"><span class="home-walk__kicker">${I('walk')}<b>Walk your saves</b><span class="home-walk__meta">${esc([when, `about ${Rt.lengthText(route).split(',')[0]}`].join(' · '))}</span></span></div>
      <a class="home-walk__main" href="${esc(Rt.href(route))}">
        <span class="home-walk__title" id="saved-walk-title">${esc(route.title)}</span>
        <span class="home-walk__discs" aria-hidden="true">${route.stops.slice(0, 3).map(s => window.WA.Picto.kind(s.kind)).join('')}</span>
        <span class="home-walk__stops"><time>${esc(window.WA.Hours.clock(route.stops[0].minute % 1440))}</time>${route.stops.map(s => `<span data-notranslate>${esc(s.name)}</span>`).join(`<span class="home-walk__to" aria-hidden="true">${I('arrow')}</span>`)}</span>
      </a></section>`;
  };

  /* Saved events by night, as on Now: a run that began earlier files under today. */
  const byNight = (dated) => {
    const Wn = W(), today = Wn.nightToday(), groups = new Map();
    for (const e of dated) { const k = [Wn.nightKey(e) || today, today].sort().pop(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const name = (k) => k === today ? 'Today' : k === Wn.nightPlus(1) ? 'Tomorrow' : (window.WA.Lang ? window.WA.Lang.daysFull() : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])[new Date(`${k}T12:00:00Z`).getUTCDay()];
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => `<div class="wa-day home-day__head" role="heading" aria-level="2"><span class="wa-day__name">${esc(name(k))}</span><span class="wa-day__date">${esc(R().dateShort(k))}</span><span class="wa-day__n">${list.length}</span></div>
      <ul class="wa-rows home-rows saved-rows">${list.map(e => R().row(e, { heart: true, unknownPrice: true, started: false })).join('')}</ul>`).join('');
  };

  const render = () => {
    const all = gather();
    const total = all.dated.length + all.places.length + all.gone.length + all.unavailable.length;
    const L = window.WA.Lists;
    const viewing = listFilter && L ? L.byId(listFilter) : null;
    $('saved-title').textContent = viewing ? viewing.name : 'Saved';
    $('saved-title').toggleAttribute('data-notranslate', !!viewing);
    $('saved-sub').textContent = viewing ? 'Only what is in this list.' : total ? `${total} · On this device` : '';
    if (window.WA.Auth?.isSignedIn()) {
      const waiting = (window.WA.Bookmarks.pendingSync?.() || 0) + (L?.pendingSync?.() || 0);
      $('saved-sub').textContent = viewing ? 'Only what is in this list.' : waiting ? `${total} · Waiting to sync` : window.WA.Bookmarks.syncConfirmed?.() ? `${total} · Synced` : `${total} · On this device`;
      if (waiting) {
        const retry = document.createElement('button');
        retry.className = 'wa-btn'; retry.textContent = 'Try again';
        retry.addEventListener('click', () => { window.WA.Bookmarks.syncFromCloud(); L?.syncFromCloud(); });
        $('saved-sub').append(' ', retry);
      }
    }


    if (!total && !(L && L.forCity(window.WA.CITY).length)) {
      $('saved-body').innerHTML = R().empty({ icon: 'save', title: 'Nothing saved yet.',
        body: 'Save from any listing. It waits here, even offline.',
        actions: [{ href: 'index.html', label: "What's on tonight" }, { href: 'places.html', label: 'Places' }] });
      return;
    }
    const dated = all.dated.filter(inList);
    const places = all.places.filter(inList);
    $('saved-body').innerHTML = `<div class="saved-cols"><div class="saved-main">${listsBar()}${savedWalk(dated)}
      ${dated.length ? `<section class="wa-sect saved-events" aria-label="Events">${byNight(dated)}</section>` : ''}
      ${!dated.length && !places.length ? `<p class="wa-note">${viewing ? 'Nothing in this list yet. Add saves to it from their pages.' : 'Nothing saved yet.'}</p>` : ''}</div>
      ${places.length ? `<aside class="saved-side"><section class="wa-sect saved-places">${R().sect({ title: 'Places', n: places.length })}
        <ul class="home-places">${places.map(v => R().placeRow(v, { heart: true, pickLabel: false })).join('')}</ul></section></aside>` : ''}
    </div>
    ${all.unavailable.filter(inList).length ? `<section class="wa-sect" aria-live="polite">${R().sect({ title: 'Saved listings awaiting details', n: all.unavailable.filter(inList).length })}
      <p class="wa-note"><span>These saves are kept</span>. <span>${pending.size ? 'Details are loading' : 'Details could not load'}</span>.</p>
      ${all.unavailable.filter(inList).map(g => `<div class="wa-gone"><span>A saved listing</span>
        <button class="wa-btn wa-btn--sm" type="button" data-unsave="${esc(g.id)}">Remove</button></div>`).join('')}
      ${!pending.size ? '<button class="wa-btn" type="button" data-retry-saved>Try again</button>' : ''}</section>` : ''}
    ${!viewing && all.gone.length ? `<section class="wa-sect">${R().sect({ title: 'Over since you saved it', n: all.gone.length })}
      ${all.gone.map(g => `<div class="wa-gone"><span><span${g.title ? ' class="wa-gone__title"' : ''}>${esc(g.title || 'A listing')}</span>, <span>${esc(g.why)}</span>.</span>
        <button class="wa-btn wa-btn--sm" type="button" data-unsave="${esc(g.id)}">Remove</button></div>`).join('')}</section>` : ''}`;
  };

  /* ── The new-list sheet ───────────────────────────────────── */
  const openNew = () => {
    $('sheet-title').textContent = 'New list';
    $('sheet-body').innerHTML = `<div class="wa-field"><label class="wa-field__label" for="list-name">Name it</label>
      <input class="wa-input" id="list-name" type="text" maxlength="60" placeholder="Kalamaja on Saturday" autocomplete="off" enterkeyhint="done"></div>
      ${window.WA.Lists.suggestions()}`;
    $('sheet-foot').innerHTML = '<button class="wa-btn wa-btn--quiet" type="button" id="sheet-cancel">Cancel</button><button class="wa-btn wa-btn--ink" type="button" id="list-create">Create</button>';
    $('sheet').showModal();
    $('list-name').focus();
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    if (hit('[data-retry-saved]')) { details.clear(); failed.clear(); render(); return; }
    if (hit('#sheet-close') || hit('#sheet-cancel')) { $('sheet').close(); return; }
    if (hit('#new-list')) { openNew(); return; }
    if (hit('#list-create')) {
      const L = window.WA.Lists;
      const id = L.create($('list-name').value);
      if (!id) { $('list-name').focus(); return; }
      $('sheet').close();
      render();
      toast(`Made “${L.byId(id).name}”`, 'Undo', () => { L.remove(id); render(); });
      return;
    }
    const drop = hit('[data-unsave]');
    if (drop) {
      e.preventDefault(); e.stopPropagation();
      const id = drop.dataset.unsave;
      const lists = window.WA.Lists ? window.WA.Lists.listsFor(id).map(l => l.id) : [];
      window.WA.Bookmarks.set(id, false);
      render();
      toast('Removed from saved', 'Undo', () => {
        window.WA.Bookmarks.set(id, true);
        lists.forEach(l => window.WA.Lists.add(l, id));
        render();
      });
      return;
    }
    const lc = hit('[data-list]');
    if (lc) { listFilter = listFilter === lc.dataset.list ? '' : lc.dataset.list; render(); }
  });

  const pre = () => { $('saved-body').innerHTML = R().skelRows(3); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pre, { once: true }); else pre();
  document.addEventListener('wa:catalog-ready', () => { details.clear(); failed.clear(); render(); R().locateIfGranted(); });
  document.addEventListener('wa:data-live', render);
  document.addEventListener('wa:location-ready', render);
  document.addEventListener('wa:bookmarks-synced', render);
  document.addEventListener('wa:lists-changed', render);
  document.addEventListener('wa:signed-out', () => { listFilter = ''; render(); });
  window.addEventListener('online', () => { details.clear(); failed.clear(); render(); });
  document.addEventListener('wa:language-changed', render);
})();
