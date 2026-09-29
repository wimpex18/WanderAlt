/* ============================================================
   finder.js — the Where / When / What sheet.
   ------------------------------------------------------------
   Opened by any [data-finder] key (the three slots of the search pill on
   Tonight from 1024; phones type into the pill instead). Three cards,
   one open at a time; the closed ones show their answer. Where holds
   the search field with live results and the cities; When the days;
   What the kinds. Search goes to the Programme with those answers.
   ============================================================ */
(() => {
  'use strict';

  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const G = () => window.WA.Geo;
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n, c) => window.WA.Icon(n, c);
  const P = (n, c) => window.WA.Picto(n, c);

  const st = { open: 'where', q: '', when: '', kinds: new Set() };

  const KINDS = [
    ['gig', 'Gigs'], ['club', 'Club nights'], ['film', 'Film'], ['theatre', 'Theatre and dance'],
    ['exhibition', 'Art'], ['talk', 'Talks'], ['workshop', 'Workshops'], ['festival', 'Festivals'],
  ];
  const CITY_SUB = {
    tallinn: 'Old Town, Kalamaja, Telliskivi and the harbour',
    riga: 'Coming later', helsinki: 'Coming later', vilnius: 'Coming later',
  };
  /* Cities on the roadmap, shown so the list reads as a place that grows. */
  const SOON = [['riga', 'Riga, Latvia'], ['helsinki', 'Helsinki, Finland'], ['vilnius', 'Vilnius, Lithuania']];

  const whenOpts = () => {
    const list = R().live();
    const opt = (v, label, sub) => ({ v, label, sub, n: list.filter(e => W().matches(e, v)).length });
    const days = Array.from({ length: 5 }, (_, i) => W().keyPlus(i + 2)).map(k =>
      ({ v: `date:${k}`, label: R().dayName(k), sub: R().dateShort(k), n: list.filter(e => W().isOnDate(e, k)).length }));
    return [opt('tonight', 'Tonight', R().dateShort(W().todayKey())), opt('tomorrow', 'Tomorrow', R().dateShort(W().keyPlus(1))),
      opt('weekend', 'This weekend', 'Friday to Sunday'), opt('thisweek', 'This week', 'The next seven days'), ...days];
  };
  const whenLabel = () => (whenOpts().find(o => o.v === st.when) || {}).label || 'Any day';
  const whatLabel = () => (st.kinds.size ? KINDS.filter(([k]) => st.kinds.has(k)).map(([, l]) => l).join(', ') : 'Anything');
  const whereLabel = () => st.q || 'Tallinn';

  const results = () => {
    if (!st.q.trim()) return '';
    const events = R().live().filter(e => R().matches(e, st.q)).sort(G().byDateThenSoonest());
    const venues = R().places().filter(v => R().matches(v, st.q));
    if (!events.length && !venues.length) {
      return `<p class="wa-suggest__empty">Nothing listed matches “${esc(st.q)}”. Try a venue, an area such as Kalamaja, or a kind such as film.</p>`;
    }
    return `<div class="wa-finder__results">${events.slice(0, 5).map(e => {
      const b = R().badgeFor(e);
      return `<a class="wa-suggest__item" href="detail.html?id=${esc(encodeURIComponent(e.id))}">
        <span class="wa-suggest__glyph">${window.WA.Picto.kind(e.kind)}</span>
        <span><span class="wa-suggest__title">${esc(e.title)}</span><br><span class="wa-suggest__meta">${esc([e.venue, R().areaOf(e)].filter(Boolean).join(' · '))}</span></span>
        <span class="wa-suggest__side">${esc(b.text)}</span></a>`;
    }).join('')}${venues.slice(0, 3).map(v => `<a class="wa-suggest__item" href="detail.html?id=${esc(encodeURIComponent(v.id))}">
        <span class="wa-suggest__glyph">${window.WA.Picto.kind(v.kind)}</span>
        <span><span class="wa-suggest__title">${esc(v.name)}</span><br><span class="wa-suggest__meta">${esc([R().kindLabel(v.kind, true), R().areaOf(v)].filter(Boolean).join(' · '))}</span></span>
        <span class="wa-suggest__side">Place</span></a>`).join('')}</div>`;
  };

  const whereCard = () => st.open !== 'where'
    ? `<button class="wa-finder__row" type="button" data-fopen="where"><span>Where</span><span>${esc(whereLabel())}</span></button>`
    : `<div class="wa-finder__body">
        <h3 class="wa-finder__title">Where?</h3>
        <div class="wa-search">
          <label class="wa-sr" for="finder-q">Search listings, venues and areas</label>
          <span class="wa-search__icon">${I('search')}</span>
          <input class="wa-search__input" id="finder-q" type="search" autocomplete="off" spellcheck="false" placeholder="A venue, an area, a name" value="${esc(st.q)}" />
        </div>
        <div id="finder-results">${results()}</div>
        ${st.q ? '' : `<p class="wa-finder__label">Cities</p>
        <div>
          <button class="wa-city" type="button" data-locate-near>${P('nearby')}<span><span class="wa-city__name">Nearby</span><span class="wa-city__sub">${G().currentLoc() ? 'Walking times are on' : 'Show walking times from where you are'}</span></span></button>
          <button class="wa-city" type="button" data-fcity="tallinn" aria-pressed="true">${P('tallinn')}<span><span class="wa-city__name">Tallinn, Estonia</span><span class="wa-city__sub">${esc(CITY_SUB.tallinn)}</span></span></button>
          ${SOON.map(([id, name]) => `<button class="wa-city" type="button" disabled>${P(id)}<span><span class="wa-city__name">${esc(name)}</span><span class="wa-city__sub">We read Tallinn first</span></span><span class="wa-city__soon">Soon</span></button>`).join('')}
        </div>`}
      </div>`;

  const whenCard = () => st.open !== 'when'
    ? `<button class="wa-finder__row" type="button" data-fopen="when"><span>When</span><span>${esc(whenLabel())}</span></button>`
    : `<div class="wa-finder__body">
        <h3 class="wa-finder__title">When?</h3>
        <div class="wa-daygrid">${whenOpts().map(o => `<button class="wa-daybtn" type="button" data-fwhen="${esc(o.v)}" aria-pressed="${st.when === o.v}"${o.n ? '' : ' disabled'}>
          <strong>${esc(o.label)}</strong><span>${esc(`${o.sub} · ${o.n} listed`)}</span></button>`).join('')}</div>
      </div>`;

  const whatCard = () => st.open !== 'what'
    ? `<button class="wa-finder__row" type="button" data-fopen="what"><span>What</span><span>${esc(whatLabel())}</span></button>`
    : `<div class="wa-finder__body">
        <h3 class="wa-finder__title">What are you after?</h3>
        <div class="wa-chips">${KINDS.map(([k, l]) => `<button class="wa-chip" type="button" data-fkind="${esc(k)}" aria-pressed="${st.kinds.has(k)}">${window.WA.Picto.kind(k)}${esc(l)}</button>`).join('')}</div>
      </div>`;

  const paint = () => {
    const body = document.getElementById('sheet-body');
    body.innerHTML = `<div class="wa-finder">
      <div class="wa-finder__card">${whereCard()}</div>
      <div class="wa-finder__card">${whenCard()}</div>
      <div class="wa-finder__card">${whatCard()}</div>
    </div>`;
    document.getElementById('sheet-foot').innerHTML = `<button class="wa-btn wa-btn--quiet" type="button" data-fclear>Clear all</button>
      <button class="wa-btn wa-btn--primary" type="button" data-fgo>${I('search')}Search</button>`;
  };

  const href = () => {
    const sp = new URLSearchParams();
    if (st.q) sp.set('q', st.q);
    if (st.when.startsWith('date:')) sp.set('date', st.when.slice(5));
    else if (st.when) sp.set('time', st.when);
    if (st.kinds.size) sp.set('cat', [...st.kinds].join(','));
    return `discover.html${sp.toString() ? `?${sp}` : ''}`;
  };

  const open = (which) => {
    const d = document.getElementById('sheet');
    if (!d) return;
    st.open = which || 'where';
    d.classList.add('wa-sheet--finder');
    document.getElementById('sheet-title').textContent = 'Search';
    paint();
    if (!d.open) d.showModal();
    if (st.open === 'where') { const i = document.getElementById('finder-q'); if (i) i.focus(); }
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    const f = hit('[data-finder]');
    if (f) { e.preventDefault(); open(f.dataset.finder); return; }
    const d = document.getElementById('sheet');
    if (!d || !d.classList.contains('wa-sheet--finder')) return;
    if (hit('#sheet-close')) { d.close(); return; }
    const o = hit('[data-fopen]');
    if (o) { st.open = o.dataset.fopen; paint(); return; }
    const w = hit('[data-fwhen]');
    if (w) { st.when = st.when === w.dataset.fwhen ? '' : w.dataset.fwhen; st.open = 'what'; paint(); return; }
    const k = hit('[data-fkind]');
    if (k) { const v = k.dataset.fkind; st.kinds.has(v) ? st.kinds.delete(v) : st.kinds.add(v); paint(); return; }
    if (hit('[data-fclear]')) { st.q = ''; st.when = ''; st.kinds.clear(); st.open = 'where'; paint(); return; }
    if (hit('[data-fgo]')) { location.href = href(); return; }
    if (hit('[data-fcity]')) { st.open = 'when'; paint(); return; }
    if (hit('[data-locate-near]')) { G().userLoc().then(() => paint()); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'finder-q') return;
    st.q = e.target.value;
    document.getElementById('finder-results').innerHTML = results();
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'finder-q' && e.key === 'Enter') { e.preventDefault(); location.href = href(); }
  });
  /* The sheet is shared with other uses (Filters, lists), so the finder
     flag comes off when it closes. */
  document.addEventListener('close', (e) => { if (e.target.id === 'sheet') e.target.classList.remove('wa-sheet--finder'); }, true);

  window.WA.Finder = { open };
})();
