/* ============================================================
   you.js — You (5f) and sign-in (6c). Replaces profile.js.
   ------------------------------------------------------------
   "You is not a profile — it is a receipt. There is no social graph, no
   reviews, no host onboarding, so their profile card becomes three
   counts (opened, saved, cities) and one plain sentence about what the
   app has inferred. Stating the inference and offering a reset is the
   whole deal: personalisation without a quiz, and no black box."

   Sign-in leads with the reason, not the wall (6c). Nothing here is
   gated — the honest pitch is "keeps your shortlist across devices",
   with a plain third option to carry on signed out. The privacy card is
   a feature, not fine print: we are asking for location from someone
   standing on a street in a foreign city.
   ============================================================ */
(() => {
  'use strict';

  const $   = (id) => document.getElementById(id);
  const UI  = () => window.WA.UI;
  const esc = (s) => UI().esc(s);

  const PLACEHOLDER = /^(unknown|tba|tbc|n\/a|none|null|other|-)$/i;
  const real = (v) => {
    const s = String(v == null ? '' : v).trim();
    return s && !PLACEHOLDER.test(s) ? s : '';
  };

  /* ── The inference, stated ───────────────────────────────────
     Counted from the opened/saved log, which is the whole model. If the
     reader has not opened enough for a claim to mean anything, we say
     that instead of inventing a preference from three taps. */
  const inference = () => {
    const seen = window.WA.Seen.ids();
    if (seen.length < 5) return null;
    const picks = window.WA._catalogAll || window.WA.catalog || [];
    const byKind = new Map();
    for (const id of seen) {
      const p = picks.find(e => e.id === id);
      const k = p && real(p.kind);
      if (k) byKind.set(k, (byKind.get(k) || 0) + 1);
    }
    const ranked = [...byKind.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return null;
    return { top: ranked.slice(0, 4), lead: ranked.slice(0, 2).map(r => r[0]) };
  };

  const counts = () => {
    const saved = Object.keys((window.WA.Bookmarks && window.WA.Bookmarks.get()) || {}).length;
    const picks = window.WA._catalogAll || window.WA.catalog || [];
    const venues = window.WA._venuesAll || window.WA.venues || [];
    const ids = new Set(Object.keys((window.WA.Bookmarks && window.WA.Bookmarks.get()) || {}));
    const cities = new Set();
    for (const e of [...picks, ...venues]) if (ids.has(e.id) && e.city) cities.add(e.city);
    return { opened: window.WA.Seen.count(), saved, cities: cities.size };
  };

  const signInCard = () => `
    <section class="wa-digest" aria-labelledby="signin-title">
      <h2 class="wa-digest__title" id="signin-title">Keep your shortlist across devices.</h2>
      <p class="wa-digest__body">Everything works signed out. An account only carries your saves and the Saturday email between your phone and your laptop.</p>
      <div class="wa-btn-row" style="flex-wrap:wrap">
        <button class="wa-btn wa-btn--primary" type="button" id="signin">Continue with email</button>
        <a class="wa-btn" href="${(window.WA.Auth && window.WA.Auth.googleHref) ? window.WA.Auth.googleHref() : '#'}">Continue with Google</a>
      </div>
      <!-- 6c draws Apple as a third option. It is deliberately absent
           rather than drawn-and-broken: Apple sign-in needs a Service ID
           and key configured in Supabase, and a button that 400s on tap
           is worse than one option fewer. Add the button here the day
           the provider is configured. -->
      <p class="wa-digest__fine">By continuing you agree to the terms. We'll email you once a week at most, and only if you ask.</p>
    </section>

    <section class="wa-section">
      <h2 class="wa-section-title">What we store</h2>
      <p class="wa-detail__note">Your saves, your city, and which kinds you open. No location history, no tracking between sessions, no third-party analytics. You can wipe all of it from here in one tap.</p>
    </section>`;

  const render = () => {
    const c = counts();
    const inf = inference();
    const signedIn = !!(window.WA.Auth && window.WA.Auth.isSignedIn && window.WA.Auth.isSignedIn());
    const follows = window.WA.Follows.keys();
    const sources = new Set((window.WA._catalogAll || []).map(e => e.handle).filter(Boolean)).size;
    const cityList = (window.WA.CITIES || []);
    const cityLabel = (id) => {
      const x = cityList.find(y => y.id === id);
      return x ? x.label.charAt(0) + x.label.slice(1).toLowerCase() : id;
    };

    $('you-body').innerHTML = `
      <div class="wa-cells" style="margin-top:var(--s-5)">
        <div class="wa-cell"><span class="wa-cell__label">Opened</span><span class="wa-cell__value">${c.opened}</span></div>
        <div class="wa-cell"><span class="wa-cell__label">Saved</span><span class="wa-cell__value">${c.saved}</span></div>
        <div class="wa-cell"><span class="wa-cell__label">Cities</span><span class="wa-cell__value">${c.cities}</span></div>
      </div>

      <section class="wa-section">
        <h2 class="wa-section-title">${inf
          ? esc(`You open ${inf.lead.join(' and ')} most`)
          : 'Nothing learned about you yet'}</h2>
        <p class="wa-detail__note">${inf
          ? 'So those move up your Explore. Nothing is hidden — it only changes the order.'
          : 'Open a few things and this fills in. There is no quiz and no profile to complete.'}</p>
        ${inf ? `<div class="wa-chips" style="margin-top:var(--s-4)">
          ${inf.top.map(([k, n]) => `<span class="wa-chip" aria-disabled="true">${esc(k)} <span class="wa-chip__count">${n}</span></span>`).join('')}
        </div>` : ''}
        ${c.opened ? `<p style="margin-top:var(--s-4)">
          <button class="wa-linkbtn" type="button" id="reset">Reset what you've learned about me &rarr;</button>
        </p>` : ''}
      </section>

      <section class="wa-section">
        <h2 class="wa-section-title">Appearance</h2>
        <p class="wa-section-sub">${esc(`DUSK AT ${window.WA.Theme.duskLabel()}`)}</p>
        <div class="wa-segment" style="margin-top:var(--s-4)">
          ${window.WA.Theme.OPTIONS.map(o => `<button class="wa-segment__opt" type="button"
             data-theme-set="${esc(o.value)}" aria-pressed="${window.WA.Theme.get() === o.value}">${esc(o.label)}</button>`).join('')}
        </div>
      </section>

      <section class="wa-section">
        <h2 class="wa-section-title">Home city</h2>
        <div class="wa-chips" style="margin-top:var(--s-4)">
          ${cityList.map(x => `<button class="wa-chip" type="button" data-city="${esc(x.id)}"
             aria-pressed="${window.WA.CITY === x.id}">${esc(cityLabel(x.id))}${x.status === 'internal' ? ' <span class="wa-chip__count">internal</span>' : ''}</button>`).join('')}
        </div>
      </section>

      <!-- 5f draws the Saturday email and "Add to my calendar" as rows
           in You, not only at the foot of Explore. The digest_opt_ins
           table, the Resend key and the calendar-feed function all
           already exist; this surface was the one 5f asked for and the
           only one that had not been built. -->
      <section class="wa-section">
        <h2 class="wa-section-title">Saturday email</h2>
        <p class="wa-detail__note">One email a week: what's on next week in ${esc(cityLabel(window.WA.CITY))}, in the same shape as Tonight. No account needed, one unsubscribe link, no other mail.</p>
        <p style="margin-top:var(--s-4)"><a class="wa-btn" href="./index.html#digest-title">Sign up &rsaquo;</a></p>
      </section>

      <section class="wa-section">
        <h2 class="wa-section-title">Add to my calendar</h2>
        <p class="wa-detail__note">Take the week as a calendar feed and never open the app.</p>
        <p style="margin-top:var(--s-4)"><a class="wa-btn" href="./about.html#calendar">How it works &rsaquo;</a></p>
      </section>

      ${follows.length ? `<section class="wa-section">
        <h2 class="wa-section-title">Following</h2>
        <p class="wa-section-sub">${esc(`${follows.length} ${follows.length === 1 ? 'venue' : 'venues'}`)}</p>
        <div class="wa-chips" style="margin-top:var(--s-4)">
          ${follows.map(f => `<a class="wa-chip" href="source.html?venue=${esc(encodeURIComponent(f))}">${esc(f)}</a>`).join('')}
        </div>
      </section>` : ''}

      ${signedIn ? `<section class="wa-section">
        <h2 class="wa-section-title">Account</h2>
        <p class="wa-detail__note">Signed in. Your saves sync between devices.</p>
        <p style="margin-top:var(--s-4)"><button class="wa-btn" type="button" id="signout">Sign out</button></p>
      </section>` : signInCard()}

      <!-- The source count is the credibility line now that curators are
           gone, and it belongs where someone goes looking for who is
           behind this. -->
      <p class="wa-digest__fine" style="margin-top:var(--s-8)">
        WanderAlt reads ${sources || 'its'} sources across ${cityList.length} cities.
        <a href="./about.html">See them all &rarr;</a>
      </p>`;
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);

    const t = hit('[data-theme-set]');
    if (t) { window.WA.Theme.set(t.dataset.themeSet); render(); return; }

    const c = hit('[data-city]');
    if (c) { window.WA.setCity(c.dataset.city); return; }

    if (hit('#reset')) {
      const had = window.WA.Seen.ids().slice();
      window.WA.Seen.clear();
      render();
      window.WA.Toast.show('Cleared what we had learned', 'Undo', () => {
        had.forEach(id => window.WA.Seen.mark(id));
        render();
      });
      return;
    }

    if (hit('#signin'))  { window.WA.Auth.openSignIn && window.WA.Auth.openSignIn(); return; }
    if (hit('#signout')) { window.WA.Auth.signOut(); render(); return; }
  });

  document.addEventListener('wa:catalog-ready', render);
  document.addEventListener('wa:seen-changed', render);
  document.addEventListener('wa:signed-in', render);
  document.addEventListener('wa:signed-out', render);
  if (window.WA && window.WA.catalog) render();
})();
