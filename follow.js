/* ============================================================
   follow.js — WA.Follows.
   ------------------------------------------------------------
   localStorage-only follow store, same shape as WA.Bookmarks. Drives
   "Only sources I follow" on Tonight and the list on You.

   A follow is keyed by identity, never by a typed name:
     place:<places.id>      a venue
     src:<handle>           a source or organiser (lowercase, no @)
   The value kept is the label shown on You. Follows saved before ids
   existed are bare names (a venue name or an @handle); migrate() turns
   each into an id once the catalogue is in, and matchesEvent() still
   honours the bare form until then.

   Public API (window.WA.Follows):
     get()               → { id: label, … }
     has(id)             → boolean
     set(id, on, label)  → write; dispatches 'wa:follows-changed'
     toggle(id, label)   → flips and returns the new state
     keys()              → [ id, … ]
     label(id)           → the stored label
     placeId(place), sourceId(handle) → the ids above
     matchesEvent(e)     → true when e's venue or source is followed
     migrate(places)     → bare names to ids; returns how many changed
     feedUrl(id)         → calendar-feed URL for a place, source or saved search
     searchId(state)     → search:… for kinds / free / English, '' when none is set
   ============================================================ */
window.WA = window.WA || {};

window.WA.Follows = (() => {
  'use strict';

  const LOCAL_KEY = 'wa:follows';

  /* Follows are per-city like bookmarks: the same venue can exist in
     two cities, and a reader who follows a Riga venue should not see
     it counted while browsing Tallinn. */
  const city = () => (window.WA && window.WA.CITY) || 'tallinn';

  const fold = (s) => String(s == null ? '' : s).toLowerCase().trim();
  const placeId = (place) => (place && place.id ? `place:${place.id}` : '');
  const sourceId = (handle) => {
    const h = fold(handle).replace(/^@/, '');
    return h ? `src:${h}` : '';
  };
  const isId = (k) => k.startsWith('place:') || k.startsWith('src:') || k.startsWith('search:');

  /* A saved search is a follow too: search:kind=gig,club&free=1&english=1.
     Kinds sorted, so the same search is always the same id. Only these three
     filters, because they are facts on the event and the calendar feed and
     the email can read them the same way. */
  const searchId = (s) => {
    const kinds = [...((s && s.kinds) || [])].map(k => String(k).toLowerCase().trim()).filter(k => /^[a-z_]{2,20}$/.test(k)).sort();
    const parts = [];
    if (kinds.length) parts.push(`kind=${kinds.join(',')}`);
    if (s && s.free) parts.push('free=1');
    if (s && s.english) parts.push('english=1');
    return parts.length ? `search:${parts.join('&')}` : '';
  };
  const parseSearch = (id) => {
    const p = new URLSearchParams(String(id || '').replace(/^search:/, ''));
    return { kinds: (p.get('kind') || '').split(',').filter(Boolean), free: p.get('free') === '1', english: p.get('english') === '1' };
  };
  const matchesSearch = (e, spec) => !!e && (!spec.kinds.length || spec.kinds.includes(String(e.kind || '').toLowerCase())) &&
    (!spec.free || e.isFree === true || (e.priceMin != null && Number(e.priceMin) === 0)) &&
    (!spec.english || (e.eventLanguages || []).includes('en'));

  /* An id is stored as given; a bare name is lowercased and trimmed. */
  const keyOf = (id) => {
    const s = String(id == null ? '' : id).trim();
    if (!s) return '';
    return `${city()}|${isId(s) ? s : s.toLowerCase()}`;
  };

  const readAll = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
    catch (_) { return {}; }   /* corrupt or blocked: behave as empty */
  };

  const writeAll = (store) => {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(store)); }
    catch (_) { /* private mode or quota: following degrades, nothing breaks */ }
  };

  /* Only the active city's entries, keyed without the city prefix. */
  const get = () => {
    const prefix = `${city()}|`;
    const out = {};
    const all = readAll();
    for (const k of Object.keys(all)) {
      if (all[k] && k.startsWith(prefix)) out[k.slice(prefix.length)] = all[k];
    }
    return out;
  };

  const has = (id) => {
    const k = keyOf(id);
    return !!(k && readAll()[k]);
  };

  const changed = (id, on) => document.dispatchEvent(new CustomEvent('wa:follows-changed', {
    detail: { source: String(id), following: !!on },
  }));

  /* ── The account copy ───────────────────────────────────────
     Signed in, an id follow is also a row in `follows` (own rows only), so
     the email alerts know what to watch. A bare name is never synced. */
  const signedIn = () => !!(window.WA.Auth && window.WA.Auth.isSignedIn && window.WA.Auth.isSignedIn());
  const base = () => window.WA.BASE_URL || '';
  const cloud = async (id, on, text) => {
    if (!signedIn() || !isId(String(id))) return;
    const headers = window.WA.Auth.getAuthHeaders();
    try {
      if (on) {
        await fetch(`${base()}/rest/v1/follows`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({ follow_id: String(id), label: typeof text === 'string' ? text.slice(0, 80) : null, city: city() }),
        });
      } else {
        await fetch(`${base()}/rest/v1/follows?follow_id=eq.${encodeURIComponent(String(id))}`, { method: 'DELETE', headers });
      }
    } catch (_) { /* the local follow stands */ }
  };

  const set = (id, on, label) => {
    const k = keyOf(id);
    if (!k) return false;
    const all = readAll();
    if (on) all[k] = (typeof label === 'string' && label.trim()) ? label.trim().slice(0, 80) : (all[k] || true);
    else delete all[k];
    writeAll(all);
    cloud(String(id), !!on, typeof all[k] === 'string' ? all[k] : label);
    changed(id, on);
    return !!on;
  };

  const toggle = (id, label) => set(id, !has(id), label);

  const keys = () => Object.keys(get());

  const label = (id) => {
    const v = get()[isId(String(id)) ? String(id) : fold(id)];
    return typeof v === 'string' ? v : '';
  };

  const matchesEvent = (e) => !!e && (
    has(placeId({ id: e.venueId })) || has(sourceId(e.handle)) ||
    (!!e.venue && has(e.venue)) || (!!e.handle && has(e.handle)) ||
    keys().some(k => k.startsWith('search:') && matchesSearch(e, parseSearch(k))));

  /* Bare names from before ids. A name that matches exactly one place
     becomes place:<id>; an @handle becomes src:<handle>. A name that
     matches two places stays as it was rather than guess. */
  const migrate = (places) => {
    const bare = keys().filter(k => !isId(k));
    if (!bare.length) return 0;
    const byName = new Map();
    for (const p of places || []) {
      const n = fold(p && p.name);
      if (!n || !p.id) continue;
      byName.set(n, byName.has(n) ? null : p);
    }
    const all = readAll();
    let n = 0;
    for (const name of bare) {
      const old = keyOf(name);
      let next = '', text = '';
      if (name.startsWith('@')) { next = sourceId(name); text = name; }
      else if (byName.get(name)) { next = placeId(byName.get(name)); text = byName.get(name).name; }
      if (!next) continue;
      delete all[old];
      all[keyOf(next)] = text;
      n++;
    }
    if (n) { writeAll(all); changed('', true); }
    return n;
  };

  /* The calendar feed for one follow. A calendar app does the notifying:
     nothing is sent from here and no account is involved. */
  const feedUrl = (id) => {
    const s = String(id || '');
    const base = `${(window.WA && window.WA.BASE_URL) || ''}/functions/v1/calendar-feed?city=${encodeURIComponent(city())}`;
    if (s.startsWith('place:')) return `${base}&place=${encodeURIComponent(s.slice(6))}`;
    if (s.startsWith('src:')) return `${base}&handle=${encodeURIComponent(`@${s.slice(4)}`)}`;
    if (s.startsWith('search:')) return `${base}&${s.slice(7)}`;
    return '';
  };

  /* Signing in sends this browser's follows up and brings the account's
     follows down, like saves and going. */
  document.addEventListener('wa:signed-in', async () => {
    const mine = get();
    Object.keys(mine).filter(isId).forEach(id => cloud(id, true, mine[id]));
    try {
      const r = await fetch(`${base()}/rest/v1/follows?select=follow_id,label&city=eq.${encodeURIComponent(city())}`, { headers: window.WA.Auth.getAuthHeaders() });
      if (!r.ok) return;
      const all = readAll();
      let n = 0;
      for (const row of await r.json()) {
        const k = keyOf(row.follow_id);
        if (k && !all[k]) { all[k] = row.label || true; n++; }
      }
      if (n) { writeAll(all); changed('', true); }
    } catch (_) { /* offline: the local follows stand */ }
  });

  document.addEventListener('wa:catalog-ready', () => {
    migrate((window.WA._venuesAll || []).length ? window.WA._venuesAll : (window.WA.venues || []));
  });

  return { get, has, set, toggle, keys, label, keyOf, placeId, sourceId, matchesEvent, migrate, feedUrl, searchId, parseSearch, matchesSearch };
})();
