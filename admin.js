/* ============================================================
   WanderAlt — Admin curation panel
   ------------------------------------------------------------
   Reads  via anon key (SELECT-only RLS).
   Writes via service role key (localStorage, localhost only).
   Auth   via Supabase email+password.
   ============================================================ */
(() => {
  const BASE  = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
  const ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';
  const CITIES = ['tallinn', 'helsinki', 'riga'];

  /* ── Helpers ─────────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);

  /* HTML-escape every DB-sourced interpolation, including the single quote.
     Discovery rows carry scraped text and this panel holds the service-role
     key, so it uses the same escaping contract as the public pages. */
  const escAttr = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
  /* One anon read + one service-key write; every table-specific wrapper
     below is a thin alias. */
  const sbRead = (pathQs) =>
    fetch(`${BASE}/rest/v1/${pathQs}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    }).then(r => r.json());

  /* opts: method ('PATCH'), prefer ('return=minimal'), label,
     onError: 'alert' (default — read body, alert + console),
              'log'    (read body, console only — fire-and-forget writes),
              'ignore' (do NOT touch the body; caller inspects the
                        Response itself, e.g. to show a status line).
     Returns the Response, or null when no service key is pasted. */
  const sbWrite = async (pathQs, body, opts = {}) => {
    const { method = 'PATCH', prefer = 'return=minimal',
            label = 'Write', onError = 'alert' } = opts;
    if (!hasKey()) {
      if (onError === 'alert') alert('Paste your service role key first.');
      else console.warn(`${label}: service key required`);
      return null;
    }
    const key = getKey();
    const r = await fetch(`${BASE}/rest/v1/${pathQs}`, {
      method,
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: prefer,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok && onError !== 'ignore') {
      const msg = await r.text();
      console.error(`${label} failed`, msg);
      if (onError === 'alert') alert(`${label} failed.\n\n${msg}`);
    }
    return r;
  };

  const GET       = (qs) => sbRead(`picks?${qs}`);
  const PATCH     = (filter, body) => sbWrite(`picks?${filter}`, body);
  const POST_PICK = (body) => sbWrite('picks', body,
    { method: 'POST', prefer: 'return=representation', label: 'Create' });

  /* ── State ──────────────────────────────────────────────── */
  let allPicks   = [];
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
               'valid_until,quote,handle,image_url,' +
               'lat,lng,address,coords_source,coords_locked' +
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
           <span>${escAttr(p.title)}</span>
           <span class="meta">${escAttr(p.venue)} &middot; ${escAttr(p.neighborhood)}</span>
           <button class="admin-btn--edit" data-id="${escAttr(p.id)}"
                   aria-label="Edit ${escAttr(p.title)}" title="Edit">&#9998;</button>
           <button class="admin-btn--rm" data-id="${escAttr(p.id)}" data-field="tonight"
                   aria-label="Remove tonight flag">&times;</button>
         </div>`
      : `<p class="meta admin-empty">None set.</p>`;
  };

  /* ══════════════════════════════════════════════════════════
     THIS WEEK RENDERER
     ══════════════════════════════════════════════════════════ */
  const DAY_ORDER = ['Tonight', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const getFilteredPicks = () => {
    let picks = allPicks.filter(x => x.this_week);
    if (twState.kindFilter) picks = picks.filter(p => p.kind === twState.kindFilter);
    if (twState.dayFilter)  picks = picks.filter(p => p.day  === twState.dayFilter);
    if (twState.dateFrom)   picks = picks.filter(p => p.valid_until && p.valid_until >= twState.dateFrom);
    if (twState.dateTo)     picks = picks.filter(p => p.valid_until && p.valid_until <= twState.dateTo);
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
      count.textContent = `${total}${note}`;
    }

    if (ctrl) {
      const kinds = [...new Set(all.map(p => p.kind).filter(Boolean))].sort();
      const days  = [...new Set(all.map(p => p.day).filter(Boolean))]
        .sort((a, b) => (DAY_ORDER.indexOf(a) + 1 || 99) - (DAY_ORDER.indexOf(b) + 1 || 99));

      ctrl.innerHTML = `
        <div class="tw-filter-bar">
          <select id="tw-kind" aria-label="Filter by kind">
            <option value="">All kinds</option>
            ${kinds.map(k => `<option value="${escAttr(k)}" ${twState.kindFilter === k ? 'selected' : ''}>${escAttr(k)}</option>`).join('')}
          </select>
          <select id="tw-day" aria-label="Filter by day">
            <option value="">All days</option>
            ${days.map(d => `<option value="${escAttr(d)}" ${twState.dayFilter === d ? 'selected' : ''}>${escAttr(d)}</option>`).join('')}
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
          const dateBit = p.valid_until ? ` &middot; until&nbsp;${escAttr(p.valid_until.slice(0, 10))}` : '';
          const dayBit  = p.day ? ` &middot; ${escAttr(p.day)}` : '';
          return `<li class="admin-pick-row">
            <span>${escAttr(p.title)}</span>
            <span class="meta">${escAttr(p.venue)} &middot; ${escAttr(p.kind) || '—'}${dayBit}${dateBit}</span>
            <button class="admin-btn--edit" data-id="${escAttr(p.id)}"
                    aria-label="Edit ${escAttr(p.title)}" title="Edit">&#9998;</button>
            <button class="admin-btn--rm" data-id="${escAttr(p.id)}" data-field="this_week"
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
    if (apState.unpinnedOnly) p = p.filter(x => x.lat == null || x.lng == null);
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
      const unpinned = allPicks.filter(x => x.lat == null || x.lng == null).length;
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
            ${kinds.map(k => `<option value="${escAttr(k)}" ${apState.kindFilter === k ? 'selected' : ''}>${escAttr(k)}</option>`).join('')}
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
          const noPin = (p.lat == null || p.lng == null) ? ' <em class="admin-pick-row__noPin">(unpinned)</em>' : '';
          return `<li class="admin-pick-row">
            <span>${escAttr(p.title)}${noPin}</span>
            <span class="meta">${escAttr(meta)}${flags ? ` &nbsp;<em class="admin-pick-row__flags">${flags}</em>` : ''}</span>
            <button class="admin-btn--edit" data-id="${escAttr(p.id)}"
                    aria-label="Edit ${escAttr(p.title)}" title="Edit">&#9998;</button>
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
    $('mf-image-url').value    = pick?.image_url    || '';
    $('mf-image').value        = '';
    $('mf-tonight').checked    = !!pick?.tonight;
    $('mf-thisweek').checked   = !!pick?.this_week;

    const preview = $('mf-image-preview');
    if (preview) {
      /* escAttr, not raw: image_url can come from scraped sources, and this panel's
         localStorage holds the service-role key — an attribute break-out here
         would hand over the whole database. */
      preview.innerHTML = pick?.image_url
        ? `<img src="${escAttr(pick.image_url)}" alt="Current image" />`
        : '';
    }

    /* Pin position editor — seed and render. */
    initPinMap(
      pick?.lat ?? null,
      pick?.lng ?? null,
      pick?.address ?? '',
      !!pick?.coords_locked,
    );

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('mf-title').focus(), 50);
  };

  /* ──────────────────────────────────────────────────────────────
     PIN POSITION EDITOR (MapLibre)
     A draggable marker on a small basemap inside the pick modal.
     dragend → hidden #mf-lat / #mf-lng. "Lock coords" sets
     picks.coords_locked, marking the placement as authoritative.
     ────────────────────────────────────────────────────────────── */
  const PIN_DEFAULT_CENTER = [24.7536, 59.4370]; /* Tallinn */
  let pinMap = null;        /* maplibregl.Map */
  let pinMarker = null;     /* maplibregl.Marker */
  let pinManualMove = false; /* set true once the user drags the marker */

  const fmtCoords = (lat, lng) =>
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  const setPinCoords = (lat, lng, address) => {
    const latEl  = $('mf-lat');
    const lngEl  = $('mf-lng');
    const txtEl  = $('mf-pin-coords');
    const addrEl = $('mf-pin-address');
    if (!latEl || !lngEl) return;
    if (lat == null || lng == null) {
      latEl.value = ''; lngEl.value = '';
      if (txtEl)  txtEl.textContent  = 'not placed';
      if (addrEl) addrEl.textContent = '';
      if (pinMarker) pinMarker.remove();
      pinMarker = null;
      return;
    }
    latEl.value = String(lat);
    lngEl.value = String(lng);
    if (txtEl)  txtEl.textContent  = fmtCoords(lat, lng);
    if (addrEl) addrEl.textContent = address || '';
  };

  const placeMarker = (lat, lng) => {
    if (!pinMap) return;
    if (pinMarker) pinMarker.setLngLat([lng, lat]);
    else {
      pinMarker = new maplibregl.Marker({ draggable: true, color: '#055959' })
        .setLngLat([lng, lat])
        .addTo(pinMap);
      pinMarker.on('dragend', () => {
        const ll = pinMarker.getLngLat();
        pinManualMove = true;
        setPinCoords(ll.lat, ll.lng, '');
      });
    }
  };

  const initPinMap = (lat, lng, address, locked) => {
    pinManualMove = false;
    const lockedEl = $('mf-coords-locked');
    if (lockedEl) lockedEl.checked = !!locked;
    setPinCoords(lat ?? null, lng ?? null, address ?? '');

    if (!pinMap) {
      if (typeof window.maplibregl === 'undefined') {
        /* maplibre-loader.js has not finished (or failed): say so, and
           retry if it announces itself. */
        const el = $('mf-pin-map');
        if (el) el.innerHTML = '<div style="padding:var(--s-4);font-size:11px;color:#888">MapLibre not loaded — coords editable via lat/lng above.</div>';
        document.addEventListener('wa:maplibre-ready', () => {
          if (el) el.innerHTML = '';
          initPinMap(lat, lng, address, locked);
        }, { once: true });
        return;
      }
      pinMap = new maplibregl.Map({
        container: 'mf-pin-map',
        style:     './map-style.json',
        center:    PIN_DEFAULT_CENTER,
        zoom:      12,
        /* The modal is narrow; the stock attribution control crowds the
           corner even in "compact" mode. Disable it here and surface the
           OSM credit once below the map (see .admin-pin-map__attr). */
        attributionControl: false,
        dragRotate: false,
      });
      pinMap.touchZoomRotate.disableRotation();
      pinMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      /* Click anywhere → drop the marker there (places-without-coords flow). */
      pinMap.on('click', (e) => {
        const { lat, lng } = e.lngLat;
        placeMarker(lat, lng);
        pinManualMove = true;
        setPinCoords(lat, lng, '');
      });
    }

    if (lat != null && lng != null) {
      placeMarker(lat, lng);
      /* Defer slightly so the modal layout settles before MapLibre measures.
         Without this the map can boot at 0×0 inside the hidden modal. */
      requestAnimationFrame(() => {
        pinMap.resize();
        pinMap.easeTo({ center: [lng, lat], zoom: 15, duration: 0 });
      });
    } else if (pinMarker) {
      pinMarker.remove(); pinMarker = null;
      requestAnimationFrame(() => pinMap && pinMap.resize());
    } else {
      requestAnimationFrame(() => pinMap && pinMap.resize());
    }
  };

  /* Reset button — clear the pick's coords. */
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'mf-pin-clear') {
      setPinCoords(null, null);
      const lockedEl = $('mf-coords-locked');
      if (lockedEl) lockedEl.checked = false;
      pinManualMove = true;
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
      handle:       $('mf-handle').value.trim() || null,
      day:          $('mf-day').value           || null,
      valid_until:  $('mf-valid-until').value   || null,
      quote:        $('mf-quote').value.trim()  || null,
      tonight:      $('mf-tonight').checked,
      this_week:    $('mf-thisweek').checked,
    };

    /* Pin position — real lat/lng from the MapLibre editor; empty inputs
       clear them. A user drag (pinManualMove) implies the placement is authoritative,
       so we also tag the source as 'manual'. coords_locked is the editor's
       explicit "don't touch this" switch. */
    const latRaw = $('mf-lat')?.value;
    const lngRaw = $('mf-lng')?.value;
    const lat    = latRaw === '' ? null : Number(latRaw);
    const lng    = lngRaw === '' ? null : Number(lngRaw);
    if (lat !== null && Number.isFinite(lat) && lng !== null && Number.isFinite(lng)) {
      data.lat = lat;
      data.lng = lng;
      if (pinManualMove) data.coords_source = 'manual';
    } else if (latRaw === '' && lngRaw === '') {
      data.lat = null;
      data.lng = null;
      data.address = null;
      data.coords_source = null;
    }
    data.coords_locked = !!$('mf-coords-locked')?.checked;

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
      `<li class="admin-result" data-id="${escAttr(p.id)}" role="option" tabindex="0">
         ${escAttr(p.title)}
         <span class="meta">&middot; ${escAttr(p.venue)}${p.kind ? ' &middot; ' + escAttr(p.kind) : ''}</span>
       </li>`
    ).join('');
  };

  /* ══════════════════════════════════════════════════════════
     VENUES
     ══════════════════════════════════════════════════════════ */
  const VENUES_GET = (qs) => sbRead(`venues?${qs}`);

  const VENUES_PATCH = (id, body) =>
    sbWrite(`venues?id=eq.${encodeURIComponent(id)}`, body, { label: 'Venue update' });

  const VENUES_POST = (body) => sbWrite('venues', body,
    { method: 'POST', prefer: 'return=representation', label: 'Create venue' });

  /* ── venue_details REST helpers ─ */
  const VD_GET = (qs) => sbRead(`venue_details?${qs}`);

  const VD_UPSERT = (body) => sbWrite('venue_details', body,
    { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      label: 'VD upsert', onError: 'log' });

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
    $('vmf-address').value      = '';
    $('vmf-image-url').value    = venue?.image_url    || '';
    $('vmf-status').value       = venue?.status       || 'active';

    /* Clear detail fields first; async-populate from venue_details */
    $('vmf-wikidata').value      = '';
    $('vmf-short-desc').value    = '';
    $('vmf-opening-hours').value = '';

    if (venue?.name) {
      const vkey = venue.name.toLowerCase();
      const vcity = venue.city || currentCity;
      VD_GET(
        `city=eq.${encodeURIComponent(vcity)}` +
        `&venue_key=eq.${encodeURIComponent(vkey)}` +
        `&select=address,wikidata_id,short_desc,opening_hours,phone,business_status&limit=1`
      ).then(rows => {
        const vd = Array.isArray(rows) ? rows[0] : null;
        if (!vd) return;
        $('vmf-address').value         = vd.address         || '';
        $('vmf-wikidata').value        = vd.wikidata_id     || '';
        $('vmf-short-desc').value      = vd.short_desc      || '';
        $('vmf-opening-hours').value   = vd.opening_hours   || '';
        $('vmf-phone').value           = vd.phone           || '';
        const bsEl = $('vmf-business-status');
        if (bsEl) bsEl.value = vd.business_status || '';
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
      /* Also upsert venue_details with the detail fields */
      const latVal2 = parseFloat($('vmf-lat').value);
      const lngVal2 = parseFloat($('vmf-lng').value);
      const vdRow   = {
        city:          data.city,
        venue_key:     name.toLowerCase(),
        display_name:  name,
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
          '&select=id,name,kind,neighborhood,city,lat,lng,image_url,status'
        );
        if (!Array.isArray(hits) || !hits.length) { resultsEl.hidden = true; return; }
        venueSearchCache = hits;
        resultsEl.hidden  = false;
        resultsEl.innerHTML = hits.map(v => {
          const detail = [v.kind, v.neighborhood].filter(Boolean).join(' · ');
          return `<li class="admin-result" data-id="${escAttr(v.id)}" role="option" tabindex="0">
            ${escAttr(v.name)}${detail ? ` <span class="meta">&middot; ${escAttr(detail)}</span>` : ''}
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
        `&select=id,name,kind,neighborhood,city,status,lat,lng,image_url`,
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
            ? ` <em>(possibly closed)</em>` : '';
          return `<li class="admin-pick-row">
            <span>${escAttr(v.name)}</span>
            <span class="meta">${escAttr(meta)}${closed}</span>
            <button class="admin-btn--edit admin-btn--edit-venue" data-venue-id="${escAttr(v.id)}"
                    aria-label="Edit ${escAttr(v.name)}" title="Edit">&#9998;</button>
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
      if (list) list.innerHTML = `<li class="meta" style="color:var(--c-accent);padding:var(--s-3) 0">Error: ${escAttr(err.message)}</li>`;
      if ($('venues-count')) $('venues-count').textContent = '';
    }
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
      const [picksRes, unpinnedRes] = await Promise.all([
        fetch(`${BASE}/rest/v1/picks?city=eq.${city}&archived_at=is.null&select=id`,
              { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
        fetch(`${BASE}/rest/v1/picks?city=eq.${city}&archived_at=is.null` +
              `&or=(lat.is.null,lng.is.null)&select=id`,
              { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
      ]);

      const total    = countHeader(picksRes);
      const unpinned = countHeader(unpinnedRes);

      if (el('stat-picks'))    el('stat-picks').textContent    = `${total ?? '?'} picks`;
      if (el('stat-unpinned')) {
        el('stat-unpinned').textContent = `${unpinned ?? '?'} unpinned`;
        el('stat-unpinned').className   =
          `admin-stat-badge${unpinned > 0 ? ' admin-stat-badge--warn' : ''}`;
      }
    } catch { /* silently absent */ }
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
        await loadAll();
        loadVenuesList(0);
        loadStats();
      });
    }

    /* ── Stats strip ── */
    loadStats();

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
    loadVenuesList(0);

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
            `<li class="admin-result" data-id="${escAttr(v.id)}" data-name="${escAttr(v.name)}"
                 role="option" tabindex="0">
               ${escAttr(v.name)}${v.kind ? ` <span class="meta">&middot; ${escAttr(v.kind)}</span>` : ''}
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

    /* Escape closes whichever modal is open */
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
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
