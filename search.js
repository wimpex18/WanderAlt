/* ============================================================
   WanderAlt — Search page wiring
   ------------------------------------------------------------
   Filters the combined catalog + past corpus on every keystroke.
   Empty query  → show default browse sections (Curators,
                  Neighborhoods, By Kind).
   Active query → hide browse sections, show results list.

   Searches catalog: title, venue, neighborhood, kind, handle, quote.
   Searches past:    title only (rendered as a compact past row).
   ============================================================ */
(() => {
  /* Returns neighborhood · kind · day/time string for a catalog result row. */
  const buildMeta = (entry) => {
    const parts = [entry.neighborhood, entry.kind];
    if (entry.day && entry.day !== 'Tonight') parts.push(`${entry.day} ${entry.time}`);
    else if (entry.time)                      parts.push(entry.time);
    return parts.join(' · ');
  };

  /* Filter the combined corpus. Past entries carry _past:true and are matched
     on title only; null fields in catalog entries are safely skipped. */
  const filter = (corpus, term) => {
    const q = term.toLowerCase();
    return corpus.filter(e =>
      [e.title, e.venue, e.neighborhood, e.kind, e.handle, e.quote]
        .some(f => f && f.toLowerCase().includes(q))
    );
  };

  /* Secondary mood filter: all active tags must be present in entry.moodTags. */
  const filterMood = (entries, activeTags) => {
    if (!activeTags.length) return entries;
    return entries.filter(e =>
      activeTags.every(tag => e.moodTags && e.moodTags.includes(tag))
    );
  };

  const render = (entries, listEl, emptyEl) => {
    if (!entries.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    listEl.innerHTML = entries.map(e => {
      if (e._past) {
        /* Compact single-line row matching the Saved / Past style. */
        return `<li class="list-row list-row--past">
           <p class="list-row__title">${e.title}</p>
           <p class="list-row__meta">${e.date}</p>
         </li>`;
      }
      return `<li class="list-row">
         <p class="list-row__title">
           <a href="venue.html?id=${e.id}">${e.title}</a>
         </p>
         <p class="list-row__meta">${buildMeta(e)}</p>
         <p class="list-row__quote">&#x2014; ${e.quote} <a class="handle" href="curator.html?handle=${encodeURIComponent(e.handle)}">${e.handle}</a></p>
       </li>`;
    }).join('');
  };

  /* Escape special chars for use inside HTML attribute values and text. */
  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Return [[key, count], …] sorted desc, capped at max, for any string accessor. */
  const topN = (entries, accessor, max) => {
    const counts = {};
    entries.forEach(e => { const k = accessor(e); if (k) counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, max);
  };

  /* Rebuild browse sections from the live catalog so counts are always current. */
  const populateBrowse = (catalog) => {
    /* Pull curator taglines from WA.curators (live data) — keyed by handle. */
    const curatorData = (window.WA && window.WA.curators) || [];
    const BIOS = Object.fromEntries(curatorData.map(c => [c.handle, c.tagline]).filter(([, t]) => t));
    /* Known kind display labels — unknown kinds are title-cased. */
    const KIND_LABELS = {
      gig:        'Gigs &amp; noise',
      talk:       'Lectures &amp; talks',
      exhibition: 'Exhibitions',
      club:       'Clubs &amp; late bars',
      bookshop:   'Bookshops &amp; records',
      film:       'Film &amp; cinema',
      market:     'Markets &amp; fairs',
      festival:   'Festivals',
    };

    /* — Curators — */
    const curators = topN(catalog, e => e.handle, 6);
    const curatorSect = document.getElementById('curators-label')?.closest('section');
    if (curatorSect && curators.length) {
      const metaEl = curatorSect.querySelector('.meta');
      const listEl = curatorSect.querySelector('.curator-rows');
      if (metaEl) metaEl.textContent = `${curators.length} writer${curators.length !== 1 ? 's' : ''}`;
      if (listEl) listEl.innerHTML = curators.map(([handle, n]) => {
        const bio = BIOS[handle];
        return `<li class="curator-row" role="button" tabindex="0" data-search="${esc(handle)}">
          <span class="curator-row__handle">${esc(handle)}</span>
          ${bio ? `<span class="curator-row__quote">&mdash; ${bio}</span>` : ''}
          <span class="curator-row__count">${n}</span>
        </li>`;
      }).join('');
    }

    /* — Neighborhoods — */
    const nhoods = topN(catalog, e => e.neighborhood, 8);
    const nhSect = document.getElementById('neighborhoods-label')?.closest('section');
    if (nhSect && nhoods.length) {
      const metaEl = nhSect.querySelector('.meta');
      const listEl = nhSect.querySelector('.browse-rows');
      if (metaEl) metaEl.textContent = `${nhoods.length} area${nhoods.length !== 1 ? 's' : ''}`;
      if (listEl) listEl.innerHTML = nhoods.map(([name, n]) =>
        `<li class="browse-row" role="button" tabindex="0" data-search="${esc(name)}">
          <span class="browse-row__label">${esc(name)}</span>
          <span class="browse-row__count">${n} picks</span>
        </li>`
      ).join('');
    }

    /* — Kinds — */
    const kinds = topN(catalog, e => e.kind, 8);
    const kindSect = document.getElementById('kinds-label')?.closest('section');
    if (kindSect && kinds.length) {
      const metaEl = kindSect.querySelector('.meta');
      const listEl = kindSect.querySelector('.browse-rows');
      if (metaEl) metaEl.textContent = `${kinds.length} type${kinds.length !== 1 ? 's' : ''}`;
      if (listEl) listEl.innerHTML = kinds.map(([kind, n]) => {
        const label = KIND_LABELS[kind] || esc(kind.charAt(0).toUpperCase() + kind.slice(1));
        return `<li class="browse-row" role="button" tabindex="0" data-search="${esc(kind)}">
          <span class="browse-row__label">${label}</span>
          <span class="browse-row__count">${n}</span>
        </li>`;
      }).join('');
    }
  };

  /* Wire browse rows and curator rows.
     Any element with [data-search] fills the input on click/Enter/Space. */
  const wireRowClicks = (input) => {
    document.addEventListener('click', e => {
      const row = e.target.closest('[data-search]');
      if (!row) return;
      input.value = row.dataset.search;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('[data-search]');
      if (!row) return;
      e.preventDefault();
      input.value = row.dataset.search;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  /* ── Match-me mode ─────────────────────────────────────── */

  const timeSpan = (p) => {
    if (!p.time) return '';
    if (!p.day || p.day === 'Tonight') return ` &middot; ${p.time}`;
    return ` &middot; ${p.day} ${p.time}`;
  };

  /* Hero card — the top-ranked match. Reuses tonight__venue layout so no
     new tokens are needed. Accepts the v6 toPick() shape (imageUrl etc). */
  const renderHeroCard = (pick, why) => {
    const imgUrl   = pick.imageUrl || pick.image_url || null;
    const initials = pick.thumbInitials || pick.thumb_initials
      || (pick.venue || pick.title || '??').slice(0, 2).toUpperCase();
    const thumbCls = `thumb thumb--lg${imgUrl ? ' thumb--has-img' : ''}`;
    const thumbSty = imgUrl ? ` style="background-image:url('${imgUrl.replace(/'/g, '%27')}')"` : '';
    const thumbLabel = imgUrl ? esc(pick.venue || pick.title) : `${esc(pick.venue || pick.title)} placeholder`;
    const thumbHtml =
      `<span class="${thumbCls}" role="img" aria-label="${thumbLabel}"${thumbSty}>`
      + `<span class="thumb__fallback" aria-hidden="${!!imgUrl}">${esc(initials)}</span>`
      + `</span>`;

    const pendingBadge = pick.pending
      ? `<span class="match-pending" title="Surfaced by external search — not yet curated.">pending review</span>`
      : '';

    const whyText = why || pick.why || pick.quote || '';

    return `<div class="match-card">
       <p class="match-card__why">&ldquo;${esc(whyText)}&rdquo;</p>
       <p class="match-card__attr">
         <span class="match-card__attr-line" aria-hidden="true"></span>
         <a class="handle" href="curator.html?handle=${encodeURIComponent(pick.handle)}">${esc(pick.handle)}</a>
         ${pendingBadge}
       </p>
       <a class="tonight__venue" href="venue.html?id=${encodeURIComponent(pick.id)}">
         ${thumbHtml}
         <span class="tonight__venue-body">
           <span class="tonight__venue-name">${esc(pick.title)}</span>
           <span class="meta">${esc(pick.neighborhood || '')} &middot; ${esc(pick.kind || '')}${timeSpan(pick)}</span>
         </span>
       </a>
     </div>`;
  };

  /* Secondary rows — same .list-row shape as keyword results. */
  const renderSecondaryRow = (pick, why) => {
    const pendingBadge = pick.pending
      ? ` <span class="match-pending">pending</span>`
      : '';
    const meta = [pick.neighborhood, pick.kind, pick.day && pick.day !== 'Tonight' ? `${pick.day} ${pick.time || ''}`.trim() : pick.time]
      .filter(Boolean).join(' · ');
    return `<li class="list-row">
       <p class="list-row__title">
         <a href="venue.html?id=${encodeURIComponent(pick.id)}">${esc(pick.title)}</a>${pendingBadge}
       </p>
       <p class="list-row__meta">${esc(meta)}</p>
       <p class="list-row__quote">&#x2014; ${esc(why || pick.quote || '')} <a class="handle" href="curator.html?handle=${encodeURIComponent(pick.handle)}">${esc(pick.handle)}</a></p>
     </li>`;
  };

  /* Render the full match response — hero + list + meta footnote.
     Also wires the "Search external sources" button when applicable. */
  const renderMatchResults = (data, prompt) => {
    const resultEl = document.getElementById('match-result');
    if (!resultEl) return;

    const hits = Array.isArray(data.hits) && data.hits.length
      ? data.hits
      : (data.pick ? [{ pick: data.pick, why: data.pick.why || '' }] : []);

    if (!hits.length) {
      resultEl.innerHTML =
        `<p class="match-error">No curated picks match &ldquo;${esc(prompt)}&rdquo;.</p>`
        + renderDiscoverPrompt(prompt, 'No curated picks yet — try external sources?');
      wireDiscoverButton(prompt);
      return;
    }

    const [first, ...rest] = hits;
    const hero = renderHeroCard(first.pick, first.why);
    const list = rest.length
      ? `<ol class="match-list list-rows" role="list">${rest.map(h => renderSecondaryRow(h.pick, h.why)).join('')}</ol>`
      : '';

    const footnote = renderMatchFootnote(data);
    const discover = data.suggested_more
      ? renderDiscoverPrompt(prompt, 'Want picks beyond what curators have covered?')
      : '';

    resultEl.innerHTML = hero + list + footnote + discover;
    if (data.suggested_more) wireDiscoverButton(prompt);
  };

  const renderMatchFootnote = (data) => {
    const bits = [];
    if (data.classifier === 'sql')        bits.push('curator filter');
    else if (data.classifier === 'hybrid') bits.push('hybrid search');
    else if (data.classifier === 'bm25_only') bits.push('keyword search');
    else if (data.classifier === 'discovery') bits.push('external sources');
    if (data.cached) bits.push('cached');
    if (typeof data.latency_ms === 'number') bits.push(`${data.latency_ms} ms`);
    if (!bits.length) return '';
    return `<p class="match-foot">${bits.join(' · ')}</p>`;
  };

  const renderDiscoverPrompt = (_prompt, label) =>
    `<div class="match-discover">
       <p class="meta">${esc(label)}</p>
       <button class="match-discover__btn" id="match-discover-btn" type="button">
         Search external sources &rarr;
       </button>
     </div>`;

  const wireDiscoverButton = (prompt) => {
    const btn = document.getElementById('match-discover-btn');
    if (!btn) return;
    btn.addEventListener('click', () => runDiscover(prompt), { once: true });
  };

  /* Calls match-pick → renders hits + footnote + optional discover prompt.
     opts.bypassCache=true forces a fresh LLM rerank (used by "Try again"). */
  const runMatch = async (prompt, opts = {}) => {
    const matchWrap  = document.getElementById('match-wrap');
    const matchAgain = document.getElementById('match-again');
    const resultEl   = document.getElementById('match-result');
    if (!matchWrap || !resultEl) return;

    matchWrap.hidden = false;
    if (matchAgain) matchAgain.hidden = true;
    resultEl.innerHTML = '<p class="match-loading">Matching&hellip;</p>';

    const base = window.WA && window.WA.BASE_URL;
    const city = (window.WA && window.WA.CITY) || 'tallinn';

    if (!base) {
      resultEl.innerHTML = '<p class="match-error">Match-me is not available in offline mode.</p>';
      return;
    }

    try {
      const res = await fetch(`${base}/functions/v1/match-pick`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ city, prompt, mode: 'find_many', bypass_cache: !!opts.bypassCache }),
      });
      const data = await res.json();

      if (!data.ok) {
        resultEl.innerHTML =
          `<p class="match-error">Couldn't match right now — try rephrasing, or use the search above.</p>`;
        return;
      }

      renderMatchResults(data, prompt);
      if (matchAgain) matchAgain.hidden = false;

    } catch (_) {
      resultEl.innerHTML =
        `<p class="match-error">Match-me is unreachable right now — try the search above.</p>`;
    }
  };

  /* Calls discover-venues; appends results below the existing match output. */
  const runDiscover = async (prompt) => {
    const resultEl = document.getElementById('match-result');
    const btn      = document.getElementById('match-discover-btn');
    if (!resultEl) return;

    if (btn) { btn.disabled = true; btn.textContent = 'Searching external sources…'; }

    const base = window.WA && window.WA.BASE_URL;
    const city = (window.WA && window.WA.CITY) || 'tallinn';
    if (!base) return;

    let section = document.getElementById('match-discover-section');
    if (!section) {
      section = document.createElement('section');
      section.id = 'match-discover-section';
      section.className = 'match-discover-section';
      resultEl.appendChild(section);
    }
    section.innerHTML = '<p class="match-loading">Looking up external sources&hellip;</p>';

    try {
      const res = await fetch(`${base}/functions/v1/discover-venues`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ city, prompt, limit: 5 }),
      });
      const data = await res.json();

      if (!data.ok || !data.hits || !data.hits.length) {
        section.innerHTML = `<p class="match-error">External search returned nothing new for &ldquo;${esc(prompt)}&rdquo;.</p>`;
        return;
      }

      const rows = data.hits.map(h => renderSecondaryRow(h.pick, h.why)).join('');
      section.innerHTML =
        `<header class="search-section-head">
           <p class="eyebrow">External sources</p>
           <p class="meta">${data.hits.length} pending review</p>
         </header>
         <ol class="list-rows" role="list">${rows}</ol>
         <p class="match-foot">via Google Places · awaiting curator review</p>`;

    } catch (_) {
      section.innerHTML = '<p class="match-error">External search is unreachable right now.</p>';
    }
  };

  const init = () => {
    const catalog      = (window.WA && window.WA.catalog) || [];
    const past         = (window.WA && window.WA.past)    || [];
    /* Tag past entries so render() can apply the compact row style. */
    const corpus       = [...catalog, ...past.map(e => ({ ...e, _past: true }))];

    /* Rebuild browse section rows and counts from the live catalog. */
    populateBrowse(catalog);

    const input        = document.getElementById('q');
    const inputWrap    = input?.closest('[data-mode]');
    const resultsWrap  = document.getElementById('search-results-section');
    const resultsList  = document.getElementById('search-results');
    const resultsCount = document.getElementById('search-results-count');
    const emptyState   = document.getElementById('search-empty');
    const browseSects  = Array.from(document.querySelectorAll('.search-browse-section'));
    const matchWrap    = document.getElementById('match-wrap');
    const matchAgain   = document.getElementById('match-again');
    const matchToggle  = document.getElementById('match-toggle');

    if (!input || !resultsWrap) return;

    wireRowClicks(input);

    /* ── Mode management ── */
    let mode = 'search'; /* 'search' | 'match' */

    const setMode = (newMode) => {
      mode = newMode;
      if (inputWrap) inputWrap.dataset.mode = newMode;

      if (newMode === 'match') {
        input.placeholder = 'Tell me what you want…';
        input.setAttribute('enterkeyhint', 'go');
        if (matchToggle) matchToggle.textContent = '← Search';
        /* Hide keyword results while in match mode */
        resultsWrap.hidden = true;
      } else {
        input.placeholder = 'Search anything…';
        input.setAttribute('enterkeyhint', 'search');
        if (matchToggle) matchToggle.textContent = 'Match me →';
        /* Clear match card */
        if (matchWrap) matchWrap.hidden = true;
        if (matchAgain) matchAgain.hidden = true;
        /* Re-run keyword search with current value */
        runSearch();
      }
    };

    if (matchToggle) {
      matchToggle.addEventListener('click', () => {
        setMode(mode === 'search' ? 'match' : 'search');
        input.focus();
      });
    }

    /* "Try again →" re-submits the current prompt (bypasses cache so the
       rerank actually runs again — otherwise we'd just re-serve the cached
       response and the user sees no change). */
    if (matchAgain) {
      matchAgain.addEventListener('click', () => {
        const prompt = input.value.trim();
        if (prompt) runMatch(prompt, { bypassCache: true });
      });
    }

    /* ── Track active mood tags ── */
    let activeMoodTags = (window.WA && window.WA.MoodChips)
      ? [...window.WA.MoodChips.active()]
      : [];

    /* ── Sort control ── */
    const sortEl = document.getElementById('search-sort');
    let sortBy = 'relevance';
    /* Day buckets used by 'newest': Tonight first, then weekday order, then untyped. */
    const DAY_RANK = { Tonight: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const sortEntries = (entries) => {
      const arr = [...entries];
      switch (sortBy) {
        case 'newest':
          /* Past entries last; among active picks, by day rank then time. */
          return arr.sort((a, b) => {
            if (a._past && !b._past) return 1;
            if (b._past && !a._past) return -1;
            const ra = DAY_RANK[a.day] ?? 99;
            const rb = DAY_RANK[b.day] ?? 99;
            if (ra !== rb) return ra - rb;
            return (a.time || '').localeCompare(b.time || '');
          });
        case 'title':
          return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        case 'curator':
          return arr.sort((a, b) => (a.handle || '').localeCompare(b.handle || ''));
        default:
          return arr; /* 'relevance' — keep input order */
      }
    };

    /* ── Keyword search ── */
    const runSearch = () => {
      if (mode === 'match') return; /* don't clobber match results */

      const term = input.value.trim();

      if (!term && !activeMoodTags.length) {
        resultsWrap.hidden = true;
        browseSects.forEach(s => { s.hidden = false; });
        if (sortEl) { sortEl.disabled = false; sortEl.value = 'relevance'; sortBy = 'relevance'; }
        return;
      }

      browseSects.forEach(s => { s.hidden = true; });
      resultsWrap.hidden = false;

      /* Apply text filter first, then mood filter, then user-selected sort. */
      const textMatches = term ? filter(corpus, term) : corpus.filter(e => !e._past);
      const moodFiltered = filterMood(textMatches, activeMoodTags);
      const matches      = sortEntries(moodFiltered);

      if (resultsCount) {
        resultsCount.textContent =
          matches.length === 1 ? '1 result' : `${matches.length} results`;
      }
      if (emptyState) {
        emptyState.textContent = term
          ? `Nothing found for "${term}"`
          : 'No picks match the active mood filters.';
      }

      /* Disable sort control when there's nothing to sort. */
      if (sortEl) sortEl.disabled = matches.length === 0;

      render(matches, resultsList, emptyState);
    };

    if (sortEl) {
      sortEl.addEventListener('change', () => {
        sortBy = sortEl.value;
        runSearch();
      });
    }

    /* ── Input handler — branches on current mode ── */
    input.addEventListener('input', () => {
      if (mode === 'match') {
        /* Clear stale match result while typing */
        if (matchWrap) matchWrap.hidden = true;
        if (matchAgain) matchAgain.hidden = true;
      } else {
        runSearch();
      }
    });

    /* Enter in match mode triggers the API call */
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || mode !== 'match') return;
      e.preventDefault();
      const prompt = input.value.trim();
      if (prompt) runMatch(prompt);
    });

    /* Re-run keyword search when mood chips change (search mode only) */
    document.addEventListener('wa:mood-changed', (e) => {
      activeMoodTags = e.detail.tags;
      if (mode === 'search') runSearch();
    });
  };

  document.addEventListener('wa:catalog-ready', init);
})();
