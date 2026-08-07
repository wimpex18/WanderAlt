/* ============================================================
   explore.js — Explore (5a phone, 5b desktop).
   ------------------------------------------------------------
   Replaces briefing.js. Today opened on a photograph and a single hero
   pick, which spent the whole first screen on one thing that might not
   be for you; Explore is a browsing surface and is honest about it.
   Carousels with plain section names, a count in every subtitle, and
   the dense list one tap away in Tonight.

   Four scope tabs, as 5b and 5c both draw them: All, Tonight, Places,
   Walks. Walks was cut from this row in the first cycle because measured
   opening-hours coverage was ~48%, under the ~70% the "ordered so every
   door is open when you reach it" promise needs. The parse rate of filed
   hours is 93.7% now, and both walk screens and the three hand-written
   routes shipped in 6b, so the tab surfaces what exists rather than
   promising work. On desktop this row is the masthead — see wa.css.

   Everything interpolated here is scraped: titles, venues, kinds and
   neighbourhoods come from Telegram, RSS and venue pages via an LLM.
   Every one goes through WA.UI.esc() at the interpolation site, and any
   URL goes through WA.UI.safeUrl() — esc() escapes quotes, not schemes.
   ============================================================ */
(() => {
  'use strict';

  const $  = (id) => document.getElementById(id);
  const UI = () => window.WA.UI;

  /* ── State ───────────────────────────────────────────────────
     The capsule owns it. `when` reuses when.js's vocabulary so the
     value means the same thing here, on Tonight and on the map. */
  const state = {
    scope: 'all',
    when:  'tonight',
    what:  'all',
  };

  const CITY_LABEL = () => {
    const c = (window.WA.CITIES || []).find(x => x.id === window.WA.CITY);
    return c ? c.label.charAt(0) + c.label.slice(1).toLowerCase() : 'Tallinn';
  };

  const WHEN_LABEL = { tonight: 'Tonight', tomorrow: 'Tomorrow', weekend: 'This weekend', thisweek: 'This week', all: 'Anytime' };

  /* ── Data ────────────────────────────────────────────────────
     Two shapes on this page: picks (events) and venues (places).
     They are normalised only where the card needs them to agree. */

  const picks  = () => (window.WA.catalog || []).filter(e => !e.isClosed);

  /* Places and picks share the card, so the card has to know which it
     has: a place answers "closes at", a pick answers "doors". Stamped
     once here rather than branching on the presence of a field. */
  let _places = null;
  const places = () => {
    if (_places) return _places;
    _places = (window.WA.venues || []).map(v => Object.assign({ __place: true }, v));
    return _places;
  };
  /* ?scope= so another screen can hand the reader straight to a scope.
     3a's thin-city empty state says "166 places are open regardless" and
     offers Show places; without this the button could only drop them on
     Explore's default tab and leave them to find Places themselves. */
  const readScope = () => {
    const want = new URLSearchParams(location.search).get('scope');
    if (!['all', 'tonight', 'places'].includes(want)) return;
    state.scope = want;
    document.querySelectorAll('#scope [data-scope]').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.scope === want)));
  };
  readScope();

  document.addEventListener('wa:catalog-ready', () => { _places = null; });

  const isFreeish = (e) => e.isFree === true ||
    (e.priceMin != null && Number(e.priceMin) === 0);

  /* The single most decision-changing fact, for the one badge a card
     is allowed. Never two. */
  const badgeFor = (e) => {
    if (e.__place) {
      const s = window.WA.Hours.state(e.openingHours);
      if (!s.known) return null;                    /* say nothing rather than guess */
      if (s.open)   return { text: 'Open', now: true };
      return null;
    }
    if (isFreeish(e))                 return { text: 'Free', now: false };

    /* Two bugs lived on this line. It printed e.time raw, so a pick
       whose time field is prose or a bare date rendered "Doors 00:00"
       on 24 cards; and it set now:true for anything merely happening
       today, which painted every one of those badges lime. Lime has one
       job — "now" — and a door opening at 15:00 seen at nine in the
       morning is not now. 5b draws these as the plain cream pill.

       So: lime only once it has actually started, which is the same
       rule the row rail uses for NOW, and a clock only when one parses. */
    const m = window.WA.when.statedMinutes(e);
    const today = window.WA.when.isTonight(e);
    if (m != null) {
      if (today && m <= window.WA.Hours.cityNow().minutes) return { text: 'Now', now: true };
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      return { text: `Doors ${hh}:${mm}`, now: false };
    }
    /* Dated but undated-in-time: say the day, never a made-up clock. */
    if (today) return { text: 'Tonight', now: false };
    return null;
  };

  /* Fixed order so a row of eight scans: distance · area, then
     kind · time or price. A missing field is stated, not left blank. */
  const metaLines = (e) => {
    const dist = window.WA.Geo.distanceLabel(e);
    /* 'other' is a data bucket, not a place — never print it. */
    const area = e.neighborhood && e.neighborhood.toLowerCase() !== 'other' ? e.neighborhood : '';
    /* Without permission or coordinates the slot degrades to the area,
       then to the city — still an orientation aid, still one line, and
       no layout shift when permission arrives later. It never prints
       "distance unknown": an empty slot should carry the next-best
       fact, not an apology for the missing one. */
    const line1 = [dist, area].filter(Boolean).join(' · ') || CITY_LABEL();

    let tail = '';
    if (e.__place) {
      const s = window.WA.Hours.state(e.openingHours);
      tail = !s.known ? 'hours not filed'
           : s.open   ? (s.closesAt == null ? 'open 24 hours' : `until ${window.WA.Hours.clock(s.closesAt)}`)
           : s.opensAt != null ? `opens ${window.WA.Hours.clock(s.opensAt)}` : 'closed today';
    } else {
      const price = UI().priceLabel ? UI().priceLabel(e) : '';
      tail = [e.day && e.day !== 'Tonight' ? e.day : '', e.time, price].filter(Boolean).join(' · ');
    }
    const line2 = [e.kind, tail].filter(Boolean).join(' · ');
    return [line1, line2];
  };

  /* One template for both shapes now (6c), so both go to the same page
     and detail.js resolves the id against picks then venues. */
  const hrefFor = (e) => `detail.html?id=${encodeURIComponent(e.id)}`;

  /* ── Card ────────────────────────────────────────────────────
     1 square well (photo, else the category mark) · 2 one badge top
     left · 3 save top right · 4 title, two lines, never truncated ·
     5 two mono lines. */
  const card = (e) => {
    const esc   = UI().esc;
    const title = e.__place ? (e.name || '') : (e.title || '');
    const badge = badgeFor(e);
    const [m1, m2] = metaLines(e);
    const mark  = window.WA.Marks.markFor(e.kind);
    const photo = e.imageUrl ? UI().safeUrl(e.imageUrl) : '';
    const saved = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[e.id]);

    const well = photo
      ? `<img class="wa-card__photo" src="${esc(window.WA.img ? window.WA.img(photo, 400) : photo)}" alt="" loading="lazy" decoding="async">`
      : `<span class="wa-mark"><svg aria-hidden="true"><use href="#wa-mark-${esc(mark)}"></use></svg></span>`;

    return `<a class="wa-card" href="${esc(hrefFor(e))}">
      <span class="wa-card__well">
        ${badge ? `<span class="wa-card__badge${badge.now ? ' wa-card__badge--now' : ''}">${esc(badge.text)}</span>` : ''}
        <button class="wa-card__save" type="button" data-save="${esc(e.id)}"
                aria-pressed="${saved ? 'true' : 'false'}"
                aria-label="${saved ? 'Remove from saved' : 'Save'} ${esc(title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3z"/></svg>
        </button>
        ${well}
      </span>
      <span class="wa-card__body">
        <span class="wa-card__title">${esc(title)}</span>
        <span class="wa-card__meta">${esc(m1)}</span>
        <span class="wa-card__meta">${esc(m2)}</span>
      </span>
    </a>`;
  };

  const seeAll = (n, href, sub) => {
    const esc = UI().esc;
    return `<a class="wa-seeall" href="${esc(href)}">
      <span class="wa-seeall__label">See all ${esc(String(n))}</span>
      <span class="wa-seeall__sub">${esc(sub)}</span>
    </a>`;
  };

  /* ── Section ─────────────────────────────────────────────────
     Every section carries a count in its subtitle, because every
     surface has to read well at N=3. A thin section is a short row,
     never a hole — and when one cannot fill a row at all, it says
     why rather than disappearing. */
  const section = ({ title, sub, items, href, hrefSub, emptyTitle, emptyBody }) => {
    const esc = UI().esc;
    if (!items.length) {
      return `<section class="wa-section">
        <h2 class="wa-section-title">${esc(title)}</h2>
        <p class="wa-section-sub">${esc(sub)}</p>
        <div class="wa-empty">
          <p class="wa-empty__title">${esc(emptyTitle)}</p>
          <p class="wa-empty__body">${esc(emptyBody)}</p>
        </div>
      </section>`;
    }
    const shown = items.slice(0, 12);
    const bridge = href && items.length > shown.length ? seeAll(items.length, href, hrefSub || 'as a timetable') : '';
    return `<section class="wa-section">
      <h2 class="wa-section-title">${esc(title)}</h2>
      <p class="wa-section-sub">${esc(sub)}</p>
      <div class="wa-carousel">${shown.map(card).join('')}${bridge}</div>
    </section>`;
  };

  /* ── The sections themselves ─────────────────────────────────
     "Locals kept coming back to" from 5a is deliberately absent: it
     ranks by how often a pick is saved, and the bookmarks table has
     no rows yet. A popularity shelf invented from nothing is exactly
     the kind of claim this redesign removed everywhere else. It
     returns when there is something to count. */
  const buildSections = () => {
    const esc  = UI().esc;
    const when = window.WA.when;
    const geo  = window.WA.Geo;
    const city = CITY_LABEL();
    const out  = [];

    const events = picks().filter(e => when.matches(e, state.when))
      .filter(e => state.what === 'all' || String(e.kind || '').toLowerCase() === state.what);

    const openNow = places().filter((p) => {
      const s = window.WA.Hours.state(p.openingHours);
      return s.known && s.open;
    });

    const sorted = (list) => list.slice().sort(geo.bySoonestThenDistance());

    /* 5b's fourth scope. Routes are not picks, so this does not go
       through section() -- it lists every route for the city using the
       same card the All scope shows one of. A city with no routes says
       so plainly rather than showing an empty shelf. */
    if (state.scope === 'walks') {
      const esc = UI().esc;
      const mine = (ROUTES || []).filter(r => r.city === window.WA.CITY);
      out.push(`<section class="wa-section">
        <h2 class="wa-section-title">Walks in ${esc(city)}</h2>
        <p class="wa-section-sub">${esc(mine.length
          ? `${mine.length} ${mine.length === 1 ? 'route' : 'routes'} · hand-assembled`
          : 'none yet')}</p>
        ${mine.length
          ? mine.map(r => `<a class="wa-walkcard" href="walk.html?id=${esc(encodeURIComponent(r.id))}">
              <span class="wa-walkcard__eyebrow">A walk</span>
              <span class="wa-walkcard__title">${esc(r.title)}</span>
              <p class="wa-walkcard__blurb">${esc(r.blurb)}</p>
              <span class="wa-walkcard__facts">${esc(`${r.stops.length} stops · ordered so every door is open when you reach it`)}</span>
            </a>`).join('')
          : `<div class="wa-empty">
              <p class="wa-empty__title">No walks written for ${esc(city)} yet.</p>
              <p class="wa-empty__body">Routes are assembled by hand around venues whose opening hours are filed, so they arrive one city at a time. Tallinn has three.</p>
            </div>`}
      </section>`);
    }

    if (state.scope === 'all' || state.scope === 'tonight') {
      const label = WHEN_LABEL[state.when] || 'On';
      out.push(section({
        title: `${label} in ${city}`,
        sub:   `${events.length} ${events.length === 1 ? 'event' : 'events'} · soonest first`,
        items: sorted(events),
        href:  `discover.html?time=${encodeURIComponent(state.when)}`,
        hrefSub: 'as a timetable',
        emptyTitle: `Nothing filed for ${label.toLowerCase()} in ${city}.`,
        emptyBody:  openNow.length
          ? `The sources went quiet, which happens. ${openNow.length} ${openNow.length === 1 ? 'place is' : 'places are'} open right now regardless.`
          : `The sources went quiet, which happens. Try a wider window from the When slot above.`,
      }));
    }

    if (state.scope === 'all' || state.scope === 'places') {
      /* This section is only honest where hours exist. Roughly half the
         catalogue carries them; the rest is covered by the Places
         section below, which never claims to know. */
      out.push(section({
        title: 'Open right now',
        sub:   `${openNow.length} ${openNow.length === 1 ? 'place' : 'places'} · nearest first`,
        items: sorted(openNow),
        href:  'discover.html?type=places',
        hrefSub: 'every place',
        emptyTitle: 'Nothing we can confirm is open this minute.',
        emptyBody:  `Opening hours reach us for about half of ${city}'s places, so this is quieter than the city is. Places below shows everything.`,
      }));
    }

    if (state.scope === 'places') {
      const all = places().slice().sort((a, b) => {
        const da = geo.distanceTo(a), db = geo.distanceTo(b);
        if (da != null && db != null) return da - db;
        if (da != null) return -1;
        if (db != null) return 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      out.push(section({
        title: `Places in ${city}`,
        sub:   `${all.length} listed · nearest first`,
        items: all,
        href:  'discover.html?type=places',
        hrefSub: 'as a list',
        emptyTitle: `No places listed in ${city} yet.`,
        emptyBody:  'The venue index is built from OpenStreetMap, and this city has not been swept yet.',
      }));
    }

    return out.join('');
  };

  /* ── Render ──────────────────────────────────────────────────
     Skeleton first, matching the grid exactly so nothing jumps. */
  const skeleton = () =>
    `<section class="wa-section">
      <h2 class="wa-section-title">Reading the sources</h2>
      <p class="wa-section-sub">ONE MOMENT</p>
      <div class="wa-carousel">${Array.from({ length: 4 }, () => `
        <div class="wa-card">
          <span class="wa-skel wa-skel--well"></span>
          <span class="wa-card__body">
            <span class="wa-skel wa-skel--title"></span>
            <span class="wa-skel wa-skel--line"></span>
          </span>
        </div>`).join('')}</div>
    </section>`;

  /* 6b's test surface: ONE route as a full-width card, above the fold,
     for two weeks. Not a scope chip -- Walks is not a section of the
     catalogue, it is a single experiment, and 5g's build order puts it
     last precisely because it is the only thing here that needs new
     logic rather than new layout.

     Renders only for cities that actually have routes, so the other
     three do not carry a hole where an experiment would be. */
  let ROUTES = null;
  const walkCard = () => {
    /* esc is function-scoped throughout this file, not module-scoped --
       using it without this line threw a ReferenceError that vanished
       into loadWalks()'s unawaited promise, so the card simply never
       appeared and nothing said why. */
    const esc = UI().esc;
    const host = $('walkcard');
    if (!host) return;
    /* The Walks scope lists every route below, so the teaser above it
       would be the same card printed twice. */
    if (state.scope === 'walks') { host.innerHTML = ''; return; }
    const mine = (ROUTES || []).filter(r => r.city === window.WA.CITY);
    if (!mine.length) { host.innerHTML = ''; return; }
    const r = mine[0];
    const stops = r.stops.length;
    host.innerHTML = `<a class="wa-walkcard" href="walk.html?id=${esc(encodeURIComponent(r.id))}">
      <span class="wa-walkcard__eyebrow">A walk</span>
      <span class="wa-walkcard__title">${esc(r.title)}</span>
      <p class="wa-walkcard__blurb">${esc(r.blurb)}</p>
      <span class="wa-walkcard__facts">${esc(`${stops} stops · ordered so every door is open when you reach it`)}</span>
    </a>`;
  };

  /* ── 5b's saved strip ────────────────────────────────────────
     "3 saved in Kalamaja · Two are open right now →". It sits between
     the capsule and the first shelf, and on desktop it is now the only
     route to Saved, since 5b's masthead is the scope tabs and the app
     tab bar is a phone pattern. So it always carries the link, even
     when nothing saved is open.

     The area is the neighbourhood most of the saved things share, not
     the reader's GPS position: it is a fact about the shelf being
     described, it needs no permission, and it is still true when
     location is denied. It falls back to the city.

     Nothing saved means no strip at all. A row reading "0 saved in
     Tallinn" is an empty state for a shelf that was never asked for. */
  const savedStrip = () => {
    const esc = UI().esc;
    const host = $('savedstrip');
    if (!host) return;
    const B = window.WA.Bookmarks;
    if (!B || !B.ids) { host.innerHTML = ''; return; }

    /* Both shapes, the way saved-page.js resolves them. Saved holds
       places as well as picks, and searching only the pick catalogue
       made a reader with three saved bars see no strip at all. */
    const ids = new Set(B.ids());
    const mine = [
      ...(window.WA._catalogAll || window.WA.catalog || []),
      ...(window.WA._venuesAll  || window.WA.venues  || []),
    ].filter(e => ids.has(e.id) && e.city === window.WA.CITY);
    if (!mine.length) { host.innerHTML = ''; return; }

    const tally = {};
    for (const e of mine) {
      const a = e.neighborhood && e.neighborhood.toLowerCase() !== 'other' ? e.neighborhood : '';
      if (a) tally[a] = (tally[a] || 0) + 1;
    }
    const area = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || CITY_LABEL();

    /* Open right now means the same thing it means everywhere else: a
       place whose filed hours say open, or a dated pick that has
       already started. Never a guess from an unparsed time. */
    const openCount = mine.filter((e) => {
      if (e.__place || e.openingHours) return window.WA.Hours.state(e.openingHours).open === true;
      const m = window.WA.when.statedMinutes(e);
      return m != null && window.WA.when.isTonight(e) && m <= window.WA.Hours.cityNow().minutes;
    }).length;

    const WORD = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
    const tail = openCount
      ? `${WORD[openCount] || openCount} ${openCount === 1 ? 'is' : 'are'} open right now`
      : 'See them all';

    host.innerHTML = `<a class="wa-savedstrip" href="saved.html">
      <span class="wa-savedstrip__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>
      </span>
      <span class="wa-savedstrip__count">${esc(`${mine.length} saved in ${area}`)}</span>
      <span class="wa-savedstrip__more">${esc(tail)} &rarr;</span>
    </a>`;
  };

  const loadWalks = async () => {
    try {
      const res = await fetch('./walks.json');
      ROUTES = res.ok ? (await res.json()).routes : [];
      walkCard();
    } catch (err) {
      ROUTES = [];
      console.warn('[WanderAlt] walks.json did not load — the route card is skipped.', err);
    }
  };
  loadWalks();

  const render = () => {
    savedStrip();
    walkCard();
    $('sections').innerHTML = buildSections();
    $('cap-where').textContent = CITY_LABEL();
    $('cap-when').textContent  = WHEN_LABEL[state.when] || 'Anytime';
    $('cap-what').textContent  = state.what === 'all' ? 'Anything' : state.what;
    const dc = $('digest-city');
    if (dc) dc.textContent = CITY_LABEL();
  };

  /* ── Sheets ──────────────────────────────────────────────────
     One question expanded, the other two parked below showing their
     current value. */
  const sheet = $('sheet');

  const parkedRow = (slot, label, value) => {
    const esc = UI().esc;
    return `<button class="wa-sheet__parked" type="button" data-open-slot="${esc(slot)}" style="margin-top:var(--s-3)">
      <span class="wa-sheet__parked-label">${esc(label)}</span>
      <span class="wa-sheet__parked-value">${esc(value)}</span>
    </button>`;
  };

  const whereBody = () => {
    const esc = UI().esc;
    const rows = (window.WA.CITIES || []).map((c) => {
      const cityPicks  = (window.WA._catalogAll || []).filter(e => e.city === c.id && window.WA.when.isTonight(e)).length;
      const cityPlaces = (window.WA._venuesAll  || []).filter(v => v.city === c.id).length;
      /* Coverage printed BEFORE the tap, not discovered after it. */
      const coverage = c.status === 'internal'
        ? 'internal testing'
        : `${cityPicks ? `${cityPicks} tonight` : 'nothing tonight'} · ${cityPlaces} places`;
      const on = c.id === window.WA.CITY;
      return `<button class="wa-sheet__parked" type="button" data-city="${esc(c.id)}"
                style="margin-top:var(--s-2);${on ? 'border-color:var(--petrol);background:var(--petrol-tint)' : ''}">
        <img src="${esc(c.thumb)}" alt="" width="40" height="27" style="border-radius:6px;object-fit:cover" />
        <span class="wa-sheet__parked-label">${esc(c.label.charAt(0) + c.label.slice(1).toLowerCase())}</span>
        <span class="wa-sheet__parked-value">${esc(coverage)}</span>
      </button>`;
    }).join('');

    return `<div class="wa-field">
        <span class="wa-field__label">Live cities</span>
        ${rows}
      </div>
      ${parkedRow('when', 'When', WHEN_LABEL[state.when] || 'Anytime')}
      ${parkedRow('what', 'What', state.what === 'all' ? 'Anything' : state.what)}`;
  };

  const whenBody = () => {
    const esc = UI().esc;
    const opts = ['tonight', 'tomorrow', 'weekend', 'thisweek', 'all'];
    const counts = (v) => picks().filter(e => window.WA.when.matches(e, v)).length;
    return `<div class="wa-field">
        <span class="wa-field__label">When</span>
        <div class="wa-chips">
          ${opts.map(v => `<button class="wa-chip" type="button" data-when="${esc(v)}"
             aria-pressed="${state.when === v}" data-count="${counts(v)}">${esc(WHEN_LABEL[v])}
             <span class="wa-chip__count">${counts(v)}</span></button>`).join('')}
        </div>
      </div>
      ${parkedRow('where', 'Where', CITY_LABEL())}
      ${parkedRow('what', 'What', state.what === 'all' ? 'Anything' : state.what)}`;
  };

  const whatBody = () => {
    const esc = UI().esc;
    const kinds = [...new Set(picks().map(e => String(e.kind || '').toLowerCase()).filter(Boolean))].sort();
    const countOf = (k) => picks().filter(e => String(e.kind || '').toLowerCase() === k).length;
    return `<div class="wa-field">
        <span class="wa-field__label">What</span>
        <div class="wa-chips">
          <button class="wa-chip" type="button" data-what="all" aria-pressed="${state.what === 'all'}">Anything</button>
          ${kinds.map(k => `<button class="wa-chip" type="button" data-what="${esc(k)}"
             aria-pressed="${state.what === k}" data-count="${countOf(k)}">${esc(k)}
             <span class="wa-chip__count">${countOf(k)}</span></button>`).join('')}
        </div>
      </div>
      ${parkedRow('where', 'Where', CITY_LABEL())}
      ${parkedRow('when', 'When', WHEN_LABEL[state.when] || 'Anytime')}`;
  };

  const SHEETS = {
    where: { title: 'Where?', body: whereBody },
    when:  { title: 'When?',  body: whenBody  },
    what:  { title: 'What?',  body: whatBody  },
  };

  /* The key says the outcome, not the verb — you know the size of the
     result before you commit to it. */
  const footFor = () => {
    const n = picks().filter(e => window.WA.when.matches(e, state.when))
      .filter(e => state.what === 'all' || String(e.kind || '').toLowerCase() === state.what).length;
    const noun = state.what === 'all' ? (n === 1 ? 'thing' : 'things') : (n === 1 ? state.what : `${state.what}s`);
    return `<button class="wa-btn wa-btn--quiet" type="button" id="sheet-clear">Clear all</button>
            <button class="wa-btn wa-btn--primary" type="button" id="sheet-apply" style="flex:1">Show ${n} ${UI().esc(noun)}</button>`;
  };

  /* Held in a variable, NOT as data-slot on the <dialog>. The capsule
     keys are [data-slot], the sheet contains the chips, and an attribute
     of the same name on the dialog made every click inside the sheet
     match the "open this slot" branch first and return early — the
     chips looked dead while quietly reopening the sheet. */
  let openSlot = '';

  const openSheet = (slot) => {
    const s = SHEETS[slot];
    if (!s) return;
    openSlot = slot;
    $('sheet-title').textContent = s.title;
    $('sheet-body').innerHTML = s.body();
    $('sheet-foot').innerHTML = footFor();
    if (!sheet.open) sheet.showModal();
  };

  const closeSheet = () => { if (sheet.open) sheet.close(); };

  /* ── Events ──────────────────────────────────────────────────
     One delegated listener. The sheet re-renders in place when a value
     changes, so its own parked rows and its key stay true. */
  document.addEventListener('click', (e) => {
    const t = e.target;

    const slot = t.closest && t.closest('[data-slot]');
    if (slot) { openSheet(slot.dataset.slot); return; }

    const go = t.closest && t.closest('#cap-go');
    if (go) { openSheet('where'); return; }

    const reopen = t.closest && t.closest('[data-open-slot]');
    if (reopen) { openSheet(reopen.dataset.openSlot); return; }

    if (t.closest && t.closest('#sheet-close')) { closeSheet(); return; }

    const cityBtn = t.closest && t.closest('[data-city]');
    if (cityBtn) { window.WA.setCity(cityBtn.dataset.city); return; }

    const whenBtn = t.closest && t.closest('[data-when]');
    if (whenBtn) { state.when = whenBtn.dataset.when; openSheet(openSlot); render(); return; }

    const whatBtn = t.closest && t.closest('[data-what]');
    if (whatBtn) { state.what = whatBtn.dataset.what; openSheet(openSlot); render(); return; }

    if (t.closest && t.closest('#sheet-apply')) { closeSheet(); return; }
    if (t.closest && t.closest('#sheet-clear')) {
      state.when = 'tonight'; state.what = 'all';
      openSheet(openSlot); render(); return;
    }

    const scopeBtn = t.closest && t.closest('[data-scope]');
    if (scopeBtn) {
      state.scope = scopeBtn.dataset.scope;
      document.querySelectorAll('#scope [data-scope]').forEach(b =>
        b.setAttribute('aria-selected', String(b.dataset.scope === state.scope)));
      render();
      return;
    }

    /* Save is a button inside the card link — stop the navigation. */
    const save = t.closest && t.closest('[data-save]');
    if (save) {
      e.preventDefault();
      e.stopPropagation();
      const id = save.dataset.save;
      const on = save.getAttribute('aria-pressed') === 'true';
      if (window.WA.Bookmarks) window.WA.Bookmarks.set(id, !on);
      save.setAttribute('aria-pressed', String(!on));
    }
  });

  sheet && sheet.addEventListener('close', () => { openSlot = ''; });

  /* ── Saturday email ──────────────────────────────────────────
     Anonymous opt-in; the account is attached only when there is one. */
  const form = $('digest-form');
  if (form) {
    form.addEventListener('submit', async () => {
      const input = $('digest-email');
      const note  = $('digest-note');
      const email = (input.value || '').trim();
      if (!email) return;
      const base = window.WA.BASE_URL, key = window.WA.ANON_KEY;
      if (!base || !key) return;
      try {
        const res = await fetch(`${base}/rest/v1/digest_opt_ins`, {
          method:  'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`,
                     'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            email, city: window.WA.CITY,
            ...(window.WA.Auth && window.WA.Auth.session && window.WA.Auth.session.user_id
              ? { user_id: window.WA.Auth.session.user_id } : {}),
          }),
        });
        note.textContent = res.ok
          ? 'Done. First one lands on Saturday morning.'
          : 'That did not go through. Try again in a minute.';
        if (res.ok) input.value = '';
      } catch (_) {
        note.textContent = 'That did not go through. Try again in a minute.';
      }
    });
  }

  /* ── Boot ────────────────────────────────────────────────────
     Skeleton immediately, real sections when the catalog lands, and a
     re-render when geolocation resolves so distances fill in without
     shifting the layout. */
  $('sections').innerHTML = skeleton();
  document.addEventListener('wa:catalog-ready', () => {
    render();
    window.WA.Geo.userLoc();
  });
  document.addEventListener('wa:location-ready', render);

  /* catalog.js ships a static snapshot, so if the live fetch already
     resolved before this script ran there is still something to draw. */
  if (window.WA && window.WA.catalog && window.WA.catalog.length) render();
})();
