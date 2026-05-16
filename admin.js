/* ============================================================
   WanderAlt — Admin curation panel
   ------------------------------------------------------------
   Reads  via anon key (SELECT-only RLS — intentionally public).
   Writes via service role key (localStorage, localhost only).
   Auth   via Supabase email+password (optional; for identity
          and future role-based access control).
   ============================================================ */
(() => {
  const BASE  = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
  const ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';
  const CITIES = ['tallinn', 'helsinki', 'riga'];

  /* ── Helpers ─────────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);

  /* ── Service role key (localStorage) ────────────────────── */
  const getKey  = ()  => localStorage.getItem('wa-admin-key') || '';
  const setKey  = (k) => localStorage.setItem('wa-admin-key', k);
  const hasKey  = ()  => !!getKey();

  /* ── Auth session (Supabase user) ────────────────────────── */
  const getSession   = ()  => JSON.parse(localStorage.getItem('wa-admin-session') || 'null');
  const setSession   = (s) => localStorage.setItem('wa-admin-session', JSON.stringify(s));
  const clearSession = ()  => localStorage.removeItem('wa-admin-session');

  /* ── City management ─────────────────────────────────────── */
  let currentCity = localStorage.getItem('wa-admin-city') || 'tallinn';
  const setCity   = (c) => { currentCity = c; localStorage.setItem('wa-admin-city', c); };

  /* ── Supabase REST helpers ───────────────────────────────── */
  const GET = (qs) =>
    fetch(`${BASE}/rest/v1/picks?${qs}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    }).then(r => r.json());

  const PATCH = async (filter, body) => {
    if (!hasKey()) { alert('Paste your service role key first.'); return null; }
    const key = getKey();
    const r = await fetch(`${BASE}/rest/v1/picks?${filter}`, {
      method:  'PATCH',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const msg = await r.text(); console.error('PATCH failed', msg); alert(`Write failed.\n\n${msg}`); }
    return r;
  };

  const POST_PICK = async (body) => {
    if (!hasKey()) { alert('Paste your service role key first.'); return null; }
    const key = getKey();
    const r = await fetch(`${BASE}/rest/v1/picks`, {
      method:  'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const msg = await r.text(); alert(`Create failed.\n\n${msg}`); }
    return r;
  };

  /* ── State ──────────────────────────────────────────────── */
  let allPicks   = [];
  let allColumns = [];
  let modalPick  = null; // null → creating new pick

  const TW_PAGE_SIZE = 20;
  let twState = { kindFilter: '', dayFilter: '', dateFrom: '', dateTo: '', sort: 'order', page: 0 };

  /* ══════════════════════════════════════════════════════════
     AUTH
     ══════════════════════════════════════════════════════════ */
  const signIn = async (email, password) => {
    const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error_description || e.msg || 'Sign in failed');
    }
    return r.json();
  };

  const signOut = async () => {
    const sess = getSession();
    if (sess?.access_token) {
      await fetch(`${BASE}/auth/v1/logout`, {
        method:  'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${sess.access_token}` },
      }).catch(() => {});
    }
    clearSession();
    renderAuthState();
  };

  const renderAuthState = () => {
    const sess    = getSession();
    const btn     = $('admin-auth-btn');
    const authOut = $('admin-auth-out');
    const authIn  = $('admin-auth-in');
    const label   = $('auth-user-label');
    if (sess?.user) {
      const handle = sess.user.email?.split('@')[0] || 'Admin';
      if (btn)     { btn.textContent = handle; btn.classList.add('is-signed-in'); }
      if (authOut) authOut.hidden = true;
      if (authIn)  authIn.hidden  = false;
      if (label)   label.textContent = sess.user.email || '';
    } else {
      if (btn)     { btn.textContent = 'Sign in'; btn.classList.remove('is-signed-in'); }
      if (authOut) authOut.hidden = false;
      if (authIn)  authIn.hidden  = true;
    }
  };

  /* ══════════════════════════════════════════════════════════
     DATA LOADING
     ══════════════════════════════════════════════════════════ */
  const loadAll = async () => {
    allPicks = await GET(
      `city=eq.${currentCity}` +
      '&archived_at=is.null' +
      '&select=id,title,venue,venue_id,neighborhood,kind,day,tonight,this_week,' +
               'valid_until,quote,handle,context_md,image_url,world_x,world_y' +
      '&order=sort_order.asc,created_at.asc' +
      '&limit=1000'
    );
    render();
  };

  /* ══════════════════════════════════════════════════════════
     TONIGHT RENDERER
     ══════════════════════════════════════════════════════════ */
  const renderTonight = () => {
    const el = $('tonight-pick');
    if (!el) return;
    const p = allPicks.find(x => x.tonight);
    el.innerHTML = p
      ? `<div class="admin-pick-row">
           <span>${p.title}</span>
           <span class="meta">${p.venue} &middot; ${p.neighborhood || ''}</span>
           <button class="admin-btn--edit" data-id="${p.id}"
                   aria-label="Edit ${p.title}" title="Edit">&#9998;</button>
           <button class="admin-btn--rm" data-id="${p.id}" data-field="tonight"
                   aria-label="Remove tonight flag">&times;</button>
         </div>`
      : `<p class="meta admin-empty">None set.</p>`;
  };

  /* ══════════════════════════════════════════════════════════
     THIS WEEK RENDERER
     ══════════════════════════════════════════════════════════ */
  const getFilteredPicks = () => {
    let picks = allPicks.filter(x => x.this_week);
    if (twState.kindFilter) picks = picks.filter(p => p.kind === twState.kindFilter);
    if (twState.dayFilter)  picks = picks.filter(p => p.day  === twState.dayFilter);
    if (twState.dateFrom)   picks = picks.filter(p => p.valid_until && p.valid_until >= twState.dateFrom);
    if (twState.dateTo)     picks = picks.filter(p => p.valid_until && p.valid_until <= twState.dateTo);
    const DAY_ORDER = ['Tonight', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    if (twState.sort === 'title') picks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    if (twState.sort === 'kind')  picks.sort((a, b) => (a.kind  || '').localeCompare(b.kind  || ''));
    if (twState.sort === 'day')   picks.sort((a, b) => {
      const ai = DAY_ORDER.indexOf(a.day), bi = DAY_ORDER.indexOf(b.day);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    if (twState.sort === 'date')  picks.sort((a, b) => (a.valid_until || '').localeCompare(b.valid_until || ''));
    return picks;
  };

  const renderThisWeek = () => {
    const list  = $('thisweek-picks');
    const count = $('thisweek-count');
    const ctrl  = $('thisweek-controls');
    if (!list) return;

    const all       = allPicks.filter(x => x.this_week);
    const filtered  = getFilteredPicks();
    const total     = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / TW_PAGE_SIZE));
    twState.page    = Math.max(0, Math.min(twState.page, pageCount - 1));
    const page      = filtered.slice(twState.page * TW_PAGE_SIZE, (twState.page + 1) * TW_PAGE_SIZE);

    if (count) {
      const note = total < all.length ? ` of ${all.length} flagged` : ' flagged';
      count.textContent = `${total}${note} · briefing shows first 8`;
    }

    if (ctrl) {
      const DAY_ORDER = ['Tonight', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const kinds = [...new Set(all.map(p => p.kind).filter(Boolean))].sort();
      const days  = [...new Set(all.map(p => p.day).filter(Boolean))]
        .sort((a, b) => (DAY_ORDER.indexOf(a) + 1 || 99) - (DAY_ORDER.indexOf(b) + 1 || 99));

      ctrl.innerHTML = `
        <div class="tw-filter-bar">
          <select id="tw-kind" aria-label="Filter by kind">
            <option value="">All kinds</option>
            ${kinds.map(k => `<option value="${k}" ${twState.kindFilter === k ? 'selected' : ''}>${k}</option>`).join('')}
          </select>
          <select id="tw-day" aria-label="Filter by day">
            <option value="">All days</option>
            ${days.map(d => `<option value="${d}" ${twState.dayFilter === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
          <label class="tw-date-label">From
            <input type="date" id="tw-from" value="${twState.dateFrom}" aria-label="Valid from" />
          </label>
          <label class="tw-date-label">To
            <input type="date" id="tw-to" value="${twState.dateTo}" aria-label="Valid to" />
          </label>
          <select id="tw-sort" aria-label="Sort">
            <option value="order" ${twState.sort === 'order' ? 'selected' : ''}>Sort: default</option>
            <option value="title" ${twState.sort === 'title' ? 'selected' : ''}>Sort: title A–Z</option>
            <option value="kind"  ${twState.sort === 'kind'  ? 'selected' : ''}>Sort: kind</option>
            <option value="day"   ${twState.sort === 'day'   ? 'selected' : ''}>Sort: day</option>
            <option value="date"  ${twState.sort === 'date'  ? 'selected' : ''}>Sort: valid until</option>
          </select>
          ${pageCount > 1 ? `<div class="tw-pager">
            <button class="tw-pager-btn" id="tw-prev" ${twState.page === 0 ? 'disabled' : ''}>&larr;</button>
            <span class="meta">${twState.page + 1}&thinsp;/&thinsp;${pageCount}</span>
            <button class="tw-pager-btn" id="tw-next" ${twState.page >= pageCount - 1 ? 'disabled' : ''}>&rarr;</button>
          </div>` : ''}
        </div>`;

      const bind = (id, key) =>
        $(id)?.addEventListener('change', e => { twState[key] = e.target.value; twState.page = 0; renderThisWeek(); });
      bind('tw-kind', 'kindFilter'); bind('tw-day', 'dayFilter');
      bind('tw-from', 'dateFrom');   bind('tw-to',  'dateTo');
      bind('tw-sort', 'sort');
      $('tw-prev')?.addEventListener('click', () => { twState.page--; renderThisWeek(); });
      $('tw-next')?.addEventListener('click', () => { twState.page++; renderThisWeek(); });
    }

    list.innerHTML = page.length
      ? page.map(p => {
          const dateBit = p.valid_until ? ` &middot; until&nbsp;${p.valid_until.slice(0, 10)}` : '';
          const dayBit  = p.day ? ` &middot; ${p.day}` : '';
          return `<li class="admin-pick-row">
            <span>${p.title}</span>
            <span class="meta">${p.venue} &middot; ${p.kind || '—'}${dayBit}${dateBit}</span>
            <button class="admin-btn--edit" data-id="${p.id}"
                    aria-label="Edit ${p.title}" title="Edit">&#9998;</button>
            <button class="admin-btn--rm" data-id="${p.id}" data-field="this_week"
                    aria-label="Remove from this week">&times;</button>
          </li>`;
        }).join('')
      : `<li class="meta admin-empty" style="padding:var(--s-3) 0">No picks match the filter.</li>`;
  };

  /* ══════════════════════════════════════════════════════════
     ALL-PICKS BROWSER
     ══════════════════════════════════════════════════════════ */
  const AP_PAGE_SIZE = 20;
  let apState = { kindFilter: '', sort: 'default', page: 0, unpinnedOnly: false };

  const getApPicks = () => {
    let p = [...allPicks];
    if (apState.kindFilter)   p = p.filter(x => x.kind === apState.kindFilter);
    if (apState.unpinnedOnly) p = p.filter(x => !x.world_x || !x.world_y);
    if (apState.sort === 'title') p.sort((a, b) => (a.title||'').localeCompare(b.title||''));
    if (apState.sort === 'venue') p.sort((a, b) => (a.venue||'').localeCompare(b.venue||''));
    if (apState.sort === 'kind')  p.sort((a, b) => (a.kind||'').localeCompare(b.kind||''));
    return p;
  };

  const renderAllPicks = () => {
    const ctrl  = $('all-picks-controls');
    const list  = $('all-picks-list');
    if (!list) return;

    const filtered  = getApPicks();
    const total     = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / AP_PAGE_SIZE));
    apState.page    = Math.max(0, Math.min(apState.page, pageCount - 1));
    const page      = filtered.slice(apState.page * AP_PAGE_SIZE, (apState.page + 1) * AP_PAGE_SIZE);

    const countEl = $('all-picks-count');
    if (countEl) {
      const active  = allPicks.length;
      const unpinned = allPicks.filter(x => !x.world_x || !x.world_y).length;
      const suffix  = (apState.kindFilter || apState.unpinnedOnly) ? ` of ${active}` : '';
      countEl.textContent = `${total}${suffix} picks` +
        (unpinned > 0 && !apState.unpinnedOnly ? ` · ${unpinned} unpinned` : '');
    }

    /* Sync the "Unpinned only" button state */
    const unpBtn = $('ap-unpinned-btn');
    if (unpBtn) unpBtn.classList.toggle('is-active', apState.unpinnedOnly);

    if (ctrl) {
      const kinds = [...new Set(allPicks.map(p => p.kind).filter(Boolean))].sort();
      ctrl.innerHTML = `
        <div class="tw-filter-bar">
          <select id="ap-kind" aria-label="Filter by kind">
            <option value="">All kinds</option>
            ${kinds.map(k => `<option value="${k}" ${apState.kindFilter === k ? 'selected' : ''}>${k}</option>`).join('')}
          </select>
          <select id="ap-sort" aria-label="Sort">
            <option value="default" ${apState.sort === 'default' ? 'selected' : ''}>Sort: default</option>
            <option value="title"   ${apState.sort === 'title'   ? 'selected' : ''}>Sort: title A–Z</option>
            <option value="venue"   ${apState.sort === 'venue'   ? 'selected' : ''}>Sort: venue</option>
            <option value="kind"    ${apState.sort === 'kind'    ? 'selected' : ''}>Sort: kind</option>
          </select>
          ${pageCount > 1 ? `<div class="tw-pager">
            <button class="tw-pager-btn" id="ap-prev" ${apState.page === 0 ? 'disabled' : ''}>&larr;</button>
            <span class="meta">${apState.page + 1}&thinsp;/&thinsp;${pageCount}</span>
            <button class="tw-pager-btn" id="ap-next" ${apState.page >= pageCount - 1 ? 'disabled' : ''}>&rarr;</button>
          </div>` : ''}
        </div>`;

      $('ap-kind')?.addEventListener('change', e => { apState.kindFilter = e.target.value; apState.page = 0; renderAllPicks(); });
      $('ap-sort')?.addEventListener('change', e => { apState.sort = e.target.value; apState.page = 0; renderAllPicks(); });
      $('ap-prev')?.addEventListener('click', () => { apState.page--; renderAllPicks(); });
      $('ap-next')?.addEventListener('click', () => { apState.page++; renderAllPicks(); });
    }

    list.innerHTML = page.length
      ? page.map(p => {
          const flags = [p.tonight && '◆ tonight', p.this_week && '● this week'].filter(Boolean).join(' · ');
          const meta  = [p.venue, p.kind, p.neighborhood, p.day].filter(Boolean).join(' · ');
          const noPin = (!p.world_x || !p.world_y) ? ' <em style="opacity:.45">(unpinned)</em>' : '';
          return `<li class="admin-pick-row">
            <span>${p.title}${noPin}</span>
            <span class="meta">${meta}${flags ? ` &nbsp;<em style="opacity:.55">${flags}</em>` : ''}</span>
            <button class="admin-btn--edit" data-id="${p.id}"
                    aria-label="Edit ${p.title}" title="Edit">&#9998;</button>
          </li>`;
        }).join('')
      : `<li class="meta admin-empty" style="padding:var(--s-3) 0">No picks loaded yet.</li>`;
  };

  const render = () => { renderTonight(); renderThisWeek(); renderAllPicks(); };

  /* ══════════════════════════════════════════════════════════
     EDIT / CREATE MODAL
     ══════════════════════════════════════════════════════════ */
  const openModal = (pick) => {
    modalPick = pick || null;
    const modal = $('admin-modal');
    if (!modal) return;

    $('modal-title').textContent  = pick ? 'Edit pick' : 'New pick';
    $('modal-archive').hidden     = !pick;
    $('modal-status').textContent = '';

    $('mf-title').value        = pick?.title        || '';
    $('mf-venue').value        = pick?.venue         || '';
    $('mf-venue-id').value     = pick?.venue_id     || '';
    $('mf-kind').value         = pick?.kind         || '';
    $('mf-neighborhood').value = pick?.neighborhood || '';
    $('mf-handle').value       = pick?.handle       || '';
    $('mf-day').value          = pick?.day          || '';
    $('mf-valid-until').value  = pick?.valid_until  ? pick.valid_until.slice(0, 10) : '';
    $('mf-quote').value        = pick?.quote        || '';
    $('mf-context').value      = pick?.context_md   || '';
    $('mf-image-url').value    = pick?.image_url    || '';
    $('mf-image').value        = '';
    $('mf-tonight').checked    = !!pick?.tonight;
    $('mf-thisweek').checked   = !!pick?.this_week;

    const preview = $('mf-image-preview');
    if (preview) {
      preview.innerHTML = pick?.image_url
        ? `<img src="${pick.image_url}" alt="Current image" />`
        : '';
    }

    /* Pin position editor — seed and render. */
    initPinMap(pick?.world_x ?? null, pick?.world_y ?? null);

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('mf-title').focus(), 50);
  };

  /* ──────────────────────────────────────────────────────────────
     PIN POSITION EDITOR
     Renders the illustrated world SVG into a small panel inside the
     pick modal. Click anywhere → updates world_x/y and re-renders
     the marker. Values are submitted with the rest of the form.
     ────────────────────────────────────────────────────────────── */
  const WORLD_W = 1800, WORLD_H = 1200;
  let pinMapSvgRendered = false;

  const renderPinMarker = () => {
    const map  = $('mf-pin-map');
    const wxEl = $('mf-world-x');
    const wyEl = $('mf-world-y');
    const txt  = $('mf-pin-coords');
    if (!map || !wxEl || !wyEl) return;

    let marker = map.querySelector('.admin-pin-map__marker');
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'admin-pin-map__marker';
      map.appendChild(marker);
    }

    const wx = parseFloat(wxEl.value);
    const wy = parseFloat(wyEl.value);
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) {
      marker.hidden = true;
      if (txt) txt.textContent = 'not placed';
      return;
    }
    marker.hidden = false;
    marker.style.left = `${(wx / WORLD_W) * 100}%`;
    marker.style.top  = `${(wy / WORLD_H) * 100}%`;
    if (txt) txt.textContent = `world_x: ${Math.round(wx)}, world_y: ${Math.round(wy)}`;
  };

  const initPinMap = (world_x, world_y) => {
    const map  = $('mf-pin-map');
    const wxEl = $('mf-world-x');
    const wyEl = $('mf-world-y');
    if (!map || !wxEl || !wyEl) return;

    wxEl.value = world_x ?? '';
    wyEl.value = world_y ?? '';

    /* Render the SVG once — re-use on every modal open. */
    if (!pinMapSvgRendered) {
      if (window.WA?.mapWorldSVG) {
        map.innerHTML = WA.mapWorldSVG();
        pinMapSvgRendered = true;
      } else {
        /* map-world.js failed to load — show a plain backdrop so clicks still work */
        map.innerHTML =
          `<svg viewBox="0 0 ${WORLD_W} ${WORLD_H}"><rect width="${WORLD_W}" height="${WORLD_H}" fill="#eee"/></svg>`;
        pinMapSvgRendered = true;
      }
      map.addEventListener('click', (e) => {
        const rect = map.getBoundingClientRect();
        const wx = ((e.clientX - rect.left) / rect.width)  * WORLD_W;
        const wy = ((e.clientY - rect.top)  / rect.height) * WORLD_H;
        wxEl.value = Math.round(wx);
        wyEl.value = Math.round(wy);
        renderPinMarker();
      });
    }

    renderPinMarker();
  };

  /* Clear button — null out coords so auto-pin takes over on save. */
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'mf-pin-clear') {
      const wxEl = $('mf-world-x');
      const wyEl = $('mf-world-y');
      if (wxEl) wxEl.value = '';
      if (wyEl) wyEl.value = '';
      renderPinMarker();
    }
  });

  const closeModal = () => {
    const modal = $('admin-modal');
    if (modal) modal.hidden = true;
    /* Only restore scroll if the venue modal is also closed */
    if ($('admin-venue-modal')?.hidden !== false) document.body.style.overflow = '';
    modalPick = null;
  };

  const setModalStatus = (msg, isError) => {
    const el = $('modal-status');
    if (el) { el.textContent = msg; el.style.color = isError ? 'var(--c-accent)' : 'var(--c-ink-mute)'; }
  };

  /* Upload to Supabase Storage bucket "picks" (must exist, public) */
  const uploadImage = async (file) => {
    if (file.size > 2 * 1024 * 1024) throw new Error('File too large — max 2 MB');
    const ext  = file.name.split('.').pop().toLowerCase().replace('jpg', 'jpeg');
    const path = `picks/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const r    = await fetch(`${BASE}/storage/v1/object/picks/${path}`, {
      method:  'POST',
      headers: {
        apikey: getKey(), Authorization: `Bearer ${getKey()}`,
        'Content-Type': file.type, 'x-upsert': 'true',
      },
      body: file,
    });
    if (!r.ok) { const msg = await r.text(); throw new Error(`Upload: ${msg}`); }
    return `${BASE}/storage/v1/object/public/picks/${path}`;
  };

  const saveModal = async (e) => {
    e.preventDefault();
    if (!hasKey()) { alert('Service key required for writes.'); return; }

    const title = $('mf-title').value.trim();
    const venue = $('mf-venue').value.trim();
    if (!title || !venue) { setModalStatus('Title and Venue are required.', true); return; }

    const saveBtn = $('modal-save');
    if (saveBtn) saveBtn.disabled = true;
    setModalStatus('Saving…');

    const data = {
      title,
      venue,
      venue_id:     $('mf-venue-id').value     || null,
      kind:         $('mf-kind').value         || null,
      neighborhood: $('mf-neighborhood').value.trim() || null,
      handle:       $('mf-handle').value.trim(),
      day:          $('mf-day').value           || null,
      valid_until:  $('mf-valid-until').value   || null,
      quote:        $('mf-quote').value.trim(),
      context_md:   $('mf-context').value.trim() || null,
      tonight:      $('mf-tonight').checked,
      this_week:    $('mf-thisweek').checked,
    };

    /* Pin position — editor overrides win; blanks revert to auto-pin trigger. */
    const wxRaw = $('mf-world-x')?.value;
    const wyRaw = $('mf-world-y')?.value;
    const wx    = wxRaw === '' ? null : Number(wxRaw);
    const wy    = wyRaw === '' ? null : Number(wyRaw);
    if (wx !== null && Number.isFinite(wx)) data.world_x = Math.round(wx);
    else if (wxRaw === '')                  data.world_x = null;
    if (wy !== null && Number.isFinite(wy)) data.world_y = Math.round(wy);
    else if (wyRaw === '')                  data.world_y = null;

    /* Image: upload takes priority; otherwise use URL field */
    const imageFile = $('mf-image').files?.[0];
    if (imageFile) {
      try {
        setModalStatus('Uploading image…');
        data.image_url = await uploadImage(imageFile);
      } catch (err) {
        setModalStatus(`Image failed: ${err.message}`, true);
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
    } else {
      const url = $('mf-image-url').value.trim();
      if (url) data.image_url = url;
    }

    /* If setting tonight=true, un-set any existing tonight pick */
    if (data.tonight) {
      const prev = allPicks.find(p => p.tonight && p.id !== modalPick?.id);
      if (prev) await PATCH(`id=eq.${encodeURIComponent(prev.id)}`, { tonight: false });
    }

    let success = false;
    if (modalPick) {
      /* Edit existing */
      const r = await PATCH(`id=eq.${encodeURIComponent(modalPick.id)}`, data);
      if (r?.ok) { Object.assign(modalPick, data); success = true; }
    } else {
      /* Create new */
      data.city = currentCity;
      const r   = await POST_PICK(data);
      if (r?.ok) { success = true; await loadAll(); }
    }

    if (saveBtn) saveBtn.disabled = false;
    if (success) {
      setModalStatus('Saved.');
      setTimeout(closeModal, 700);
      render();
      /* If the edited pick was on the review queue, refresh it so the
         editor's title/quote changes show up before they click Approve. */
      if (modalPick?.pending_review) loadReviewQueue();
    } else {
      setModalStatus('Failed — check console.', true);
    }
  };

  const archivePick = async () => {
    if (!modalPick) return;
    if (!confirm(`Archive "${modalPick.title}"?\n\nRemoved from site; stays in database.`)) return;
    const r = await PATCH(`id=eq.${encodeURIComponent(modalPick.id)}`,
      { archived_at: new Date().toISOString() });
    if (r?.ok) {
      allPicks = allPicks.filter(p => p.id !== modalPick.id);
      closeModal();
      render();
    }
  };

  /* ══════════════════════════════════════════════════════════
     AUTOCOMPLETE SEARCH
     ══════════════════════════════════════════════════════════ */
  /* options.exclude: skip picks that already have this flag set */
  const showResults = (term, resultsEl, options = {}) => {
    if (!term || term.length < 2) { resultsEl.hidden = true; return; }
    const q    = term.toLowerCase();
    let pool   = allPicks;
    if (options.exclude) pool = pool.filter(p => !p[options.exclude]);
    const hits = pool
      .filter(p => [p.title, p.venue, p.neighborhood, p.kind, p.handle]
        .some(f => f && f.toLowerCase().includes(q)))
      .slice(0, 10);
    if (!hits.length) { resultsEl.hidden = true; return; }
    resultsEl.hidden  = false;
    resultsEl.innerHTML = hits.map(p =>
      `<li class="admin-result" data-id="${p.id}" role="option" tabindex="0">
         ${p.title}
         <span class="meta">&middot; ${p.venue}${p.kind ? ' &middot; ' + p.kind : ''}</span>
       </li>`
    ).join('');
  };

  /* ══════════════════════════════════════════════════════════
     VENUES
     ══════════════════════════════════════════════════════════ */
  const VENUES_GET = (qs) =>
    fetch(`${BASE}/rest/v1/venues?${qs}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    }).then(r => r.json());

  const VENUES_PATCH = async (id, body) => {
    if (!hasKey()) { alert('Service key required.'); return null; }
    const key = getKey();
    const r   = await fetch(`${BASE}/rest/v1/venues?id=eq.${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const msg = await r.text(); alert(`Venue update failed.\n\n${msg}`); }
    return r;
  };

  const VENUES_POST = async (body) => {
    if (!hasKey()) { alert('Service key required.'); return null; }
    const key = getKey();
    const r   = await fetch(`${BASE}/rest/v1/venues`, {
      method:  'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const msg = await r.text(); alert(`Create venue failed.\n\n${msg}`); }
    return r;
  };

  /* ── venue_details REST helpers ─ */
  const VD_GET = (qs) =>
    fetch(`${BASE}/rest/v1/venue_details?${qs}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    }).then(r => r.json());

  const VD_UPSERT = async (body) => {
    if (!hasKey()) { console.warn('VD_UPSERT: service key required'); return null; }
    const key = getKey();
    const r   = await fetch(`${BASE}/rest/v1/venue_details`, {
      method:  'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const msg = await r.text(); console.error(`VD upsert failed: ${msg}`); }
    return r;
  };

  /* ── Venue modal state ─ */
  let venueModalRecord = null;
  let venueSearchCache = [];

  const openVenueModal = (venue) => {
    venueModalRecord = venue || null;
    const modal = $('admin-venue-modal');
    if (!modal) return;

    $('vmodal-title').textContent  = venue ? 'Edit venue' : 'New venue';
    $('vmodal-status').textContent = '';

    $('vmf-name').value         = venue?.name         || '';
    $('vmf-kind').value         = venue?.kind         || '';
    $('vmf-neighborhood').value = venue?.neighborhood || '';
    $('vmf-city').value         = venue?.city         || currentCity;
    $('vmf-lat').value          = venue?.lat          ?? '';
    $('vmf-lng').value          = venue?.lng          ?? '';
    $('vmf-address').value      = venue?.address      || '';
    $('vmf-image-url').value    = venue?.image_url    || '';
    $('vmf-status').value       = venue?.status       || 'active';

    /* Clear enrichment fields first; async-populate from venue_details */
    $('vmf-wikidata').value      = '';
    $('vmf-short-desc').value    = '';
    $('vmf-opening-hours').value = '';
    if ($('vmf-manual-lock')) $('vmf-manual-lock').checked = false;

    if (venue?.name) {
      const vkey = venue.name.toLowerCase();
      const vcity = venue.city || currentCity;
      VD_GET(
        `city=eq.${encodeURIComponent(vcity)}` +
        `&venue_key=eq.${encodeURIComponent(vkey)}` +
        `&select=wikidata_id,short_desc,opening_hours,phone,business_status,manual_lock&limit=1`
      ).then(rows => {
        const vd = Array.isArray(rows) ? rows[0] : null;
        if (!vd) return;
        $('vmf-wikidata').value        = vd.wikidata_id     || '';
        $('vmf-short-desc').value      = vd.short_desc      || '';
        $('vmf-opening-hours').value   = vd.opening_hours   || '';
        $('vmf-phone').value           = vd.phone           || '';
        const bsEl = $('vmf-business-status');
        if (bsEl) bsEl.value = vd.business_status || '';
        if ($('vmf-manual-lock')) $('vmf-manual-lock').checked = !!vd.manual_lock;
      }).catch(() => {});
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('vmf-name').focus(), 50);
  };

  const closeVenueModal = () => {
    const modal = $('admin-venue-modal');
    if (modal) modal.hidden = true;
    /* Only restore scroll if the pick modal is also closed */
    if ($('admin-modal')?.hidden !== false) document.body.style.overflow = '';
    venueModalRecord = null;
  };

  const setVenueModalStatus = (msg, isError) => {
    const el = $('vmodal-status');
    if (el) { el.textContent = msg; el.style.color = isError ? 'var(--c-accent)' : 'var(--c-ink-mute)'; }
  };

  const saveVenueModal = async (e) => {
    e.preventDefault();
    if (!hasKey()) { alert('Service key required for writes.'); return; }

    const name = $('vmf-name').value.trim();
    if (!name) { setVenueModalStatus('Name is required.', true); return; }

    const saveBtn = $('vmodal-save');
    if (saveBtn) saveBtn.disabled = true;
    setVenueModalStatus('Saving…');

    const latVal = parseFloat($('vmf-lat').value);
    const lngVal = parseFloat($('vmf-lng').value);
    const data   = {
      name,
      kind:         $('vmf-kind').value             || null,
      neighborhood: $('vmf-neighborhood').value.trim() || null,
      city:         $('vmf-city').value             || currentCity,
      lat:          isNaN(latVal) ? null : latVal,
      lng:          isNaN(lngVal) ? null : lngVal,
      address:      $('vmf-address').value.trim()   || null,
      image_url:    $('vmf-image-url').value.trim() || null,
      status:       $('vmf-status').value           || 'active',
    };

    let success = false;
    if (venueModalRecord) {
      const r = await VENUES_PATCH(venueModalRecord.id, data);
      if (r?.ok) { Object.assign(venueModalRecord, data); success = true; }
    } else {
      const r = await VENUES_POST(data);
      if (r?.ok) { success = true; }
    }

    if (saveBtn) saveBtn.disabled = false;
    if (success) {
      /* Also upsert venue_details with any enrichment fields */
      const latVal2 = parseFloat($('vmf-lat').value);
      const lngVal2 = parseFloat($('vmf-lng').value);
      const vdRow   = {
        city:          data.city,
        venue_key:     name.toLowerCase(),
        display_name:  name,
        manual_lock:   !!$('vmf-manual-lock')?.checked,
        source:        'manual',
        enriched_at:   new Date().toISOString(),
      };
      const wikidata  = $('vmf-wikidata')?.value.trim();
      const shortDesc = $('vmf-short-desc')?.value.trim();
      const ohours    = $('vmf-opening-hours')?.value.trim();
      const phone     = $('vmf-phone')?.value.trim();
      const bizStatus = $('vmf-business-status')?.value || null;
      const addrVal   = $('vmf-address').value.trim();
      if (wikidata)   vdRow.wikidata_id     = wikidata;
      if (shortDesc)  vdRow.short_desc      = shortDesc;
      if (ohours)     vdRow.opening_hours   = ohours;
      if (phone)      vdRow.phone           = phone;
      if (bizStatus)  vdRow.business_status = bizStatus;
      if (addrVal)    vdRow.address         = addrVal;
      if (!isNaN(latVal2)) vdRow.lat = latVal2;
      if (!isNaN(lngVal2)) vdRow.lng = lngVal2;
      VD_UPSERT(vdRow).catch(() => {});

      setVenueModalStatus('Saved.');
      setTimeout(closeVenueModal, 700);
    } else {
      setVenueModalStatus('Failed — check console.', true);
    }
  };

  /* Live search — calls Supabase ilike on each keystroke (debounced) */
  let venueSearchTimer = null;
  const searchVenues = (term, resultsEl) => {
    clearTimeout(venueSearchTimer);
    if (!term || term.length < 2) { resultsEl.hidden = true; return; }
    venueSearchTimer = setTimeout(async () => {
      try {
        const hits = await VENUES_GET(
          `name=ilike.*${encodeURIComponent(term)}*` +
          `&city=eq.${currentCity}` +
          '&limit=10' +
          '&select=id,name,kind,neighborhood,city,lat,lng,address,image_url,status'
        );
        if (!Array.isArray(hits) || !hits.length) { resultsEl.hidden = true; return; }
        venueSearchCache = hits;
        resultsEl.hidden  = false;
        resultsEl.innerHTML = hits.map(v => {
          const detail = [v.kind, v.neighborhood].filter(Boolean).join(' · ');
          return `<li class="admin-result" data-id="${v.id}" role="option" tabindex="0">
            ${v.name}${detail ? ` <span class="meta">&middot; ${detail}</span>` : ''}
          </li>`;
        }).join('');
      } catch { resultsEl.hidden = true; }
    }, 200);
  };

  /* ══════════════════════════════════════════════════════════
     VENUES LIST (paginated browse)
     ══════════════════════════════════════════════════════════ */
  const VL_PAGE_SIZE = 20;
  let vlPage  = 0;
  let vlTotal = 0;
  let vlCache = [];   // venues on the current page (for edit modal delegation)

  const loadVenuesList = async (page = 0) => {
    const list    = $('venues-list');
    const pagerEl = $('venues-pager');
    const countEl = $('venues-count');
    if (!list) return;

    list.innerHTML = `<li class="meta admin-empty" style="padding:var(--s-3) 0">Loading…</li>`;

    try {
      const offset = page * VL_PAGE_SIZE;
      const r      = await fetch(
        `${BASE}/rest/v1/venues?city=eq.${currentCity}` +
        `&limit=${VL_PAGE_SIZE}&offset=${offset}&order=name.asc` +
        `&select=id,name,kind,neighborhood,city,status,lat,lng,address,image_url`,
        {
          headers: {
            apikey: ANON, Authorization: `Bearer ${ANON}`,
            Prefer: 'count=exact',
          },
        }
      );
      const range = r.headers.get('content-range') || '';
      vlTotal = parseInt(range.split('/')[1]) || 0;
      vlPage  = page;
      const venues = await r.json();
      vlCache = Array.isArray(venues) ? venues : [];

      const pageCount = Math.max(1, Math.ceil(vlTotal / VL_PAGE_SIZE));
      if (countEl) countEl.textContent = `${vlTotal} venues`;

      if (!vlCache.length) {
        list.innerHTML = `<li class="meta admin-empty" style="padding:var(--s-3) 0">No venues for ${currentCity} yet.</li>`;
      } else {
        list.innerHTML = vlCache.map(v => {
          const meta   = [v.kind, v.neighborhood].filter(Boolean).join(' · ');
          const closed = v.status === 'possibly_closed'
            ? ` <em style="opacity:.5">(possibly closed)</em>` : '';
          return `<li class="admin-pick-row">
            <span>${v.name}</span>
            <span class="meta">${meta}${closed}</span>
            <button class="admin-btn--edit admin-btn--edit-venue" data-venue-id="${v.id}"
                    aria-label="Edit ${v.name}" title="Edit">&#9998;</button>
          </li>`;
        }).join('');
      }

      if (pagerEl) {
        if (pageCount > 1) {
          pagerEl.hidden = false;
          pagerEl.innerHTML = `
            <div class="tw-filter-bar" style="margin-top:var(--s-2)">
              <div class="tw-pager">
                <button class="tw-pager-btn" id="vl-prev" ${page === 0 ? 'disabled' : ''}>&larr;</button>
                <span class="meta">${page + 1}&thinsp;/&thinsp;${pageCount}</span>
                <button class="tw-pager-btn" id="vl-next" ${page >= pageCount - 1 ? 'disabled' : ''}>&rarr;</button>
              </div>
            </div>`;
          $('vl-prev')?.addEventListener('click', () => loadVenuesList(vlPage - 1));
          $('vl-next')?.addEventListener('click', () => loadVenuesList(vlPage + 1));
        } else {
          pagerEl.hidden = true;
        }
      }
    } catch (err) {
      if (list) list.innerHTML = `<li class="meta" style="color:var(--c-accent);padding:var(--s-3) 0">Error: ${err.message}</li>`;
      if ($('venues-count')) $('venues-count').textContent = '';
    }
  };

  /* ══════════════════════════════════════════════════════════
     VENUE ENRICHMENT LIST
     ══════════════════════════════════════════════════════════ */
  const VE_PAGE_SIZE = 20;
  let vePage  = 0;
  let veTotal = 0;

  const loadEnrichmentList = async (page = 0) => {
    const list    = $('enrichment-list');
    const pagerEl = $('enrichment-pager');
    const countEl = $('enrichment-count');
    if (!list) return;

    list.innerHTML = `<li class="meta admin-empty" style="padding:var(--s-3) 0">Loading…</li>`;

    try {
      const offset = page * VE_PAGE_SIZE;
      const r = await fetch(
        `${BASE}/rest/v1/venue_details?city=eq.${encodeURIComponent(currentCity)}` +
        `&order=enriched_at.desc&limit=${VE_PAGE_SIZE}&offset=${offset}` +
        `&select=id,venue_key,display_name,website,wikidata_id,source,manual_lock,enriched_at`,
        {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: 'count=exact' },
        }
      );
      const range = r.headers.get('content-range') || '';
      veTotal = parseInt(range.split('/')[1]) || 0;
      vePage  = page;
      const rows = await r.json();

      const pageCount = Math.max(1, Math.ceil(veTotal / VE_PAGE_SIZE));
      if (countEl) countEl.textContent = `${veTotal} enriched venue${veTotal !== 1 ? 's' : ''}`;

      if (!Array.isArray(rows) || !rows.length) {
        list.innerHTML = `<li class="meta admin-empty" style="padding:var(--s-3) 0">No enriched venues yet — click "Run bulk enrichment" to start.</li>`;
      } else {
        list.innerHTML = rows.map(row => {
          const ts     = row.enriched_at ? new Date(row.enriched_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '';
          const locked = row.manual_lock ? ' 🔒' : '';
          const wd     = row.wikidata_id ? ` · <a href="https://www.wikidata.org/wiki/${row.wikidata_id}" target="_blank" rel="noopener" style="color:var(--c-accent)">${row.wikidata_id}</a>` : '';
          const site   = row.website
            ? (() => { try { return ' · ' + new URL(row.website).hostname.replace(/^www\./, ''); } catch { return ''; } })()
            : '';
          return `<li class="admin-pick-row" data-vd-id="${row.id}" data-vd-key="${row.venue_key}">
            <span>${row.display_name || row.venue_key}${locked}</span>
            <span class="meta">${row.source || ''}${wd}${site}</span>
            <span class="meta" style="white-space:nowrap">${ts}</span>
            <button class="admin-btn--edit admin-btn--lock-toggle"
                    data-vd-id="${row.id}" data-locked="${row.manual_lock ? '1' : '0'}"
                    title="${row.manual_lock ? 'Unlock (allow auto-enrichment)' : 'Lock (protect manual edits)'}"
                    aria-label="${row.manual_lock ? 'Unlock' : 'Lock'} ${row.display_name || row.venue_key}">
              ${row.manual_lock ? '🔒' : '🔓'}
            </button>
          </li>`;
        }).join('');
      }

      if (pagerEl) {
        if (pageCount > 1) {
          pagerEl.hidden = false;
          pagerEl.innerHTML = `
            <div class="tw-filter-bar" style="margin-top:var(--s-2)">
              <div class="tw-pager">
                <button class="tw-pager-btn" id="ve-prev" ${page === 0 ? 'disabled' : ''}>&larr;</button>
                <span class="meta">${page + 1}&thinsp;/&thinsp;${pageCount}</span>
                <button class="tw-pager-btn" id="ve-next" ${page >= pageCount - 1 ? 'disabled' : ''}>&rarr;</button>
              </div>
            </div>`;
          $('ve-prev')?.addEventListener('click', () => loadEnrichmentList(vePage - 1));
          $('ve-next')?.addEventListener('click', () => loadEnrichmentList(vePage + 1));
        } else {
          pagerEl.hidden = true;
        }
      }
    } catch (err) {
      if (list) list.innerHTML = `<li class="meta" style="color:var(--c-accent);padding:var(--s-3) 0">Error: ${err.message}</li>`;
    }
  };

  /* ══════════════════════════════════════════════════════════
     DISCOVERY REVIEW QUEUE
     Picks created by discover-venues live with pending_review=true
     and handle='@discovery'. This list lets editors approve (publish
     + re-embed) or reject (archive) each one.
     ══════════════════════════════════════════════════════════ */
  const escAttr = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const stripPendingSuffix = (title) =>
    String(title || '').replace(/\s*[—-]\s*pending review\s*$/i, '').trim();

  const loadReviewQueue = async () => {
    const list     = $('review-list');
    const statusEl = $('review-status');
    if (!list) return;

    list.innerHTML = '';
    if (statusEl) statusEl.textContent = 'Loading…';

    try {
      const r = await fetch(
        `${BASE}/rest/v1/picks?city=eq.${encodeURIComponent(currentCity)}` +
        `&pending_review=eq.true&archived_at=is.null` +
        `&select=id,title,venue,neighborhood,kind,handle,image_url,discovery_source,discovery_query,thumb_initials,created_at` +
        `&order=created_at.desc&limit=50`,
        { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
      );
      const rows = await r.json();
      const badge = $('review-badge');
      if (!Array.isArray(rows) || !rows.length) {
        if (statusEl) statusEl.textContent = 'No picks awaiting review.';
        if (badge) badge.style.display = 'none';
        return;
      }

      if (statusEl) {
        statusEl.textContent =
          `${rows.length} pick${rows.length !== 1 ? 's' : ''} awaiting review`;
      }
      if (badge) { badge.textContent = rows.length; badge.style.display = ''; }

      list.innerHTML = rows.map(row => {
        const cleanTitle = stripPendingSuffix(row.title) || row.venue || row.id;
        const initials   = row.thumb_initials
          || (row.venue || cleanTitle).slice(0, 2).toUpperCase();
        const thumbStyle = row.image_url
          ? `background-image:url('${row.image_url.replace(/'/g, '%27')}')`
          : '';
        const thumbInner = row.image_url ? '' : escAttr(initials);
        const metaBits = [row.neighborhood, row.kind].filter(Boolean).join(' · ');
        const query    = row.discovery_query
          ? `via "${escAttr(row.discovery_query)}"`
          : (row.discovery_source || '');

        return `<li class="review-row" data-id="${escAttr(row.id)}">
          <div class="review-thumb" style="${thumbStyle}">${thumbInner}</div>
          <div class="review-body">
            <p class="review-title">${escAttr(cleanTitle)}</p>
            <p class="review-meta">${escAttr(metaBits)}</p>
            <p class="review-query">${escAttr(query)}</p>
          </div>
          <div class="review-actions">
            <button type="button" class="admin-col-btn admin-col-btn--approve"
                    data-review-action="approve">Approve</button>
            <button type="button" class="admin-col-btn"
                    data-review-action="edit">Edit</button>
            <button type="button" class="admin-col-btn admin-col-btn--reject"
                    data-review-action="reject">Reject</button>
          </div>
        </li>`;
      }).join('');
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error: ${err.message}`;
    }
  };

  /* Approve: clear pending_review, strip placeholder suffix, refresh embedding. */
  const approveReview = async (id, row) => {
    const newTitle = stripPendingSuffix(row.title);
    const patch    = { pending_review: false };
    if (newTitle && newTitle !== row.title) patch.title = newTitle;

    const r = await PATCH(`id=eq.${encodeURIComponent(id)}`, patch);
    if (!r?.ok) return false;

    /* Re-embed so the now-published pick is searchable by vector + BM25.
       Best-effort — failure doesn't block the approval. */
    try {
      await fetch(`${BASE}/functions/v1/embed-picks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}` },
        body:    JSON.stringify({ city: currentCity, pick_id: id }),
      });
    } catch (_) { /* embedding refresh is opportunistic */ }

    return true;
  };

  /* Reject: archive the pick so it disappears from queues + search. */
  const rejectReview = async (id) => {
    const r = await PATCH(`id=eq.${encodeURIComponent(id)}`,
                          { archived_at: new Date().toISOString() });
    return r?.ok;
  };

  /* ══════════════════════════════════════════════════════════
     STATS STRIP — quick health counts
     ══════════════════════════════════════════════════════════ */
  const loadStats = async () => {
    const key     = hasKey() ? getKey() : ANON;
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const city    = currentCity;
    const countHeader = (res) => {
      const m = (res?.headers?.get('Content-Range') || '').match(/\/(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    };
    const el = (id) => document.getElementById(id);
    try {
      const [picksRes, unpinnedRes, reviewRes, embedsRes] = await Promise.all([
        fetch(`${BASE}/rest/v1/picks?city=eq.${city}&archived_at=is.null&select=id`,
              { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
        fetch(`${BASE}/rest/v1/picks?city=eq.${city}&archived_at=is.null` +
              `&or=(world_x.is.null,world_y.is.null)&select=id`,
              { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
        fetch(`${BASE}/rest/v1/picks?handle=eq.@discovery&archived_at=is.null&select=id`,
              { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
        fetch(`${BASE}/rest/v1/pick_embeddings?select=pick_id`,
              { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
      ]);

      const total    = countHeader(picksRes);
      const unpinned = countHeader(unpinnedRes);
      const review   = countHeader(reviewRes);
      const embeds   = countHeader(embedsRes);
      const noEmbeds = (total != null && embeds != null) ? Math.max(0, total - embeds) : null;

      if (el('stat-picks'))    el('stat-picks').textContent    = `${total ?? '?'} picks`;
      if (el('stat-unpinned')) {
        el('stat-unpinned').textContent = `${unpinned ?? '?'} unpinned`;
        el('stat-unpinned').className   =
          `admin-stat-badge${unpinned > 0 ? ' admin-stat-badge--warn' : ''}`;
      }
      if (el('stat-review')) {
        el('stat-review').textContent = `${review ?? '?'} pending review`;
        el('stat-review').className   =
          `admin-stat-badge${review > 0 ? ' admin-stat-badge--accent' : ''}`;
      }
      if (el('stat-noembeds')) {
        el('stat-noembeds').textContent = noEmbeds != null ? `${noEmbeds} no embedding` : '— no embedding';
        el('stat-noembeds').className   =
          `admin-stat-badge${noEmbeds > 0 ? ' admin-stat-badge--warn' : ''}`;
      }
    } catch { /* silently absent */ }
  };

  /* ══════════════════════════════════════════════════════════
     MATCH ANALYTICS — aggregate likes/dislikes from user_match_history
     ══════════════════════════════════════════════════════════ */
  const loadAnalytics = async () => {
    const status = document.getElementById('analytics-status');
    const grid   = document.getElementById('analytics-grid');
    const likeEl = document.getElementById('analytics-likes');
    const disEl  = document.getElementById('analytics-dislikes');
    if (!status || !grid || !likeEl || !disEl) return;

    /* user_match_history RLS is per-user; aggregation needs service role.
       Without a key, show a hint and bail out gracefully. */
    if (!hasKey()) {
      status.textContent = 'Paste service-role key above to load aggregates.';
      grid.hidden = true;
      return;
    }

    status.textContent = 'Loading…';
    const key     = getKey();
    const headers = { apikey: key, Authorization: `Bearer ${key}` };

    try {
      const res = await fetch(
        `${BASE}/rest/v1/user_match_history?select=pick_id,vote`,
        { headers }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();

      if (!rows.length) {
        status.textContent = 'No votes yet — table is empty.';
        grid.hidden = true;
        return;
      }

      /* Aggregate counts per pick. */
      const tally = new Map();
      for (const r of rows) {
        if (!r.pick_id || !r.vote) continue;
        const t = tally.get(r.pick_id) || { likes: 0, dislikes: 0 };
        if (r.vote === 'like')    t.likes++;
        if (r.vote === 'dislike') t.dislikes++;
        tally.set(r.pick_id, t);
      }

      /* Resolve pick titles in one batch — limit to relevant ids. */
      const ids = [...tally.keys()];
      const idList = ids.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
      const titlesRes = await fetch(
        `${BASE}/rest/v1/picks?id=in.(${encodeURIComponent(idList)})&select=id,title,handle`,
        { headers }
      );
      const titles = titlesRes.ok ? await titlesRes.json() : [];
      const titleMap = Object.fromEntries(titles.map(p => [p.id, p]));

      const render = (entries) => entries.slice(0, 10).map(([id, t]) => {
        const p = titleMap[id] || {};
        const name = p.title || id;
        return `<li class="review-row" style="padding:var(--s-2) 0;border-bottom:1px solid var(--c-rule)">
          <p style="margin:0;font-weight:500">${escAttr(name)}</p>
          <p class="meta" style="margin:2px 0 0;opacity:.7">
            ${escAttr(p.handle || '')} · 👍 ${t.likes} · 👎 ${t.dislikes}
          </p>
        </li>`;
      }).join('') || '<li class="meta" style="opacity:.6">None.</li>';

      const liked = [...tally.entries()]
        .filter(([, t]) => t.likes > 0)
        .sort((a, b) => b[1].likes - a[1].likes);
      const disliked = [...tally.entries()]
        .filter(([, t]) => t.dislikes > 0)
        .sort((a, b) => b[1].dislikes - a[1].dislikes);

      likeEl.innerHTML = render(liked);
      disEl.innerHTML  = render(disliked);

      const total = rows.length;
      status.textContent =
        `${total} vote${total !== 1 ? 's' : ''} across ${ids.length} pick${ids.length !== 1 ? 's' : ''}.`;
      grid.hidden = false;
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
      grid.hidden = true;
    }
  };

  /* ══════════════════════════════════════════════════════════
     CURATORS MANAGEMENT
     ══════════════════════════════════════════════════════════ */
  let curatorsList = [];
  let modalCurator = null; // curator being edited (null = new)

  const loadCurators = async () => {
    const countEl = document.getElementById('curators-count');
    if (countEl) countEl.textContent = 'Loading…';
    const key     = hasKey() ? getKey() : ANON;
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    try {
      const res = await fetch(
        `${BASE}/rest/v1/curators?city=eq.${currentCity}` +
        `&select=handle,name,city,tagline,bio,source_channel,pick_count` +
        `&order=pick_count.desc.nullslast,handle.asc&limit=100`,
        { headers }
      );
      curatorsList = await res.json().catch(() => []);
      renderCurators();
    } catch (err) {
      if (countEl) countEl.textContent = `Failed: ${err.message}`;
    }
  };

  const renderCurators = () => {
    const list    = document.getElementById('curators-list');
    const countEl = document.getElementById('curators-count');
    if (!list) return;
    if (countEl) countEl.textContent = `${curatorsList.length} curator${curatorsList.length !== 1 ? 's' : ''}`;
    list.innerHTML = curatorsList.length
      ? curatorsList.map(c => `
          <li class="admin-pick-row">
            <span style="font-family:var(--ff-mono);font-size:var(--fs-meta)">${c.handle}</span>
            <span class="meta">${[c.name, c.tagline].filter(Boolean).join(' — ') || '—'}
              ${c.pick_count != null ? `<em style="opacity:.55"> · ${c.pick_count} picks</em>` : ''}</span>
            <button class="admin-btn--edit" data-curator-handle="${c.handle}"
                    aria-label="Edit ${c.handle}" title="Edit">&#9998;</button>
          </li>`
        ).join('')
      : `<li class="meta admin-empty" style="padding:var(--s-3) 0">No curators found for ${currentCity}.</li>`;
  };

  const openCuratorModal = (curator) => {
    modalCurator = curator || null;
    const modal = document.getElementById('curator-modal');
    if (!modal) return;
    const titleEl = document.getElementById('curator-modal-heading');
    if (titleEl) titleEl.textContent = curator ? 'Edit curator' : 'New curator';
    document.getElementById('curator-modal-status').textContent = '';
    document.getElementById('cf-handle').value  = curator?.handle         || '';
    document.getElementById('cf-name').value    = curator?.name           || '';
    document.getElementById('cf-city').value    = curator?.city           || currentCity;
    document.getElementById('cf-tagline').value = curator?.tagline        || '';
    document.getElementById('cf-bio').value     = curator?.bio            || '';
    document.getElementById('cf-source').value  = curator?.source_channel || '';
    document.getElementById('cf-handle').readOnly = !!curator;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('cf-handle').focus();
  };

  const closeCuratorModal = () => {
    const modal = document.getElementById('curator-modal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
    modalCurator = null;
  };

  const saveCuratorModal = async () => {
    if (!hasKey()) { alert('Service key required to save curators.'); return; }
    const status = document.getElementById('curator-modal-status');
    const btn    = document.getElementById('curator-save-btn');
    const handle   = document.getElementById('cf-handle').value.trim();
    const city     = document.getElementById('cf-city').value.trim()   || currentCity;
    const name     = document.getElementById('cf-name').value.trim()   || null;
    const tagline  = document.getElementById('cf-tagline').value.trim() || null;
    const bio      = document.getElementById('cf-bio').value.trim()    || null;
    const source   = document.getElementById('cf-source').value.trim() || null;

    if (!handle) { if (status) status.textContent = 'Handle is required.'; return; }

    if (status) status.textContent = 'Saving…';
    if (btn)    btn.disabled = true;

    const key     = getKey();
    const headers = { apikey: key, Authorization: `Bearer ${key}`,
                      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
    try {
      const res = await fetch(`${BASE}/rest/v1/curators`, {
        method:  'POST',
        headers,
        body: JSON.stringify({ handle, city, name, tagline, bio, source_channel: source }),
      });
      if (res.ok || res.status === 204) {
        if (status) status.textContent = 'Saved.';
        await loadCurators();
        setTimeout(closeCuratorModal, 700);
      } else {
        const data = await res.json().catch(() => ({}));
        if (status) status.textContent = data.message || `Error ${res.status}`;
      }
    } catch (err) {
      if (status) status.textContent = `Network error: ${err.message}`;
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  /* ══════════════════════════════════════════════════════════
     PIPELINE
     ══════════════════════════════════════════════════════════ */
  const loadPipeline = async () => {
    const statusEl  = $('pipeline-status');
    const contentEl = $('pipeline-content');
    if (!hasKey()) {
      if (statusEl) statusEl.textContent = 'Service key required to view pipeline stats.';
      if (contentEl) contentEl.hidden = true;
      return;
    }
    const key     = getKey();
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    if (statusEl) statusEl.textContent = 'Loading…';

    try {
      const [queueRows, logRows] = await Promise.all([
        fetch(`${BASE}/rest/v1/staging_messages?select=status&limit=500`, { headers })
          .then(r => r.json()).catch(() => []),
        fetch(`${BASE}/rest/v1/ingest_log?select=fn,status,inserted,rejected,error,finished_at` +
              `&order=id.desc&limit=5`, { headers })
          .then(r => r.json()).catch(() => []),
      ]);
      renderPipeline(queueRows, logRows);
      if (statusEl) statusEl.textContent = '';
      if (contentEl) contentEl.hidden = false;
    } catch (err) {
      if (statusEl) statusEl.textContent = `Failed: ${err.message}`;
    }
  };

  const renderPipeline = (queueRows, logRows) => {
    /* Queue badges */
    const queueEl = $('pipeline-queue');
    if (queueEl) {
      if (!Array.isArray(queueRows) || !queueRows.length) {
        queueEl.innerHTML = '<span class="meta">Queue empty.</span>';
      } else {
        const counts = {};
        queueRows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
        queueEl.innerHTML = Object.entries(counts)
          .map(([s, n]) => `<span class="admin-pipeline-badge admin-pipeline-badge--${s}">${s}: ${n}</span>`)
          .join('');
      }
    }

    /* Ingest log table */
    const tbody = $('pipeline-log')?.querySelector('tbody');
    if (tbody) {
      if (!Array.isArray(logRows) || !logRows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="meta" style="opacity:.5">No log entries yet.</td></tr>';
      } else {
        tbody.innerHTML = logRows.map(r => {
          const ts = r.finished_at
            ? new Date(r.finished_at).toLocaleString('en-GB', { dateStyle:'short', timeStyle:'short' })
            : '—';
          const errCls = r.error ? 'pipeline-status-err' : 'pipeline-status-ok';
          return `<tr>
            <td>${r.fn || '—'}</td>
            <td class="${errCls}">${r.status || '—'}</td>
            <td>${r.inserted ?? '—'}</td>
            <td>${r.rejected ?? '—'}</td>
            <td>${ts}</td>
          </tr>`;
        }).join('');
      }
    }
  };

  /* ══════════════════════════════════════════════════════════
     COLUMNS
     ══════════════════════════════════════════════════════════ */
  const COLUMNS_GET = async (qs) => {
    const r = await fetch(`${BASE}/rest/v1/columns?${qs}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    return r.json();
  };

  const COLUMNS_PATCH = async (id, body) => {
    if (!hasKey()) { alert('Service key required.'); return null; }
    const key = getKey();
    const r   = await fetch(`${BASE}/rest/v1/columns?id=eq.${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const msg = await r.text(); alert(`Column update failed.\n\n${msg}`); }
    return r;
  };

  const loadColumns = async () => {
    const statusEl = $('columns-status');
    try {
      allColumns = await COLUMNS_GET(
        `city=eq.${currentCity}` +
        '&order=week_of.desc&limit=20' +
        '&select=id,curator_handle,city,status,week_of,issue_num,body_md,created_at,approved_at'
      );
      renderColumns();
    } catch {
      if (statusEl) statusEl.textContent = 'Failed to load columns.';
    }
  };

  const renderColumns = () => {
    const list     = $('columns-list');
    const statusEl = $('columns-status');
    if (!list) return;

    const drafts    = allColumns.filter(c => c.status === 'draft');
    const published = allColumns.filter(c => c.status === 'published');
    const rejected  = allColumns.filter(c => c.status === 'rejected');

    if (statusEl)
      statusEl.textContent = `${drafts.length} draft · ${published.length} published · ${rejected.length} rejected`;

    if (!allColumns.length) {
      list.innerHTML = '<p class="meta admin-empty">No columns yet. Click "Draft now" to generate one.</p>';
      return;
    }

    list.innerHTML = allColumns.map(col => {
      const weekLabel  = col.week_of
        ? new Date(col.week_of + 'T00:00:00').toLocaleDateString('en-GB',
            { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
      const issueLabel = col.issue_num ? ` · Issue ${col.issue_num}` : '';
      const preview    = (col.body_md || '').slice(0, 200).replace(/\n/g, ' ');
      const isDraft    = col.status === 'draft';

      return `<div class="admin-col-row" data-col-id="${col.id}">
        <div class="admin-col-meta">
          <span class="admin-col-handle">${col.curator_handle}</span>
          <span class="admin-col-week">week of ${weekLabel}${issueLabel}</span>
          <span class="admin-col-status">${col.status}</span>
        </div>
        <p class="admin-col-preview">${preview}&hellip;</p>
        <textarea class="admin-col-body" data-col-id="${col.id}"
                  aria-label="Column body for ${col.curator_handle}">${col.body_md || ''}</textarea>
        <div class="admin-col-actions">
          <button class="admin-col-btn admin-col-btn--edit"
                  data-col-id="${col.id}" data-action="edit">Edit draft</button>
          ${isDraft ? `
          <button class="admin-col-btn admin-col-btn--approve"
                  data-col-id="${col.id}" data-action="approve">Approve &amp; publish</button>
          <button class="admin-col-btn admin-col-btn--reject"
                  data-col-id="${col.id}" data-action="reject">Reject</button>` : ''}
        </div>
      </div>`;
    }).join('');
  };

  const wireColumns = () => {
    const list = $('columns-list');
    if (!list) return;

    list.addEventListener('click', async (e) => {
      const btn    = e.target.closest('[data-action]');
      if (!btn) return;
      const colId  = btn.dataset.colId;
      const action = btn.dataset.action;
      const col    = allColumns.find(c => c.id === colId);
      if (!col) return;

      if (action === 'edit') {
        const ta = list.querySelector(`textarea[data-col-id="${colId}"]`);
        if (ta) ta.classList.toggle('is-open');
        btn.textContent = ta?.classList.contains('is-open') ? 'Save edits' : 'Edit draft';
        if (ta && !ta.classList.contains('is-open')) {
          const r = await COLUMNS_PATCH(colId, { body_md: ta.value });
          if (r?.ok) {
            col.body_md = ta.value;
            const prev = list.querySelector(`.admin-col-row[data-col-id="${colId}"] .admin-col-preview`);
            if (prev) prev.textContent = ta.value.slice(0, 200).replace(/\n/g, ' ') + '…';
          }
        }
        return;
      }
      if (action === 'approve') {
        if (!confirm(`Publish this column by ${col.curator_handle}?\n\nWill appear on the Briefing page.`)) return;
        const ta   = list.querySelector(`textarea[data-col-id="${colId}"]`);
        const body = { status: 'published', approved_at: new Date().toISOString() };
        if (ta?.classList.contains('is-open')) body.body_md = ta.value;
        await COLUMNS_PATCH(colId, body);
        col.status = 'published';
        renderColumns(); wireColumns();
        return;
      }
      if (action === 'reject') {
        if (!confirm('Reject this column?')) return;
        const r = await COLUMNS_PATCH(colId, { status: 'rejected' });
        if (r?.ok) { col.status = 'rejected'; renderColumns(); wireColumns(); }
      }
    });

    $('columns-draft-btn')?.addEventListener('click', async () => {
      if (!hasKey()) { alert('Service key required.'); return; }
      const btn      = $('columns-draft-btn');
      const statusEl = $('columns-status');
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.textContent = 'Drafting… ~20 seconds';
      try {
        const r    = await fetch(`${BASE}/functions/v1/draft-column`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}` },
          body:    JSON.stringify({ city: currentCity }),
        });
        const json = await r.json().catch(() => ({}));
        if (statusEl) statusEl.textContent = r.ok
          ? `Done: ${JSON.stringify(json)}`
          : `Error: ${JSON.stringify(json)}`;
        if (r.ok) await loadColumns();
      } catch (err) {
        if (statusEl) statusEl.textContent = `Network error: ${err.message}`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  };

  /* ══════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════ */
  const init = () => {

    /* ── Service key ── */
    const keyInput = $('admin-key');
    const authSect = $('admin-auth');
    if (hasKey()) {
      if (keyInput) keyInput.value = getKey();
      if (authSect) authSect.hidden = true;
    }
    $('admin-key-save')?.addEventListener('click', () => {
      const v = keyInput?.value.trim();
      if (!v) return;
      setKey(v);
      if (authSect) authSect.hidden = true;
    });
    keyInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') $('admin-key-save')?.click();
    });

    /* ── City switcher ── */
    const citySelect = $('admin-city-select');
    if (citySelect) {
      citySelect.value = currentCity;
      citySelect.addEventListener('change', async (e) => {
        setCity(e.target.value);
        twState.page = 0;
        apState.page = 0;
        await Promise.all([loadAll(), loadColumns()]);
        loadVenuesList(0);
        loadEnrichmentList(0);
        loadReviewQueue();
        loadCurators();
        loadStats();
        loadAnalytics();
      });
    }

    /* ── Stats strip + analytics ── */
    loadStats();
    loadAnalytics();
    $('analytics-refresh-btn')?.addEventListener('click', () => loadAnalytics());

    /* ── Auth ── */
    renderAuthState();
    const authBtn   = $('admin-auth-btn');
    const authPanel = $('admin-auth-panel');
    authBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (authPanel) authPanel.hidden = !authPanel.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!authPanel?.hidden && !authPanel?.contains(e.target) && e.target !== authBtn) {
        if (authPanel) authPanel.hidden = true;
      }
    });
    $('auth-submit')?.addEventListener('click', async () => {
      const email    = $('auth-email')?.value.trim();
      const password = $('auth-password')?.value;
      const errEl    = $('auth-error');
      if (!email || !password) { if (errEl) errEl.textContent = 'Enter email and password.'; return; }
      if (errEl) errEl.textContent = '';
      try {
        const data = await signIn(email, password);
        setSession({ access_token: data.access_token, user: data.user });
        renderAuthState();
        if (authPanel) authPanel.hidden = true;
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      }
    });
    $('auth-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('auth-submit')?.click(); });
    $('auth-signout')?.addEventListener('click', () => { signOut(); if (authPanel) authPanel.hidden = true; });

    /* ── Load data ── */
    loadAll();
    loadColumns();
    loadVenuesList(0);
    loadEnrichmentList(0);
    loadReviewQueue();
    loadCurators();
    wireColumns();

    /* ── Delegation: ✕ remove-flag buttons ── */
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.admin-btn--rm');
      if (!btn) return;
      const { id, field } = btn.dataset;
      const r = await PATCH(`id=eq.${encodeURIComponent(id)}`, { [field]: false });
      if (r?.ok) {
        const p = allPicks.find(x => x.id === id);
        if (p) p[field] = false;
        if (field === 'tonight') renderTonight(); else renderThisWeek();
      }
    });

    /* ── Delegation: ✎ edit pick buttons ── */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-btn--edit');
      if (!btn || btn.classList.contains('admin-btn--edit-venue')) return;
      const pick = allPicks.find(x => x.id === btn.dataset.id);
      if (pick) openModal(pick);
    });

    /* ── Delegation: ✎ edit venue buttons ── */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-btn--edit-venue');
      if (!btn) return;
      /* check search-result cache first, fall back to list cache */
      const venue = venueSearchCache.find(v => v.id === btn.dataset.venueId)
                 || vlCache.find(v => v.id === btn.dataset.venueId);
      if (venue) openVenueModal(venue);
    });

    /* ── Tonight clear ── */
    $('tonight-clear')?.addEventListener('click', async () => {
      const p = allPicks.find(x => x.tonight);
      if (!p) return;
      const r = await PATCH(`id=eq.${encodeURIComponent(p.id)}`, { tonight: false });
      if (r?.ok) { p.tonight = false; renderTonight(); }
    });

    /* ── This Week reset all ── */
    $('thisweek-clear-all')?.addEventListener('click', async () => {
      const n = allPicks.filter(x => x.this_week).length;
      if (!n) return;
      if (!confirm(`Reset all ${n} this_week flags?\n\n(Tonight pick is preserved.)`)) return;
      const r = await PATCH(`city=eq.${currentCity}&this_week=eq.true&tonight=eq.false`, { this_week: false });
      if (r?.ok) {
        allPicks.forEach(p => { if (!p.tonight) p.this_week = false; });
        twState.page = 0;
        renderThisWeek();
      }
    });

    /* ── Tonight search ── */
    const tonightSearch  = $('tonight-search');
    const tonightResults = $('tonight-results');
    tonightSearch?.addEventListener('input', () =>
      showResults(tonightSearch.value.trim(), tonightResults, { exclude: 'tonight' })
    );
    tonightResults?.addEventListener('click', async (e) => {
      const li = e.target.closest('.admin-result');
      if (!li) return;
      const { id } = li.dataset;
      const prev   = allPicks.find(x => x.tonight);
      if (prev) await PATCH(`id=eq.${encodeURIComponent(prev.id)}`, { tonight: false });
      const r = await PATCH(`id=eq.${encodeURIComponent(id)}`, { tonight: true });
      if (r?.ok) {
        allPicks.forEach(p => { p.tonight = (p.id === id); });
        tonightSearch.value = '';
        tonightResults.hidden = true;
        renderTonight();
      }
    });

    /* ── This Week search ── */
    const weekSearch  = $('thisweek-search');
    const weekResults = $('thisweek-results');
    weekSearch?.addEventListener('input', () =>
      showResults(weekSearch.value.trim(), weekResults, { exclude: 'this_week' })
    );
    weekResults?.addEventListener('click', async (e) => {
      const li = e.target.closest('.admin-result');
      if (!li) return;
      const { id } = li.dataset;
      const r = await PATCH(`id=eq.${encodeURIComponent(id)}`, { this_week: true });
      if (r?.ok) {
        const p = allPicks.find(x => x.id === id);
        if (p) p.this_week = true;
        weekSearch.value = '';
        weekResults.hidden = true;
        renderThisWeek();
      }
    });

    /* ── Picks search (all picks, opens edit modal) ── */
    const picksSearch  = $('picks-search');
    const picksResults = $('picks-results');
    picksSearch?.addEventListener('input', () =>
      showResults(picksSearch.value.trim(), picksResults)
    );
    picksResults?.addEventListener('click', (e) => {
      const li = e.target.closest('.admin-result');
      if (!li) return;
      const pick = allPicks.find(x => x.id === li.dataset.id);
      if (pick) { openModal(pick); picksSearch.value = ''; picksResults.hidden = true; }
    });
    $('picks-new-btn')?.addEventListener('click', () => openModal(null));
    $('ap-unpinned-btn')?.addEventListener('click', () => {
      apState.unpinnedOnly = !apState.unpinnedOnly;
      apState.page = 0;
      renderAllPicks();
    });

    /* ── Venue autocomplete inside pick modal ── */
    let modalVenueTimer = null;
    $('mf-venue')?.addEventListener('input', () => {
      clearTimeout(modalVenueTimer);
      /* Clear the linked venue_id whenever the user edits the name */
      $('mf-venue-id').value = '';
      const term      = $('mf-venue').value.trim();
      const resultsEl = $('mf-venue-results');
      if (!term || term.length < 2) { resultsEl.hidden = true; return; }
      modalVenueTimer = setTimeout(async () => {
        try {
          const hits = await VENUES_GET(
            `name=ilike.*${encodeURIComponent(term)}*` +
            `&city=eq.${currentCity}` +
            '&limit=8&select=id,name,kind,neighborhood'
          );
          if (!Array.isArray(hits) || !hits.length) { resultsEl.hidden = true; return; }
          resultsEl.hidden  = false;
          resultsEl.innerHTML = hits.map(v =>
            `<li class="admin-result" data-id="${v.id}" data-name="${v.name.replace(/"/g, '&quot;')}"
                 role="option" tabindex="0">
               ${v.name}${v.kind ? ` <span class="meta">&middot; ${v.kind}</span>` : ''}
             </li>`
          ).join('');
        } catch { $('mf-venue-results').hidden = true; }
      }, 200);
    });
    $('mf-venue-results')?.addEventListener('click', (e) => {
      const li = e.target.closest('.admin-result');
      if (!li) return;
      $('mf-venue').value    = li.dataset.name;
      $('mf-venue-id').value = li.dataset.id;
      $('mf-venue-results').hidden = true;
    });

    /* ── Pipeline section ── */
    if (hasKey()) loadPipeline();
    $('pipeline-refresh-btn')?.addEventListener('click', loadPipeline);
    $('pipeline-process-btn')?.addEventListener('click', async () => {
      if (!hasKey()) { alert('Service key required.'); return; }
      const btn      = $('pipeline-process-btn');
      const statusEl = $('pipeline-status');
      if (btn) btn.disabled = true;
      if (statusEl) { statusEl.textContent = 'Triggering process-staging…'; }
      try {
        const r    = await fetch(`${BASE}/functions/v1/process-staging`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}` },
          body:    JSON.stringify({}),
        });
        const json = await r.json().catch(() => ({}));
        if (statusEl) statusEl.textContent = r.ok
          ? `Done: ${json.inserted || 0} inserted, ${json.rejected || 0} rejected.`
          : `Error: ${JSON.stringify(json)}`;
        if (r.ok) { await loadAll(); setTimeout(loadPipeline, 1500); }
      } catch (err) {
        if (statusEl) statusEl.textContent = `Network error: ${err.message}`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    /* ── Verify venues ── */
    const wireVerifyBtn = (btnId, dryRun) => {
      $(btnId)?.addEventListener('click', async () => {
        if (!dryRun && !confirm(
          'This will mark matched venues as CLOSED in the database and archive their picks.\n\nProceed?'
        )) return;
        const btn      = $(btnId);
        const statusEl = $('pipeline-status');
        if (btn) btn.disabled = true;
        if (statusEl) statusEl.textContent = dryRun ? 'Running dry-run check…' : 'Applying venue closure…';
        try {
          const r    = await fetch(`${BASE}/functions/v1/verify-venues?dry_run=${dryRun}`, {
            headers: { apikey: ANON },
          });
          const json = await r.json().catch(() => ({}));
          if (r.ok) {
            const found = json.confirmed_closed?.length ?? 0;
            if (dryRun) {
              statusEl.textContent = found === 0
                ? `Dry run: no disused venues found in OSM. (${json.venues_checked} checked)`
                : `Dry run: ${found} venue(s) would be closed — ${json.confirmed_closed.map(v => v.name).join(', ')}`;
            } else {
              statusEl.textContent = `Applied: ${json.closed_venue_count} venue(s) closed, ${json.archived_pick_count} pick(s) archived.`;
              setTimeout(loadPipeline, 1000);
            }
          } else {
            statusEl.textContent = `Error: ${JSON.stringify(json)}`;
          }
        } catch (err) {
          if (statusEl) statusEl.textContent = `Network error: ${err.message}`;
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    };
    wireVerifyBtn('pipeline-verify-btn', true);
    wireVerifyBtn('pipeline-verify-apply-btn', false);

    $('pipeline-rotate-btn')?.addEventListener('click', async () => {
      const btn      = $('pipeline-rotate-btn');
      const statusEl = $('pipeline-status');
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.textContent = 'Rotating tonight pick…';
      try {
        const r    = await fetch(`${BASE}/functions/v1/rotate-tonight`, {
          method: 'POST',
          headers: { apikey: ANON, 'Content-Type': 'application/json' },
          body: '{}',
        });
        const json = await r.json().catch(() => ({}));
        if (r.ok) {
          statusEl.textContent = json.action === 'promoted'
            ? `Promoted: "${json.title}" (${json.day}) is now Tonight.`
            : json.message || 'No eligible pick for today — noop.';
          if (json.action === 'promoted') setTimeout(loadPipeline, 800);
        } else {
          statusEl.textContent = `Error: ${JSON.stringify(json)}`;
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = `Network error: ${err.message}`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    /* ── Backfill embeddings button ── */
    $('pipeline-embed-btn')?.addEventListener('click', async () => {
      if (!hasKey()) { alert('Service key required.'); return; }
      const btn      = $('pipeline-embed-btn');
      const statusEl = $('pipeline-embed-status');
      if (btn) btn.disabled = true;
      if (statusEl) { statusEl.style.display = ''; statusEl.textContent = 'Embedding missing picks — takes up to 1 min…'; }
      try {
        const r    = await fetch(`${BASE}/functions/v1/embed-picks`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}` },
          body:    JSON.stringify({ city: currentCity, limit: 200 }),
        });
        const json = await r.json().catch(() => ({}));
        if (r.ok) {
          if (statusEl) statusEl.textContent =
            json.embedded === 0
              ? 'All picks are already embedded.'
              : `Embedded ${json.embedded} pick${json.embedded !== 1 ? 's' : ''} (model: ${json.model}).`;
        } else {
          if (statusEl) statusEl.textContent = `Error: ${JSON.stringify(json)}`;
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = `Network error: ${err.message}`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    /* ── Edit modal wiring ── */
    $('modal-form')?.addEventListener('submit', saveModal);
    $('modal-cancel')?.addEventListener('click', closeModal);
    $('modal-close')?.addEventListener('click',  closeModal);
    $('modal-archive')?.addEventListener('click', archivePick);

    /* Image file → local preview */
    $('mf-image')?.addEventListener('change', (e) => {
      const file    = e.target.files?.[0];
      const preview = $('mf-image-preview');
      if (!file || !preview) return;
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${url}" alt="Preview" />`;
    });

    /* Close pick modal on backdrop click or Escape */
    $('admin-modal')?.addEventListener('click', (e) => {
      if (e.target === $('admin-modal')) closeModal();
    });

    /* ── Venues section ── */
    const venuesSearch  = $('venues-search');
    const venuesResults = $('venues-results');
    venuesSearch?.addEventListener('input', () =>
      searchVenues(venuesSearch.value.trim(), venuesResults)
    );
    venuesResults?.addEventListener('click', (e) => {
      const li = e.target.closest('.admin-result');
      if (!li) return;
      const venue = venueSearchCache.find(v => v.id === li.dataset.id);
      if (venue) { openVenueModal(venue); venuesSearch.value = ''; venuesResults.hidden = true; }
    });
    $('venues-new-btn')?.addEventListener('click', () => openVenueModal(null));

    /* Venue modal wiring */
    $('vmodal-form')?.addEventListener('submit',  saveVenueModal);
    $('vmodal-cancel')?.addEventListener('click', closeVenueModal);
    $('vmodal-close')?.addEventListener('click',  closeVenueModal);
    $('admin-venue-modal')?.addEventListener('click', (e) => {
      if (e.target === $('admin-venue-modal')) closeVenueModal();
    });

    /* ── "Enrich now" button inside venue modal ── */
    $('vmodal-enrich-btn')?.addEventListener('click', async () => {
      if (!hasKey()) { alert('Service key required.'); return; }
      const name = $('vmf-name').value.trim();
      if (!name) { setVenueModalStatus('Save the venue first.', true); return; }
      const city   = $('vmf-city').value || currentCity;
      const btn    = $('vmodal-enrich-btn');
      if (btn) btn.disabled = true;
      setVenueModalStatus('Enriching from Wikidata…');
      try {
        const r    = await fetch(`${BASE}/functions/v1/enrich-venues`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}` },
          body:    JSON.stringify({ city, venue_key: name.toLowerCase(), limit: 1 }),
        });
        const json = await r.json().catch(() => ({}));
        if (r.ok) {
          const res = json.results?.[0];
          setVenueModalStatus(
            res ? `Enriched — source: ${res.source}${res.wikidata_id ? ', ' + res.wikidata_id : ''}` : 'No data found.'
          );
          /* Reload enrichment fields from venue_details */
          const vdRows = await VD_GET(
            `city=eq.${encodeURIComponent(city)}&venue_key=eq.${encodeURIComponent(name.toLowerCase())}` +
            `&select=wikidata_id,short_desc,opening_hours,phone,business_status,manual_lock&limit=1`
          );
          const vd = Array.isArray(vdRows) ? vdRows[0] : null;
          if (vd) {
            $('vmf-wikidata').value        = vd.wikidata_id     || '';
            $('vmf-short-desc').value      = vd.short_desc      || '';
            $('vmf-opening-hours').value   = vd.opening_hours   || '';
            $('vmf-phone').value           = vd.phone           || '';
            const bsEl = $('vmf-business-status');
            if (bsEl) bsEl.value = vd.business_status || '';
            if ($('vmf-manual-lock')) $('vmf-manual-lock').checked = !!vd.manual_lock;
          }
        } else {
          setVenueModalStatus(`Error: ${JSON.stringify(json)}`, true);
        }
      } catch (err) {
        setVenueModalStatus(`Network error: ${err.message}`, true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    /* ── Venue enrichment section ── */
    loadEnrichmentList(0);
    $('enrichment-refresh-btn')?.addEventListener('click', () => loadEnrichmentList(0));

    $('enrichment-run-btn')?.addEventListener('click', async () => {
      if (!hasKey()) { alert('Service key required.'); return; }
      const btn      = $('enrichment-run-btn');
      const statusEl = $('enrichment-status');
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.textContent = 'Running enrichment — this may take 1–2 minutes…';
      try {
        const r    = await fetch(`${BASE}/functions/v1/enrich-venues`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}` },
          body:    JSON.stringify({ city: currentCity, limit: 50 }),
        });
        const json = await r.json().catch(() => ({}));
        if (r.ok) {
          if (statusEl) statusEl.textContent =
            `Done — ${json.processed ?? 0} venues processed.`;
          await loadEnrichmentList(0);
        } else {
          if (statusEl) statusEl.textContent = `Error: ${JSON.stringify(json)}`;
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = `Network error: ${err.message}`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    /* ── Discovery review queue ── */
    $('review-refresh-btn')?.addEventListener('click', () => loadReviewQueue());

    /* Delegation for Approve / Edit / Reject on each review row. */
    $('review-list')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-review-action]');
      if (!btn) return;
      if (!hasKey()) { alert('Service key required.'); return; }
      const row = btn.closest('.review-row');
      const id  = row?.dataset.id;
      if (!id) return;

      const action = btn.dataset.reviewAction;

      /* Fetch the full pick row so Edit can populate the modal and
         Approve can compute the cleaned title. */
      const picks = await GET(`id=eq.${encodeURIComponent(id)}&limit=1`);
      const pick  = Array.isArray(picks) ? picks[0] : null;
      if (!pick) { alert('Pick not found.'); await loadReviewQueue(); return; }

      if (action === 'edit') {
        openModal(pick);
        return;
      }

      if (action === 'approve') {
        btn.disabled = true; btn.textContent = 'Approving…';
        const ok = await approveReview(id, pick);
        if (ok) await Promise.all([loadReviewQueue(), loadAll()]);
        else { btn.disabled = false; btn.textContent = 'Approve'; }
        return;
      }

      if (action === 'reject') {
        if (!confirm(`Reject "${stripPendingSuffix(pick.title) || pick.id}"?\n\nArchived; will not appear anywhere.`)) return;
        btn.disabled = true; btn.textContent = 'Rejecting…';
        const ok = await rejectReview(id);
        if (ok) await Promise.all([loadReviewQueue(), loadAll()]);
        else { btn.disabled = false; btn.textContent = 'Reject'; }
      }
    });

    /* Delegation: lock/unlock toggle buttons in enrichment list */
    $('enrichment-list')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.admin-btn--lock-toggle');
      if (!btn) return;
      if (!hasKey()) { alert('Service key required.'); return; }
      const vdId  = btn.dataset.vdId;
      const isLocked = btn.dataset.locked === '1';
      const newLock  = !isLocked;
      const key      = getKey();
      const r = await fetch(`${BASE}/rest/v1/venue_details?id=eq.${encodeURIComponent(vdId)}`, {
        method:  'PATCH',
        headers: {
          apikey: key, Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ manual_lock: newLock }),
      });
      if (r.ok) await loadEnrichmentList(vePage);
    });

    /* ── Curators section ── */
    $('curator-new-btn')?.addEventListener('click', () => openCuratorModal(null));
    $('curator-save-btn')?.addEventListener('click', saveCuratorModal);
    $('curator-modal-close')?.addEventListener('click',  closeCuratorModal);
    $('curator-modal-cancel')?.addEventListener('click', closeCuratorModal);
    $('curator-delete-btn')?.addEventListener('click', async () => {
      if (!modalCurator) return;
      if (!confirm(`Delete curator "${modalCurator.handle}"?\n\nThis does not delete their picks.`)) return;
      if (!hasKey()) { alert('Service key required.'); return; }
      const key = getKey();
      const res = await fetch(
        `${BASE}/rest/v1/curators?handle=eq.${encodeURIComponent(modalCurator.handle)}`,
        { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (res.ok) { closeCuratorModal(); await loadCurators(); }
    });
    $('curator-modal')?.addEventListener('click', (e) => {
      if (e.target === $('curator-modal')) closeCuratorModal();
    });
    $('curators-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-curator-handle]');
      if (!btn) return;
      const curator = curatorsList.find(c => c.handle === btn.dataset.curatorHandle);
      if (curator) openCuratorModal(curator);
    });

    /* Escape closes whichever modal is open */
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('curator-modal')?.hidden) { closeCuratorModal(); return; }
      if (!$('admin-venue-modal')?.hidden) { closeVenueModal(); return; }
      if (!$('admin-modal')?.hidden)       { closeModal();      return; }
    });

    /* ── Close all dropdowns on outside click ── */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.admin-search-row')) {
        document.querySelectorAll('.admin-results').forEach(r => { r.hidden = true; });
      }
    });
  };

  document.addEventListener('DOMContentLoaded', init);
})();
