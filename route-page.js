/* ============================================================
   route-page.js — one evening, stop by stop.
   ------------------------------------------------------------
   route.html?s=place:<id>:<minute>,event:<id>:<minute>,...
   With no `s`, the best route for the next few hours is composed (route.js). Each stop
   links to its own page and says where its facts come from; the walks
   between stops are straight-line distance at the site's one walking
   pace. Hours are shown only when filed.
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const G = () => window.WA.Geo;
  const H = () => window.WA.Hours;
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n, c) => window.WA.Icon(n, c);

  const venueOf = (s) => (s.type === 'place' ? (window.WA._venuesAll || []).find(v => v.id === s.id) : null);
  const art = (s) => {
    const v = venueOf(s);
    const src = v && v.imageUrl ? R().url(v.imageUrl) : '';
    if (!src) return window.WA.Picto.kind(s.kind);
    return `<span class="rt__logo${R().logoCls(v.imageSource === 'logo', v.imageTone)}"><img src="${esc(src)}" alt="" loading="lazy"></span>`;
  };

  const startLine = (first) => {
    const me = G().currentLoc();
    if (!me || first.lat == null) return '';
    const d = G().distanceTo({ lat: first.lat, lng: first.lng });
    const w = G().walkMinutes(d);
    return w == null ? '' : `<li class="rt__walk rt__walk--start"><span></span><span class="rt__rail" aria-hidden="true"></span><span>${esc(`${w} min walk from where you are`)}</span></li>`;
  };

  const stopHtml = (s, i, route) => {
    const last = i === route.stops.length - 1;
    const walk = !last && route.stops[i + 1].walk != null
      ? `<li class="rt__walk"><span></span><span class="rt__rail rt__rail--dash" aria-hidden="true"></span><span>${I('walk')}${esc(`${route.stops[i + 1].walk} min walk`)}</span></li>` : '';
    const sub = window.WA.Route.stopSub(s);
    return `<li class="rt__stop${s.type === 'event' ? ' is-event' : ''}">
        <time class="rt__time">${esc(H().clock(s.minute % 1440))}</time>
        <span class="rt__rail" aria-hidden="true"><span class="rt__node"></span></span>
        <a class="rt__body" href="${esc(s.href)}">
          <span class="rt__art">${art(s)}</span>
          <span class="rt__text">
            <span class="rt__name">${esc(s.name)}</span>
            <span class="rt__meta">${esc([sub, s.area].filter(Boolean).join(' · '))}</span>
            ${s.note ? `<span class="rt__note">${esc(s.note)}</span>` : ''}
          </span>
        </a></li>${walk}`;
  };

  const draw = (route) => {
    document.title = `${route.title} · WanderAlt`;
    $('rt-kicker').textContent = [R().dateShort(route.day || window.WA.when.todayKey()), route.area, `${route.stops.length} stops`].filter(Boolean).join(' · ');
    $('rt-title').textContent = route.title;
    if (!new URLSearchParams(location.search).has('d')) history.replaceState(null, '', window.WA.Route.href(route));
    const cost = window.WA.Route.costText(route);
    /* One sentence per span, so each is looked up whole in the interface language. */
    $('rt-sub').innerHTML = [route.blurb, `About ${window.WA.Route.lengthText(route)}.`, cost ? `${cost.charAt(0).toUpperCase()}${cost.slice(1)}.` : '', 'Check hours before you go.']
      .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join(' ');
    const maps = window.WA.Route.mapsUrl(route);
    $('rt-body').innerHTML = `<ol class="rt">${startLine(route.stops[0])}${route.stops.map((s, i) => stopHtml(s, i, route)).join('')}</ol>
      <div class="rt-actions">
        ${maps ? `<a class="wa-btn wa-btn--primary" href="${esc(maps)}" target="_blank" rel="noopener noreferrer">${I('walk')}Open in Maps</a>` : ''}
        <button class="wa-btn" type="button" id="rt-share">${I('share')}Share</button>
      </div>
      <p class="wa-note">${route.engine && route.engine !== 'rules' ? '<span>The title and note were written by an AI model from our own listings; the stops, times and walks are worked out and checked from the same data.</span> ' : ''}<span>Walking times are straight-line distances at a normal pace.</span> <span>Each stop's page says where its listing came from.</span></p>
      <div id="rt-more"></div>`;
    more(route);
  };

  /* Other evenings put together for today and the next days. */
  const more = (route) => {
    const host = $('rt-more');
    if (!host) return;
    const R2 = window.WA.Route;
    const list = R2.upcoming().filter(r => R2.param(r) !== R2.param(route)).slice(0, 6);
    if (!list.length) { host.innerHTML = ''; return; }
    const day = (r) => (r.off === 0 ? 'Today' : r.off === 1 ? 'Tomorrow' : R().dayName(r.day));
    host.innerHTML = `<section class="wa-sect rt-more"><h2 class="wa-sect__title">More routes</h2>${list.map(r => `<div class="rt-more__item">${R2.card(r, { label: day(r) })}</div>`).join('')}</section>`;
  };

  const none = (shared = false) => {
    $('rt-title').textContent = shared ? 'This walk is no longer available' : 'No route right now';
    $('rt-sub').textContent = '';
    $('rt-body').innerHTML = R().empty({ icon: 'calendar', title: shared ? 'Choose a walk for today.' : 'Nothing fits together right now.',
      body: shared ? 'Its date or stops have changed. Now has walks for the next few hours.' : 'A route needs a listing with a start time and a picked place close to it. The Guide has the places; Tonight has the listings.',
      actions: [{ href: 'index.html', label: 'Now' }, { href: 'places.html', label: 'Guide' }] });
  };

  const boot = () => {
    const q = new URLSearchParams(location.search);
    const s = q.get('s');
    const route = s ? window.WA.Route.fromURL(s, q.get('d')) : window.WA.Route.best();
    if (!route) { none(!!s); return; }
    /* A stored evening keeps its own title and note, once the table has answered. */
    const t = q.get('t');
    const row = t && window.WA.Route.upcoming().find(r => r.id === t);
    draw(row && row.day === route.day && window.WA.Route.param(row) === window.WA.Route.param(route) ? Object.assign(route, { id: row.id, title: row.title, blurb: row.blurb, engine: row.engine }) : route);
  };

  document.addEventListener('click', async (e) => {
    if (!e.target.closest || !e.target.closest('#rt-share')) return;
    const r = await window.WA.Share.url({ title: $('rt-title').textContent, text: 'A walk through Tallinn', url: location.href });
    if (r === 'copied' && window.WA.Toast) window.WA.Toast.show('Link copied');
  });

  document.addEventListener('wa:catalog-ready', () => { boot(); window.WA.Route.loadStored(); });
  document.addEventListener('wa:routes-ready', () => { if (window.WA.catalog) boot(); });
  document.addEventListener('wa:location-ready', () => { if (document.getElementById('rt-body').children.length) boot(); });
  document.addEventListener('wa:language-changed', boot);
})();
