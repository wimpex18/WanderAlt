/* ============================================================
   places.js — Places: the shops, rooms and stages.
   ------------------------------------------------------------
   Kind chips, an Open now toggle, nearest first and then open first.
   Each row says whether it is open and how much is listed there.
   URL: ?kind= ?open=1
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const G = () => window.WA.Geo;
  const esc = (s) => window.WA.UI.esc(s);

  const GROUPS = [
    { id: 'records',   label: 'Records',        icon: 'records',  kinds: ['record store'] },
    { id: 'books',     label: 'Books',          icon: 'books',    kinds: ['bookshop'] },
    { id: 'galleries', label: 'Galleries',      icon: 'art',      kinds: ['gallery', 'arts centre', 'museum'] },
    { id: 'thrift',    label: 'Thrift',         icon: 'thrift',   kinds: ['thrift'] },
    { id: 'cinema',    label: 'Cinema',         icon: 'film',     kinds: ['cinema'] },
    { id: 'clubs',     label: 'Clubs and bars', icon: 'club',     kinds: ['club', 'bar'] },
    { id: 'theatres',  label: 'Theatres',       icon: 'theatre',  kinds: ['theatre'] },
    { id: 'community', label: 'Community',      icon: 'centre',   kinds: ['community'] },
  ];

  const state = { group: '', open: false };
  const sp = new URLSearchParams(location.search);
  if (GROUPS.some(g => g.id === sp.get('kind'))) state.group = sp.get('kind');
  if (sp.get('open') === '1') state.open = true;

  const write = () => {
    const q = new URLSearchParams();
    if (state.group) q.set('kind', state.group);
    if (state.open) q.set('open', '1');
    history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
  };

  const inGroup = (v, id) => { const g = GROUPS.find(x => x.id === id); return !g || g.kinds.includes(String(v.kind || '').toLowerCase()); };
  const isOpen = (v) => R().openState(v).open === true;

  /* How much is listed at a place, keyed like detail.js's programme. */
  const listedAt = (() => {
    let map = null;
    return (v) => {
      if (!map) {
        map = new Map();
        for (const e of R().live()) {
          const k = e.venueId || `name:${String(e.venue || '').toLowerCase().trim()}`;
          map.set(k, (map.get(k) || 0) + 1);
        }
      }
      return (map.get(v.id) || 0) + (map.get(`name:${String(v.name || '').toLowerCase().trim()}`) || 0);
    };
  })();

  const sort = (list) => list.slice().sort((a, b) => {
    const da = G().distanceTo(a), db = G().distanceTo(b);
    if (da != null && db != null && Math.abs(da - db) > 1) return da - db;
    const oa = isOpen(a) ? 0 : 1, ob = isOpen(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return String(a.name).localeCompare(String(b.name), 'et');
  });

  const render = () => {
    const all = R().places();
    const pool = state.open ? all.filter(isOpen) : all;
    $('kinds').innerHTML = `<button class="wa-chip" type="button" data-group="" aria-pressed="${!state.group}">All <span class="wa-chip__n">${pool.length}</span></button>` +
      GROUPS.map(g => {
        const n = pool.filter(v => inGroup(v, g.id)).length;
        return `<button class="wa-chip" type="button" data-group="${esc(g.id)}" aria-pressed="${state.group === g.id}"${n || state.group === g.id ? '' : ' disabled'}>${window.WA.Picto(g.icon === "club" ? "club" : g.icon)}${esc(g.label)} <span class="wa-chip__n">${n}</span></button>`;
      }).join('');

    const list = sort(pool.filter(v => inGroup(v, state.group)));
    const openN = all.filter(v => inGroup(v, state.group)).filter(isOpen).length;
    const g = GROUPS.find(x => x.id === state.group);
    const noun = g ? g.label.toLowerCase() : 'places';
    $('summary').innerHTML = `<strong>${list.length} ${list.length === 1 && !g ? 'place' : esc(noun)}</strong> ${esc(G().currentLoc() ? '· nearest first' : '· open first')}${state.open ? '' : ` · ${openN} open now`}`;
    $('open-now').setAttribute('aria-pressed', String(state.open));

    if (!all.length) {
      $('list').innerHTML = R().empty({ icon: 'store', title: window.WA.DATA_LIVE === false ? "We can't reach the places right now." : 'No places are filed yet.',
        body: 'Try again in a moment.', actions: [{ act: 'reload', label: 'Try again' }] });
      return;
    }
    if (!list.length) {
      const without = all.filter(v => inGroup(v, state.group)).length;
      $('list').innerHTML = state.open && without
        ? R().empty({ icon: 'clock', title: `No ${noun} we list are open this minute.`,
          body: `About half the places file their hours. ${without} ${noun} are listed in all.`,
          actions: [{ act: 'all-hours', label: `Show all ${without}` }, { href: 'discover.html?time=tonight', label: "Tonight's listings" }] })
        : R().empty({ icon: 'store', title: `No ${noun} are listed yet.`,
          body: 'Other kinds of place are.', actions: [{ act: 'all-kinds', label: 'All places' }] });
      write();
      return;
    }
    $('list').innerHTML = `<ul class="places-grid">${list.map(v => {
      const n = listedAt(v);
      return R().placeRow(v, { extra: n ? `${n} listed` : '' });
    }).join('')}</ul>${R().locPrompt('Sort by walking time from where I am')}`;
    write();
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    const gb = hit('[data-group]');
    if (gb) { state.group = gb.dataset.group; render(); return; }
    if (hit('#open-now')) { state.open = !state.open; render(); return; }
    if (hit('[data-act="all-hours"]')) { state.open = false; render(); return; }
    if (hit('[data-act="all-kinds"]')) { state.group = ''; render(); return; }
    if (hit('[data-act="reload"]')) location.reload();
  });

  const pre = () => { $('list').innerHTML = R().skelRows(6); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pre, { once: true }); else pre();
  document.addEventListener('wa:catalog-ready', () => { render(); R().locateIfGranted(); });
  document.addEventListener('wa:location-ready', render);
})();
