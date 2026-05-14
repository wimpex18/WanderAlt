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
      ? ` style="background-image:url('${entry.imageUrl.replace(/'/g, '%27')}')"` : '';
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

    const timeStr = entry.time ? ` &middot; ${entry.time}` : '';
    section.innerHTML =
      `<div class="tonight-card">
         <div class="tonight-card__head">
           <div class="tonight-badge">
             <span class="tonight-badge__dot" aria-hidden="true"></span>
             Tonight${timeStr}
           </div>
         </div>
         ${thumbEl(entry, true)}
         ${entry.imageAttr && entry.imageUrl ? `<p class="photo-credit">${entry.imageAttr}</p>` : ''}
         <div class="tonight-card__meta">
           <span class="kind-badge">
             <span class="kind-badge__icon" aria-hidden="true">
               <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="1.5" fill="currentColor"/></svg>
             </span>
             <span class="kind-badge__label">${entry.kind}</span>
           </span>
           <span class="meta">${entry.neighborhood}${timeStr}</span>
         </div>
         <a href="venue.html?id=${entry.id}" class="tonight-card__title" id="tonight-label">${entry.title}</a>
         <blockquote class="tonight__quote">
           <p>&ldquo;${entry.quote}&rdquo;</p>
           <footer class="tonight__attr">
             <span class="tonight__attr-line" aria-hidden="true"></span><a class="handle" href="curator.html?handle=${encodeURIComponent(entry.handle)}">${entry.handle}</a>
           </footer>
         </blockquote>
         <div class="tonight-actions">
           <a class="btn-primary" href="venue.html?id=${entry.id}">I&rsquo;m going &rarr;</a>
           <label class="btn-secondary bookmark">
             <input type="checkbox" class="bookmark__check" data-id="${entry.id}" aria-label="Save this pick" />
             <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3z"/></svg>
             Save
           </label>
         </div>
       </div>`;
  };

  /* ── This Week list ────────────────────────────────────── */
  /* total = real thisWeek count before the 8-pick display cap. */
  const renderThisWeek = (entries, total = entries.length) => {
    const list = document.querySelector('.picks');
    const sub  = document.querySelector('.section-sub');
    if (!list) return;

    const curatorCount = new Set(entries.map(e => e.handle)).size;
    if (sub) {
      const countLabel = total > entries.length
        ? `${entries.length} of ${total} picks`
        : `${entries.length} picks`;
      sub.textContent =
        `${countLabel} · ${curatorCount} curator${curatorCount !== 1 ? 's' : ''}`;
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

  /* ── Mood filtering ───────────────────────────────────────── */
  const matchesMood = (entry, activeTags) => {
    if (!activeTags.length) return true;
    return activeTags.every(tag => entry.moodTags && entry.moodTags.includes(tag));
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
    /* Cap the displayed list at 8; pass the real total for the sub-heading. */
    const thisWeek  = weekSrc.slice(0, 8);

    /* Track the current tonight ID so Surprise me excludes it. */
    _surpriseExcludeId = tonight ? tonight.id : null;

    /* Stash the full week source for mood re-filtering. */
    const _allWeek     = weekSrc;
    const _isFallback  = fallback;

    renderTonight(tonight);
    /* In fallback mode the total is just what we show — no "N of M" confusion. */
    renderThisWeek(thisWeek, fallback ? thisWeek.length : allWeek.length);
    restoreBookmarks();
    wireBookmarks();
    wireSurprise(catalog);
    renderColumn();  /* async — doesn't block the sync render above */

    /* Digest opt-in for visitors without an account. */
    const wireDigestOptin = () => {
      const form   = document.getElementById('digest-optin-form');
      const input  = document.getElementById('digest-optin-email');
      const status = document.getElementById('digest-optin-status');
      if (!form || !input || !status) return;

      form.addEventListener('submit', async () => {
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

    /* Mood filter: re-renders This Week with only matching entries. */
    document.addEventListener('wa:mood-changed', (e) => {
      const activeTags = e.detail.tags;
      const filtered   = _allWeek.filter(entry => matchesMood(entry, activeTags));
      /* Show filtered count vs. real total so the user knows filtering is active. */
      renderThisWeek(
        filtered.slice(0, 8),
        _isFallback ? filtered.length : _allWeek.length
      );
      restoreBookmarks();
    });
  };

  document.addEventListener('wa:catalog-ready',    init);
  /* After cloud sync, re-check bookmark state without full re-render. */
  document.addEventListener('wa:bookmarks-synced', restoreBookmarks);
})();
