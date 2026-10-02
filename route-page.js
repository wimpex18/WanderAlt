/* ============================================================
   route-page.js — one evening, stop by stop.
   ------------------------------------------------------------
   route.html?s=place:<id>:<minute>,event:<id>:<minute>,...
   With no `s`, tonight's best route is composed (route.js). Each stop
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
    return `<span class="rt__logo${v.imageSource === 'logo' ? ' is-logo' : ''}"><img src="${esc(src)}" alt="" loading="lazy"></span>`;
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
    $('rt-kicker').textContent = [R().dayName(window.WA.when.todayKey()), route.area, `${route.stops.length} stops`].filter(Boolean).join(' · ');
    $('rt-title').textContent = route.title;
    $('rt-sub').textContent = `About ${window.WA.Route.lengthText(route)}. Chosen from picked places and what is listed; check hours before you go.`;
    const maps = window.WA.Route.mapsUrl(route);
    $('rt-body').innerHTML = `<ol class="rt">${startLine(route.stops[0])}${route.stops.map((s, i) => stopHtml(s, i, route)).join('')}</ol>
      <div class="rt-actions">
        ${maps ? `<a class="wa-btn wa-btn--primary" href="${esc(maps)}" target="_blank" rel="noopener noreferrer">${I('walk')}Open in Maps</a>` : ''}
        <button class="wa-btn" type="button" id="rt-share">${I('share')}Share</button>
      </div>
      <p class="wa-note">Walking times are straight-line distances at a normal pace. Each stop's page says where its listing came from.</p>`;
  };

  const none = () => {
    $('rt-title').textContent = 'No route tonight';
    $('rt-sub').textContent = '';
    $('rt-body').innerHTML = R().empty({ icon: 'calendar', title: 'Nothing fits together tonight.',
      body: 'A route needs a listing with a start time and a picked place close to it. The Guide has the places; Tonight has the listings.',
      actions: [{ href: 'index.html', label: 'Tonight' }, { href: 'places.html', label: 'Guide' }] });
  };

  const boot = () => {
    const s = new URLSearchParams(location.search).get('s');
    const route = s ? window.WA.Route.fromParam(s) : window.WA.Route.compose();
    if (route) draw(route); else none();
  };

  document.addEventListener('click', async (e) => {
    if (!e.target.closest || !e.target.closest('#rt-share')) return;
    const r = await window.WA.Share.url({ title: $('rt-title').textContent, text: 'An evening on foot in Tallinn', url: location.href });
    if (r === 'copied' && window.WA.Toast) window.WA.Toast.show('Link copied');
  });

  document.addEventListener('wa:catalog-ready', boot);
  document.addEventListener('wa:location-ready', () => { if (document.getElementById('rt-body').children.length) boot(); });
})();
