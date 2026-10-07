/* ============================================================
   source.js — one source's listings, as a feed.
   ------------------------------------------------------------
   ?handle=<@handle> lists everything that source filed, by day.
   ?venue=<name> redirects to the venue page when the venue is a place
   we hold; otherwise it lists the picks that name that venue.
   ============================================================ */
(() => {
  'use strict';

  const R = () => window.WA.R;
  const esc = (s) => window.WA.UI.esc(s);
  const main = () => document.getElementById('main');
  const key = (s) => String(s || '').toLowerCase().trim();

  const resolve = () => {
    const sp = new URLSearchParams(location.search);
    const venue = sp.get('venue') || '';
    const handle = sp.get('handle') || '';
    const picks = R().live();
    if (venue) {
      const place = (window.WA._venuesAll || []).find(v => key(v.name) === key(venue));
      return { name: venue, picks: picks.filter(e => key(e.venue) === key(venue)), place, via: 'venue' };
    }
    if (handle) {
      return { name: `@${handle.replace(/^@/, '')}`, picks: picks.filter(e => key(e.handle) === key(handle)), via: 'handle' };
    }
    return null;
  };

  const render = () => {
    const s = resolve();
    if (s && s.place && s.place.id) { location.replace(`detail.html?id=${encodeURIComponent(s.place.id)}`); return; }
    if (!s || !s.picks.length) {
      main().innerHTML = R().empty({ icon: 'programme',
        title: s ? `Nothing from ${s.name} is listed right now.` : 'No source named.',
        body: s ? 'Sources go quiet between programmes. All events has the full listing.' : 'This page needs a source to show.',
        actions: [{ href: 'discover.html', label: 'All events' }, { href: 'index.html', label: 'Tonight' }] });
      return;
    }
    document.title = `${s.name} · WanderAlt`;
    const F = window.WA.Follows;
    const fid = s.via === 'handle' && F ? F.sourceId(s.name) : '';
    const following = !!fid && F.has(fid);
    const feed = following ? F.feedUrl(fid) : '';
    const venues = new Set(s.picks.map(e => R().latin(e.venue)).filter(Boolean)).size;
    const list = s.picks.slice().sort(window.WA.Geo.bySoonestThenDistance());
    main().innerHTML = `<header class="wa-pagehead">
        <p class="wa-kicker">${s.via === 'handle' ? 'A source we read' : 'Venue'}</p>
        <h1 class="wa-h1" data-notranslate>${esc(s.name)}</h1>
        <p class="wa-lede"><span>${list.length} listed</span>${s.via === 'handle' ? ` · <span>${venues} ${venues === 1 ? 'place' : 'places'}</span>` : ''} · <span>soonest first</span></p>
        ${fid ? `<p class="det-actions__row"><button class="wa-btn" type="button" id="follow-source" aria-pressed="${following}">${window.WA.Icon(following ? 'check' : 'follow')}<span>${following ? 'Following' : 'Follow'}</span></button>${feed ? `<a class="wa-btn" href="${esc(feed.replace(/^https?:/, 'webcal:'))}">${window.WA.Icon('calendar')}<span>Calendar</span></a>` : ''}</p>` : ''}
      </header>
      ${R().grouped(list)}`;
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#follow-source');
    const s = b && resolve();
    if (!s || !window.WA.Follows) return;
    window.WA.Follows.toggle(window.WA.Follows.sourceId(s.name), s.name);
    render();
  });
  document.addEventListener('wa:catalog-ready', render);
  const pre = () => { main().innerHTML = R().skelRows(5); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pre, { once: true }); else pre();
  document.addEventListener('wa:language-changed', render);
})();
