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
    if (pushState === 'install') return '<p class="wa-note">On iPhone, add WanderAlt to the Home Screen first, then notifications can be switched on here.</p>';
    if (pushState === 'denied') return '<p class="wa-note">Notifications are blocked for this site in your browser settings.</p>';
    if (pushState !== 'on' && pushState !== 'off') return '';
    const on = pushState === 'on' && !!prefs.push;
    return `<button class="wa-switch" type="button" data-push aria-pressed="${on}">
        <span class="wa-switch__text"><span class="wa-switch__title">Notifications on this device</span><span class="wa-switch__sub">Changes to your events arrive here too</span></span><span class="wa-switch__track"></span></button>
      <button class="wa-switch" type="button" data-digest="tonight" aria-pressed="${on && !!prefs.tonight}"${on ? '' : ' disabled'}>
        <span class="wa-switch__text"><span class="wa-switch__title">Tonight at places you follow</span><span class="wa-switch__sub">One notification at 16:00, only when something starts today</span></span><span class="wa-switch__track"></span></button>`;
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
    if (!signedIn) return `<section class="wa-sect">${R().sect({ title: 'Inbox', sub: 'Sign in and WanderAlt tells you here when an event you saved is cancelled, and once a week what is on at places you follow.' })}</section>`;
    if (notes === undefined) { loadNotes(); return ''; }
    if (!notes) return '';
    return `<section class="wa-sect" id="inbox">${R().sect({ title: 'Inbox', n: notes.length || null, sub: notes.length ? 'Kept for 30 days' : 'Nothing yet. Save an event or follow a place and changes land here.' })}
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
    return rows ? `<section class="wa-sect">${R().sect({ title: 'Notifications', sub: 'Optional. A nudge outside the app; the inbox works without it.' })}${rows}</section>` : '';
  };

  const render = () => {
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

    $('you-body').innerHTML = `
      <div class="wa-stats">
        <div class="wa-stat"><span class="wa-stat__n">${window.WA.Seen.count()}</span><span class="wa-stat__label">Opened</span></div>
        <div class="wa-stat"><span class="wa-stat__n">${saved}</span><span class="wa-stat__label">Saved</span></div>
        <div class="wa-stat"><span class="wa-stat__n">${follows.length}</span><span class="wa-stat__label">Following</span></div>
      </div>

      <div class="you-cols">
        ${inboxSection(signedIn)}
        <section class="wa-sect" id="interests">${R().sect({ title: 'Interests', sub: ids.length ? 'They get their own shelf on Tonight. Nothing else is hidden.' : 'Pick up to three and Tonight gives them a shelf.' })}
          <div class="wa-chips" style="margin-top:var(--s-3)">${R().interests.OPTIONS.map(o =>
            `<button class="wa-chip" type="button" data-interest="${esc(o.id)}" aria-pressed="${ids.includes(o.id)}"${!ids.includes(o.id) && ids.length >= 3 ? ' disabled' : ''}>${o.icon === "globe" ? I("globe") : window.WA.Picto(o.icon)}${esc(o.label)}</button>`).join('')}</div>
        </section>

        <section class="wa-sect">${R().sect({ title: 'Appearance', sub: `Auto follows your device, else it turns dark at ${window.WA.Theme.duskLabel()} in Tallinn.` })}
          <div class="wa-seg" style="margin-top:var(--s-3);max-width:420px">${window.WA.Theme.OPTIONS.map(o =>
            `<button class="wa-seg__opt" type="button" data-theme-set="${esc(o.value)}" aria-pressed="${window.WA.Theme.get() === o.value}">${esc(o.label)}</button>`).join('')}</div>
        </section>

        <section class="wa-sect">${R().sect({ title: 'Following', n: follows.length || null, sub: follows.length ? '' : 'Follow a venue from its page and its listings are marked for you.' })}
          ${followed.length ? `<ul>${followed.map(v => v.__raw
            ? `<li class="wa-place"><span class="wa-place__glyph">${I('place')}</span><span class="wa-place__body"><span class="wa-place__name">${v.source ? `<a href="source.html?handle=${esc(encodeURIComponent(`@${v.source}`))}">${esc(v.name)}</a>` : esc(v.name)}</span></span><span class="wa-place__side">${cal(v.key)}<button class="wa-btn wa-btn--sm" type="button" data-unfollow="${esc(v.key)}">Unfollow</button></span></li>`
            : `${R().placeRow(v)}<p class="wa-note" style="margin:0 0 var(--s-3)">${cal(F.placeId(v))}<button class="wa-btn wa-btn--sm" type="button" data-unfollow="${esc(F.placeId(v))}">Unfollow</button></p>`).join('')}</ul>` : ''}
        </section>

        <section class="wa-sect">${R().sect({ title: 'Opened earlier', n: opened.length || null, sub: opened.length ? 'Newest first' : 'Nothing opened yet.' })}
          ${opened.length ? `<ul class="wa-rows">${opened.map(x => x.title ? R().row(x, { day: true, noThumb: true }) : '').join('')}</ul>
            <ul>${opened.filter(x => !x.title).map(v => R().placeRow(v)).join('')}</ul>
            <p style="margin-top:var(--s-3)"><button class="wa-linkbtn" type="button" id="reset">Forget what I've opened</button></p>` : ''}
        </section>

        ${pushSection(signedIn)}

        <section class="wa-sect">
          ${signedIn ? `${R().sect({ title: 'Account' })}<p class="wa-note">Signed in${window.WA.Auth.session && window.WA.Auth.session.email ? ` as ${esc(window.WA.Auth.session.email)}` : ''}. Your saves sync between devices.</p>
            <p style="margin-top:var(--s-3)"><button class="wa-btn" type="button" id="signout">Sign out</button></p>`
          : `<div class="wa-card wa-card--ink">
              <h2 class="wa-card__title">Keep your saves on every device.</h2>
              <p class="wa-note">Everything works signed out. An account only carries your shortlist between your phone and your laptop.</p>
              ${window.WA.Auth && window.WA.Auth.signInError ? `<p class="wa-note" role="alert">Sign-in did not finish: ${esc(window.WA.Auth.signInError)}</p>` : ''}
              <div class="wa-btns">
                <button class="wa-btn wa-btn--primary" type="button" id="signin">Continue with email</button>
                <a class="wa-btn" href="${esc(window.WA.Auth && window.WA.Auth.googleHref ? window.WA.Auth.googleHref() : '#')}">Continue with Google</a>
              </div>
            </div>`}
        </section>

        <section class="wa-sect">${R().sect({ title: 'What we store' })}
          <p class="wa-note">Your saves, lists, follows, interests and what you open, in this browser. Signed in, your saves, going marks, follows and notification switches are also kept in your account, with the notes in your inbox. No location history, no analytics, no third-party scripts.</p>
          <p style="margin-top:var(--s-3)"><a class="wa-link" href="about.html#calendar-feed">Take the week as a calendar feed</a></p>
        </section>
      </div>
      <footer class="wa-foot"><span>WanderAlt · ${esc(R().cityName())}</span><a href="about.html">About</a><a href="mailto:hello@wanderalt.app">hello@wanderalt.app</a></footer>`;
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    const t = hit('[data-theme-set]');
    if (t) { window.WA.Theme.set(t.dataset.themeSet); render(); return; }
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
    if (hit('#signin')) { if (window.WA.Auth.openSignIn) window.WA.Auth.openSignIn(); return; }
    if (hit('#signout')) { window.WA.Auth.signOut(); render(); }
  });

  document.addEventListener('wa:catalog-ready', render);
  document.addEventListener('wa:seen-changed', render);
  document.addEventListener('wa:signed-in', render);
  document.addEventListener('wa:signed-out', () => { prefs = undefined; notes = undefined; pushState = ''; render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
})();
