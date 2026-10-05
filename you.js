/* ============================================================
   you.js — You: interests, appearance, follows, history, account.
   ------------------------------------------------------------
   Everything here is local to the browser. The account only carries
   saves between devices; nothing is gated behind it.
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const R = () => window.WA.R;
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n, c) => window.WA.Icon(n, c);
  const toast = (m, l, u) => { if (window.WA.Toast) window.WA.Toast.show(m, l, u); };

  const pool = () => [...(window.WA._catalogAll || []), ...(window.WA._venuesAll || [])];

  /* Notification switches for this device. A missing table (migration not
     applied) leaves `prefs` null and hides the section. */
  let jumped = false;
  const foldOpen = new Set();   /* which folds the reader opened, kept across redraws */
  let pushState = '';   /* '' until asked; then what WA.Push.state() says */
  let prefs;   /* undefined: not asked yet; null: unavailable; else { weekly, changes } */
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
  /* Notifications on this device. Hidden until the push key is set; an
     iPhone that has not added the site to the Home Screen is told why. */
  const pushRows = () => {
    const I = window.WA.Install;
    if (pushState === 'install') return `<p class="wa-state">Needs the Home Screen app</p>
      <p class="wa-note">Alerts need the app on your Home Screen.</p>
      <p style="margin-top:var(--s-3)"><button class="wa-btn wa-btn--sm" type="button" id="install-open" data-from="push">Add to Home Screen</button></p>`;
    if (pushState === 'denied') return `<p class="wa-state">Blocked</p><p class="wa-note">${I && I.standalone() ? 'Open Settings, then Notifications, then WanderAlt, and allow notifications.' : 'Notifications are blocked for this site in your browser settings.'}</p>`;
    if (pushState !== 'on' && pushState !== 'off') return '';
    const on = pushState === 'on' && !!prefs.push;
    return `<p class="wa-state${on ? ' is-on' : ''}">${on ? 'On for this device' : 'Off'}</p>
      <button class="wa-switch" type="button" data-push aria-pressed="${on}">
        <span class="wa-switch__text"><span class="wa-switch__title">Notifications on this device</span><span class="wa-switch__sub">When a saved plan changes</span></span><span class="wa-switch__track"></span></button>
      <button class="wa-switch" type="button" data-digest="tonight" aria-pressed="${on && !!prefs.tonight}"${on ? '' : ' disabled'}>
        <span class="wa-switch__text"><span class="wa-switch__title">Tonight at places you follow</span><span class="wa-switch__sub">One note at 16:00, only when something starts</span></span><span class="wa-switch__track"></span></button>
      ${on ? '<p><button class="wa-linkbtn" type="button" id="push-test">Send a test notification</button></p>' : ''}`;
  };

  /* Add to Home Screen: one slim row near the top for anyone in a browser tab that can offer it. */
  const appSection = () => {
    const I = window.WA.Install;
    if (!I || !I.canOffer()) return '';
    return `<button class="you-app" type="button" id="install-open" data-from="you">
      <span class="you-app__ic">${window.WA.Icon('plus')}</span>
      <span class="you-app__text"><strong>${esc(I.label())}</strong><span>${esc(I.benefit())}</span></span>
      ${window.WA.Icon('chevron')}</button>`;
  };

  /* The inbox: notes the alert job wrote for this account. Rows are read
     once, shown with the unread dot, and marked read as they appear. */
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
    if (notes && notes.some(n => !n.read_at)) window.WA.Inbox.markRead();
  };
  const inboxSection = (signedIn) => {
    if (!signedIn) return '';
    if (notes === undefined) { loadNotes(); return ''; }
    if (!notes) return '';
    return `<section class="wa-sect" id="inbox">${R().sect({ title: 'Inbox', n: notes.length || null, sub: notes.length ? 'Kept for 30 days' : 'Nothing yet.' })}
      ${notes.length ? `<ul class="wa-inbox">${notes.map(n => `<li><a class="wa-inbox__row${n.read_at ? '' : ' is-new'}" href="${esc(window.WA.UI.safeUrl(n.url) || '#')}">
        <span class="wa-inbox__title">${esc(n.title)}</span><span class="wa-inbox__body">${esc(n.body)}</span><span class="wa-inbox__when">${esc(ago(n.created_at))}</span></a></li>`).join('')}</ul>
        <p style="margin-top:var(--s-3)"><button class="wa-linkbtn" type="button" id="inbox-clear">Clear inbox</button></p>` : ''}
    </section>`;
  };

  /* Notifications on this device: opt-in, hidden until the push key is set. */
  const pushSection = (signedIn) => {
    if (!signedIn) return '';
    if (prefs === undefined) { loadPrefs(); return ''; }
    if (!prefs) return '';
    const rows = pushRows();
    return rows ? `<section class="wa-sect" id="notifications">${R().sect({ title: 'Notifications' })}${rows}</section>` : '';
  };


  const render = () => {
    const editing = window.WA.StartFrom.editing();
    const saved = Object.keys((window.WA.Bookmarks && window.WA.Bookmarks.get()) || {}).length;
    const follows = window.WA.Follows ? window.WA.Follows.keys() : [];
    const signedIn = !!(window.WA.Auth && window.WA.Auth.isSignedIn && window.WA.Auth.isSignedIn());
    const ids = R().interests.ids();
    const venues = window.WA._venuesAll || [];
    const byId = new Map(pool().map(x => [x.id, x]));
    const opened = window.WA.Seen.ids().slice().reverse().map(id => byId.get(id)).filter(Boolean).slice(0, 8);
    const F = window.WA.Follows;
    const followed = follows.map(k => {
      if (k.startsWith('place:')) return venues.find(v => v.id === k.slice(6)) || { name: F.label(k) || 'A venue', __raw: true, key: k };
      if (k.startsWith('search:')) return { name: F.label(k) || 'A saved search', __raw: true, key: k };
      if (k.startsWith('src:')) return { name: F.label(k) || `@${k.slice(4)}`, __raw: true, key: k, source: k.slice(4) };
      return venues.find(v => String(v.name).toLowerCase().trim() === k) || { name: k, __raw: true, key: k };
    });
    const cal = (k) => {
      const u = F.feedUrl(k);
      return u ? `<a class="wa-btn wa-btn--sm wa-btn--quiet" href="${esc(u.replace(/^https?:/, 'webcal:'))}" aria-label="Add this to your calendar">${I('calendar')}<span>Calendar</span></a>` : '';
    };

    const fold = (id, title, n, body) => `<details class="you-fold" id="${id}"${foldOpen.has(id) ? ' open' : ''}><summary><span class="you-fold__t">${esc(title)}</span>${n ? `<span class="you-fold__n">${n}</span>` : ''}${I('chevron')}</summary><div class="you-fold__b">${body}</div></details>`;

    const email = window.WA.Auth.session && window.WA.Auth.session.email;
    const head = signedIn
      ? `<section class="you-me"><span class="you-me__mark" aria-hidden="true">${esc(((email || 'You')[0] || 'Y').toUpperCase())}</span>
          <span class="you-me__text"><strong>You</strong>${email ? `<span>${esc(email)}</span>` : ''}</span></section>`
      : `<section class="you-join">
          <h2 class="you-join__title">Keep what you find</h2>
          <p class="you-join__sub">Save places and listings, and get a note when a show you saved changes. No password.</p>
          ${window.WA.Auth && window.WA.Auth.signInError ? `<p class="you-join__sub" role="alert">Sign-in did not finish: ${esc(window.WA.Auth.signInError)}</p>` : ''}
          <div class="you-join__actions">
            <a class="wa-btn" href="${esc(window.WA.Auth && window.WA.Auth.googleHref ? window.WA.Auth.googleHref() : '#')}"><svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.566 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>Google</a>
            <button class="wa-btn wa-btn--primary" type="button" id="signin">Email me a link</button>
          </div>
        </section>`;

    $('you-body').innerHTML = `
      ${head}
      ${appSection()}

      <div class="you-cols">
        ${inboxSection(signedIn)}
        <section class="wa-sect you-int" id="interests">
          <div class="wa-sect__head"><h2 class="wa-sect__title">Your taste</h2><span class="you-int__n">${ids.length} of 3 · routes lean this way</span></div>
          <div class="wa-chips wa-chips--scroll you-int__row">${R().interests.OPTIONS.map(o =>
            `<button class="wa-chip" type="button" data-interest="${esc(o.id)}" aria-pressed="${ids.includes(o.id)}"${!ids.includes(o.id) && ids.length >= 3 ? ' disabled' : ''}>${o.icon === "globe" ? I("globe") : window.WA.Picto(o.icon)}${esc(o.label)}</button>`).join('')}</div>
        </section>

        <section class="wa-sect you-start">
          <h2 class="wa-sect__title">Start from</h2>
          <div id="start-from-field">${window.WA.StartFrom.markup()}</div>
        </section>

        ${pushSection(signedIn)}

        <section class="wa-sect you-folds">
          ${fold('fold-following', 'Following', follows.length || null, followed.length ? `<ul>${followed.map(v => v.__raw
            ? `<li class="wa-place"><span class="wa-place__glyph">${I('place')}</span><span class="wa-place__body"><span class="wa-place__name">${v.source ? `<a href="source.html?handle=${esc(encodeURIComponent(`@${v.source}`))}">${esc(v.name)}</a>` : esc(v.name)}</span></span><span class="wa-place__side">${cal(v.key)}<button class="wa-btn wa-btn--sm" type="button" data-unfollow="${esc(v.key)}">Unfollow</button></span></li>`
            : `${R().placeRow(v)}<p class="wa-note" style="margin:0 0 var(--s-3)">${cal(F.placeId(v))}<button class="wa-btn wa-btn--sm" type="button" data-unfollow="${esc(F.placeId(v))}">Unfollow</button></p>`).join('')}</ul>` : '<p class="wa-note">Follow a venue from its page.</p>')}
          ${fold('fold-opened', 'Opened earlier', opened.length || null, opened.length ? `<ul class="wa-rows">${opened.map(x => x.title ? R().row(x, { day: true, noThumb: true }) : '').join('')}</ul>
            <ul>${opened.filter(x => !x.title).map(v => R().placeRow(v)).join('')}</ul>
            <p style="margin-top:var(--s-3)"><button class="wa-linkbtn" type="button" id="reset">Forget what I've opened</button></p>` : '<p class="wa-note">Nothing opened yet.</p>')}
        </section>

        <section class="wa-sect">
          ${signedIn ? `${R().sect({ title: 'Account' })}<p class="wa-note">Signed in${window.WA.Auth.session && window.WA.Auth.session.email ? ` as ${esc(window.WA.Auth.session.email)}` : ''}. Your saves sync between devices.</p>
            <p style="margin-top:var(--s-3)"><button class="wa-btn wa-btn--sm" type="button" id="signout">Sign out</button>
              <button class="wa-linkbtn" type="button" id="delete-account" style="margin-left:var(--s-4)">Delete account</button></p>`
          : ''}
        </section>

        <section class="wa-sect you-folds">
          ${fold('fold-store', 'Data and privacy', null, `<p class="wa-note">Your saves and history stay in this browser. Signed in, they also live in your account until you delete it here. <a class="wa-link" href="about.html#privacy">The full note</a> · <a class="wa-link" href="about.html#calendar-feed">Calendar feed</a></p>
            <p><button class="wa-linkbtn" type="button" id="wipe-device">Forget everything on this device</button></p>`)}
        </section>
      </div>
      <footer class="wa-foot"><span>WanderAlt · ${esc(R().cityName())}</span><a href="about.html">About</a><a href="mailto:hello@wanderalt.app">hello@wanderalt.app</a></footer>`;
    $('you-body').querySelectorAll('.wa-sect').forEach((s) => { if (!s.textContent.trim() && !s.querySelector('img, svg, button, a')) s.remove(); });
    window.WA.StartFrom.restore(editing);
    /* A link from the Home Screen invitation lands on the notifications once their rows exist. */
    const target = location.hash === '#notifications' && !jumped && document.getElementById('notifications');
    if (target) { jumped = true; target.scrollIntoView({ block: 'start' }); }
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
        <button class="wa-btn wa-btn--primary" type="button" id="confirm-yes" >${esc(action)}</button>
      </div></div>`;
    document.body.appendChild(d);
    const done = (v) => { if (d.open) d.close(); d.remove(); resolve(v); };
    d.querySelector('#confirm-no').addEventListener('click', () => done(false));
    d.querySelector('#confirm-yes').addEventListener('click', () => done(true));
    d.addEventListener('cancel', (ev) => { ev.preventDefault(); done(false); });
    d.showModal();
  });

  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d && d.classList && d.classList.contains('you-fold')) { if (d.open) foldOpen.add(d.id); else foldOpen.delete(d.id); }
  }, true);

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    const i = hit('[data-interest]');
    if (i) {
      const ids = R().interests.ids();
      const id = i.dataset.interest;
      R().interests.set(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(0, 3), false);
      render();
      const again = document.querySelector(`[data-interest="${CSS.escape(id)}"]`);
      if (again) again.focus();
      return;
    }
    if (hit('[data-push]') && prefs && window.WA.Push) {
      (async () => {
        if (pushState === 'on' && prefs.push) {
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
    if (hit('#install-open')) { window.WA.Install.open(hit('#install-open').dataset.from || 'you'); return; }
    if (hit('#push-test')) {
      const b = hit('#push-test');
      window.WA.Push.test().then((ok) => { b.textContent = ok ? 'Sent' : 'Could not send'; setTimeout(() => { b.textContent = 'Send a test notification'; }, 2500); });
      return;
    }
    if (hit('#signin')) { if (window.WA.Auth.openSignIn) window.WA.Auth.openSignIn(); return; }
    if (hit('#signout')) { window.WA.Auth.signOut().then(render); return; }
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
  document.addEventListener('wa:signed-in', render);
  document.addEventListener('wa:signed-out', () => { prefs = undefined; notes = undefined; pushState = ''; render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
  document.addEventListener('wa:language-changed', render);
})();
