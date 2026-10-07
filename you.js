/* ============================================================
   you.js — You: one short list of settings. Each row names its current
   value and opens what changes it: a panel out of the row for a quick
   choice (language, appearance), a sheet for anything longer. Everything
   is local to the browser; the account only carries saves between devices.
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const G = () => window.WA.Geo;
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n, c) => window.WA.Icon(n, c);
  const toast = (m, l, u) => { if (window.WA.Toast) window.WA.Toast.show(m, l, u); };

  const pool = () => [...(window.WA._catalogAll || []), ...(window.WA._venuesAll || [])];
  const signedIn = () => !!(window.WA.Auth && window.WA.Auth.isSignedIn && window.WA.Auth.isSignedIn());

  /* Notification switches for this device. A missing table (migration not
     applied) leaves `prefs` null and hides the row. */
  let pushState = '';   /* '' until asked; then what WA.Push.state() says */
  let prefs;            /* undefined: not asked yet; null: unavailable; else { weekly, changes, push, tonight } */
  const authHeaders = () => window.WA.Auth.getAuthHeaders();
  const loadPrefs = async () => {
    prefs = null;
    try {
      const r = await fetch(`${window.WA.BASE_URL}/rest/v1/digest_prefs?select=weekly,changes,push,tonight`, { headers: authHeaders() });
      if (r.ok) { const rows = await r.json(); prefs = rows[0] || { weekly: false, changes: false }; }
    } catch (_) { /* offline */ }
    if (window.WA.Push) pushState = await window.WA.Push.state();
    render();
  };
  const savePrefs = async (next) => {
    const before = prefs;
    prefs = next; render();
    try {
      const r = await fetch(`${window.WA.BASE_URL}/rest/v1/digest_prefs?on_conflict=user_id`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ weekly: !!next.weekly, changes: !!next.changes, push: !!next.push, tonight: !!next.tonight }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch (_) { prefs = before; render(); toast('Could not save. Try again later'); }
  };
  const pushOn = () => pushState === 'on' && !!(prefs && prefs.push);
  /* Hidden until the push key is set; an iPhone without the Home Screen app is told why. */
  const pushRows = () => {
    const In = window.WA.Install;
    if (pushState === 'install') return `<p class="wa-note">Alerts need the app on your Home Screen.</p>
      <p><button class="wa-btn wa-btn--pill" type="button" id="install-open" data-from="push">Add to Home Screen</button></p>`;
    if (pushState === 'denied') return `<p class="wa-note">${In && In.standalone() ? 'Open Settings, then Notifications, then WanderAlt, and allow notifications.' : 'Notifications are blocked for this site in your browser settings.'}</p>`;
    if (pushState !== 'on' && pushState !== 'off') return '';
    const on = pushOn();
    return `<button class="wa-switch" type="button" data-push aria-pressed="${on}">
        <span class="wa-switch__text"><span class="wa-switch__title">Notifications on this device</span><span class="wa-switch__sub">Saved plan changes</span></span><span class="wa-switch__track"></span></button>
      <button class="wa-switch" type="button" data-digest="tonight" aria-pressed="${on && !!prefs.tonight}"${on ? '' : ' disabled'}>
        <span class="wa-switch__text"><span class="wa-switch__title">Tonight from followed places</span><span class="wa-switch__sub">At 16:00 when listed</span></span><span class="wa-switch__track"></span></button>
      ${on ? '<p><button class="wa-linkbtn" type="button" id="push-test">Send a test notification</button></p>' : ''}`;
  };

  /* The inbox: notes the alert job wrote for this account, marked read as they appear. */
  let notes;   /* undefined: not asked yet; null: unavailable; else rows */
  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 60) return m < 2 ? 'Just now' : `${m} min ago`;
    if (m < 1440) return `${Math.round(m / 60)} h ago`;
    return `${Math.round(m / 1440)} d ago`;
  };
  const loadNotes = async () => {
    notes = null;
    if (window.WA.Inbox) notes = await window.WA.Inbox.list();
    render();
  };

  /* ── What each row shows ─────────────────────────────────── */
  const tasteWords = () => {
    const opts = R().interests.OPTIONS, ids = R().interests.ids();
    const words = ids.map(id => (opts.find(o => o.id === id) || {}).label).filter(Boolean);
    return words.length ? (words.length > 2 ? `${words[0]}, ${words[1]} +${words.length - 2}` : words.join(', ')) : 'Not set';
  };
  const startWord = () => { const a = G().anchor(); return a ? a.label : G().deviceLoc() ? 'Your location' : 'Whole city'; };
  const langWord = () => (window.WA.Lang ? window.WA.Lang.names[window.WA.Lang.current()] : 'English');
  const themeWord = () => { const T = window.WA.Theme; const o = T && T.OPTIONS.find(x => x.value === T.get()); return o ? o.label : 'Auto'; };
  const followed = () => {
    const F = window.WA.Follows, venues = window.WA._venuesAll || [];
    return (F ? F.keys() : []).map(k => {
      if (k.startsWith('place:')) return venues.find(v => v.id === k.slice(6)) || { name: F.label(k) || 'A venue', __raw: true, key: k };
      if (k.startsWith('search:')) return { name: F.label(k) || 'A saved search', __raw: true, key: k };
      if (k.startsWith('src:')) return { name: F.label(k) || `@${k.slice(4)}`, __raw: true, key: k, source: k.slice(4) };
      return venues.find(v => String(v.name).toLowerCase().trim() === k) || { name: k, __raw: true, key: k };
    });
  };
  const opened = () => { const byId = new Map(pool().map(x => [x.id, x])); return window.WA.Seen.ids().slice().reverse().map(id => byId.get(id)).filter(Boolean).slice(0, 12); };

  const row = (kind, icon, label, value, extra = '') => `<button class="you-row" type="button" data-you="${kind}"${extra}>
      <span class="you-row__ic">${I(icon)}</span><span class="you-row__label">${esc(label)}</span>
      ${value ? `<span class="you-row__value">${value}</span>` : ''}${I('chevron', 'you-row__go')}</button>`;
  const group = (rows) => { const r = rows.filter(Boolean); return r.length ? `<div class="you-group">${r.join('')}</div>` : ''; };

  /* ── Sheets ───────────────────────────────────────────────── */
  const tasteBody = () => {
    const ids = R().interests.ids();
    return `<p class="wa-note">Up to three. Walks lean toward them; nothing is hidden.</p>
      <div class="you-taste" role="group" aria-label="Your taste">${R().interests.OPTIONS.map(o => {
        const on = ids.includes(o.id);
        return `<button class="you-taste__opt" type="button" data-interest="${esc(o.id)}" aria-pressed="${on}"${!on && ids.length >= 3 ? ' disabled' : ''}>
          ${o.picto ? window.WA.Picto(o.picto) : `<span class="you-taste__ic">${I(o.icon || 'globe')}</span>`}<span>${esc(o.label)}</span></button>`;
      }).join('')}</div>`;
  };
  const followingBody = () => {
    const F = window.WA.Follows, list = followed();
    const cal = (k) => { const u = F.feedUrl(k); return u ? `<a class="wa-btn wa-btn--sm wa-btn--quiet" href="${esc(u.replace(/^https?:/, 'webcal:'))}" aria-label="Add this to your calendar">${I('calendar')}<span>Calendar</span></a>` : ''; };
    if (!list.length) return '<p class="wa-note">Follow a place or a source from its page to hear when it lists something new.</p>';
    return `<ul class="you-follows">${list.map(v => {
      const key = v.__raw ? v.key : F.placeId(v);
      const name = v.__raw ? (v.source ? `<a href="source.html?handle=${esc(encodeURIComponent(`@${v.source}`))}">${esc(v.name)}</a>` : esc(v.name))
        : `<a href="detail.html?id=${esc(encodeURIComponent(v.id))}">${esc(v.name)}</a>`;
      return `<li class="you-follow"><span class="you-follow__name" data-notranslate>${name}</span><span class="you-follow__acts">${cal(key)}<button class="wa-btn wa-btn--sm" type="button" data-unfollow="${esc(key)}">Unfollow</button></span></li>`;
    }).join('')}</ul>`;
  };
  const openedBody = () => {
    const list = opened();
    if (!list.length) return '<p class="wa-note">Nothing opened yet.</p>';
    return `<ul class="wa-rows">${list.filter(x => x.title).map(x => R().row(x, { day: true, noThumb: true })).join('')}</ul>
      <ul>${list.filter(x => !x.title).map(v => R().placeRow(v, { pickLabel: false })).join('')}</ul>
      <p><button class="wa-linkbtn" type="button" id="reset">Forget what I've opened</button></p>`;
  };
  const inboxBody = () => !notes || !notes.length ? '<p class="wa-note">Nothing yet. Notes about saved plans arrive here.</p>'
    : `<ul class="wa-inbox">${notes.map(n => `<li><a class="wa-inbox__row${n.read_at ? '' : ' is-new'}" href="${esc(window.WA.UI.safeUrl(n.url) || '#')}">
        <span class="wa-inbox__title">${esc(n.title)}</span><span class="wa-inbox__body">${esc(n.body)}</span><span class="wa-inbox__when">${esc(ago(n.created_at))}</span></a></li>`).join('')}</ul>
      <p class="wa-note">Kept for 30 days</p><p><button class="wa-linkbtn" type="button" id="inbox-clear">Clear inbox</button></p>`;
  const privacyBody = () => `<p class="wa-note">Your saves and history stay in this browser. Signed in, they also live in your account until you delete it.</p>
      <p class="you-links"><a class="wa-link" href="about.html#privacy">The full note</a><a class="wa-link" href="about.html#calendar-feed">Calendar feed</a></p>
      <p><button class="wa-btn wa-btn--pill you-danger" type="button" id="wipe-device">Forget everything on this device</button></p>`;
  const accountBody = () => {
    const email = window.WA.Auth.session && window.WA.Auth.session.email;
    return `<p class="wa-note">${email ? `<span data-notranslate>${esc(email)}</span> · ` : ''}<span>Your saves sync between devices.</span></p>
      <div class="you-acts"><button class="wa-btn wa-btn--pill" type="button" id="signout">Sign out</button>
        <button class="wa-btn wa-btn--pill you-danger" type="button" id="delete-account">Delete account</button></div>`;
  };
  const SHEETS = {
    taste: () => ['Your taste', tasteBody()],
    following: () => ['Following', followingBody()],
    opened: () => ['Recently opened', openedBody()],
    inbox: () => ['Inbox', inboxBody()],
    notifications: () => ['Notifications', pushRows()],
    privacy: () => ['Data and privacy', privacyBody()],
    account: () => ['Account', accountBody()],
  };
  let sheet = null, sheetKind = '', sheetOpener = null;
  const closeSheet = () => { if (sheet && sheet.open) sheet.close(); };
  const openSheet = (kind, opener) => {
    if (sheet || !SHEETS[kind]) return;
    const [title, body] = SHEETS[kind]();
    sheetKind = kind; sheetOpener = opener;
    sheet = document.createElement('dialog');
    sheet.className = 'wa-sheet you-sheet';
    sheet.setAttribute('aria-labelledby', 'you-sheet-title');
    sheet.innerHTML = `<div class="wa-sheet__panel"><div class="wa-sheet__head"><h2 class="wa-sheet__title" id="you-sheet-title">${esc(title)}</h2>
      <button class="wa-iconbtn" type="button" data-you-close aria-label="Close">${I('close')}</button></div>
      <div class="wa-sheet__body" id="you-sheet-body">${body}</div></div>`;
    sheet.addEventListener('close', () => {
      sheet.remove(); sheet = null; sheetKind = '';
      const back = sheetOpener && sheetOpener.isConnected ? sheetOpener : document.querySelector(`[data-you="${kind}"]`);
      if (back) back.focus({ preventScroll: true });
    }, { once: true });
    document.body.append(sheet); sheet.showModal();
    if (kind === 'inbox' && notes && notes.some(n => !n.read_at)) window.WA.Inbox.markRead();
  };
  const refreshSheet = () => {
    if (!sheet || !SHEETS[sheetKind]) return;
    const host = $('you-sheet-body'), focus = document.activeElement && host.contains(document.activeElement) ? document.activeElement : null;
    const key = focus && (focus.dataset.interest || focus.id);
    host.innerHTML = SHEETS[sheetKind]()[1];
    if (key) (host.querySelector(`[data-interest="${CSS.escape(key)}"]`) || $(key))?.focus({ preventScroll: true });
  };

  /* Quick choices pour out of their row (ui-helpers genie). */
  const choices = (kind) => {
    const panel = document.createElement('div');
    panel.className = 'wa-when you-pick';
    if (kind === 'language') {
      const L = window.WA.Lang;
      panel.setAttribute('aria-label', 'Language');
      panel.setAttribute('data-notranslate', '');
      panel.innerHTML = L.supported.map(c => `<button class="wa-when__opt" type="button" data-you-lang="${c}" lang="${c}" aria-pressed="${c === L.current()}"><b>${esc(L.names[c])}</b><small>${esc(L.codes[c])}</small></button>`).join('');
    } else {
      const T = window.WA.Theme;
      panel.setAttribute('aria-label', 'Appearance');
      panel.innerHTML = T.OPTIONS.map(o => `<button class="wa-when__opt" type="button" data-you-theme="${o.value}" aria-pressed="${o.value === T.get()}"><b>${esc(o.label)}</b><small>${esc(o.value === 'auto' ? `Dark from ${T.duskLabel()}` : '')}</small></button>`).join('');
    }
    return panel;
  };

  /* ── The page ─────────────────────────────────────────────── */
  const render = () => {
    const editing = window.WA.StartFrom.editing();
    const inSession = signedIn();
    if (inSession && notes === undefined) loadNotes();
    if (inSession && prefs === undefined) loadPrefs();
    const email = window.WA.Auth.session && window.WA.Auth.session.email;
    const In = window.WA.Install;
    const follows = followed().length, seen = opened().length;
    const unread = notes ? notes.filter(n => !n.read_at).length : 0;
    const push = inSession && prefs && pushRows() ? (pushState === 'denied' ? 'Blocked' : pushState === 'install' ? 'Needs the app' : pushOn() ? 'On' : 'Off') : '';

    const head = inSession
      ? `<button class="you-me" type="button" data-you="account"><span class="you-me__mark" aria-hidden="true">${esc(((email || 'You')[0] || 'Y').toUpperCase())}</span>
          <span class="you-me__text"><strong${email ? ' data-notranslate' : ''}>${esc(email || 'Signed in')}</strong><span>Saves sync to your account</span></span>${I('chevron', 'you-row__go')}</button>`
      : `<section class="you-join">
          <span class="you-join__text"><strong>Keep your saves on every device</strong><span>Optional. No password.</span></span>
          <button class="wa-btn wa-btn--pill wa-btn--primary" type="button" id="signin">Sign in</button>
          ${window.WA.Auth && window.WA.Auth.signInError ? `<p class="you-join__error" role="alert">Sign-in did not finish: ${esc(window.WA.Auth.signInError)}</p>` : ''}
        </section>`;

    $('you-body').innerHTML = `${head}
      ${inSession ? group([
        notes ? row('inbox', 'info', 'Inbox', unread ? `<span class="you-badge">${unread}</span>` : esc(notes.length ? String(notes.length) : '')) : '',
        push ? row('notifications', 'clock', 'Notifications', esc(push)) : '',
      ]) : ''}
      ${group([
        row('taste', 'spark', 'Your taste', esc(tasteWords())),
        row('start', 'locate', 'Start from', `<span${G().anchor() ? ' data-notranslate' : ''}>${esc(startWord())}</span>`, ' aria-haspopup="dialog"'),
        row('language', 'globe', 'Language', `<span data-notranslate>${esc(langWord())}</span>`, ' aria-haspopup="dialog" aria-expanded="false"'),
        row('appearance', 'moon', 'Appearance', esc(themeWord()), ' aria-haspopup="dialog" aria-expanded="false"'),
      ])}
      ${group([
        row('following', 'people', 'Following', follows ? String(follows) : ''),
        row('opened', 'list', 'Recently opened', seen ? String(seen) : ''),
      ])}
      ${group([
        In && In.canOffer() ? `<button class="you-row" type="button" id="install-open" data-from="you"><span class="you-row__ic">${I('plus')}</span><span class="you-row__label">${esc(In.label())}</span>${I('chevron', 'you-row__go')}</button>` : '',
        row('privacy', 'save', 'Data and privacy', ''),
      ])}
      <footer class="wa-foot"><span>WanderAlt · ${esc(R().cityName())}</span><a href="about.html">About</a><a href="mailto:hello@wanderalt.app">hello@wanderalt.app</a></footer>`;
    window.WA.StartFrom.restore(editing);
    refreshSheet();
    /* A link from the Home Screen invitation opens the notifications once they are known. */
    if (location.hash === '#notifications' && push && !sheet) { history.replaceState(null, '', location.pathname); openSheet('notifications'); }
  };

  /* A destructive choice gets its own sheet and its own words, and the
     default focus lands on Cancel. Resolves true only on the action. */
  const confirmSheet = ({ title, text, action }) => new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'wa-sheet';
    d.setAttribute('aria-labelledby', 'confirm-title');
    d.innerHTML = `<div class="wa-sheet__panel">
      <div class="wa-sheet__head"><h2 class="wa-sheet__title" id="confirm-title">${esc(title)}</h2></div>
      <div class="wa-sheet__body"><p class="wa-note">${esc(text)}</p><p class="wa-field__consequence" id="confirm-status" aria-live="polite" role="status"></p></div>
      <div class="wa-sheet__foot">
        <button class="wa-btn wa-btn--quiet" type="button" id="confirm-no" autofocus>Cancel</button>
        <button class="wa-btn wa-btn--pill you-danger you-danger--solid" type="button" id="confirm-yes">${esc(action)}</button>
      </div></div>`;
    document.body.appendChild(d);
    const done = (v) => { if (d.open) d.close(); d.remove(); resolve(v); };
    d.querySelector('#confirm-no').addEventListener('click', () => done(false));
    d.querySelector('#confirm-yes').addEventListener('click', () => done(true));
    d.addEventListener('cancel', (ev) => { ev.preventDefault(); done(false); });
    d.showModal();
  });

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    const lang = hit('[data-you-lang]');
    if (lang) { window.WA.UI.genie.close(true); window.WA.Lang.set(lang.dataset.youLang); return; }
    const theme = hit('[data-you-theme]');
    if (theme) { window.WA.UI.genie.close(true); window.WA.Theme.set(theme.dataset.youTheme); render(); return; }
    if (hit('[data-you-close]')) { closeSheet(); return; }
    const you = hit('[data-you]');
    if (you) {
      const kind = you.dataset.you;
      if (kind === 'start') { window.WA.StartFrom.open(you); return; }
      if (kind === 'language' || kind === 'appearance') {
        if (you.getAttribute('aria-expanded') === 'true') window.WA.UI.genie.close(true);
        else window.WA.UI.genie(you, choices(kind));
        return;
      }
      openSheet(kind, you);
      return;
    }
    const i = hit('[data-interest]');
    if (i) {
      const ids = R().interests.ids(), id = i.dataset.interest;
      R().interests.set(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(0, 3), false);
      render();
      return;
    }
    if (hit('[data-push]') && prefs && window.WA.Push) {
      (async () => {
        if (pushOn()) {
          await window.WA.Push.disable(); pushState = 'off';
          savePrefs({ ...prefs, push: false, tonight: false });
        } else if (await window.WA.Push.enable()) {
          pushState = 'on'; savePrefs({ ...prefs, push: true });
        } else {
          pushState = await window.WA.Push.state(); render();
          toast('Notifications were not allowed');
        }
      })();
      return;
    }
    if (hit('#inbox-clear')) {
      (async () => { if (await window.WA.Inbox.clear()) { notes = []; render(); } else toast('Could not clear. Try again later'); })();
      return;
    }
    const dg = hit('[data-digest]');
    if (dg && prefs) { savePrefs({ ...prefs, [dg.dataset.digest]: !prefs[dg.dataset.digest] }); return; }
    const uf = hit('[data-unfollow]');
    if (uf) { window.WA.Follows.set(uf.dataset.unfollow, false); render(); return; }
    if (hit('#reset')) {
      const had = window.WA.Seen.ids().slice();
      window.WA.Seen.clear();
      render();
      toast('Forgot what you opened', 'Undo', () => { had.forEach(id => window.WA.Seen.mark(id)); render(); });
      return;
    }
    if (hit('#install-open')) { closeSheet(); window.WA.Install.open(hit('#install-open').dataset.from || 'you'); return; }
    if (hit('#push-test')) {
      const b = hit('#push-test');
      window.WA.Push.test().then((ok) => { b.textContent = ok ? 'Sent' : 'Could not send'; setTimeout(() => { b.textContent = 'Send a test notification'; }, 2500); });
      return;
    }
    if (hit('#signin')) { if (window.WA.Auth.openSignIn) window.WA.Auth.openSignIn(); return; }
    if (hit('#signout')) { closeSheet(); window.WA.Auth.signOut().then(render); return; }
    if (hit('#delete-account')) {
      (async () => {
        if (!await confirmSheet({ title: 'Delete your account?', text: 'Your saves, lists, follows, alerts and inbox are removed, and this device forgets them too. This cannot be undone.', action: 'Delete account' })) return;
        if (await window.WA.Auth.deleteAccount()) { location.assign('./index.html'); }
        else toast('Could not delete the account. Nothing was changed');
      })();
      return;
    }
    if (hit('#wipe-device')) {
      (async () => {
        if (!await confirmSheet({ title: 'Forget everything on this device?', text: 'Saves, lists, follows and history are cleared from this browser and you are signed out. An account keeps its saves; sign in to bring them back.', action: 'Forget everything' })) return;
        await window.WA.Auth.signOut();
        await window.WA.Auth.wipeDevice();
        location.assign('./index.html');
      })();
      return;
    }
  });

  document.addEventListener('wa:catalog-ready', render);
  document.addEventListener('wa:seen-changed', render);
  document.addEventListener('wa:start-state', render);
  document.addEventListener('wa:theme-changed', render);
  document.addEventListener('wa:signed-in', render);
  document.addEventListener('wa:signed-out', () => { prefs = undefined; notes = undefined; pushState = ''; closeSheet(); render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
  document.addEventListener('wa:language-changed', render);
})();
