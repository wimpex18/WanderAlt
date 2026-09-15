/* ============================================================
   detail.js — one detail template, two data shapes.
   ------------------------------------------------------------
   ?id= resolves against picks first, then venues. An event fills the
   three cells with doors / entry / walk; a place with closes / entry /
   walk plus the week strip. The primary action is "Walk me there".
   Provenance closes every page.

   Every interpolated value is database text: esc() at the site, safeUrl() for
   anything reaching an href or src.
   ============================================================ */
(() => {
  'use strict';

  /* Guarded: WA.Toast is optional per page. */
  const toast = (msg, label, undo) => {
    if (window.WA.Toast && window.WA.Toast.show) window.WA.Toast.show(msg, label, undo);
  };

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
  /* Set by lookUp() so resolve() can find what the catalogue could not. */
  let extra = null;

  const resolve = () => {
    const id = param('id');
    if (!id) return null;
    const picks  = window.WA._catalogAll || window.WA.catalog || [];
    const pick = picks.find(e => e.id === id);
    if (pick) return { kind: 'event', e: pick };
    const venues = window.WA._venuesAll || window.WA.venues || [];
    const venue = venues.find(v => v.id === id);
    if (venue) return { kind: 'place', e: venue };
    /* Whatever the by-id lookup fetched, if it ran. */
    return extra && extra.e && extra.e.id === id ? extra : null;
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

  /* The label follows the state: Open → Closes 18:00. Shut but opening
     later → Opens 10:00. Shut for the day → Today / closed. Unknown → no
     cell at all. */
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

  /* ── The week strip ──────────────────────────────────────────
     Only for places, and only when hours exist. */
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

  /* ── Provenance ──────────────────────────────────────────────
     Closes every detail page: what we read and when. */
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

  /* Pick the URL first, then describe that URL, so the sentence always
     matches the link it is shown with. */
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
      /* A logo (image_source 'logo', ~192px) is contained on the petrol tint,
         never cropped to fill the well. The credit line says which it is. */
      const isMark = e.imageSource === 'logo';
      return `<div class="wa-detail__well${isMark ? ' wa-detail__well--brand' : ''}">
        <img class="wa-detail__photo" src="${esc(photo)}"
             alt="" loading="eager" decoding="async" data-mark="${esc(mark)}" />
        ${e.imageAttr ? `<p class="wa-detail__credit">${esc(isMark ? `${e.imageAttr} — their logo, not a photo` : e.imageAttr)}</p>` : ''}
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
  /* Says which list the pick is already in, not just what the button does. */
  const listLabel = (id) => {
    const L = window.WA.Lists;
    if (!L) return 'Add to a list';
    const ls = L.listsFor(id);
    if (!ls.length) return 'Add to a list';
    if (ls.length === 1) return `In ${ls[0].name}`;
    return `In ${ls.length} lists`;
  };

  /* The two dead ends are different facts: an archived listing, and a row
     we never had. Both carry the next-best answer. */
  const deadEnd = (title, body) => {
    const cityLabel = (window.WA.CITIES || []).find(c => c.id === window.WA.CITY)?.label
      .replace(/^(.)(.*)$/, (m, a, b) => a + b.toLowerCase()) || 'Tallinn';
    main().innerHTML = `<div class="wa-empty" style="margin-top:var(--s-8)">
      <p class="wa-empty__title">${esc(title)}</p>
      <p class="wa-empty__body">${esc(body)}</p>
      <div class="wa-empty__actions">
        <a class="wa-btn wa-btn--primary" href="./discover.html">Tonight in ${esc(cityLabel)}</a>
        <a class="wa-btn" href="./index.html">Explore</a>
      </div>
    </div>`;
  };

  /* Ask the database for the one row the loaded set does not carry.
     Guarded against a double fetch: render() runs on catalog-ready and
     again after interactions, and a miss must not re-query each time. */
  let lookedUp = false;
  const lookUp = async () => {
    if (lookedUp) return;
    lookedUp = true;
    const found = window.WA.byId ? await window.WA.byId(param('id')) : null;

    if (!found) {
      deadEnd('We have no listing at that address.',
        'The link may be mistyped, or it may predate a change here. Nothing is missing from tonight.');
      return;
    }
    if (found.archivedAt) {
      const when = new Date(found.archivedAt);
      const dated = isNaN(when) ? '' :
        ` It came off the list on ${when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`;
      deadEnd('That listing has closed down.',
        `Listings expire — that's normal.${dated} Here's what's on tonight instead.`);
      return;
    }
    /* A live row the loaded set never held (e.g. a museum). Render it
       like any other. */
    extra = found;
    render();
  };

  const render = () => {
    const hit = resolve();

    if (!hit) {
      /* Not in the loaded set is not the same as gone: the loaded set also
         excludes every venue outside VENUE_KINDS. Ask the database first;
         the skeleton stays meanwhile. */
      lookUp();
      return;
    }

    const isEvent = hit.kind === 'event';
    const e = hit.e;
    const title = isEvent ? (e.title || '') : (e.name || '');
    const venueName = isEvent ? real(e.venue) : real(e.name);

    /* Opening a detail page is the signal "Hide things I've seen" reads. */
    window.WA.Seen.mark(e.id);

    document.title = `WanderAlt — ${title}`;
    /* A line that only restates the title is suppressed — same predicate
       as the Tonight row. */
    const md = document.querySelector('meta[name="description"]');
    const filed = window.WA.UI.descriptionOr(real(e.description), title)
               || window.WA.UI.descriptionOr(real(e.quote), title);

    /* No description gets the same sentence Tonight prints. */
    const venueWord = real(e.venue);
    const desc = filed ||
      (venueWord ? `No description filed. ${venueWord}'s own listing is one line long.`
                 : 'No description filed by the source.');
    /* The meta tag describes the page to a crawler, so it only ever
       carries a real sentence — never our apology for not having one. */
    if (md) md.content = filed.slice(0, 160);

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
        <!-- Lists live here rather than on a Saved row: a per-row
             control would cost the title 44px and
             pushed long picks to a third line. This is the screen where
             the reader is already deciding about one thing. -->
        <button class="wa-btn" type="button" id="addlist">${listLabel(e.id)}</button>
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
        what: 'Details from the venue',
        when: null,
        sourceName: null,
      })}
    `;
  };

  /* ── The add-to-list sheet ──────────────────────────────────
   Same shape as everywhere else: the lists this pick is already in,
   checked, then one field to name a new one. */
const listSheet = (pickId) => {
  const d = document.getElementById('sheet');
  const L = window.WA.Lists;
  if (!d || !L) return;
  const esc2 = window.WA.UI.esc;
  const lists = L.forCity(window.WA.CITY);
  const inThem = new Set(L.listsFor(pickId).map(l => l.id));

  document.getElementById('sheet-body').innerHTML = `
    ${lists.length ? `<div class="wa-chips">${lists.map(l => `
      <button class="wa-chip" type="button" data-toggle-list="${esc2(l.id)}"
              aria-pressed="${inThem.has(l.id)}">${esc2(l.name)}</button>`).join('')}</div>`
      : `<p class="wa-detail__note">No lists yet. Name one and this goes straight into it.</p>`}
    <div class="wa-field" style="margin-top:var(--s-5)">
      <label class="wa-field__label" for="list-name">New list</label>
      <input class="wa-input" id="list-name" type="text" maxlength="60"
             placeholder="Kalamaja day off" autocomplete="off">
    </div>`;
  document.getElementById('sheet-foot').innerHTML =
    `<button class="wa-btn wa-btn--primary" type="button" id="list-create" style="flex:1">Create and add</button>`;
  d.showModal();
};

document.addEventListener('click', (e) => {
  const L = window.WA.Lists;
  const id = new URLSearchParams(location.search).get('id') || '';

  if (e.target.closest && e.target.closest('#sheet-close')) {
    const d = document.getElementById('sheet'); if (d && d.open) d.close();
    return;
  }
  if (e.target.closest && e.target.closest('#addlist')) { listSheet(id); return; }

  const tog = e.target.closest && e.target.closest('[data-toggle-list]');
  if (tog && L) {
    const listId = tog.dataset.toggleList;
    const on = tog.getAttribute('aria-pressed') === 'true';
    if (on) L.removeItem(listId, id); else L.add(listId, id);
    tog.setAttribute('aria-pressed', String(!on));
    const l = L.byId(listId);
    if (!on && l) toast(`Saved to ${l.name}`, 'Undo', () => {
      L.removeItem(listId, id); render();
    });
    render();
    return;
  }

  if (e.target.closest && e.target.closest('#list-create') && L) {
    const input = document.getElementById('list-name');
    const newId = L.create(input ? input.value : '');
    if (!newId) { if (input) input.focus(); return; }
    L.add(newId, id);
    const d = document.getElementById('sheet'); if (d && d.open) d.close();
    render();
    toast(`Saved to ${L.byId(newId).name}`, 'Undo', () => {
      L.remove(newId); render();
    });
    return;
  }
});

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
      /* The description expands in place. */
      document.getElementById('desc').classList.remove('wa-detail__desc--clamp');
      e.target.closest('#more').remove();
      return;
    }
    const sh = e.target.closest && e.target.closest('#share');
    if (sh) {
      /* The trigger is the top bar's Share. Routed through WA.Share, which
         treats a dismissed OS sheet as cancelled rather than copying. */
      const hit = resolve();
      if (!hit || !window.WA.Share) return;
      const p = hit.e;
      window.WA.Share.url({
        title: p.title || 'WanderAlt',
        text:  [p.title, real(p.venue)].filter(Boolean).join(' · '),
        url:   location.href,
      }).then((r) => {
        /* WA.Toast requires a reverse action and a copied link has none, so
           the confirmation lives on the control. */
        if (r !== 'copied' && r !== 'failed') return;
        const was = sh.textContent;
        sh.textContent = r === 'copied' ? 'Link copied' : 'Copy failed';
        setTimeout(() => { sh.textContent = was; }, 2000);
      });
      return;
    }
  });

  document.addEventListener('wa:catalog-ready', () => { render(); window.WA.Geo.userLoc(); });
  document.addEventListener('wa:location-ready', render);
  if (window.WA && window.WA.catalog && window.WA.catalog.length) render();
})();
