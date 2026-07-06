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

  /* Returns a <span class="meta__time"> wrapping the timing portion of a
     meta string, or '' if no time is set. Time only, no day — This Week
     rows sit under a .week-daylabel group header now, so repeating the
     day inline on every row would be redundant. */
  const timeSpan = (entry) =>
    entry.time ? `<span class="meta__time"> &middot; ${entry.time}</span>` : '';

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
  const renderTonight = (entries) => {
    const section = document.getElementById('tonight');
    if (!section || !entries || !entries.length) return;
    section.removeAttribute('aria-busy');   /* hydration done — drop the loading flag */
    section.classList.remove('tonight--solo');

    const esc = window.WA.UI.esc;
    const [hero, ...rest] = entries;

    const heroKicker = [hero.time ? `<b>${esc(hero.time)}</b>` : '', esc(hero.venue), esc(hero.kind)]
      .filter(Boolean).join(' &middot; ');
    const heroQuote = hero.quote
      ? `<p class="list-row__quote">&ldquo;${esc(hero.quote)}&rdquo; <a class="handle" href="curator.html?handle=${encodeURIComponent(hero.handle)}">${esc(hero.handle)}</a></p>`
      : `<p class="list-row__quote">via <a class="handle" href="curator.html?handle=${encodeURIComponent(hero.handle)}">${esc(hero.handle)}</a></p>`;
    const heroCard = `<article class="tonight-card tonight-card--hero">
       <div class="tonight-card__signal">
         <span class="tag tag--live">Tonight</span>
         <span class="tonight-card__kicker">${heroKicker}</span>
       </div>
       <div class="tonight-card__body">
         ${thumbEl(hero, true)}
         <div class="tonight-card__text">
           <a href="venue.html?id=${hero.id}" class="tonight-card__title">${esc(hero.title)}</a>
           ${heroQuote}
         </div>
       </div>
       <div class="tonight-card__actions">
         <a class="btn btn--primary" href="venue.html?id=${hero.id}">I&rsquo;m going<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg></a>
         <label class="bookmark tonight-card__save" title="Save this pick">
           <input type="checkbox" class="bookmark__check" data-id="${hero.id}" aria-label="Save: ${esc(hero.title)}">
           ${bookmarkSVG()}
         </label>
       </div>
     </article>`;

    const railCards = rest.map(entry => {
      const meta = [esc(entry.venue), entry.time ? esc(entry.time) : null].filter(Boolean).join(' &middot; ');
      return `<article class="tonight-rail__card">
         <a class="tonight-rail__link" href="venue.html?id=${entry.id}">
           ${thumbEl(entry, true)}
           <span class="tonight-rail__title">${esc(entry.title)}</span>
           <span class="tonight-rail__meta">${meta}</span>
         </a>
         <label class="bookmark tonight-rail__save" title="Save this pick">
           <input type="checkbox" class="bookmark__check" data-id="${entry.id}" aria-label="Save: ${esc(entry.title)}">
           ${bookmarkSVG()}
         </label>
       </article>`;
    }).join('');

    const rail = rest.length
      ? `<div class="tonight-rail" role="list">${railCards}</div>`
      : '';

    section.innerHTML =
      `<h2 class="visually-hidden" id="tonight-label">Tonight</h2>
       <div class="tonight-set">${heroCard}${rail}</div>`;
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
  const renderTonightEmpty = () => {
    const section = document.getElementById('tonight');
    if (!section) return;
    section.removeAttribute('aria-busy');
    /* No photo / hero in the empty state — collapse the 2-col Tonight grid
       to a single column so the tag + note read as one editorial block. */
    section.classList.add('tonight--solo');
    const cityId    = window.WA?.CITY || 'tallinn';
    const cityLabel = cityId.charAt(0).toUpperCase() + cityId.slice(1);
    section.innerHTML =
      `<div class="tonight__signal"><span class="tag tag--live">Tonight</span></div>
       <p class="tonight__empty">No pick for tonight in ${cityLabel} yet &mdash; curators are warming up. ` +
       `In the meantime, <a href="./discover.html?type=places">browse places &rarr;</a></p>`;
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
    const ordered = ts ? [..._weekFullSet].sort((a, b) => ts(b) - ts(a)) : _weekFullSet;
    const entries = ordered.slice(0, _weekShown);

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
        ? 'No picks match the active filter.'
        : `No picks this week in ${cityLabel} yet — curators are warming up.`;
      if (!emptyCard) {
        emptyCard = document.createElement('div');
        emptyCard.id = 'picks-empty';
        emptyCard.className = 'picks-empty';
        list.parentNode.insertBefore(emptyCard, list.nextSibling);
      }
      emptyCard.innerHTML =
        `<div class="picks-empty__plate" style="background-image:url('./assets/${cityId}-overview.svg')" aria-hidden="true"></div>` +
        `<div class="picks-empty__body">` +
        `  <p class="picks-empty__title">${reason}</p>` +
        `  <p class="picks-empty__sub"><a href="./discover.html">Browse Discover &rarr;</a></p>` +
        `</div>`;
      if (sub) sub.textContent = '0 picks';
      const footer = document.getElementById('picks-footer');
      if (footer) footer.remove();
      return;
    }
    if (emptyCard) emptyCard.remove();

    const curatorCount = new Set(_weekFullSet.map(e => e.handle)).size;
    if (sub) {
      /* Counter reflects what's CURRENTLY shown vs the total available
         in the active set. "20 of 47 picks · 12 curators".               */
      const filteredHasMore = _weekIsFiltered && _weekTotalAll > _weekFullSet.length;
      const showCount  = entries.length;
      const totalCount = filteredHasMore ? _weekTotalAll : _weekFullSet.length;
      const countLabel = showCount < totalCount
        ? `${showCount} of ${totalCount} picks`
        : `${showCount} picks`;
      /* One subtle, honest cue when a taste profile is active — no per-card
         badges (that would clutter and undercut the human-curation voice). */
      const tasteActive = Object.keys(window.WA?.taste?.getPrefs?.() || {}).length > 0;
      sub.textContent =
        `${countLabel} · ${curatorCount} curator${curatorCount !== 1 ? 's' : ''}` +
        (tasteActive ? ' · tuned to you' : '');
    }

    /* Pick card structure note:
       The whole card is NOT a single <a> any more — that nested the
       handle <a> inside the venue <a>, which browsers eject from the
       DOM. Instead, .pick__link is a <div> grid container, and the
       thumb + title get their own <a>s pointing to venue.html.
       The .handle <a> inside .via is then a sibling, not a descendant. */
    /* F-11 guard: consecutive rows sharing one photo read as a rendering
       bug (legacy "Various venues" picks all carried the same venue shot)
       — drop repeats to the initials tile; the first occurrence keeps it. */
    let prevImg = null;
    const dupImg = new Set();
    for (const e of entries) {
      if (e.imageUrl && e.imageUrl === prevImg) dupImg.add(e.id);
      if (e.imageUrl) prevImg = e.imageUrl;
    }

    /* Day-grouped (Jul 2026): a flat list of 8 same-shape rows made you
       read every row to find "what's on Thursday" — a day label between
       groups turns that into a glance. Walks entries in their current
       (taste-biased) order and drops a label whenever the day changes;
       with no taste profile set the order is already chronological, so
       groups come out clean. A day value repeating non-consecutively
       (possible once taste re-sorting shuffles across days) just prints
       a second small label — reads fine, doesn't need guarding against. */
    let lastDay = null;
    list.innerHTML = entries.map(e => {
      const dayLabel = (e.day && e.day !== lastDay)
        ? `<li class="week-daylabel">${window.WA.UI.esc(e.day)}</li>` : '';
      lastDay = e.day || lastDay;
      return dayLabel + `<li class="pick">
         <a class="pick__img" href="venue.html?id=${e.id}" tabindex="-1" aria-hidden="true">
           ${thumbEl(dupImg.has(e.id) ? { ...e, imageUrl: null } : e)}
         </a>
         <div class="pick__body">
           <a class="pick__title-link" href="venue.html?id=${e.id}">
             <span class="pick__title">${e.title}</span>
           </a>
           <span class="meta">${e.venue} &middot; ${e.kind}${timeSpan(e)}</span>
           <span class="via">via <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${e.handle}</a></span>
         </div>
         <label class="bookmark">
           <input type="checkbox" class="bookmark__check" data-id="${e.id}"
                  aria-label="Bookmark: ${e.title}">
           ${bookmarkSVG()}
         </label>
       </li>`;
    }).join('');

    /* Bridge to Discover — the one sanctioned Today→Discover link. When
       the week has more picks than we show here, send the long tail to
       Discover (pre-filtered to this week) instead of paginating on the
       home page. This teaches the mental model (Today = curated now,
       Discover = browse everything) rather than duplicating the browse. */
    let footer = document.getElementById('picks-footer');
    if (footer) footer.remove();
    const remaining = _weekFullSet.length - entries.length;
    if (remaining > 0) {
      footer = document.createElement('div');
      footer.id = 'picks-footer';
      footer.className = 'week__foot';
      footer.innerHTML = `
        <a class="linkact" href="./discover.html?time=thisweek">Browse all this week<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg></a>
        <span class="meta">${remaining} more in Discover</span>
      `;
      list.parentNode.insertBefore(footer, list.nextSibling);
    }
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

  /* Surprise lives in the This Week section header (static markup in
     index.html, July 2026 board 1b). The click is handled by ONE delegated
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
     3 of 4 cities right now — rotate-tonight's cron is frozen, see
     ROADMAP), so Tonight is never just catalog[0]'s arbitrary first
     row. */
  const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const selectTonightSet = (catalog, max = 3) => {
    /* Explicit tonight=true rows come first (a genuine curator flag), then
       today-scheduled This Week items pad out the rest — so a city with
       exactly one explicit flag still gets a diversified set instead of
       an oddly-sparse single card, while curator flags still lead. */
    const explicit  = catalog.filter(e => e.tonight);
    const today     = WEEKDAY_ABBR[new Date().getDay()];
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
       user's onboarding answers (and previous 👍) bubble to the top. Falls
       back to original order when there's no taste profile. */
    const orderByTaste = (entries) => {
      const taste = window.WA?.taste;
      if (!taste) return entries;
      const prefs = taste.getPrefs();
      const fb    = taste.getFeedback();
      if (!Object.keys(prefs).length && !(fb.liked?.length) && !(fb.disliked?.length)) {
        return entries;  /* untouched corpus order */
      }
      /* Stable sort — bigger score first; ties keep original order via index. */
      return entries
        .map((e, i) => ({ e, i, s: taste.tasteScore(e) }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map(x => x.e);
    };
    const orderedWeek = orderByTaste(weekSrc);

    /* Track the current tonight picks so Surprise me excludes them. */
    _surpriseExcludeIds = tonightIds;

    renderEditorialDeskNote();
    const sfMeta = document.getElementById('standfirst-meta');
    if (sfMeta) sfMeta.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (tonightSet.length) renderTonight(tonightSet);
    else                   renderTonightEmpty();
    renderWorthAVisit(worthAVisit);
    /* Pass the full ordered set — renderThisWeek paginates internally. */
    renderThisWeek(orderedWeek);
    restoreBookmarks();
    wireBookmarks();
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
    /* Re-render This Week when the taste profile changes (after onboarding
       or a Profile-page edit). */
    document.addEventListener('wa:taste-changed', () => {
      const reordered = orderByTaste(weekSrc);
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
