/* ============================================================
   WanderAlt — Briefing page renderer
   ------------------------------------------------------------
   Reads window.WA.catalog (catalog.js) to build the Tonight
   hero and This Week pick list, then wires bookmark state via
   window.WA.Bookmarks (bookmark.js).

   Load order in index.html:
     catalog.js → bookmark.js → briefing.js   (all defer)
   ============================================================ */
(() => {
  /* Legacy mood deep-links: mood chips used to live on this page and
     wrote a #mood= hash. They moved to Discover, so forward any old
     bookmark (index.html#mood=loud,solo) there before we render. */
  const moodHash = window.location.hash.match(/[#&]mood=([^&]+)/);
  if (moodHash) {
    window.location.replace('./discover.html#mood=' + moodHash[1]);
    return;
  }

  /* ── Taste-profile onboarding (3 questions, inline banner) ── */
  const initTasteOnboarding = () => {
    const taste = window.WA?.taste;
    const wrap  = document.getElementById('taste-onboarding');
    if (!taste || !wrap) return;

    const reflect = () => {
      const prefs = taste.getPrefs();
      wrap.querySelectorAll('.taste-chip').forEach(b => {
        const on = prefs[b.dataset.axis] === b.dataset.choice;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.toggle('taste-chip--on', on);
      });
      const done  = document.getElementById('taste-done');
      const reset = document.getElementById('taste-reset');
      const allAnswered = ['energy', 'company', 'money'].every(a => prefs[a]);
      if (done)  done.hidden  = !allAnswered;
      /* Show Reset when at least one pref is set. */
      if (reset) reset.hidden = !Object.keys(prefs).length;
    };

    wrap.addEventListener('click', (e) => {
      const chip = e.target.closest('.taste-chip');
      if (chip) {
        const { axis, choice } = chip.dataset;
        /* Tapping the already-active choice deselects it (back to "no
           preference" for that axis) instead of being permanently stuck. */
        if (taste.getPrefs()[axis] === choice) taste.unsetPref(axis);
        else taste.setPrefs({ [axis]: choice });
        reflect();
        return;
      }
      const act = e.target.closest('button');
      if (!act) return;
      if (act.id === 'taste-skip' || act.id === 'taste-done') {
        taste.setOnboarded();
        wrap.hidden = true;
        return;
      }
      if (act.id === 'taste-reset') {
        taste.resetOnboarding();
        taste.clearAllFeedback();
        reflect();
      }
    });

    /* Show if not yet onboarded; after onboarding it hides on Skip/Done. */
    if (!taste.isOnboarded()) {
      wrap.hidden = false;
      reflect();
    }

    /* Deep link: Discover/Saved's "tuned to you" cue points here so an
       already-onboarded reader can adjust their taste. Drop the pre-paint
       hide class (set by taste-flag.js), reveal, and scroll into view. */
    const openFromHash = () => {
      if (location.hash !== '#taste-onboarding') return;
      document.documentElement.classList.remove('wa-taste-done');
      wrap.hidden = false;
      reflect();
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
  };

  /* ── Template helpers ──────────────────────────────────── */

  /* Returns a .thumb span — uses real image when entry.imageUrl is set,
     otherwise falls back to the halftone placeholder + initials badge.  */
  /* Shared render helpers — single implementation in ui-helpers.js (P1). */
  const { bookmarkSVG } = window.WA.UI;
  const thumbEl = window.WA.UI.thumb;


  /* ── Tonight set (Jul 2026: hero + horizontal rail) ──
     Was a single hero pick; most cities carry zero rows with tonight=true
     (rotate-tonight's cron is frozen), so the old code silently fell back
     to catalog[0] — an arbitrary first-in-array item, not a curated
     choice. selectTonightSet() (see init()) picks up to 3 candidates
     spanning different `kind`s, priority order (explicit tonight=true
     first) — entries[0] is the flagship.

     Three equal full-width cards stacked vertically cost ~3 screens of
     mobile scroll and gave the eye no way to tell "flagship" from "#3 of
     3." Summer 2026 mobile convention for one-primary-plus-peers content
     (Airbnb Explore, Apple News, Spotify Home) is a hero + a horizontally
     scrollable rail for the rest — fixed height regardless of rail count,
     and the size difference itself IS the hierarchy signal. Photo/glyph-
     led throughout: every card leads with the shared thumb (real photo or
     the kind-based glyph placeholder); the curator quote is a caption
     (.list-row__quote, shared with This Week/Discover/Saved) under the
     hero's title, not the dominant element — rail cards drop the quote
     entirely (title + time/venue is enough for a peer-item glance; the
     full quote+CTA treatment is what makes the hero the hero). */
  /* Dusk Glass (Jul 2026): the hero is the scene — tonight's
     photo fills the viewport, the voice floats over it. entries[0] is the
     flagship; the rest of the tonight set joins the This Week ticket rail
     (renderWeekPage prepends them) instead of a separate card rail. */

  /* Paint the scene background: the hero photo when it exists, else keep
     the dusk-gradient fallback (never a gray box). A probe img
     downgrades to the gradient when a stale photo URL 403s. */
  const paintScene = (entry) => {
    const bg = document.getElementById('scene-bg');
    if (!bg) return;
    if (!entry || !entry.imageUrl) {
      bg.style.backgroundImage = '';
      bg.classList.add('scene__bg--fallback');
      return;
    }
    const url = window.WA.img(entry.imageUrl, 1080).replace(/'/g, '%27');
    bg.style.backgroundImage = `url('${url}')`;
    bg.classList.remove('scene__bg--fallback');
    const probe = new Image();
    probe.addEventListener('error', () => {
      bg.style.backgroundImage = '';
      bg.classList.add('scene__bg--fallback');
    });
    probe.src = url;
  };

  /* "FRI 10 JUL" — the scene ticker's date piece. */
  const tickerDate = () => new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).replace(',', '').toUpperCase();

  const renderTonight = (entries) => {
    const section = document.getElementById('tonight');
    if (!section || !entries || !entries.length) return;
    section.removeAttribute('aria-busy');   /* hydration done — drop the loading flag */

    const esc = window.WA.UI.esc;
    const hero = entries[0];
    paintScene(hero);

    const glassTag = [esc(hero.kind), esc(hero.neighborhood && hero.neighborhood.toLowerCase() !== 'other' ? hero.neighborhood : hero.venue)]
      .filter(Boolean).join(' &middot; ');
    const ticker = `${tickerDate()} &middot; PICK 1 OF ${Math.max(_tickerTotal, 1)}` +
      (navigator.onLine === false ? ' &middot; OFFLINE' : '');
    const attr = ['&mdash; ' +
      `<a class="handle" href="curator.html?handle=${encodeURIComponent(hero.handle)}">${esc(hero.handle)}</a>`,
      esc(hero.venue), hero.time ? `doors ${esc(hero.time)}` : null,
    ].filter(Boolean).join(' &middot; ');
    const quote = hero.quote
      ? `<blockquote class="scene-quote"><p>${esc(hero.quote)}</p></blockquote>`
      : '';

    /* Desktop right card: THE VENUE (from the venues seed,
       matched by name — same rule as venue.js) + FROM THE DESK (the
       curator's own motto from the curators table; the true COLUMN
       block returns when draft-column wakes). Hidden < 1100 via CSS. */
    const venuesAll = (window.WA && (window.WA._venuesAll || window.WA.venues)) || [];
    const vKey = (hero.venue || '').trim().toLowerCase();
    const matchedVenue = vKey
      ? venuesAll.find(v => (v.name || '').trim().toLowerCase() === vKey) : null;
    const curator = ((window.WA && window.WA.curators) || [])
      .find(c => c.handle === hero.handle);
    const venueMetaLine = matchedVenue
      ? [matchedVenue.neighborhood, matchedVenue.kind].filter(Boolean).join(' &middot; ')
      : '';
    const aside = (matchedVenue || (curator && curator.tagline)) ? `
       <aside class="scene-aside island" aria-label="Venue and curator">
         ${matchedVenue ? `
         <p class="scene-aside__label">The venue</p>
         <p class="scene-aside__name">${esc(matchedVenue.name)}</p>
         <p class="scene-aside__meta one-line">${venueMetaLine}${venueMetaLine ? ' &middot; ' : ''}<a href="place.html?id=${encodeURIComponent(matchedVenue.id)}">venue &nearr;</a></p>` : ''}
         ${matchedVenue && curator && curator.tagline ? '<hr class="scene-aside__rule">' : ''}
         ${curator && curator.tagline ? `
         <p class="scene-aside__label">From the desk</p>
         <blockquote class="scene-aside__motto"><p>${esc(curator.tagline)}</p></blockquote>
         <a class="scene-aside__go" href="curator.html?handle=${encodeURIComponent(hero.handle)}">Read &rarr;</a>` : ''}
       </aside>` : '';

    section.innerHTML =
      `<h2 class="visually-hidden" id="tonight-label">Tonight</h2>
       <div class="scene-tags">
         ${(() => {   /* lime is the TONIGHT signal only — other days ride glass */
           const isTonight = hero.tonight || hero.day === ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()];
           const label = (isTonight ? 'Tonight' : (hero.day ? esc(hero.day) : 'This week')) + (hero.time ? ` &middot; ${esc(hero.time)}` : '');
           return `<span class="tag ${isTonight ? 'tag--live' : 'tag--scene'}">${label}</span>`;
         })()}
         ${glassTag ? `<span class="tag tag--scene one-line">${glassTag}</span>` : ''}
       </div>
       <p class="scene-ticker one-line">${ticker}</p>
       <a class="scene-title" href="venue.html?id=${hero.id}">${esc(hero.title)}</a>
       ${quote}
       <p class="scene-attr one-line">${attr}</p>
       <div class="scene-actions wa-row">
         <a class="scene-cta" href="venue.html?id=${hero.id}">I&rsquo;m going &rarr;</a>
         <label class="bookmark scene-key" title="Save this pick">
           <input type="checkbox" class="bookmark__check" data-id="${hero.id}" aria-label="Save: ${esc(hero.title)}">
           ${bookmarkSVG()}
         </label>
         <button class="scene-key scene-share" type="button" aria-label="Share this pick" title="Share"
                 data-share-title="${esc(hero.title)}" data-share-text="${esc(hero.title)} &mdash; ${esc(hero.venue)}"
                 data-share-url="venue.html?id=${hero.id}">
           <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 7.5L12 3.5l4 4"/><path d="M5 12v8h14v-8"/></svg>
         </button>
       </div>
       ${aside}`;
    /* Surprise-me was demoted out of the hero action row (July 2026 board
       1b) — it lives in the This Week header now. Un-hide it here in case
       an empty-city render hid it earlier in this session. */
    const surpriseBtn = document.getElementById('surprise-btn');
    if (surpriseBtn) surpriseBtn.hidden = false;
    /* Re-apply saved state to the freshly-rendered checkboxes (surprise-me
       re-renders the set, so this can't rely on the one-shot init pass). */
    if (window.WA?.Bookmarks) {
      const saved = window.WA.Bookmarks.get();
      section.querySelectorAll('.bookmark__check').forEach(cb => {
        if (saved[cb.dataset.id]) cb.checked = true;
      });
    }
  };

  /* Cities served by WanderAlt's in-house editorial desk rather than a
     resident human curator. Their picks are surfaced from public listings
     (the city's source feeds) and filtered by hand; the cards keep their
     per-feed attribution, and this umbrella note states the arrangement
     plainly so the "curated by humans" promise isn't quietly overstated.
     Drop a city from this set the moment a resident curator takes over. */
  const HOUSE_DESK_CITIES = new Set(['vilnius']);

  /* Honest umbrella note under the standfirst, shown only for house-desk
     cities. Names the desk as in-house, names the feeds, says there is no
     resident curator yet, and invites one. Idempotent: re-running init
     (taste re-render) won't duplicate it. */
  const renderEditorialDeskNote = () => {
    const cityId = window.WA?.CITY || 'tallinn';
    const standfirst = document.querySelector('.page-head');
    const existing = document.getElementById('desk-note');
    if (!HOUSE_DESK_CITIES.has(cityId) || !standfirst) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const cityLabel = cityId.charAt(0).toUpperCase() + cityId.slice(1);
    const note = document.createElement('p');
    note.className = 'desk-note';
    note.id = 'desk-note';
    note.innerHTML =
      `${cityLabel} runs on WanderAlt&rsquo;s in-house editorial desk &mdash; ` +
      `picks drawn from public listings and filtered by hand, while we look ` +
      `for a resident curator. Know the scene? ` +
      `<a href="./about.html#about-contact">Get in touch &rarr;</a>`;
    standfirst.insertAdjacentElement('afterend', note);
  };

  /* Empty Tonight hero — shown when the active city has no picks yet (e.g.
     a newly-unlocked city without a curator). Replaces the skeleton so the
     page never reads as a perpetual loading state. */
  /* Empty Tonight: fall back to the week's first pick with a
     THIS WEEK tag; only a city with no picks at all gets the curator-voice
     quiet-night line over the dusk gradient — never a loading state. */
  const renderTonightEmpty = () => {
    const section = document.getElementById('tonight');
    if (!section) return;
    section.removeAttribute('aria-busy');
    paintScene(null);
    const cityId    = window.WA?.CITY || 'tallinn';
    const cityLabel = cityId.charAt(0).toUpperCase() + cityId.slice(1);
    section.innerHTML =
      `<h2 class="visually-hidden" id="tonight-label">Tonight</h2>
       <div class="scene-tags"><span class="tag tag--live">Tonight</span></div>
       <p class="scene-empty">Quiet night. The city is resting.</p>
       <p class="scene-attr">No pick for tonight in ${cityLabel} yet &mdash; <a href="./discover.html?type=places">browse places &rarr;</a></p>`;
    /* No catalog to surprise from — hide the This Week header shuffle. */
    const surpriseBtn = document.getElementById('surprise-btn');
    if (surpriseBtn) surpriseBtn.hidden = true;
  };

  /* ── This Week list ────────────────────────────────────── */
  /* The home page is a curated weekly, not a search result page.
     Choice-overload research (Iyengar; Baymard list benchmarks) says a
     curated list should stay in single digits — so we cap This Week at
     PAGE_SIZE and hand the long tail to Discover via a single "Browse
     all this week →" bridge link. No on-home pagination, no filtering:
     retrieval lives on Discover, curation lives here. */
  const PAGE_SIZE = 8;
  let _weekFullSet  = [];     /* full ordered list for the active city */
  let _weekShown    = PAGE_SIZE;
  let _weekIsFiltered = false;
  let _weekTotalAll = 0;      /* full week count, for the "N of M" label */
  let _weekIsFallback = false; /* true = nothing dated/flagged this week; the
                                  section shows latest picks and SAYS so —
                                  never fabricate "This week" (design-critique
                                  must-fix #1, Jul 2026). */

  /* total = unfiltered count, used only when isFiltered=true to show "N of M". */
  const renderThisWeek = (entries, total = entries.length, isFiltered = false) => {
    _weekFullSet    = entries;
    _weekTotalAll   = total;
    _weekIsFiltered = isFiltered;
    _weekShown      = Math.min(PAGE_SIZE, entries.length);
    renderWeekPage();
  };

  const renderWeekPage = () => {
    const list = document.querySelector('.picks');
    const sub  = document.querySelector('.section-sub');
    if (!list) return;
    /* Hydration done — drop the loading attribute that the skeleton
       placeholders sit under. The next innerHTML write replaces them. */
    if (list.hasAttribute('aria-busy')) list.removeAttribute('aria-busy');
    /* Gentle, on-device taste bias (B-5): re-order This Week by the taste
       score (+1 per matching mood_tag, ± explicit feedback) so the most-
       aligned curated picks surface first. Stable sort keeps curation /
       recency order for ties; with no taste set every score is 0, so
       nothing reorders. Curation stays primary — this only nudges, and it
       never leaves the device (taste lives in localStorage). */
    const ts = window.WA?.taste?.tasteScore;
    const tasteOrdered = ts ? [..._weekFullSet].sort((a, b) => ts(b) - ts(a)) : _weekFullSet;
    /* Day-group as the PRIMARY order — catalog order is NOT chronological,
       so without this the day labels below repeat (Fri·Sat·Sun·Sat·Wed·Fri,
       caught by the July 2026 visual audit). The week wheel is ROTATED to
       read forward from today: a Thursday reader sees Fri before next Mon
       (today's own picks live in Tonight, so today's day name means "later
       this week"). Stable sort: the taste nudge above survives within each
       day. */
    const rank = window.WA.UI.DAY_RANK;
    const todayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
    const todayRank = rank[todayName] || 1;
    const rot = (d) => d === 'Tonight' ? 0 : ((rank[d] - todayRank + 7) % 7) + 1;
    const ordered = tasteOrdered
      .map((e, i) => ({ e, i, r: e.day in rank ? rot(e.day) : 99 }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map(x => x.e);
    const entries = ordered.slice(0, _weekShown);

    /* Honest heading: when the never-blank fallback is active there is
       nothing actually dated this week — say "Latest picks", don't claim
       "This week". Reset on every render (city switch re-renders). */
    const headEl = document.getElementById('thisweek-label');
    if (headEl) headEl.textContent = _weekIsFallback ? 'Latest picks' : 'This week';

    /* Empty state — a graceful card with the active city's plate
       instead of a stark empty list. Hits any time This Week resolves
       to zero picks (typical for thinner cities like Helsinki / Riga,
       or for any mood-filter combo that returns nothing).            */
    let emptyCard = document.getElementById('picks-empty');
    if (_weekFullSet.length === 0) {
      list.innerHTML = '';
      const cityId    = window.WA?.CITY || 'tallinn';
      const cityLabel = cityId.charAt(0).toUpperCase() + cityId.slice(1);
      const reason = _weekIsFiltered
        ? 'Nothing matches; loosen a filter.'
        : `No picks this week in ${cityLabel} yet — curators are warming up.`;
      if (!emptyCard) {
        emptyCard = document.createElement('div');
        emptyCard.id = 'picks-empty';
        emptyCard.className = 'picks-empty picks-empty--compact';
        list.parentNode.insertBefore(emptyCard, list.nextSibling);
      }
      emptyCard.innerHTML =
        /* No city-overview plate (owner direction, Jul 2026) — compact
           curator-voice state; the city art lives on About + selector. */
        `<div class="picks-empty__body">` +
        `  <p class="picks-empty__title">${reason}</p>` +
        `  <p class="picks-empty__sub"><a href="./discover.html">Browse Discover &rarr;</a></p>` +
        `</div>`;
      if (sub) sub.textContent = '';
      return;
    }
    if (emptyCard) emptyCard.remove();

    /* Board 3b: the section header's right side is the bridge into
       Discover — "ALL 12 →" (mono, quiet). Replaces the old counts line
       + below-list footer; taste still orders the rail silently. */
    if (sub) {
      const total = Math.max(_weekTotalAll, _weekFullSet.length) + _tonightExtras.length;
      /* Honesty guard (critique #1): on the never-blank fallback the rail
         shows LATEST picks, none dated this week — the bridge must not
         deep-link into a 0-result ?time=thisweek Discover. */
      const bridge = _weekIsFallback ? './discover.html' : './discover.html?time=thisweek';
      sub.innerHTML =
        `<a class="week-all" href="${bridge}">ALL ${total} &rarr;</a>`;
    }

    /* Dusk Glass tickets: one snap-scroll rail of 64px glass
       tickets — day cell · title · one-line mono meta. The rest of the
       tonight set rides in front with a lime TONIGHT cell (lime = live
       signal only). Single-line by construction, everything ellipsizes. */
    const esc = window.WA.UI.esc;
    const ticket = (e, live = false) => {
      const meta = [
        e.neighborhood && e.neighborhood.toLowerCase() !== 'other' ? e.neighborhood : e.venue,
        e.kind, e.time,
      ].filter(Boolean).join(' · ');
      const day = live ? 'TONIGHT'
        : (e.day ? e.day.slice(0, 3) : (e.kind || '·').slice(0, 4)).toUpperCase();
      return `<li class="ticket">
         <a class="ticket__link" href="venue.html?id=${e.id}">
           <span class="ticket__day${live ? ' ticket__day--live' : ''}">${esc(day)}</span>
           <span class="ticket__body">
             <span class="ticket__title one-line">${esc(e.title)}</span>
             <span class="ticket__meta one-line">${esc(meta)}</span>
           </span>
         </a>
       </li>`;
    };
    list.innerHTML =
      _tonightExtras.map(e => ticket(e, true)).join('') +
      entries.map(e => ticket(e)).join('');
  };

  /* ── Bookmark wiring ───────────────────────────────────── */
  const restoreBookmarks = () => {
    const store = window.WA.Bookmarks.get();
    document.querySelectorAll('.bookmark__check').forEach(cb => {
      if (store[cb.dataset.id]) cb.checked = true;
    });
  };

  const wireBookmarks = () => {
    document.addEventListener('change', e => {
      const cb = e.target.closest('.bookmark__check');
      if (!cb) return;
      window.WA.Bookmarks.set(cb.dataset.id, cb.checked);
    });
  };

  /* ── Surprise me ───────────────────────────────────────────── */
  let _surpriseExcludeIds = new Set();
  let _surpriseCatalog   = [];
  /* init() runs twice on a normal load (static catalog immediately, then
     again on wa:catalog-ready once live data lands). Re-rendering twice is
     fine; re-BINDING listeners twice is not — a double-bound taste-chip
     handler toggles a pref on and straight back off, and bookmark/digest
     handlers fire duplicate writes. So all listener wiring below is gated
     on _initBound (same pattern as discover.js). */
  let _initBound = false;
  let _weekSrc   = [];
  /* Tonight candidates beyond the flagship — they open the This Week rail
     as lime-cell TONIGHT tickets (renderWeekPage). */
  let _tonightExtras = [];
  /* "PICK 1 OF N" — N is the same set the rail + ALL link count. */
  let _tickerTotal = 1;

  /* Surprise lives in the This Week section header (static markup in
     index.html). The click is handled by ONE delegated
     listener (bound once) so it keeps working across hero re-renders. */
  const wireSurprise = (catalog) => {
    _surpriseCatalog = catalog;
    if (wireSurprise._bound) return;
    wireSurprise._bound = true;

    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('#surprise-btn')) return;
      const pool = _surpriseCatalog.filter(e => !_surpriseExcludeIds.has(e.id));
      if (!pool.length) return;

      const pick = pool[Math.floor(Math.random() * pool.length)];
      _surpriseExcludeIds = new Set([pick.id]);

      const section = document.getElementById('tonight');
      if (!section) return;

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        renderTonight([pick]);
      } else {
        section.style.transition = 'opacity 160ms ease';
        section.style.opacity    = '0';
        setTimeout(() => {
          renderTonight([pick]);
          section.style.opacity = '1';
          setTimeout(() => {
            section.style.removeProperty('opacity');
            section.style.removeProperty('transition');
          }, 180);
        }, 160);
      }
    });
  };

  /* ── Tonight selection (July 2026) ────────────────────────
     Up to 3 candidates spanning different `kind`s. Prefers rows the
     backend explicitly flagged tonight=true; falls back to This Week
     items scheduled for today's weekday when a city has none (true for
     3 of 4 cities right now — rotate-tonight's cron is frozen), so
     Tonight is never just catalog[0]'s arbitrary first
     row. */
  const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const selectTonightSet = (catalog, max = 3) => {
    /* Explicit tonight=true rows come first (a genuine curator flag), then
       today-scheduled This Week items pad out the rest — so a city with
       exactly one explicit flag still gets a diversified set instead of
       an oddly-sparse single card, while curator flags still lead. */
    const explicit  = catalog.filter(e => e.tonight);
    /* Shared Baltic-clock weekday (when.js) so Tonight membership agrees
       with the stamped flags; local-clock fallback for safety. */
    const today     = window.WA?.when?.todayAbbrev() || WEEKDAY_ABBR[new Date().getDay()];
    const scheduled = catalog.filter(e => e.thisWeek && e.day === today && !e.tonight);
    const pool = [...explicit, ...scheduled];

    const out = [];
    const seenKinds = new Set();
    for (const e of pool) {
      if (out.length >= max) break;
      if (seenKinds.has(e.kind)) continue;
      seenKinds.add(e.kind);
      out.push(e);
    }
    for (const e of pool) {
      if (out.length >= max) break;
      if (!out.includes(e)) out.push(e);
    }
    return out;
  };

  /* ── Worth a visit (July 2026) ─────────────────────────────
     A short strip of evergreen venues/places (day === null — the same
     signal Discover's Places scope uses) below the dated This Week
     picks, so Today surfaces underground spots worth knowing about, not
     only scheduled events. Small on purpose (PAGE_SIZE-style restraint,
     see renderThisWeek) — a pointer into Discover, not a second feed. */
  const WORTH_A_VISIT_MAX = 3;
  const selectWorthAVisit = (catalog, excludeIds, max = WORTH_A_VISIT_MAX) => {
    const venues = catalog.filter(e => e.day === null && !excludeIds.has(e.id));
    /* Photo-bearing venues first (reads better in the card row), then the rest. */
    const withPhoto = venues.filter(e => e.imageUrl);
    const withoutPhoto = venues.filter(e => !e.imageUrl);
    return [...withPhoto, ...withoutPhoto].slice(0, max);
  };

  const renderWorthAVisit = (entries) => {
    const section = document.getElementById('worth-a-visit');
    const list    = document.getElementById('worth-a-visit-list');
    if (!section || !list) return;
    if (!entries.length) { section.hidden = true; return; }
    section.hidden = false;

    const esc = window.WA.UI.esc;
    const { rowMedia, buildMeta, bookmarkSVG: bmSVG } = window.WA.UI;
    const saved = window.WA?.Bookmarks?.get() || {};
    list.innerHTML = entries.map(e => `
      <li class="list-row list-row--card list-row--bookmarkable" data-id="${esc(e.id)}">
        ${rowMedia(e)}
        <div class="list-row__body">
          <p class="list-row__title"><a href="venue.html?id=${esc(e.id)}">${esc(e.title)}</a></p>
          <p class="list-row__meta">${esc(buildMeta(e))}</p>
        </div>
        <label class="bookmark">
          <input type="checkbox" class="bookmark__check" data-id="${esc(e.id)}"
                 aria-label="Bookmark: ${esc(e.title)}" ${saved[e.id] ? 'checked' : ''}>
          ${bmSVG()}
        </label>
      </li>`).join('');
  };

  /* ── Init ──────────────────────────────────────────────── */
  const init = () => {
    const catalog   = (window.WA && window.WA.catalog) || [];

    const tonightSet = selectTonightSet(catalog);
    const tonightIds = new Set(tonightSet.map(e => e.id));
    const worthAVisit = selectWorthAVisit(catalog, tonightIds);
    const excludeFromWeek = new Set([...tonightIds, ...worthAVisit.map(e => e.id)]);

    /* If nothing is flagged thisWeek (e.g. all auto-generated picks have
       the flags unset), fall back to the most-recent entries so the page
       is never blank after a fresh DB import. Tonight/Worth-a-visit picks
       are excluded so the same pick doesn't repeat twice on one page. */
    const allWeek   = catalog.filter(e => e.thisWeek && !excludeFromWeek.has(e.id));
    const fallback  = allWeek.length === 0;
    const weekSrc   = fallback
      ? catalog.filter(e => !excludeFromWeek.has(e.id)).slice(0, 8)
      : allWeek;

    /* Apply taste re-ordering before slicing to 8: items aligned with the
       user's onboarding answers bubble to the top. Falls back to original
       order when there's no taste profile. Shared impl in taste.js. */
    const orderByTaste = (entries) =>
      window.WA?.taste ? window.WA.taste.orderByTaste(entries) : entries;
    const orderedWeek = orderByTaste(weekSrc);
    /* Kept at module scope so the bind-once wa:taste-changed listener
       below re-renders the CURRENT week source, not the one from the
       first (possibly static-catalog) init run. */
    _weekSrc = weekSrc;
    _weekIsFallback = fallback;

    /* Track the current tonight picks so Surprise me excludes them. */
    _surpriseExcludeIds = tonightIds;

    renderEditorialDeskNote();
    const sfMeta = document.getElementById('standfirst-meta');
    if (sfMeta) sfMeta.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    _tonightExtras = tonightSet.slice(1);
    _tickerTotal = weekSrc.length + tonightSet.length;
    /* Board 4f: with no tonight candidates the hero falls back to the
       week's first pick (tag shows its day, not TONIGHT — and the rail
       drops it so the same pick doesn't sit in both); only a city with
       nothing at all gets the quiet-night line. */
    let weekForRail = orderedWeek;
    if (tonightSet.length) {
      renderTonight(tonightSet);
    } else if (orderedWeek.length) {
      renderTonight([orderedWeek[0]]);
      weekForRail = orderedWeek.slice(1);
      _weekSrc = weekForRail;
    } else {
      renderTonightEmpty();
    }
    renderWorthAVisit(worthAVisit);
    /* Pass the full ordered set — renderThisWeek paginates internally. */
    renderThisWeek(weekForRail);
    restoreBookmarks();
    /* Surprise me lives in the This Week header; renderTonight /
       renderTonightEmpty toggle its visibility for empty cities. */
    wireSurprise(catalog);
    /* Calendar-feed link (This Week header) — point at the active city.
       Static markup defaults to tallinn for the no-JS case. */
    const calLink = document.getElementById('calendar-feed-link');
    if (calLink && window.WA?.BASE_URL) {
      calLink.href = `${window.WA.BASE_URL}/functions/v1/calendar-feed` +
                     `?city=${encodeURIComponent(window.WA.CITY || 'tallinn')}`;
    }

    /* Everything below binds listeners to elements that survive re-init
       (document, the static onboarding/digest markup) — bind once. */
    if (_initBound) return;
    _initBound = true;

    wireBookmarks();
    /* Hero share key — delegated so it survives re-renders.
       Native share sheet with clipboard fallback via WA.Share. */
    document.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('.scene-share');
      if (!btn || !window.WA?.Share) return;
      const r = await window.WA.Share.url({
        title: btn.dataset.shareTitle,
        text:  btn.dataset.shareText,
        url:   new URL(btn.dataset.shareUrl, window.location.href).href,
      });
      if (r === 'copied' || r === 'shared') window.WA.UI.flashDone(btn);
    });
    /* Re-render This Week when the taste profile changes (after onboarding
       or a Profile-page edit). Reads _weekSrc so a taste change after the
       live catalog lands reorders live picks, not the static seed. */
    document.addEventListener('wa:taste-changed', () => {
      const reordered = orderByTaste(_weekSrc);
      renderThisWeek(reordered);
      restoreBookmarks();
    });

    /* First-visit taste check — shows the 3-question banner above the
       Tonight hero. Skips if the user already onboarded. */
    initTasteOnboarding();

    /* Digest opt-in for visitors without an account. */
    const wireDigestOptin = () => {
      const form   = document.getElementById('digest-optin-form');
      const input  = document.getElementById('digest-optin-email');
      const status = document.getElementById('digest-optin-status');
      if (!form || !input || !status) return;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = input.value.trim();
        if (!email) return;

        const url  = window.WA && window.WA.BASE_URL;
        const key  = window.WA && window.WA.ANON_KEY;
        const city = (window.WA && window.WA.CITY) || 'tallinn';
        if (!url || !key) { status.textContent = 'Not available offline.'; return; }

        const btn = document.getElementById('digest-optin-submit');
        if (btn) btn.disabled = true;

        try {
          const res = await fetch(`${url}/rest/v1/digest_opt_ins`, {
            method:  'POST',
            headers: {
              apikey:         key,
              Authorization:  `Bearer ${key}`,
              'Content-Type': 'application/json',
              Prefer:         'return=minimal',
            },
            /* Attach the account when signed in — lets send-digest compose
               the per-recipient "your saved events changed" block (the
               sanctioned no-push channel). Anonymous opt-ins still work. */
            body: JSON.stringify({
              email, city,
              ...(window.WA?.Auth?.session?.user_id
                ? { user_id: window.WA.Auth.session.user_id } : {}),
            }),
          });
          if (res.ok || res.status === 409 /* already subscribed */) {
            status.textContent = 'You\'re on the list.';
            form.hidden = true;
          } else {
            status.textContent = 'Something went wrong — try again.';
            if (btn) btn.disabled = false;
          }
        } catch (_) {
          status.textContent = 'Something went wrong — try again.';
          if (btn) btn.disabled = false;
        }
      });
    };
    wireDigestOptin();

    /* Hide the anonymous digest opt-in when a user is signed in — they use
       the profile page toggle instead. */
    const optinWrap = document.getElementById('digest-optin-wrap');
    if (optinWrap) {
      const syncOptinVisibility = () => {
        optinWrap.hidden = !!(window.WA.Auth && window.WA.Auth.isSignedIn());
      };
      syncOptinVisibility();
      document.addEventListener('wa:signed-in',  syncOptinVisibility);
      document.addEventListener('wa:signed-out', syncOptinVisibility);
    }
  };

  document.addEventListener('wa:catalog-ready',    init);
  /* Fallback: catalog may already be ready (event fired before this listener). */
  if (window.WA?.catalog?.length) init();
  /* After cloud sync, re-check bookmark state without full re-render. */
  document.addEventListener('wa:bookmarks-synced', restoreBookmarks);
})();
