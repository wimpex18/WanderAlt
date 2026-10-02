/* ============================================================
   saved-page.js — Saved.
   ------------------------------------------------------------
   Lists first (the only place to make one), then what is coming up
   (soonest to expire first), then places, then what has gone since it
   was saved, which does not look tappable because it is not.
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

  const mosaic = (ids) => {
    const pool = [...(window.WA._catalogAll || []), ...(window.WA._venuesAll || [])];
    const found = [...new Set(ids.map(canonical))].map(id => pool.find(x => x.id === id)).filter(Boolean);
    /* Four tiles make a mosaic; fewer read better as one picture. */
    const tiles = found.length >= 4 ? found.slice(0, 4) : found.slice(0, 1);
    if (!tiles.length) return `<span class="wa-listcard__mosaic wa-listcard__mosaic--one"><span class="wa-listcard__tile">${I('save', 'wa-ic--lg')}</span></span>`;
    return `<span class="wa-listcard__mosaic${tiles.length === 1 ? ' wa-listcard__mosaic--one' : ''}">${tiles.map(x => {
      const { src, logo } = R().art(x);
      return `<span class="wa-listcard__tile${logo ? ' is-logo' : ''}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : window.WA.Picto.kind(x.kind)}</span>`;
    }).join('')}</span>`;
  };

  const listsBlock = (goneIds) => {
    const L = window.WA.Lists;
    if (!L) return '';
    const lists = L.forCity(window.WA.CITY);
    return `<section class="wa-sect">${R().sect({ title: 'Lists', n: lists.length || null, sub: lists.length ? 'Tap a list to see only what is in it' : 'Group saves into a night out, a trip, a weekend' })}
      <div class="wa-lists" style="margin-top:var(--s-3)">
        ${lists.map(l => {
          const items = [...new Set((l.items || []).map(canonical))];
          const n = items.length;
          const gone = items.filter(id => goneIds.has(id)).length;
          return `<button class="wa-listcard" type="button" data-list="${esc(l.id)}" aria-pressed="${listFilter === l.id}">
            ${mosaic(l.items || [])}<span class="wa-listcard__name">${esc(l.name)}</span>
            <span class="wa-listcard__sub">${esc(`${n} saved${gone ? ` · ${gone} over` : ''}`)}</span></button>`;
        }).join('')}
        ${lists.length ? `<button class="wa-listcard wa-listcard--new" type="button" id="new-list"><span class="wa-listcard__mosaic">${I('plus', 'wa-ic--lg')}</span><span class="wa-listcard__name">New list</span></button>` : ''}
      </div>
      ${lists.length ? '' : `<button class="wa-btn wa-btn--sm" type="button" id="new-list">${I('plus')}<span>New list</span></button>`}
      ${listFilter ? '<p style="margin-top:var(--s-3)"><button class="wa-btn wa-btn--sm" type="button" data-list="">Show everything saved</button></p>' : ''}
    </section>`;
  };

  const render = () => {
    const all = gather();
    const total = all.dated.length + all.places.length + all.gone.length + all.unavailable.length;
    const L = window.WA.Lists;
    const viewing = listFilter && L ? L.byId(listFilter) : null;
    $('saved-title').textContent = viewing ? viewing.name : total ? `${total} saved` : 'Saved';
    $('saved-sub').textContent = viewing ? 'Only what is in this list.' : total ? 'Soonest first. Stays in this browser.' : 'Your shortlist. Stays in this browser.';

    if (!total && !(L && L.forCity(window.WA.CITY).length)) {
      $('saved-body').innerHTML = R().empty({ icon: 'save', title: 'Nothing saved yet.',
        body: 'Save from any listing. It waits here, even offline.',
        actions: [{ href: 'index.html', label: "What's on tonight" }, { href: 'places.html', label: 'Guide' }] });
      return;
    }
    const dated = all.dated.filter(inList);
    const places = all.places.filter(inList);
    const goneIds = new Set(all.gone.map(g => g.id));
    $('saved-body').innerHTML = listsBlock(goneIds) + `<div class="saved-cols">
      <section class="wa-sect">${R().sect({ title: 'Coming up', n: dated.length })}
        ${dated.length ? `<ul class="wa-rows">${dated.map(e => R().row(e, { day: true, drop: true })).join('')}</ul>`
          : '<p class="wa-note">Nothing dated is saved. Events you save land here, soonest first.</p>'}</section>
      <section class="wa-sect">${R().sect({ title: 'Places', n: places.length })}
        ${places.length ? `<ul>${places.map(v => R().placeRow(v, { drop: true })).join('')}</ul>`
          : '<p class="wa-note">Save a shop or a gallery. It waits here for a free afternoon.</p>'}</section>
    </div>
    ${all.unavailable.filter(inList).length ? `<section class="wa-sect" aria-live="polite">${R().sect({ title: 'Saved listings awaiting details', n: all.unavailable.filter(inList).length })}
      <p class="wa-note">These saves are kept. Their details ${pending.size ? 'are loading' : 'could not load'}.</p>
      ${all.unavailable.filter(inList).map(g => `<div class="wa-gone"><span>A saved listing</span>
        <button class="wa-btn wa-btn--sm" type="button" data-unsave="${esc(g.id)}">Remove</button></div>`).join('')}
      ${!pending.size ? '<button class="wa-btn" type="button" data-retry-saved>Try again</button>' : ''}</section>` : ''}
    ${!viewing && all.gone.length ? `<section class="wa-sect">${R().sect({ title: 'Over since you saved it', n: all.gone.length })}
      ${all.gone.map(g => `<div class="wa-gone"><span><span class="wa-gone__title">${esc(g.title || 'A listing')}</span>, ${esc(g.why)}.</span>
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
  window.addEventListener('online', () => { details.clear(); failed.clear(); render(); });
})();
