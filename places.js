/* ============================================================
   places.js — Places: the shops, rooms and stages.
   ------------------------------------------------------------
   Kind chips (a kind with nothing in it is not offered), an Open now toggle,
   picked places first and then nearest first, from where you are, a place you
   chose, or the city's centre, always said in one line under the heading.
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

  /* Where walking times start: you, a place you chose, or the city's centre. */
  const origin = () => {
    const here = G().currentLoc();
    if (here) return { from: here, label: G().anchor() ? (G().anchor().label || 'your chosen place') : 'where you are', own: true };
    const city = (window.WA.CITIES || []).find(c => c.id === window.WA.CITY);
    return city && city.centre ? { from: city.centre, label: city.centre.label, own: false } : { from: null, label: '', own: false };
  };

  const sort = (list) => list.slice().sort((a, b) => {
    if (a.picked !== b.picked) return a.picked ? -1 : 1;
    const from = origin().from;
    const da = G().distanceTo(a, from), db = G().distanceTo(b, from);
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
        if (!n && state.group !== g.id) return '';
        return `<button class="wa-chip" type="button" data-group="${esc(g.id)}" aria-pressed="${state.group === g.id}">${window.WA.Picto(g.icon === "club" ? "club" : g.icon)}${esc(g.label)} <span class="wa-chip__n">${n}</span></button>`;
      }).join('');

    const list = sort(pool.filter(v => inGroup(v, state.group)));
    const openN = all.filter(v => inGroup(v, state.group)).filter(isOpen).length;
    const g = GROUPS.find(x => x.id === state.group);
    const noun = g ? g.label.toLowerCase() : 'places';
    const o = origin();
    $('summary').innerHTML = `<strong>${list.length} ${list.length === 1 && !g ? 'place' : esc(noun)}</strong> · nearest first${state.open ? '' : ` · ${openN} open now`}`;
    $('from').innerHTML = o.label ? `<span class="places-from__line">${window.WA.Icon('pin')}<span>Walking from <b>${esc(o.label)}</b></span></span>${o.own ? '' : '<button class="wa-linkbtn" type="button" data-near>Use my location</button>'}` : '';
    $('open-now').setAttribute('aria-pressed', String(state.open));

    if (!all.length) {
      $('list').innerHTML = R().empty({ icon: 'store', title: window.WA.DATA_LIVE === false ? "We can't reach the places right now." : 'No places are filed yet.',
        body: 'Try again in a moment.', actions: [{ act: 'reload', label: 'Try again' }] });
      return;
    }
    if (!list.length) {
      const without = all.filter(v => inGroup(v, state.group)).length;
      $('list').innerHTML = state.open && without
        ? R().empty({ icon: 'clock', title: 'None with filed hours are open now.',
          body: `Places without filed hours aren't included. ${without} ${noun} are listed in all.`,
          actions: [{ act: 'all-hours', label: `Show all ${without}` }, { href: 'discover.html?time=tonight', label: "Tonight's listings" }] })
        : R().empty({ icon: 'store', title: `No ${noun} are listed yet.`,
          body: 'Other kinds of place are.', actions: [{ act: 'all-kinds', label: 'All places' }] });
      write();
      return;
    }
    $('list').innerHTML = `<ul class="places-grid">${list.map(v => {
      const n = listedAt(v);
      return R().placeRow(v, { extra: n ? `${n} listed` : '', from: o.from });
    }).join('')}</ul>`;
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
    if (hit('[data-near]')) G().userLoc().then(() => render());
  });

  const pre = () => { $('list').innerHTML = R().skelRows(6); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pre, { once: true }); else pre();
  document.addEventListener('wa:catalog-ready', () => { render(); R().locateIfGranted(); });
  document.addEventListener('wa:location-ready', render);
})();
