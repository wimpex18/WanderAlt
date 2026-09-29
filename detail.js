/* ============================================================
   detail.js — the event page and the venue page.
   ------------------------------------------------------------
   ?id= resolves against events first, then places, then the database
   (WA.byId), so a row the browser did not load is never reported gone.

   Event: photo, English title and short English highlights,
   summary, When · Entry · Walk, Tickets first, then calendar, walking
   directions, save and lists; Going with the count; the venue as a
   small card; the source's own words; who is in it; a small map;
   where this came from.

   Venue: photo or a typographic block, open now or shut, what is on
   next, Follow, Website / Instagram / Facebook as labelled links, the
   programme grouped by day, the week's hours, a small map, provenance.
   ============================================================ */
(() => {
  'use strict';

  const R = () => window.WA.R;
  const W = () => window.WA.when;
  const G = () => window.WA.Geo;
  const H = () => window.WA.Hours;
  const UI = () => window.WA.UI;
  const esc = (s) => UI().esc(s);
  const url = (u) => UI().safeUrl(u);
  const I = (n, c) => window.WA.Icon(n, c);
  const main = () => document.getElementById('main');
  const toast = (m, l, u) => { if (window.WA.Toast) window.WA.Toast.show(m, l, u); };
  const param = (k) => new URLSearchParams(location.search).get(k) || '';

  let extra = null;
  const resolve = () => {
    const id = window.WA.canonicalId ? window.WA.canonicalId(param('id')) : param('id');
    if (!id) return null;
    const pick = (window.WA._catalogAll || []).find(e => e.id === id);
    if (pick) return { kind: 'event', e: pick };
    const venue = (window.WA._venuesAll || []).find(v => v.id === id);
    if (venue) return { kind: 'place', e: venue };
    return extra && extra.e && (extra.e.id === id || extra.requestedId === param('id')) ? extra : null;
  };

  /* ── Pieces ─────────────────────────────────────────────────── */
  const FACT_ICON = { When: 'calendar', Was: 'calendar', Entry: 'ticket', Walk: 'walk', Area: 'pin', Today: 'clock', Where: 'pin', Next: 'programme' };
  const fact = (label, value, sub) => value ? `<div class="det-fact">
      <span class="det-fact__icon">${I(FACT_ICON[label] || 'info')}</span>
      <span class="det-fact__text">
        <span class="det-fact__label">${esc(label)}</span>
        <span class="det-fact__value">${esc(value)}</span>
        ${sub ? `<span class="det-fact__sub">${esc(sub)}</span>` : ''}
      </span>
    </div>` : '';

  const walkFact = (x) => {
    const m = G().distanceTo(x);
    if (m != null) return fact('Walk', `${R().walkLabel(G().walkMinutes(m))} on foot`, G().format(m));
    const a = R().areaOf(x);
    return a ? fact('Area', a, 'Allow location for walking time') : '';
  };

  /* A wide poster is shown whole: the square hero would crop the title. */
  document.addEventListener('load', (e) => {
    const img = e.target;
    const fig = img && img.tagName === 'IMG' && img.closest('.det-media:not(.det-media--logo)');
    if (fig && img.naturalHeight && img.naturalWidth / img.naturalHeight >= 1.4) fig.classList.add('det-media--wide');
  }, true);

  const media = (x, word, kind) => {
    const src = x.imageUrl ? url(x.imageUrl) : '';
    if (src) {
      const logo = x.imageSource === 'logo';
      const credit = x.imageAttr ? (logo ? `${x.imageAttr}, their logo` : x.imageAttr) : '';
      return `<figure class="det-media${logo ? ' det-media--logo' : ''}">
        <img src="${esc(src)}" alt="" decoding="async" fetchpriority="high">
        ${credit ? `<figcaption class="det-credit">${esc(credit)}</figcaption>` : ''}
      </figure>`;
    }
    /* No photo: a monogram of the name, large, on the kind's tint. */
    const mono = String(word || '').replace(/\(.*?\)/g, ' ').split(/[\s\-–—:/@]+/)
      .filter(w => w && !/^(the|of|and|at|in|a|an|ja|ning)$/i.test(w))
      .slice(0, 3).map(w => w.charAt(0)).join('').toUpperCase();
    const pic = window.WA.Picto.kind(kind);
    const hue = (pic.match(/wa-picto--([a-z]+)/) || [])[1] || 'place';
    return `<div class="det-type wa-picto--${hue}" aria-hidden="true">${pic}
      <span class="det-type__word">${esc(mono || '·')}</span></div>`;
  };

  const directions = (x, title) => {
    const c = G().coordsFor(x);
    if (c) return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=walking`;
    const q = [title, R().real(x.address), R().real(x.venue), 'Tallinn'].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=walking`;
  };

  const TICKET_HOSTS = /fienta|piletilevi|bilesu|tiketti|ticketmaster|tickettailor|eventbrite|kinola|ra\.co|gateme|dice\.fm|shotgun/i;
  const ticketsFor = (e) => {
    const t = e.ticketUrl || (TICKET_HOSTS.test(String(e.permalink || '')) ? e.permalink : '');
    return t ? url(t) : '';
  };

  const ago = (iso) => {
    const ms = Date.now() - new Date(iso).getTime();
    if (!iso || !isFinite(ms) || ms < 0) return '';
    const m = Math.round(ms / 60000);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
    const d = Math.round(h / 24);
    return `${d} ${d === 1 ? 'day' : 'days'} ago`;
  };
  const host = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

  const key = (s) => String(s || '').toLowerCase().trim();
  const picksAt = (place) => (window.WA._catalogAll || [])
    .filter(p => !p.isClosed && !W().hasEnded(p) && ((place.id && p.venueId === place.id) || (place.name && key(p.venue) === key(place.name))))
    .sort(G().byDateThenSoonest());

  const saveBtn = (id) => {
    const on = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[id]);
    return `<button class="wa-btn" type="button" id="save" aria-pressed="${on}">${I(on ? 'hearted' : 'heart')}<span>${on ? 'Saved' : 'Save'}</span></button>`;
  };
  const listLabel = (id) => {
    const L = window.WA.Lists;
    const ls = L ? L.listsFor(id) : [];
    return !ls.length ? 'List' : ls.length === 1 ? ls[0].name : `${ls.length} lists`;
  };

  /* A small map of the spot. The MapLibre canvas outlives re-renders:
     it is kept and put back into each new slot. */
  const miniSlot = (x, title) => {
    const c = G().coordsFor(x);
    return c ? `<a class="det-minimap" id="minimap-slot" href="map.html?pick=${esc(encodeURIComponent(x.id))}" data-lat="${esc(c.lat)}" data-lng="${esc(c.lng)}" data-map-state="loading" aria-label="${esc(`${title} on the map`)}">
      <span class="det-minimap__message" role="status">Loading map…</span>
      <span class="det-minimap__pin" aria-hidden="true">${window.WA.Picto.kind(x.kind)}</span></a>` : '';
  };
  let mini = null, miniWatch = null, miniTimer = null, miniWait = false;
  const miniState = (state) => {
    const slot = document.getElementById('minimap-slot');
    if (!slot) return;
    slot.dataset.mapState = state;
    const message = slot.querySelector('.det-minimap__message');
    if (message) message.textContent = state === 'error' ? 'Map preview unavailable · Open map' : 'Loading map…';
    if (state !== 'loading') { clearTimeout(miniTimer); miniTimer = null; }
  };
  const mountMini = () => {
    const slot = document.getElementById('minimap-slot');
    if (!slot) return;
    const lat = Number(slot.dataset.lat), lng = Number(slot.dataset.lng);
    if (mini && mini.lat === lat && mini.lng === lng) { slot.prepend(mini.el); miniState(mini.state); mini.map.resize(); return; }
    // Offscreen WebGL previews need no tiles yet. Mount when the Address
    // section is visible, after its responsive layout has settled.
    const rect = slot.getBoundingClientRect();
    if ('IntersectionObserver' in window && (rect.top >= innerHeight || rect.bottom <= 0)) {
      if (miniWatch) miniWatch.disconnect();
      miniWatch = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting && entry.target === document.getElementById('minimap-slot'))) {
          miniWatch.disconnect(); miniWatch = null; mountMini();
        }
      });
      miniWatch.observe(slot);
      return;
    }
    if (!miniTimer) miniTimer = setTimeout(() => miniState('error'), 10000);
    const gl = window.maplibregl;
    if (!gl) {
      if (!miniWait) {
        miniWait = true;
        document.addEventListener('wa:maplibre-ready', () => { miniWait = false; mountMini(); }, { once: true });
      }
      document.dispatchEvent(new CustomEvent('wa:maplibre-request'));
      return;
    }
    if (mini) { mini.resize.disconnect(); mini.map.remove(); mini = null; }
    const el = document.createElement('div');
    el.className = 'det-minimap__canvas';
    slot.prepend(el);
    const dusk = document.documentElement.dataset.theme === 'dusk';
    try {
      const map = new gl.Map({ container: el, style: dusk ? './map-style-dusk.json' : './map-style.json', center: [lng, lat], zoom: 15.2,
        interactive: false, attributionControl: { compact: true } });
      const resize = new ResizeObserver(() => map.resize());
      resize.observe(el);
      const current = mini = { el, map, lat, lng, resize, state: 'loading' };
      map.once('load', () => {
        if (mini === current && current.state !== 'error') { current.state = 'ready'; miniState('ready'); }
      });
      map.on('error', () => {
        if (mini === current) { current.state = 'error'; miniState('error'); }
      });
    } catch { el.remove(); miniState('error'); console.warn('[detail] Map preview could not initialise'); }
  };
  document.addEventListener('wa:maplibre-error', () => miniState('error'));

  const goingRow = (e) => {
    if (!window.WA.Going) return '';
    const on = window.WA.Going.has(e.id);
    return `<div class="det-going">
      <span class="det-going__icon">${I('people')}</span>
      <span class="det-going__text" id="going-text">${on ? 'You are going' : 'Going?'}</span>
      <button class="wa-btn wa-btn--sm${on ? ' is-on' : ''}" type="button" id="going" aria-pressed="${on}">${I(on ? 'check' : 'follow')}<span>${on ? 'Going' : 'I’m going'}</span></button>
    </div>`;
  };
  let goingN = { id: '', n: null };
  const paintGoing = (id) => {
    const t = document.getElementById('going-text');
    if (!t) return;
    const on = window.WA.Going.has(id);
    const n = goingN.id === id ? goingN.n : null;
    const others = n == null ? null : Math.max(n - (on && window.WA.Auth && window.WA.Auth.isSignedIn() ? 1 : 0), 0);
    t.textContent = others == null ? (on ? 'You are going' : 'Going?')
      : on ? (others ? `You and ${others} ${others === 1 ? 'other' : 'others'}` : 'You are going')
      : others ? `${others} going` : 'Be the first to say you are going';
  };
  const fetchGoing = (id) => {
    if (!window.WA.Going || goingN.id === id) { paintGoing(id); return; }
    goingN = { id, n: null };
    window.WA.Going.count(id).then((n) => { if (goingN.id === id) { goingN.n = n; paintGoing(id); } });
  };

  /* ── Calendar file ─────────────────────────────────────────── */
  const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => `\\${m}`);
  const ics = (e) => {
    const start = e.startsAt ? new Date(e.startsAt) : null;
    if (!start || isNaN(start)) return '';
    const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 3 * 3600 * 1000);
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WanderAlt//Tallinn//EN', 'BEGIN:VEVENT',
      `UID:${icsText(e.id)}@wanderalt.app`, `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(e.title)}`,
      `LOCATION:${icsText([e.venue, e.address].filter(Boolean).join(', '))}`,
      `URL:${icsText(location.href)}`,
      'END:VEVENT', 'END:VCALENDAR',
    ];
    return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  };

  /* ── The event page ─────────────────────────────────────────── */
  const LANGUAGES = { en: 'English', et: 'Estonian', ru: 'Russian', uk: 'Ukrainian', fi: 'Finnish', sv: 'Swedish', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', lv: 'Latvian', lt: 'Lithuanian', pl: 'Polish', ja: 'Japanese', zh: 'Chinese', ko: 'Korean' };
  const originalContent = (e) => {
    const lang = LANGUAGES[e.originalLanguage] ? e.originalLanguage : 'und';
    const titleLang = LANGUAGES[e.titleLanguage] ? e.titleLanguage : lang;
    const orig = R().real(e.originalTitle) && R().fold(e.originalTitle) !== R().fold(e.title) ? e.originalTitle : '';
    const native = R().real(e.description);
    const desc = R().fold(native) !== R().fold(e.originalTitle || e.title) ? native : '';
    const source = url(e.originalUrl || e.permalink);
    return `${orig ? `<p class="det-orig" lang="${esc(titleLang)}">${esc(orig)}</p>` : ''}
      ${e.originalLoadFailed ? '<p class="wa-note" role="status">Could not load the original description.</p><button class="wa-btn" type="button" data-original-retry>Try again</button>' : desc ? `<p class="wa-prose" lang="${esc(lang)}">${esc(desc)}</p>` : '<p class="wa-note">The source filed no description beyond the title.</p>'}
      ${source ? `<p class="wa-note">${desc && desc.endsWith('…') ? 'An excerpt. ' : ''}<a class="wa-link" href="${esc(source)}" target="_blank" rel="noopener noreferrer">Read the full source</a></p>` : ''}`;
  };
  const loadOriginal = async (disclosure, e) => {
    disclosure.querySelector('#original-content').innerHTML = '<p class="wa-note" role="status">Loading source excerpt…</p>';
    await window.WA.originalDescription(e);
    if (disclosure.isConnected) {
      disclosure.querySelector('summary').textContent = `${e.originalLanguage === 'en' ? 'Source description' : 'Original description'}${LANGUAGES[e.originalLanguage] ? ` · ${LANGUAGES[e.originalLanguage]}` : ''}`;
      disclosure.querySelector('#original-content').innerHTML = originalContent(e);
    }
  };
  const eventPage = (e) => {
    const title = e.title || '';
    const kind = R().kindLabel(e.kind);
    const why = R().whyTag(e);
    const ended = W().hasEnded(e);
    const liveNow = R().isLive(e);
    const summary = UI().descriptionOr(e.quote, title);
    const spoken = (e.eventLanguages || []).map(code => LANGUAGES[code]).filter(Boolean).join(' and ');
    const k = W().resolveKey(e);
    const clock = R().clockOf(e);
    const whenValue = liveNow ? 'On now' : k ? (k === W().todayKey() ? 'Tonight' : R().dateShort(k)) : 'Ongoing';
    const whenSub = liveNow ? (R().endClock(e) ? `till ${R().endClock(e)}` : `since ${clock}`) : (clock || (k ? 'Time not filed' : ''));
    const off = R().isOff(e);
    const tickets = ended || off ? '' : ticketsFor(e);
    const cal = !ended && !off && e.startsAt ? ics(e) : '';
    const soldOut = e.flag === 'sold_out';
    const v = window.WA.venueFor(e);
    const venueName = R().real(e.venue) || (v && v.name) || '';

    const venueCard = () => {
      if (!venueName) return '';
      const id = e.venueId || (v && v.id) || '';
      const href = id ? `detail.html?id=${encodeURIComponent(id)}` : `source.html?venue=${encodeURIComponent(venueName)}`;
      const more = picksAt({ id, name: venueName }).filter(p => p.id !== e.id).length;
      const img = v && v.imageUrl ? url(v.imageUrl) : '';
      const meta = [v && R().kindLabel(v.kind, true), R().areaOf(v || e)].filter(Boolean).join(' · ');
      return `<section class="det-block"><h2 class="det-block__title">The venue</h2>
        <a class="vcard" href="${esc(href)}">
          <span class="vcard__art${img && v.imageSource === 'logo' ? ' is-logo' : ''}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : window.WA.Picto.kind(v ? v.kind : e.kind)}</span>
          <span class="vcard__body">
            <span class="vcard__name">${esc(venueName)}</span>
            ${meta ? `<span class="vcard__meta">${esc(meta)}</span>` : ''}
            ${v && v.openingHours ? R().openBadge(v) : ''}
            <span class="vcard__meta">${esc(more ? `${more} more listed here` : 'Nothing else listed here yet')}</span>
          </span>
          ${I('chevron')}
        </a></section>`;
    };

    const link = e.permalink || e.ticketUrl || '';
    const via = R().real(e.handle) ? `@${String(e.handle).replace(/^@/, '')}` : '';
    const seen = ago(e.lastSeenAt || e.createdAt);

    return `<div class="det-grid">
      <div class="det-grid__media">${media(e, title, e.kind)}</div>
      <div class="det-grid__main">
        ${ended ? `<div class="det-notice" role="status">${I('clock')}<span><strong>This has ended.</strong>${esc(k ? `It was on ${R().dateShort(k)}${clock ? ` at ${clock}` : ''}.` : '')} <a class="wa-link" href="index.html">What's on tonight</a></span></div>` : ''}
        ${!ended && off ? `<div class="det-notice det-notice--off" role="status">${I('info')}<span><strong>${esc(e.flag === 'cancelled' ? 'Cancelled' : 'Postponed')}</strong>${esc(e.flag === 'cancelled' ? 'The source says this will not go ahead.' : 'The source says this is moving to a new date. Check there before you go.')}${link ? ` <a class="wa-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open the listing</a>` : ''}</span></div>` : ''}
        <header class="det-head">
          <p class="wa-kicker">${off ? '' : R().flagTag(e)}${liveNow && !off ? '<span class="wa-now">Now</span>' : ''}${kind ? `<span class="wa-tag">${window.WA.Icon.kind(e.kind, 'wa-ic--sm')}${esc(kind)}</span>` : ''}${why ? `<span class="wa-tag wa-tag__why">${esc(why)}</span>` : ''}</p>
          <h1 class="wa-h1">${esc(title)}</h1>
          ${summary ? `<p class="det-summary">${esc(summary)}</p>` : ''}
          ${spoken ? `<p class="wa-note">${I('globe', 'wa-ic--sm')} In ${esc(spoken)}</p>` : ''}
        </header>

        <div class="det-facts">
          ${fact(ended ? 'Was' : 'When', whenValue, whenSub)}
          ${fact('Entry', R().price(e), R().isFree(e) ? '' : '')}
          ${walkFact(e)}
        </div>

        ${ended || off ? '' : `<div class="wa-bar">
          <span class="wa-bar__text"><span class="wa-bar__price">${esc(soldOut ? 'Sold out' : R().price(e) || whenValue)}</span>
            <span class="wa-bar__sub">${esc([e.flag === 'few_left' ? 'Few tickets left' : '', soldOut ? '' : R().price(e) ? whenValue : '', whenSub, tickets ? `on ${host(tickets)}` : venueName].filter(Boolean).join(' · '))}</span></span>
          ${tickets
            ? `<a class="wa-btn ${soldOut ? '' : 'wa-btn--primary'}" href="${esc(tickets)}" target="_blank" rel="noopener noreferrer">${I('ticket')}${soldOut ? 'Check for returns' : 'Tickets'}</a>`
            : `<a class="wa-btn wa-btn--primary" href="${esc(directions(e, title))}" target="_blank" rel="noopener noreferrer">${I('walk')}Walk me there</a>`}
        </div>
        <div class="det-actions">
          <div class="det-actions__row">
            ${cal ? `<a class="wa-btn" href="${esc(cal)}" download="${esc((title || 'event').slice(0, 40).replace(/[^\w\- ]+/g, ''))}.ics">${I('calendar')}<span>Calendar</span></a>` : ''}
            ${tickets ? `<a class="wa-btn" href="${esc(directions(e, title))}" target="_blank" rel="noopener noreferrer">${I('walk')}<span>Walk there</span></a>` : ''}
            ${saveBtn(e.id)}
            <button class="wa-btn" type="button" id="addlist">${I('list')}<span>${esc(listLabel(e.id))}</span></button>
          </div>
        </div>
        ${goingRow(e)}`}

        ${venueCard()}

        <details class="det-original" id="original-description">
          <summary>${e.originalLanguage === 'en' ? 'Source description' : 'Original description'}${LANGUAGES[e.originalLanguage] ? ` · ${esc(LANGUAGES[e.originalLanguage])}` : ''}</summary>
          <div class="det-original__body" id="original-content">${e.descriptionFull ? originalContent(e) : '<p class="wa-note" role="status">Loading source excerpt…</p>'}</div>
        </details>

        ${R().real(e.address) || G().coordsFor(e) ? `<section class="det-block"><h2 class="det-block__title">Address</h2>
          ${miniSlot(e, title)}
          ${R().real(e.address) ? `<p>${esc(e.address)}</p>` : ''}
          <a class="wa-link" href="${esc(directions(e, title))}" target="_blank" rel="noopener noreferrer">Walking directions</a></section>` : ''}

        <section class="det-block"><h2 class="det-block__title">Where this came from</h2>
          <div class="det-prov">
            <span>${esc([via ? `Listed via ${via}` : 'Filed by the venue', seen ? `read ${seen}` : ''].filter(Boolean).join(', '))}.</span>
            ${link ? `<a href="${esc(url(link))}" target="_blank" rel="noopener noreferrer">${esc(host(link))} ${I('out', 'wa-ic--sm')}</a>` : ''}
            ${via ? `<a href="source.html?handle=${esc(encodeURIComponent(e.handle))}">Everything from ${esc(via)}</a>` : ''}
          </div>
        </section>
      </div>
    </div>`;
  };

  /* ── The venue page ─────────────────────────────────────────── */
  const placePage = (v) => {
    const o = R().openState(v);
    const following = window.WA.Follows && window.WA.Follows.has(v.name);
    const links = [['globe', 'Website', v.website], ['instagram', 'Instagram', v.instagram], ['facebook', 'Facebook', v.facebook]]
      .map(([ic, label, href]) => [ic, label, href ? url(href) : '']).filter(x => x[2]);
    const list = picksAt(v);
    const walkIn = /^(record store|bookshop|thrift|gallery|community)$/.test(String(v.kind || ''));
    const week = H().week(v.openingHours);
    const todayHours = o.s.known ? (o.open ? (o.s.closesAt == null ? '24 hours' : `till ${H().clock(o.s.closesAt)}`) : o.s.opensAt != null ? `from ${H().clock(o.s.opensAt)}` : 'Shut') : '';

    const nearby = () => {
      const a = R().areaOf(v);
      const others = R().places().filter(x => x.id !== v.id && a && R().areaOf(x) === a).slice(0, 3);
      return others.length ? `<p class="wa-note" style="margin-top:var(--s-4)">Also in ${esc(a)}:</p><ul>${others.map(x => R().placeRow(x)).join('')}</ul>` : '';
    };

    return `<div class="det-grid">
      <div class="det-grid__media">${media(v, v.name || '', v.kind)}</div>
      <div class="det-grid__main">
        <header class="det-head">
          <p class="wa-kicker"><span class="wa-tag">${window.WA.Icon.kind(v.kind, 'wa-ic--sm')}${esc(R().kindLabel(v.kind, true) || 'Place')}</span>${R().areaOf(v) ? `<span>${esc(R().areaOf(v))}</span>` : ''}</p>
          ${v.isClosed ? '<div class="det-notice det-notice--off" role="status"><strong>This venue is listed as closed.</strong><span>Check with the venue before you go.</span></div>' : ''}
          <h1 class="wa-h1">${esc(v.name || '')}</h1>
          <p>${R().openBadge(v)}</p>
        </header>

        <div class="det-facts">
          ${o.s.known ? fact('Today', todayHours) : ''}
          ${list.length ? fact('Next', list[0].title, [R().badgeFor(list[0]).text, list.length > 1 ? `${list.length - 1} more after` : ''].filter(Boolean).join(' · ')) : ''}
          ${walkIn ? fact('Entry', 'Free', 'Walk in') : ''}
          ${walkFact(v)}
        </div>

        <div class="det-actions">
          <div class="det-actions__row">
            <button class="wa-btn" type="button" id="follow" aria-pressed="${!!following}">${I(following ? 'check' : 'follow')}<span>${following ? 'Following' : 'Follow'}</span></button>
            <a class="wa-btn" href="${esc(directions(v, v.name))}" target="_blank" rel="noopener noreferrer">${I('walk')}<span>Walk there</span></a>
            ${saveBtn(v.id)}
          </div>
          ${links.length ? `<div class="det-links">${links.map(([ic, label, href]) =>
            `<a class="det-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(`${label} (opens ${host(href)})`)}">${I(ic)}<span>${esc(label)}</span>${I('out', 'wa-ic--sm')}</a>`).join('')}</div>` : ''}
        </div>

        <section class="det-block">
          <h2 class="det-block__title">Listed here next${list.length ? ` · ${list.length}` : ''}</h2>
          ${list.length ? R().grouped(list, { noThumb: false })
            : `<p class="wa-note">Nothing from ${esc(v.name)} is listed right now. ${links.length ? 'Their own channels above carry what we have not read.' : ''} ${following ? '' : 'Follow it and its listings are marked for you when they arrive.'}</p>${nearby()}`}
        </section>

        <section class="det-block"><h2 class="det-block__title">Opening hours</h2>
          ${week ? `<div class="hours">${week.map(d => `<div class="hours__row${d.isToday ? ' hours__row--today' : ''}">
              <span class="hours__day">${esc(d.day)}</span><span class="hours__val">${esc(d.text)}</span>${d.isToday ? '<span class="hours__today">Today</span>' : '<span></span>'}
            </div>`).join('')}</div>`
            : '<p class="wa-note">Not filed. About half the places we list carry hours; for the rest we would rather leave a gap than guess.</p>'}
        </section>

        ${R().real(v.address) || G().coordsFor(v) ? `<section class="det-block"><h2 class="det-block__title">Address</h2>
          ${miniSlot(v, v.name)}
          ${R().real(v.address) ? `<p>${esc(v.address)}</p>` : ''}
          <a class="wa-link" href="${esc(directions(v, v.name))}" target="_blank" rel="noopener noreferrer">Walking directions</a></section>` : ''}

        <section class="det-block"><h2 class="det-block__title">Where this came from</h2>
          <div class="det-prov">${v.osmId
            ? `<span>Address, hours and links from OpenStreetMap.</span><a href="https://www.openstreetmap.org/${esc(v.osmId)}" target="_blank" rel="noopener noreferrer">openstreetmap.org ${I('out', 'wa-ic--sm')}</a>`
            : '<span>Details from the venue.</span>'}</div>
        </section>
      </div>
    </div>`;
  };

  /* ── Dead ends ─────────────────────────────────────────────── */
  const deadEnd = (title, body) => {
    main().innerHTML = R().empty({ icon: 'calendar', title, body,
      actions: [{ href: 'index.html', label: `Tonight in ${R().cityName()}` }, { href: 'discover.html', label: 'The week' }] });
  };
  let lookedUp = false;
  const lookUp = async () => {
    if (lookedUp) return;
    lookedUp = true;
    const found = window.WA.byId ? await window.WA.byId(param('id')) : null;
    if (!found) { deadEnd('We have no listing at that address.', 'The link may be mistyped, or it may be older than a change here.'); return; }
    if (found.archivedAt) {
      const d = new Date(found.archivedAt);
      deadEnd('That listing has closed down.', `Listings expire, which is normal.${isNaN(d) ? '' : ` This one came off on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`}`);
      return;
    }
    extra = { ...found, requestedId: param('id') };
    render();
  };

  const skeleton = () => {
    main().innerHTML = `<div class="det-grid" aria-hidden="true"><div class="det-grid__media"><div class="det-media"><span class="wa-skel" style="position:absolute;inset:0"></span></div></div>
      <div class="det-grid__main"><span class="wa-skel wa-skel--kicker"></span><span class="wa-skel" style="height:34px;width:90%"></span><span class="wa-skel" style="height:34px;width:60%"></span><span class="wa-skel" style="height:72px;width:100%;margin-top:12px"></span></div></div>`;
  };

  const render = () => {
    const hit = resolve();
    if (!hit) { lookUp(); return; }
    const e = hit.e;
    const isEvent = hit.kind === 'event';
    window.WA.Seen.mark(e.id);
    const title = isEvent ? e.title : e.name;
    document.title = `${title} · WanderAlt`;
    const md = document.querySelector('meta[name="description"]');
    if (md) md.content = (UI().descriptionOr(isEvent ? e.quote : e.description, title) || '').slice(0, 160);
    const y = window.scrollY;
    main().innerHTML = isEvent ? eventPage(e) : placePage(e);
    window.scrollTo(0, y);
    mountMini();
    if (isEvent) fetchGoing(e.id);
  };

  /* ── The add-to-list sheet ─────────────────────────────────── */
  const listSheet = (pickId) => {
    const d = document.getElementById('sheet');
    const L = window.WA.Lists;
    if (!d || !L) return;
    const lists = L.forCity(window.WA.CITY);
    const inThem = new Set(L.listsFor(pickId).map(l => l.id));
    document.getElementById('sheet-title').textContent = 'Add to a list';
    document.getElementById('sheet-body').innerHTML = `
      ${lists.length ? `<div class="wa-field"><span class="wa-field__label">Your lists</span><div class="wa-chips">${lists.map(l =>
        `<button class="wa-chip" type="button" data-toggle-list="${esc(l.id)}" aria-pressed="${inThem.has(l.id)}">${esc(l.name)}</button>`).join('')}</div></div>`
        : '<p class="wa-note" style="margin-bottom:var(--s-4)">No lists yet. Name one and this goes straight in.</p>'}
      <div class="wa-field">
        <label class="wa-field__label" for="list-name">New list</label>
        <input class="wa-input" id="list-name" type="text" maxlength="60" placeholder="Kalamaja on Saturday" autocomplete="off">
      </div>`;
    document.getElementById('sheet-foot').innerHTML = '<button class="wa-btn wa-btn--primary wa-btn--wide" type="button" id="list-create">Create and add</button>';
    d.showModal();
  };

  document.addEventListener('click', (ev) => {
    const hit = (s) => ev.target.closest && ev.target.closest(s);
    const id = param('id');
    const L = window.WA.Lists;
    const sheet = document.getElementById('sheet');

    if (hit('#sheet-close')) { if (sheet.open) sheet.close(); return; }
    /* Back returns to the list you came from when there is one. */
    if (hit('#back') && document.referrer.startsWith(location.origin) && history.length > 1) { ev.preventDefault(); history.back(); return; }
    if (hit('#addlist')) { listSheet(id); return; }
    const tog = hit('[data-toggle-list]');
    if (tog && L) {
      const listId = tog.dataset.toggleList;
      const on = tog.getAttribute('aria-pressed') === 'true';
      if (on) L.removeItem(listId, id); else L.add(listId, id);
      tog.setAttribute('aria-pressed', String(!on));
      const l = L.byId(listId);
      if (!on && l) toast(`Added to ${l.name}`, 'Undo', () => { L.removeItem(listId, id); render(); });
      render();
      return;
    }
    if (hit('#list-create') && L) {
      const input = document.getElementById('list-name');
      const newId = L.create(input ? input.value : '');
      if (!newId) { if (input) input.focus(); return; }
      L.add(newId, id);
      sheet.close();
      render();
      toast(`Added to ${L.byId(newId).name}`, 'Undo', () => { L.remove(newId); render(); });
      return;
    }
    if (hit('#save')) {
      const on = !(window.WA.Bookmarks.get()[id]);
      window.WA.Bookmarks.set(id, on);
      render();
      toast(on ? 'Saved' : 'Removed from saved', 'Undo', () => { window.WA.Bookmarks.set(id, !on); render(); });
      return;
    }
    if (hit('#going') && window.WA.Going) {
      const on = !window.WA.Going.has(id);
      const signed = window.WA.Auth && window.WA.Auth.isSignedIn();
      window.WA.Going.set(id, on).then(() => { goingN = { id: '', n: null }; fetchGoing(id); });
      render();
      if (on && !signed && window.WA.Auth) toast('Marked here. Sign in to be counted', 'Sign in', () => window.WA.Auth.openSignIn());
      else toast(on ? 'Marked as going' : 'Not going', 'Undo', () => { window.WA.Going.set(id, !on).then(() => { goingN = { id: '', n: null }; fetchGoing(id); }); render(); });
      return;
    }
    if (hit('#follow')) {
      const h = resolve();
      if (!h || !window.WA.Follows) return;
      const on = window.WA.Follows.toggle(h.e.name);
      render();
      toast(on ? `Following ${h.e.name}` : `Stopped following ${h.e.name}`, 'Undo', () => { window.WA.Follows.set(h.e.name, !on); render(); });
      return;
    }
    if (hit('[data-original-retry]')) {
      const h = resolve();
      if (h && h.kind === 'event') loadOriginal(document.getElementById('original-description'), h.e);
      return;
    }
    const sh = hit('#share') || hit('[data-share]');
    if (sh) {
      const h = resolve();
      if (!h || !window.WA.Share) return;
      const t = h.e.title || h.e.name || 'WanderAlt';
      window.WA.Share.url({ title: t, text: [t, R().real(h.e.venue)].filter(Boolean).join(' · '), url: location.href }).then((r) => {
        if (r !== 'copied' && r !== 'failed') return;
        sh.setAttribute('aria-label', r === 'copied' ? 'Link copied' : 'Could not copy the link');
        const was = sh.innerHTML;
        sh.innerHTML = sh.id === 'share' ? I(r === 'copied' ? 'check' : 'close') : `${I(r === 'copied' ? 'check' : 'close')}<span>${r === 'copied' ? 'Copied' : 'Failed'}</span>`;
        setTimeout(() => { sh.innerHTML = was; sh.setAttribute('aria-label', 'Share'); }, 2000);
      });
    }
  });

  document.addEventListener('toggle', async (event) => {
    const disclosure = event.target;
    if (disclosure.id !== 'original-description' || !disclosure.open) return;
    const hit = resolve();
    if (!hit || hit.kind !== 'event') return;
    await loadOriginal(disclosure, hit.e);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', skeleton, { once: true }); else skeleton();
  document.addEventListener('wa:catalog-ready', () => { render(); R().locateIfGranted(); });
  document.addEventListener('wa:location-ready', render);
})();
