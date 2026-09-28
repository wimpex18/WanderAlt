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

  const render = () => {
    const saved = Object.keys((window.WA.Bookmarks && window.WA.Bookmarks.get()) || {}).length;
    const follows = window.WA.Follows ? window.WA.Follows.keys() : [];
    const signedIn = !!(window.WA.Auth && window.WA.Auth.isSignedIn && window.WA.Auth.isSignedIn());
    const ids = R().interests.ids();
    const venues = window.WA._venuesAll || [];
    const byId = new Map(pool().map(x => [x.id, x]));
    const opened = window.WA.Seen.ids().slice().reverse().map(id => byId.get(id)).filter(Boolean).slice(0, 8);
    const followed = follows.map(k => venues.find(v => String(v.name).toLowerCase().trim() === k) || { name: k, __raw: true });

    $('you-body').innerHTML = `
      <div class="wa-stats">
        <div class="wa-stat"><span class="wa-stat__n">${window.WA.Seen.count()}</span><span class="wa-stat__label">Opened</span></div>
        <div class="wa-stat"><span class="wa-stat__n">${saved}</span><span class="wa-stat__label">Saved</span></div>
        <div class="wa-stat"><span class="wa-stat__n">${follows.length}</span><span class="wa-stat__label">Following</span></div>
      </div>

      <div class="you-cols">
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
            ? `<li class="wa-place"><span class="wa-place__glyph">${I('place')}</span><span class="wa-place__body"><span class="wa-place__name">${esc(v.name)}</span></span><span class="wa-place__side"><button class="wa-btn wa-btn--sm" type="button" data-unfollow="${esc(v.name)}">Unfollow</button></span></li>`
            : R().placeRow(v)).join('')}</ul>` : ''}
        </section>

        <section class="wa-sect">${R().sect({ title: 'Opened earlier', n: opened.length || null, sub: opened.length ? 'Newest first' : 'Nothing opened yet.' })}
          ${opened.length ? `<ul class="wa-rows">${opened.map(x => x.title ? R().row(x, { day: true, noThumb: true }) : '').join('')}</ul>
            <ul>${opened.filter(x => !x.title).map(v => R().placeRow(v)).join('')}</ul>
            <p style="margin-top:var(--s-3)"><button class="wa-linkbtn" type="button" id="reset">Forget what I've opened</button></p>` : ''}
        </section>

        <section class="wa-sect">
          ${signedIn ? `${R().sect({ title: 'Account' })}<p class="wa-note">Signed in. Your saves sync between devices.</p>
            <p style="margin-top:var(--s-3)"><button class="wa-btn" type="button" id="signout">Sign out</button></p>`
          : `<div class="wa-card wa-card--ink">
              <h2 class="wa-card__title">Keep your saves on every device.</h2>
              <p class="wa-note">Everything works signed out. An account only carries your shortlist between your phone and your laptop.</p>
              <div class="wa-btns">
                <button class="wa-btn wa-btn--primary" type="button" id="signin">Continue with email</button>
                <a class="wa-btn" href="${esc(window.WA.Auth && window.WA.Auth.googleHref ? window.WA.Auth.googleHref() : '#')}">Continue with Google</a>
              </div>
            </div>`}
        </section>

        <section class="wa-sect">${R().sect({ title: 'What we store' })}
          <p class="wa-note">Your saves, lists, follows, interests and what you open, in this browser. No location history, no analytics, no third-party scripts.</p>
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
  document.addEventListener('wa:signed-out', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true }); else render();
})();
