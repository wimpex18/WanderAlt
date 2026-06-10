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
        taste.setPrefs({ [chip.dataset.axis]: chip.dataset.choice });
        reflect();
        return;
      }
      if (e.target.id === 'taste-skip' || e.target.id === 'taste-done') {
        taste.setOnboarded();
        wrap.hidden = true;
        return;
      }
      if (e.target.id === 'taste-reset') {
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

  /* Returns a <span class="meta__time"> wrapping the timing
     portion of a meta string, or '' if no time is set.      */
  const timeSpan = (entry) => {
    if (!entry.time) return '';
    if (!entry.day || entry.day === 'Tonight') {
      return `<span class="meta__time"> &middot; ${entry.time}</span>`;
    }
    return `<span class="meta__time"> &middot; ${entry.day} ${entry.time}</span>`;
  };

  /* Returns a .thumb span — uses real image when entry.imageUrl is set,
     otherwise falls back to the halftone placeholder + initials badge.  */
  const thumbEl = (entry, large = false) => {
    const cls  = `thumb${large ? ' thumb--lg' : ''}${entry.imageUrl ? ' thumb--has-img' : ''}`;
    const style = entry.imageUrl
      ? ` style="background-image:url('${WA.img(entry.imageUrl, 200).replace(/'/g, '%27')}')"` : '';
    const label = entry.imageUrl ? entry.venue : `${entry.venue} placeholder`;
    return `<span class="${cls}" role="img" aria-label="${label}"${style}>` +
           `<span class="thumb__fallback" aria-hidden="${!!entry.imageUrl}">${entry.thumbInitials}</span>` +
           `</span>`;
  };

  const bookmarkSVG = () =>
    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         stroke-width="1.25" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
       <path d="M6 3h12v18l-6-4-6 4V3z" />
     </svg>`;

  /* ── Tonight hero ──────────────────────────────────────── */
  const renderTonight = (entry) => {
    const section = document.getElementById('tonight');
    if (!section || !entry) return;
    section.removeAttribute('aria-busy');   /* hydration done — drop the loading flag */

    /* Flat editorial hero (redesign May 2026): a lime TONIGHT signal, a
       kind + neighborhood line, the title, then the curator quote as the
       dominant element (lime rule, full display scale), then the actions.
       No surface card, no hero thumbnail — the voice is the product. */
    const timeStr  = entry.time ? ` &middot; ${entry.time}` : '';
    /* 'other' is a data bucket, not a place — never print it (F-12). */
    const heroNhood = entry.neighborhood && entry.neighborhood.toLowerCase() !== 'other'
      ? entry.neighborhood : '';
    const whereStr = [heroNhood, entry.venue].filter(Boolean).join(' &middot; ');

    /* Photo-forward header when a venue photo exists (June 2026): the image
       fills a banner with a bottom-anchored scrim gradient (rgba 0 -> .6)
       so the white title/kindline never disappear over a high-contrast
       photo. The curator quote stays below in dark Fraunces — voice still
       leads. No photo -> the flat editorial header (kindline + title). */
    const head = entry.imageUrl
      ? `<a href="venue.html?id=${entry.id}" class="tonight__hero" id="tonight-label"
            style="background-image:url('${WA.img(entry.imageUrl, 1080).replace(/'/g, '%27')}')">
           <span class="tonight__badge tonight__badge--onphoto">Tonight${timeStr}</span>
           <span class="tonight__hero-foot">
             <span class="tonight__kindline tonight__kindline--onphoto">
               <span class="tonight__kind"><span class="dot" aria-hidden="true"></span>${entry.kind}</span>
               <span class="tonight__where">${whereStr}</span>
             </span>
             <span class="tonight__title tonight__title--onphoto">${entry.title}</span>
           </span>
         </a>`
      : `<span class="tonight__badge">Tonight${timeStr}</span>
         <div class="tonight__kindline">
           <span class="tonight__kind"><span class="dot" aria-hidden="true"></span>${entry.kind}</span>
           <span class="tonight__where">${whereStr}</span>
         </div>
         <a href="venue.html?id=${entry.id}" class="tonight__title" id="tonight-label">${entry.title}</a>`;

    section.innerHTML =
      `${head}
       <blockquote class="tonight__quote">&ldquo;${entry.quote}&rdquo;</blockquote>
       <p class="tonight__attr">&mdash; <a class="handle" href="curator.html?handle=${encodeURIComponent(entry.handle)}">${entry.handle}</a></p>
       <div class="tonight__actions">
         <a class="btn-going" href="venue.html?id=${entry.id}">I&rsquo;m going
           <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4"/></svg>
         </a>
         <label class="btn-save bookmark">
           <input type="checkbox" class="bookmark__check" data-id="${entry.id}" aria-label="Save this pick" />
           <svg width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M2 1.5h10v14l-5-3.5-5 3.5v-14z"/></svg>
           Save
         </label>
       </div>`;
    /* Re-apply saved state to the freshly-rendered checkbox (surprise-me
       re-renders the hero, so this can't rely on the one-shot init pass). */
    if (window.WA?.Bookmarks) {
      const cb = section.querySelector('.bookmark__check');
      if (cb && window.WA.Bookmarks.get()[cb.dataset.id]) cb.checked = true;
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
    const standfirst = document.querySelector('.standfirst');
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
    const cityId    = window.WA?.CITY || 'tallinn';
    const cityLabel = cityId.charAt(0).toUpperCase() + cityId.slice(1);
    section.innerHTML =
      `<span class="tonight__badge">Tonight</span>
       <p class="tonight__empty">No pick for tonight in ${cityLabel} yet &mdash; curators are warming up. ` +
       `In the meantime, <a href="./discover.html?type=places">browse places &rarr;</a></p>`;
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
    list.innerHTML = entries.map(e =>
      `<li class="pick">
         <div class="pick__link">
           <a class="pick__img" href="venue.html?id=${e.id}" tabindex="-1" aria-hidden="true">
             ${thumbEl(e)}
           </a>
           <span class="pick__body">
             <a class="pick__title-link" href="venue.html?id=${e.id}">
               <span class="pick__title">${e.title}</span>
             </a>
             <span class="meta">${e.venue} &middot; ${e.kind}${timeSpan(e)}</span>
             <span class="via">via <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${e.handle}</a></span>
           </span>
         </div>
         <label class="bookmark">
           <input type="checkbox" class="bookmark__check" data-id="${e.id}"
                  aria-label="Bookmark: ${e.title}">
           ${bookmarkSVG()}
         </label>
       </li>`
    ).join('');

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
      footer.className = 'picks-footer';
      footer.innerHTML = `
        <a class="picks-footer__btn" href="./discover.html?time=thisweek">
          Browse all this week &rarr;
        </a>
        <p class="picks-footer__meta">${remaining} more in Discover</p>
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
  let _surpriseExcludeId = null;

  const wireSurprise = (catalog) => {
    const btn = document.getElementById('surprise-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const pool = catalog.filter(e => e.id !== _surpriseExcludeId);
      if (!pool.length) return;

      const pick = pool[Math.floor(Math.random() * pool.length)];
      _surpriseExcludeId = pick.id;

      const section = document.getElementById('tonight');
      if (!section) return;

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        renderTonight(pick);
      } else {
        section.style.transition = 'opacity 160ms ease';
        section.style.opacity    = '0';
        setTimeout(() => {
          renderTonight(pick);
          section.style.opacity = '1';
          setTimeout(() => {
            section.style.removeProperty('opacity');
            section.style.removeProperty('transition');
          }, 180);
        }, 160);
      }
    });
  };

  /* ── Curator's Column ─────────────────────────────────── */
  /* Fetch the latest published column for the current city from
     Supabase and inject it above .thisweek. Gracefully absent
     if WA.BASE_URL / WA.ANON_KEY aren't set or no
     published column exists for this week.                     */
  const renderColumn = async () => {
    /* Guard: if a column was already injected (e.g. init ran twice), skip. */
    if (document.querySelector('.column')) return;
    const url  = window.WA && window.WA.BASE_URL;
    const key  = window.WA && window.WA.ANON_KEY;
    const city = (window.WA && window.WA.CITY) || 'tallinn';
    if (!url || !key) return;

    try {
      const res = await fetch(
        `${url}/rest/v1/columns?city=eq.${city}&status=eq.published` +
        `&order=week_of.desc&limit=1&select=*`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (!rows || !rows.length) return;

      const col = rows[0];
      if (!col.body_md) return;

      /* Convert minimal Markdown:
         - *text* → <em>text</em>
         - **text** → <strong>text</strong>
         - double newlines → paragraph breaks           */
      const toHtml = (md) => {
        const escaped = md
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const inline = escaped
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>');
        return inline
          .split(/\n\n+/)
          .filter(p => p.trim())
          .map(p => `<p>${p.replace(/\n/g, ' ').trim()}</p>`)
          .join('');
      };

      /* Format date: "May 2026" */
      const approvedDate = col.approved_at
        ? new Date(col.approved_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : '';

      const issueLabel = col.issue_num ? ` · Issue ${col.issue_num}` : '';

      const el = document.createElement('section');
      el.className = 'column';
      el.setAttribute('aria-labelledby', 'column-label');
      el.innerHTML =
        `<p id="column-label" class="column__eyebrow">Column${issueLabel}</p>` +
        `<div class="column__body">${toHtml(col.body_md)}</div>` +
        `<p class="column__sig">` +
          `<span aria-hidden="true">—</span>` +
          `<a class="handle" href="curator.html?handle=${encodeURIComponent(col.curator_handle)}">${col.curator_handle}</a>` +
          (approvedDate ? `<span>&middot; ${approvedDate}</span>` : '') +
        `</p>`;

      /* Insert before .thisweek */
      const thisWeekEl = document.querySelector('.thisweek');
      if (thisWeekEl) thisWeekEl.parentNode.insertBefore(el, thisWeekEl);
    } catch (_) {
      /* Network errors are silently swallowed — the page degrades gracefully. */
    }
  };

  /* ── Init ──────────────────────────────────────────────── */
  const init = () => {
    const catalog   = (window.WA && window.WA.catalog) || [];

    /* If no entry is flagged tonight/thisWeek (e.g. all auto-generated
       picks have the flags unset), fall back to the most-recent entries
       so the page is never blank after a fresh DB import.              */
    const tonight   = catalog.find(e => e.tonight) || catalog[0] || null;
    const allWeek   = catalog.filter(e => e.thisWeek);
    const fallback  = allWeek.length === 0;
    const weekSrc   = fallback ? catalog.slice(0, 8) : allWeek;

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

    /* Track the current tonight ID so Surprise me excludes it. */
    _surpriseExcludeId = tonight ? tonight.id : null;

    renderEditorialDeskNote();
    if (tonight) renderTonight(tonight);
    else         renderTonightEmpty();
    /* Pass the full ordered set — renderThisWeek paginates internally. */
    renderThisWeek(orderedWeek);
    restoreBookmarks();
    wireBookmarks();
    /* Surprise me has nothing to cycle through in an empty city. */
    const surpriseBtn = document.getElementById('surprise-btn');
    if (surpriseBtn) surpriseBtn.hidden = catalog.length === 0;
    wireSurprise(catalog);
    renderColumn();  /* async — doesn't block the sync render above */

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
            body: JSON.stringify({ email, city }),
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
