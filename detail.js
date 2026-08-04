/* ============================================================
   detail.js — one detail template, two data shapes (6c).
   ------------------------------------------------------------
   Replaces venue.js (pick detail) and place.js (place detail). The repo
   had two templates for what is one layout: "an event fills the three
   cells with doors / entry / walk, a place fills them with closes /
   entry / walk and adds the week strip. Everything else is identical.
   That's one component to build instead of two to keep in sync."

   ?id= resolves against picks first, then venues — the same param the
   two old pages each used for their own type, so every venue.html?id=
   and place.html?id= link already in the wild lands on the right thing
   through the redirect.

   Detail is where the photo belongs: one item, no peers to compare
   against, and a reason for atmosphere. Under it three cells answer the
   only three questions a person on the street has — when, how much, how
   far — and the primary action is "Walk me there", not "I'm going": the
   reader has already decided; what they need is the route.

   Provenance closes every page. "The venue's own site, read 40 minutes
   ago" does the job the curator handle used to do — it tells you why to
   believe this, and it is checkable and scales to forty cities, which a
   person's taste does not.

   Every interpolated value is scraped: esc() at the site, safeUrl() for
   anything reaching an href or src.
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

  const param = (k) => new URLSearchParams(location.search).get(k) || '';

  /* ── Resolve ─────────────────────────────────────────────────
     Picks first: an id collision between the two tables is possible in
     principle and an event is the more time-critical answer. */
  const resolve = () => {
    const id = param('id');
    if (!id) return null;
    const picks  = window.WA._catalogAll || window.WA.catalog || [];
    const pick = picks.find(e => e.id === id);
    if (pick) return { kind: 'event', e: pick };
    const venues = window.WA._venuesAll || window.WA.venues || [];
    const venue = venues.find(v => v.id === id);
    if (venue) return { kind: 'place', e: venue };
    return null;
  };

  /* ── The three cells ─────────────────────────────────────────
     A cell with no answer is NOT rendered — a placeholder in a cell is
     the dead-value problem in a more prominent position. */
  const cell = (label, value) =>
    value ? `<div class="wa-cell"><span class="wa-cell__label">${esc(label)}</span>
             <span class="wa-cell__value">${esc(value)}</span></div>` : '';

  const walkCell = (e) => {
    const m = window.WA.Geo.distanceTo(e);
    if (m == null) return '';
    return cell('Walk', `${window.WA.Geo.walkMinutes(m)} min`);
  };

  const eventCells = (e) => {
    const doors = real(e.time) || (e.startsAt ? window.WA.Hours.clock(window.WA.Geo.startMinutes(e)) : '');
    const price = UI().priceLabel ? UI().priceLabel(e) : '';
    return [cell('Doors', doors), cell('Entry', price), walkCell(e)].join('');
  };

  /* The LABEL follows the state, it does not stay fixed while the value
     contorts to fit it. The first cut always said "Closes" and then had
     to put "closed today" underneath it — a cell reading
     "Closes / closed today" is not a fact, it is a template showing
     through. Open → Closes 18:00. Shut but opening later → Opens 10:00.
     Shut for the day → Today / closed. Unknown → no cell at all. */
  const placeCells = (v) => {
    const s = window.WA.Hours.state(v.openingHours);
    let hours = '';
    if (s.known) {
      if (s.open)                  hours = cell('Closes', s.closesAt == null ? '24 hours' : window.WA.Hours.clock(s.closesAt));
      else if (s.opensAt != null)  hours = cell('Opens', window.WA.Hours.clock(s.opensAt));
      else                         hours = cell('Today', 'closed');
    }
    /* "Free" is true of every place we list — they are shops, galleries
       and bars you walk into, not ticketed events. */
    return [hours, cell('Entry', 'Free'), walkCell(v)].join('');
  };

  /* ── The week strip (6c) ─────────────────────────────────────
     Same object as the density strip: a row per day, value on the right.
     Only for places, and only when hours exist — about half the table. */
  const weekStrip = (v) => {
    const week = window.WA.Hours.week(v.openingHours);
    if (!week) {
      return `<section class="wa-section">
        <h2 class="wa-section-title">Opening hours</h2>
        <p class="wa-section-sub">NOT FILED</p>
        <p class="wa-detail__note">This venue's hours have not reached us. Roughly half the places we list carry them; the rest we would rather leave blank than guess.</p>
      </section>`;
    }
    return `<section class="wa-section">
      <h2 class="wa-section-title">Opening hours</h2>
      <ul class="wa-week">
        ${week.map(d => `<li class="wa-week__row${d.isToday ? ' wa-week__row--today' : ''}">
          <span class="wa-week__day">${esc(d.day)}</span>
          <span class="wa-week__val">${esc(d.text)}</span>
        </li>`).join('')}
      </ul>
    </section>`;
  };

  /* ── Provenance (3b) ─────────────────────────────────────────
     Closes every detail page, and is the credibility line now that
     curators are gone. Says what we read and when. */
  const ago = (iso) => {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 0) return '';
    const mins = Math.round(ms / 60000);
    if (mins < 60)   return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24)    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    const days = Math.round(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  /* The sentence has to describe the link it is shown with. The first
     cut branched on `permalink` but rendered whichever URL existed, so a
     pick with only a ticket URL read "Our own desk. fienta.com" — the
     provenance line contradicting its own citation, which is worse than
     no provenance at all. One decision now: pick the URL first, then say
     what that URL is. */
  const provenance = ({ sourceUrl, what, when, sourceName }) => {
    if (!sourceUrl && !what) return '';
    const host = sourceUrl ? String(sourceUrl).replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '';
    const seen = when ? `, read ${ago(when)}` : '';
    return `<section class="wa-section">
      <h2 class="wa-section-title">Where this came from</h2>
      <p class="wa-detail__note">${esc(what)}${esc(seen)}.
        ${sourceUrl ? `<a href="${esc(url(sourceUrl))}" target="_blank" rel="noopener noreferrer">${esc(host || sourceName || 'source')} &nearr;</a>` : ''}
      </p>
    </section>`;
  };

  const eventProvenance = (e) => {
    const link = e.permalink || e.ticketUrl || '';
    const host = String(link).replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    let what;
    if (!link)                              what = 'Filed by our own desk';
    else if (/fienta|piletilevi|bilesu|tiketti|ra\.co/i.test(host)) what = 'The ticketing listing';
    else                                    what = "The venue's own page";
    return { sourceUrl: link, what, when: e.lastSeenAt || e.createdAt };
  };

  /* ── Well: photo, else the category mark ─────────────────────
     Never a grey box. Detail is the one place a photo earns full bleed
     because there is a single item and a reason for atmosphere. */
  const well = (e, title) => {
    const photo = e.imageUrl ? url(e.imageUrl) : '';
    const mark  = window.WA.Marks.markFor(e.kind);
    if (photo) {
      return `<div class="wa-detail__well">
        <img class="wa-detail__photo" src="${esc(window.WA.img ? window.WA.img(photo, 900) : photo)}"
             alt="" loading="eager" decoding="async" />
        ${e.imageAttr ? `<p class="wa-detail__credit">${esc(e.imageAttr)}</p>` : ''}
      </div>`;
    }
    return `<div class="wa-detail__well wa-detail__well--mark">
      <span class="wa-mark"><svg aria-hidden="true"><use href="#wa-mark-${esc(mark)}"></use></svg></span>
      <p class="wa-detail__credit">no photo on file</p>
    </div>`;
  };

  const mapsHref = (e, title) => {
    const c = window.WA.Geo.coordsFor(e);
    if (c) return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
    const q = [title, real(e.address), real(e.venue), window.WA.CITY].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
  };

  /* ── Render ──────────────────────────────────────────────────── */
  const render = () => {
    const hit = resolve();

    if (!hit) {
      /* 6d's expired-listing copy: listings expire, that is normal, and
         the state carries the next-best answer rather than an apology. */
      main().innerHTML = `<div class="wa-empty" style="margin-top:var(--s-8)">
        <p class="wa-empty__title">That page has closed down.</p>
        <p class="wa-empty__body">Listings expire — that's normal. Here's what's on tonight instead.</p>
        <div class="wa-empty__actions">
          <a class="wa-btn wa-btn--primary" href="./discover.html">Tonight in ${esc((window.WA.CITIES || []).find(c => c.id === window.WA.CITY)?.label.replace(/^(.)(.*)$/, (m,a,b)=>a+b.toLowerCase()) || 'Tallinn')}</a>
          <a class="wa-btn" href="./index.html">Explore</a>
        </div>
      </div>`;
      return;
    }

    const isEvent = hit.kind === 'event';
    const e = hit.e;
    const title = isEvent ? (e.title || '') : (e.name || '');
    const venueName = isEvent ? real(e.venue) : real(e.name);

    /* Opening a detail page is the signal "Hide things I've seen" reads. */
    window.WA.Seen.mark(e.id);

    document.title = `WanderAlt — ${title}`;
    const md = document.querySelector('meta[name="description"]');
    const desc = real(e.description) || real(e.quote) || '';
    if (md) md.content = desc.slice(0, 160);

    /* The eyebrow is the same three facts the row rail carries, so the
       page reads as a continuation of the list rather than a new object. */
    const eyebrowBits = [];
    if (isEvent) {
      if (window.WA.when.isTonight(e)) eyebrowBits.push('Tonight');
      const d = real(e.time);
      if (d) eyebrowBits.push(`doors ${d}`);
    } else {
      eyebrowBits.push(window.WA.Hours.label(e.openingHours));
    }
    const dist = window.WA.Geo.distanceLabel(e);
    if (dist) eyebrowBits.push(dist);

    const area = real(e.neighborhood);
    const metaLine = [real(e.kind), isEvent ? venueName : '', area].filter(Boolean).join(' · ');

    const saved = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[e.id]);

    main().innerHTML = `
      ${well(e, title)}

      <p class="wa-detail__eyebrow">${esc(eyebrowBits.filter(Boolean).join(' · '))}</p>
      <h1 class="wa-display wa-detail__title">${esc(title)}</h1>
      ${metaLine ? `<p class="wa-detail__meta">${esc(metaLine)}</p>` : ''}
      ${desc ? `<p class="wa-detail__desc${desc.length > 240 ? ' wa-detail__desc--clamp' : ''}" id="desc">${esc(desc)}</p>
         ${desc.length > 240 ? '<button class="wa-detail__more" type="button" id="more">more</button>' : ''}` : ''}

      <div class="wa-cells">${isEvent ? eventCells(e) : placeCells(e)}</div>

      <div class="wa-btn-row wa-detail__actions">
        <a class="wa-btn wa-btn--primary" href="${esc(mapsHref(e, title))}"
           target="_blank" rel="noopener noreferrer">Walk me there</a>
        <button class="wa-btn" type="button" id="save" aria-pressed="${saved}">
          ${saved ? 'Saved' : 'Save'}
        </button>
      </div>

      ${real(e.address) ? `<section class="wa-section">
        <h2 class="wa-section-title">Address</h2>
        <p class="wa-detail__note">${esc(e.address)}</p>
      </section>` : ''}

      ${!isEvent ? weekStrip(e) : ''}

      ${isEvent && venueName ? `<section class="wa-section">
        <h2 class="wa-section-title">More from here</h2>
        <p class="wa-section-sub">EVERYTHING AT THIS VENUE</p>
        <p style="margin-top:var(--s-3)"><a class="wa-btn" href="source.html?venue=${esc(encodeURIComponent(venueName))}">${esc(venueName)} &rarr;</a></p>
      </section>` : ''}

      ${provenance(isEvent ? eventProvenance(e) : {
        sourceUrl: e.website,
        what: e.openingHours ? 'Hours and details from OpenStreetMap' : 'Listed in OpenStreetMap',
        when: null,
        sourceName: 'openstreetmap.org',
      })}
    `;
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#save');
    if (b) {
      const hit = resolve();
      if (!hit) return;
      const on = b.getAttribute('aria-pressed') === 'true';
      window.WA.Bookmarks.set(hit.e.id, !on);
      b.setAttribute('aria-pressed', String(!on));
      b.textContent = !on ? 'Saved' : 'Save';
      return;
    }
    if (e.target.closest && e.target.closest('#more')) {
      /* 3a: the description expands IN PLACE — no navigation to read a
         sentence. */
      document.getElementById('desc').classList.remove('wa-detail__desc--clamp');
      e.target.closest('#more').remove();
      return;
    }
    if (e.target.closest && e.target.closest('#share')) {
      const hit = resolve();
      const title = hit ? (hit.e.title || hit.e.name || 'WanderAlt') : 'WanderAlt';
      if (navigator.share) navigator.share({ title, url: location.href }).catch(() => {});
      else navigator.clipboard && navigator.clipboard.writeText(location.href);
    }
  });

  document.addEventListener('wa:catalog-ready', () => { render(); window.WA.Geo.userLoc(); });
  document.addEventListener('wa:location-ready', render);
  if (window.WA && window.WA.catalog && window.WA.catalog.length) render();
})();
