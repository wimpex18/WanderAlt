/* ============================================================
   source.js — the source page (3b). Replaces curator.js.
   ------------------------------------------------------------
   "The curator page becomes a source page. Same shape, honest subject:
   a venue, a feed, a channel. Following a venue is a stronger habit
   than following a stranger, and it is the seed of the personalisation
   you wanted to earn from behaviour rather than a quiz."

   The subject is a VENUE — the thing a reader recognises and can walk
   into — grouped from the picks that name it. Provenance replaces the
   byline: how many are on, when we last read it, how far away it is.

   ?venue=<name> is the key. ?handle=<@handle> is accepted too, because
   every curator.html link in the wild carries one; it resolves to that
   source's picks rather than 404ing, which is the same contract the
   retired query params get.
   ============================================================ */
(() => {
  'use strict';

  const UI  = () => window.WA.UI;
  const esc = (s) => UI().esc(s);
  const url = (u) => UI().safeUrl(u);
  const main = () => document.getElementById('main');

  const PLACEHOLDER = /^(unknown|tba|tbc|n\/a|none|null|other|-)$/i;
  const real = (v) => {
    const s = String(v == null ? '' : v).trim();
    return s && !PLACEHOLDER.test(s) ? s : '';
  };

  const key = (s) => String(s || '').toLowerCase().trim();

  /* ── Resolve the subject ─────────────────────────────────────
     A venue name, or a legacy curator handle mapped to the picks that
     carry it. Either way the answer is "a set of picks and the place
     they came from". */
  const resolve = () => {
    const sp = new URLSearchParams(location.search);
    const wantVenue  = sp.get('venue') || '';
    const wantHandle = sp.get('handle') || '';
    const picks = (window.WA._catalogAll || window.WA.catalog || [])
      .filter(e => !e.isClosed);

    if (wantVenue) {
      const k = key(wantVenue);
      const mine = picks.filter(e => key(e.venue) === k);
      const venue = (window.WA._venuesAll || window.WA.venues || [])
        .find(v => key(v.name) === k);
      return { name: real(wantVenue) || wantVenue, picks: mine, venue: venue || null, via: 'venue' };
    }

    if (wantHandle) {
      /* Legacy curator link. The handle is the source channel, so it
         still identifies a real feed — we just present it as one. */
      const k = key(wantHandle);
      const mine = picks.filter(e => key(e.handle) === k);
      /* Prefer naming it by the venue its picks actually share. */
      const venues = [...new Set(mine.map(e => real(e.venue)).filter(Boolean))];
      const name = venues.length === 1 ? venues[0] : (real(wantHandle) || wantHandle);
      const venue = venues.length === 1
        ? (window.WA._venuesAll || window.WA.venues || []).find(v => key(v.name) === key(venues[0]))
        : null;
      return { name, picks: mine, venue: venue || null, via: 'handle', handle: wantHandle };
    }

    return null;
  };

  const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  /* OPEN rather than an empty rail -- 3a's rule, same as Tonight and
     Saved. A source page is mostly exhibitions and runs, so the undated
     case is the common one here, not the edge. */
  const railFor = (e) => {
    if (window.WA.when.isTonight(e)) return 'TON';
    const k = window.WA.when.resolveKey(e);
    if (k) return DAY_ABBR[new Date(`${k}T12:00:00Z`).getUTCDay()];
    return 'OPEN';
  };

  /* Desktop-only far-right photo; absent element means absent cell, so
     a photoless row runs wider instead of leaving a gap. Same rule as
     the Tonight row — one implementation per pattern. */
  const media = (e) => {
    const src = e.imageUrl ? window.WA.UI.safeUrl(e.imageUrl) : '';
    if (!src) return '';
    return `<span class="wa-row__media"><img class="wa-mark__photo" alt=""
      loading="lazy" decoding="async"
      src="${esc(window.WA.img ? window.WA.img(src, 200) : src)}"></span>`;
  };

  const row = (e) => {
    const t = real(e.time);
    return `<li><a class="wa-row" href="detail.html?id=${esc(encodeURIComponent(e.id))}">
      <span class="wa-row__rail">
        <!-- No --now: this rail prints TON, a weekday or OPEN, never
             NOW, and isTonight() means TODAY rather than right now. -->
        <span class="wa-row__time">${esc(railFor(e))}</span>
        <span class="wa-row__dist">${esc(t)}</span>
      </span>
      <span class="wa-row__body">
        <span class="wa-row__title">${esc(e.title || '')}</span>
        <span class="wa-row__meta">${esc([real(e.kind), real(e.neighborhood)].filter(Boolean).join(' · '))}</span>
      </span>
      ${media(e)}
    </a></li>`;
  };

  const render = () => {
    const s = resolve();

    if (!s || !s.picks.length) {
      main().innerHTML = `<div class="wa-empty" style="margin-top:var(--s-8)">
        <p class="wa-empty__title">${s ? esc(`Nothing listed from ${s.name} right now.`) : 'No source named.'}</p>
        <p class="wa-empty__body">${s
          ? 'Sources go quiet between programmes. What we have read from everywhere else is on Tonight.'
          : 'This page needs a venue to show. Tonight has the full list.'}</p>
        <div class="wa-empty__actions">
          <a class="wa-btn wa-btn--primary" href="./discover.html">Tonight</a>
          <a class="wa-btn" href="./index.html">Explore</a>
        </div>
      </div>`;
      return;
    }

    document.title = `WanderAlt — ${s.name}`;

    const onNow = s.picks.filter(e => window.WA.when.isTonight(e)).length;
    const dist  = s.venue ? window.WA.Geo.distanceLabel(s.venue) : '';
    /* Freshest last_seen across this source's picks is the honest
       "read N ago" — it is when we last confirmed the listing stood. */
    const seen = s.picks
      .map(e => e.lastSeenAt || e.createdAt)
      .filter(Boolean)
      .sort()
      .pop();

    const following = window.WA.Follows.has(s.name);
    const fb = document.getElementById('follow');
    if (fb) {
      fb.setAttribute('aria-pressed', String(following));
      fb.textContent = following ? 'Following' : 'Follow';
    }

    const sorted = s.picks.slice().sort(window.WA.Geo.bySoonestThenDistance());
    const v = s.venue;
    const blurb = window.WA.venueBlurb ? window.WA.venueBlurb(s.name) : '';

    main().innerHTML = `
      <p class="wa-detail__eyebrow">${esc(s.via === 'handle' && !v ? 'Feed' : 'Venue · programme feed')}</p>
      <h1 class="wa-display wa-detail__title">${esc(s.name)}</h1>
      ${v && real(v.neighborhood) ? `<p class="wa-detail__meta">${esc([real(v.kind), real(v.neighborhood)].filter(Boolean).join(' · '))}</p>` : ''}

      <!-- 3b draws a blurb under the source title ("Former industrial
           hall in Põhja-Tallinn…"). venue_details.short_desc carries it
           on 3 of 224 rows today, so this renders when there is one and
           is absent otherwise rather than printing an empty frame. -->
      ${blurb ? `<p class="wa-detail__desc" style="margin-top:var(--s-4)">${esc(blurb)}</p>` : ''}

      <div class="wa-cells">
        <!-- The label follows the number. Falling back to the total under
             an "On now" heading claimed thirteen things were happening
             tonight when none were — the stat contradicting itself. -->
        <div class="wa-cell"><span class="wa-cell__label">${onNow ? 'On now' : 'Listed'}</span>
          <span class="wa-cell__value">${onNow || s.picks.length}</span></div>
        ${seen ? `<div class="wa-cell"><span class="wa-cell__label">Read</span>
          <span class="wa-cell__value">${esc(agoShort(seen))}</span></div>` : ''}
        ${dist ? `<div class="wa-cell"><span class="wa-cell__label">Away</span>
          <span class="wa-cell__value">${esc(dist)}</span></div>` : ''}
      </div>

      <section class="wa-section">
        <h2 class="wa-section-title">Everything from here</h2>
        <p class="wa-section-sub">${esc(`${s.picks.length} listed · soonest first`)}</p>
        <ul class="wa-rows">${sorted.map(row).join('')}</ul>
      </section>

      <p class="wa-detail__note" style="margin-top:var(--s-7)">
        Follow this venue to see its nights first. Nothing is emailed; it only
        changes the order on Explore.
      </p>

      ${v && v.website ? `<section class="wa-section">
        <h2 class="wa-section-title">Where this came from</h2>
        <p class="wa-detail__note">Listed in OpenStreetMap, programme read from the venue.
          <a href="${esc(url(v.website))}" target="_blank" rel="noopener noreferrer">${esc(String(v.website).replace(/^https?:\/\/(www\.)?/, '').split('/')[0])} &nearr;</a>
        </p>
      </section>` : ''}
    `;
  };

  const agoShort = (iso) => {
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 0) return '';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24)  return `${hrs} hr ago`;
    return `${Math.round(hrs / 24)} d ago`;
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#follow');
    if (!b) return;
    const s = resolve();
    if (!s) return;
    const now = window.WA.Follows.toggle(s.name);
    b.setAttribute('aria-pressed', String(now));
    b.textContent = now ? 'Following' : 'Follow';
  });

  document.addEventListener('wa:catalog-ready', () => { render(); window.WA.Geo.userLoc(); });
  document.addEventListener('wa:location-ready', render);
  if (window.WA && window.WA.catalog && window.WA.catalog.length) render();
})();
