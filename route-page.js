/* ============================================================
   route-page.js — one evening, stop by stop.
   ------------------------------------------------------------
   route.html?s=place:<id>:<minute>,event:<id>:<minute>,...
   With no `s`, the best route for the next few hours is composed (route.js). Each stop
   links to its own page and says where its facts come from; the walks
   between stops are the street estimate at the site's one walking pace, or,
   for a stored evening (`t`), the minutes its legs were routed along the
   streets. Hours are shown only when filed.
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
    return `<span class="rt__logo${R().logoCls(v.imageSource === 'logo', v.imageTone)}" data-kind="${esc(s.kind || '')}"><img ${window.WA.UI.imgAttrs(src, 160)} alt="" loading="lazy"></span>`;
  };

  const startLine = (first) => {
    const me = G().currentLoc();
    if (!me || first.lat == null) return '';
    const d = G().distanceTo({ lat: first.lat, lng: first.lng });
    const w = G().walkMinutes(d);
    return w == null ? '' : `<li class="rt__walk rt__walk--start"><span></span><span class="rt__rail" aria-hidden="true"></span><span>${esc(`${w} min walk from ${G().anchor() ? 'here' : 'where you are'}`)}</span></li>`;
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
            <span class="rt__meta">${esc(sub)}${s.area ? ` · <span data-notranslate>${esc(s.area)}</span>` : ''}</span>
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
    $('rt-sub').innerHTML = [route.blurb, `About ${window.WA.Route.lengthText(route)}.`, cost ? `${cost.charAt(0).toUpperCase()}${cost.slice(1)}.` : 'Place costs are not included.']
      .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join(' ');
    const maps = window.WA.Route.mapsUrl(route);
    const unfiledHours = route.stops.some(s => s.type === 'place' && s.hours === 'unknown');
    const unfiledEnd = route.stops.some((s, i) => s.type === 'event' && i < route.stops.length - 1 && !(window.WA.catalog || []).find(e => e.id === s.id)?.endsAt);
    $('rt-body').innerHTML = `<ol class="rt">${startLine(route.stops[0])}${route.stops.map((s, i) => stopHtml(s, i, route)).join('')}</ol>
      ${unfiledHours || unfiledEnd || !maps ? `<p class="wa-note rt-check">${[unfiledHours ? 'Some opening hours are not listed. Check before you go.' : '', unfiledEnd ? 'The event end time is not listed. Later stops are flexible.' : '', !maps ? 'Some stops have no map location. Open their pages for address details.' : ''].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join(' ')}</p>` : ''}
      <div class="rt-actions">
        ${maps ? `<a class="wa-btn wa-btn--primary" href="${esc(maps)}" target="_blank" rel="noopener noreferrer">${I('walk')}Open in Maps</a>` : ''}
        <button class="wa-btn" type="button" id="rt-share">${I('share')}Share</button>
      </div>
      <p class="wa-note">${route.engine && route.engine !== 'rules' ? '<span>The title and note were written by an AI model from our own listings; the stops, times and walks are worked out and checked from the same data.</span> ' : ''}<span>Place times are suggested.</span> <span>Walking times follow the streets at an easy pace.</span> <span>Tickets and opening hours can change. Check each stop before you go.</span></p>
      <div id="rt-more"></div>`;
    more(route);
    mapOf(route);
  };

  /* ── The walk on the street map, beside its stops (1024 px and wider) ──
     Numbered like the list; each number opens its stop. A dashed line joins the stops in walking
     order: it shows the order, not the path. MapLibre is fetched only here, so phones never load it. */
  const wide = typeof matchMedia === 'function' ? matchMedia('(min-width: 1024px)') : { matches: false, addEventListener() {} };
  let walkMap = null;
  const located = (s) => s.lat != null && s.lng != null && isFinite(s.lat) && isFinite(s.lng);
  const mapOf = (route) => {
    const host = $('rt-map');
    if (!host) return;
    const show = wide.matches && route.stops.length > 1 && route.stops.every(located);
    host.hidden = !show;
    if (!show) return;
    const dusk = document.documentElement.dataset.theme === 'dusk';
    const key = `${route.stops.map(s => `${s.id}@${s.lat},${s.lng}`).join('|')}|${dusk}`;
    if (walkMap && walkMap.key === key) return;
    const gl = window.maplibregl;
    if (!gl) {
      host.dataset.mapState = 'loading';
      document.addEventListener('wa:maplibre-ready', () => mapOf(route), { once: true });
      if (!document.querySelector('script[src$="maplibre-loader.js"]')) {
        const s = document.createElement('script');
        s.src = './maplibre-loader.js';
        document.head.append(s);
      } else document.dispatchEvent(new CustomEvent('wa:maplibre-request'));
      return;
    }
    if (walkMap) { walkMap.map.remove(); walkMap = null; }
    host.innerHTML = '<div class="rt-map__canvas"></div>';
    const lngs = route.stops.map(s => Number(s.lng)), lats = route.stops.map(s => Number(s.lat));
    try {
      const map = new gl.Map({ container: host.firstChild, style: dusk ? './map-style-dusk.json' : './map-style.json',
        bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], fitBoundsOptions: { padding: 64, maxZoom: 16 },
        scrollZoom: false, attributionControl: { compact: true } });
      map.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d83a14';
      const bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
      const fit = () => { map.resize(); map.fitBounds(bounds, { padding: 64, maxZoom: 16, animate: false }); };
      new ResizeObserver(fit).observe(host);
      map.on('load', () => {
        fit();
        map.addSource('walk', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.stops.map(s => [Number(s.lng), Number(s.lat)]) } } });
        map.addLayer({ id: 'walk', type: 'line', source: 'walk', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': accent, 'line-width': 3, 'line-dasharray': [1.2, 1.8] } });
        host.dataset.mapState = 'ready';
      });
      route.stops.forEach((s, i) => {
        const pin = document.createElement('a');
        pin.className = `rt-map__pin${s.type === 'event' ? ' is-event' : ''}`;
        pin.href = s.href;
        pin.innerHTML = `<span aria-hidden="true">${i + 1}</span><span class="wa-sr" data-notranslate>${esc(`${i + 1}. ${s.name}`)}</span>`;
        new gl.Marker({ element: pin }).setLngLat([Number(s.lng), Number(s.lat)]).addTo(map);
      });
      walkMap = { map, key };
    } catch { host.hidden = true; console.warn('[route] the walk map could not start'); }
  };
  wide.addEventListener('change', () => { if (window.WA.catalog) boot(); });

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
    if ($('rt-map')) $('rt-map').hidden = true;
    $('rt-title').textContent = shared ? 'This walk is no longer available' : 'No route right now';
    $('rt-sub').textContent = '';
    $('rt-body').innerHTML = R().empty({ icon: 'calendar', title: shared ? 'Choose a walk for today.' : 'Nothing fits together right now.',
      body: shared ? 'Its date or stops have changed. Now has walks for the next few hours.' : 'Try a different time or starting point, or browse the picked places in the Guide.',
      actions: [{ href: 'index.html', label: 'Now' }, { href: 'places.html', label: 'Guide' }] });
  };

  const boot = () => {
    const q = new URLSearchParams(location.search);
    const s = q.get('s');
    const route = s ? window.WA.Route.fromURL(s, q.get('d')) : window.WA.Route.best();
    if (!route) { none(!!s); return; }
    /* A stored evening keeps its own title, note and walks routed along the streets, once the table has answered. */
    const t = q.get('t');
    const row = t && window.WA.Route.upcoming().find(r => r.id === t);
    draw(row && row.day === route.day && window.WA.Route.param(row) === window.WA.Route.param(route)
      ? Object.assign(route, { id: row.id, title: row.title, blurb: row.blurb, engine: row.engine, stops: row.stops, walkMin: row.walkMin, street: row.street }) : route);
  };

  /* The share text goes to the OS sheet, outside the page the translator reads. A copy
     answers on the button itself, as on a listing's page: toasts here only carry an undo. */
  document.addEventListener('click', async (e) => {
    const sh = e.target.closest && e.target.closest('#rt-share');
    if (!sh) return;
    const text = window.WA.Lang ? window.WA.Lang.t('A walk through Tallinn') : 'A walk through Tallinn';
    const r = await window.WA.Share.url({ title: $('rt-title').textContent, text, url: location.href });
    if (r !== 'copied' && r !== 'failed') return;
    const was = sh.innerHTML;
    sh.setAttribute('aria-label', r === 'copied' ? 'Link copied' : 'Could not copy the link');
    sh.innerHTML = `${I(r === 'copied' ? 'check' : 'close')}<span>${r === 'copied' ? 'Copied' : 'Failed'}</span>`;
    setTimeout(() => { sh.innerHTML = was; sh.removeAttribute('aria-label'); }, 2000);
  });

  document.addEventListener('wa:catalog-ready', () => { boot(); window.WA.Route.loadStored(); });
  document.addEventListener('wa:routes-ready', () => { if (window.WA.catalog) boot(); });
  document.addEventListener('wa:location-ready', () => { if (document.getElementById('rt-body').children.length) boot(); });
  document.addEventListener('wa:language-changed', boot);
})();
