/* ============================================================
   WanderAlt — Auth module
   ------------------------------------------------------------
   Supports: email + password, Google OAuth, magic-link
   recovery (password reset), and session restore.

   Public API (window.WA.Auth):
     .session         — { access_token, user_id, email, expires_at } | null
     .isSignedIn()    — bool
     .getAuthHeaders()— { apikey, Authorization: 'Bearer …' }
     .signOut()       — clears session + dispatches 'wa:signed-out'

   Dispatches on document:
     'wa:signed-in'   — after token parse, restore, or sign-up
     'wa:signed-out'  — after signOut()

   Injects .auth-btn into .topbar__right (creates the wrapper
   if absent). Overlay is a single <div> re-rendered per state:
     sign-in | sign-up | forgot | set-password | account

   Load order (all HTML files):
     catalog.js → city.js → supabase.js → auth.js → …
   ============================================================ */
(() => {
  const SESSION_KEY = 'wanderalt:session:v1';

  /* ── Session helpers ─────────────────────────────────────── */

  const saveSession = (s) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
  };

  const loadSession = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.expires_at && Date.now() / 1000 > s.expires_at) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch { return null; }
  };

  const decodeJWT = (token) => {
    try {
      const p = token.split('.')[1];
      return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return null; }
  };

  const sessionFromToken = (token) => {
    const p = decodeJWT(token);
    if (!p) return null;
    return { access_token: token, user_id: p.sub, email: p.email || '', expires_at: p.exp || null };
  };

  /* ── Parse URL hash (set by Supabase after auth redirect) ── */

  const parseHash = () => {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const token  = params.get('access_token');
    const type   = params.get('type');   /* 'recovery' | 'signup' | 'magiclink' */
    if (!token) return null;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return { session: sessionFromToken(token), type };
  };

  /* ── Public Auth object ──────────────────────────────────── */

  window.WA      = window.WA || {};
  window.WA.Auth = {
    session:         null,
    /* Exported so the You page can offer Google beside email without
       owning a second copy of the redirect URL. 6c draws both on the
       sign-in screen; before this only the modal overlay had it, so the
       page that IS the signed-out state offered one of the two. */
    googleHref:      () => googleHref(),
    recoverySession: null,   /* set when hash type=recovery; cleared after password update */
    isSignedIn:      () => !!(window.WA.Auth.session),
    getAuthHeaders:  () => {
      const key = window.WA.ANON_KEY || '';
      const tok = window.WA.Auth.session ? window.WA.Auth.session.access_token : key;
      return { apikey: key, Authorization: `Bearer ${tok}` };
    },
    signOut: () => {
      window.WA.Auth.session = null;
      window.WA.Auth.recoverySession = null;
      localStorage.removeItem(SESSION_KEY);
      updateBtn();
      document.dispatchEvent(new CustomEvent('wa:signed-out'));
    },
    /* Open the sign-in overlay programmatically (signed-out profile's
       board-4c invite card uses this — one auth form, many doors). */
    openSignIn: () => openOverlay('sign-in'),
  };

  /* ── Restore or parse session ────────────────────────────── */

  const parsed = parseHash();
  if (parsed) {
    if (parsed.type === 'recovery' && parsed.session) {
      window.WA.Auth.recoverySession = parsed.session;
      /* Do NOT log in — show set-password form instead. */
    } else if (parsed.session) {
      window.WA.Auth.session = parsed.session;
      saveSession(parsed.session);
      Promise.resolve().then(() => document.dispatchEvent(new CustomEvent('wa:signed-in')));
    }
  } else {
    const stored = loadSession();
    if (stored) {
      window.WA.Auth.session = stored;
      Promise.resolve().then(() => document.dispatchEvent(new CustomEvent('wa:signed-in')));
    }
  }

  /* ── API helpers ─────────────────────────────────────────── */

  const BASE = () => window.WA.BASE_URL || '';
  const KEY  = () => window.WA.ANON_KEY  || '';

  const authFetch = (method, path, body, token) =>
    fetch(`${BASE()}${path}`, {
      method,
      headers: {
        apikey:          KEY(),
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${token || KEY()}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

  /* ── Overlay ─────────────────────────────────────────────── */

  let overlay = null;
  let btn     = null;

  /* This whole surface used to render UNSTYLED on every public page.
     `.auth-panel*` is defined in admin.css and nothing public loads that
     stylesheet, so sign-in, create-account, reset and the account panel
     came out as raw browser defaults appended to the bottom of the
     document: no overlay, no panel, 28px-tall inputs under the 44px
     floor, a grey UA submit button. It also reached for --c-accent,
     --c-ink-mute and --c-rule-strong, three tokens that died with
     styles.css. The primary account flow, on seven pages.

     It is the system's SHEET now rather than a fourteenth component --
     the same <dialog class="wa-sheet"> Tonight's filters use, so it
     inherits the backdrop, the bottom-sheet-to-centred-dialog
     responsive behaviour, focus trapping and Escape from showModal(),
     and every control inside is a .wa-btn or .wa-input. */
  const closeOverlay = () => { if (overlay && overlay.open) overlay.close(); };

  const openOverlay = (state) => {
    if (!overlay) {
      overlay = document.createElement('dialog');
      overlay.className = 'wa-sheet';
      overlay.setAttribute('aria-labelledby', 'auth-panel-title');
      overlay.innerHTML =
        `<div class="wa-sheet__panel">
           <div class="wa-sheet__head">
             <h2 class="wa-sheet__title" id="auth-panel-title">Sign in</h2>
             <button class="wa-sheet__close" type="button" id="auth-x" aria-label="Close">
               <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
             </button>
           </div>
           <div class="wa-sheet__body" id="auth-body"></div>
           <div class="wa-sheet__foot" id="auth-foot"></div>
         </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#auth-x').addEventListener('click', closeOverlay);
      /* Clicking the backdrop closes. showModal() puts the backdrop
         behind the dialog element itself, so the test is whether the
         press landed outside the panel's box. */
      overlay.addEventListener('click', (e) => {
        const box = overlay.querySelector('.wa-sheet__panel').getBoundingClientRect();
        if (e.clientX < box.left || e.clientX > box.right ||
            e.clientY < box.top  || e.clientY > box.bottom) closeOverlay();
      });
    }
    if (!overlay.open) overlay.showModal();   /* Escape and the focus trap come free */
    render(state);
  };

  /* ── State renderers ─────────────────────────────────────── */

  /* The dialog, not the body: the submit key lives in the sheet's foot
     now while the fields live in its body, and every doSignIn/doSignUp
     below looks its controls up with panel().querySelector(). Returning
     the root keeps all of them working unchanged. */
  const panel = () => overlay;
  const body  = () => overlay.querySelector('#auth-body');
  const foot  = () => overlay.querySelector('#auth-foot');
  const title = (t) => { overlay.querySelector('#auth-panel-title').textContent = t; };

  const render = (state) => {
    const renderers = { 'sign-in': renderSignIn, 'sign-up': renderSignUp,
      'forgot': renderForgot, 'set-password': renderSetPassword, 'account': renderAccount };
    (renderers[state] || renderSignIn)(panel());
  };

  const googleHref = () => {
    const redirect = encodeURIComponent(window.location.origin + '/');
    return `${BASE()}/auth/v1/authorize?provider=google&redirect_to=${redirect}`;
  };

  const status = () => panel()?.querySelector('#auth-status');
  const setStatus = (msg, isError = false) => {
    const el = status();
    if (!el) return;
    el.textContent = msg;
    /* --warn is the alarm's quieter sibling and this is a state the
       reader has to act on; --c-accent and --c-ink-mute died with
       styles.css and resolved to nothing here. */
    el.style.color = isError ? 'var(--warn)' : 'var(--ink-mute)';
  };

  /* Sign in -------------------------------------------------- */
  const renderSignIn = (p) => {
    title('Sign in');
    body().innerHTML = `
      <a href="${googleHref()}" class="wa-btn" style="width:100%">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.566 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
        Continue with Google
      </a>
      <p class="wa-field__consequence" style="text-align:center;margin:var(--s-4) 0">or</p>
      <div class="wa-field">
        <label class="wa-field__label" for="auth-email">Email</label>
        <input class="wa-input" id="auth-email" type="email" placeholder="you@example.com"
               autocomplete="email" spellcheck="false" style="width:100%" />
      </div>
      <div class="wa-field">
        <label class="wa-field__label" for="auth-password">Password</label>
        ${window.WA.UI.passwordField('<input class="wa-input" id="auth-password" type="password" placeholder="Your password" autocomplete="current-password" style="width:100%" />')}
      </div>
      <p style="margin:0">
        <button class="wa-linkbtn" type="button" id="auth-to-forgot">Forgot password?</button>
        <span aria-hidden="true" style="color:var(--rule-strong)"> · </span>
        <button class="wa-linkbtn" type="button" id="auth-to-signup">Create account</button>
      </p>
      <p class="wa-field__consequence" id="auth-status" aria-live="polite" style="margin-top:var(--s-4)"></p>`;
    foot().innerHTML = `
      <button class="wa-btn wa-btn--quiet" type="button" id="auth-close">Cancel</button>
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit" style="flex:1">Sign in</button>`;
    p.querySelector('#auth-close').addEventListener('click', closeOverlay);
    p.querySelector('#auth-to-forgot').addEventListener('click', () => render('forgot'));
    p.querySelector('#auth-to-signup').addEventListener('click', () => render('sign-up'));
    p.querySelector('#auth-submit').addEventListener('click', doSignIn);
    p.querySelector('#auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
    p.querySelector('#auth-email').focus();
  };

  const doSignIn = async () => {
    const p   = panel();
    const email    = p.querySelector('#auth-email').value.trim();
    const password = p.querySelector('#auth-password').value;
    const btn      = p.querySelector('#auth-submit');
    if (!email || !password) { setStatus('Please fill in both fields.', true); return; }
    btn.disabled = true;
    setStatus('Signing in…');
    try {
      const { ok, data } = await authFetch('POST', '/auth/v1/token?grant_type=password', { email, password });
      if (ok && data.access_token) {
        const s = sessionFromToken(data.access_token);
        window.WA.Auth.session = s; saveSession(s); updateBtn(); closeOverlay();
        document.dispatchEvent(new CustomEvent('wa:signed-in'));
      } else {
        setStatus(data.error_description || data.msg || 'Invalid email or password.', true);
        btn.disabled = false;
      }
    } catch { setStatus('Network error.', true); btn.disabled = false; }
  };

  /* Sign up -------------------------------------------------- */
  const renderSignUp = (p) => {
    title('Create account');
    body().innerHTML = `
      <div class="wa-field">
        <label class="wa-field__label" for="auth-email">Email</label>
        <input class="wa-input" id="auth-email" type="email" placeholder="you@example.com"
               autocomplete="email" spellcheck="false" style="width:100%" />
      </div>
      <div class="wa-field">
        <label class="wa-field__label" for="auth-password">Password</label>
        ${window.WA.UI.passwordField('<input class="wa-input" id="auth-password" type="password" placeholder="At least 6 characters" autocomplete="new-password" style="width:100%" />')}
      </div>
      <p style="margin:0">
        <button class="wa-linkbtn" type="button" id="auth-to-signin">Already have an account? Sign in</button>
      </p>
      <p class="wa-field__consequence" id="auth-status" aria-live="polite" style="margin-top:var(--s-4)"></p>`;
    foot().innerHTML = `
      <button class="wa-btn wa-btn--quiet" type="button" id="auth-close">Cancel</button>
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit" style="flex:1">Create account</button>`;
    p.querySelector('#auth-close').addEventListener('click', closeOverlay);
    p.querySelector('#auth-to-signin').addEventListener('click', () => render('sign-in'));
    p.querySelector('#auth-submit').addEventListener('click', doSignUp);
    p.querySelector('#auth-email').focus();
  };

  const doSignUp = async () => {
    const p   = panel();
    const email    = p.querySelector('#auth-email').value.trim();
    const password = p.querySelector('#auth-password').value;
    const btn      = p.querySelector('#auth-submit');
    if (!email) { setStatus('Please enter your email.', true); return; }
    if (password.length < 6) { setStatus('Password must be at least 6 characters.', true); return; }
    btn.disabled = true;
    setStatus('Creating account…');
    try {
      const redirect = window.location.origin + window.location.pathname;
      const { ok, data } = await authFetch('POST', '/auth/v1/signup',
        { email, password, options: { emailRedirectTo: redirect } });
      if (ok) {
        if (data.access_token) {
          /* Email confirmations disabled — logged in immediately. */
          const s = sessionFromToken(data.access_token);
          window.WA.Auth.session = s; saveSession(s); updateBtn(); closeOverlay();
          document.dispatchEvent(new CustomEvent('wa:signed-in'));
        } else {
          setStatus('Check your inbox to confirm your email, then sign in.');
          btn.disabled = false;
        }
      } else {
        setStatus(data.msg || data.error_description || 'Sign-up failed. Try again.', true);
        btn.disabled = false;
      }
    } catch { setStatus('Network error.', true); btn.disabled = false; }
  };

  /* Forgot password ------------------------------------------ */
  const renderForgot = (p) => {
    title('Reset password');
    body().innerHTML = `
      <p class="wa-detail__note" style="margin:0 0 var(--s-5)">Enter your email and we'll send a reset link.</p>
      <div class="wa-field">
        <label class="wa-field__label" for="auth-email">Email</label>
        <input class="wa-input" id="auth-email" type="email" placeholder="you@example.com"
               autocomplete="email" spellcheck="false" style="width:100%" />
      </div>
      <p style="margin:0">
        <button class="wa-linkbtn" type="button" id="auth-to-signin">Back to sign in</button>
      </p>
      <p class="wa-field__consequence" id="auth-status" aria-live="polite" style="margin-top:var(--s-4)"></p>`;
    foot().innerHTML = `
      <button class="wa-btn wa-btn--quiet" type="button" id="auth-close">Cancel</button>
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit" style="flex:1">Send reset link</button>`;
    p.querySelector('#auth-close').addEventListener('click', closeOverlay);
    p.querySelector('#auth-to-signin').addEventListener('click', () => render('sign-in'));
    p.querySelector('#auth-submit').addEventListener('click', doForgot);
    p.querySelector('#auth-email').focus();
  };

  const doForgot = async () => {
    const p   = panel();
    const email = p.querySelector('#auth-email').value.trim();
    const btn   = p.querySelector('#auth-submit');
    if (!email) { setStatus('Please enter your email.', true); return; }
    btn.disabled = true;
    setStatus('Sending…');
    try {
      const redirect = window.location.origin + '/';
      const { ok, data } = await authFetch('POST', '/auth/v1/recover', { email, redirect_to: redirect });
      if (ok) {
        setStatus('Check your inbox — reset link sent.');
      } else {
        setStatus(data.msg || data.error_description || 'Something went wrong.', true);
        btn.disabled = false;
      }
    } catch { setStatus('Network error.', true); btn.disabled = false; }
  };

  /* Set new password (recovery flow) ------------------------- */
  const renderSetPassword = (p) => {
    title('Set new password');
    body().innerHTML = `
      <p class="wa-detail__note" style="margin:0 0 var(--s-5)">Choose a new password for your account.</p>
      <div class="wa-field">
        <label class="wa-field__label" for="auth-password">New password</label>
        ${window.WA.UI.passwordField('<input class="wa-input" id="auth-password" type="password" placeholder="At least 6 characters" autocomplete="new-password" style="width:100%" />')}
      </div>
      <p class="wa-field__consequence" id="auth-status" aria-live="polite" style="margin-top:var(--s-4)"></p>`;
    foot().innerHTML = `
      <button class="wa-btn wa-btn--quiet" type="button" id="auth-close">Cancel</button>
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit" style="flex:1">Update password</button>`;
    p.querySelector('#auth-close').addEventListener('click', closeOverlay);
    p.querySelector('#auth-submit').addEventListener('click', doSetPassword);
    p.querySelector('#auth-password').focus();
  };

  const doSetPassword = async () => {
    const p   = panel();
    const password = p.querySelector('#auth-password').value;
    const btn      = p.querySelector('#auth-submit');
    if (password.length < 6) { setStatus('Password must be at least 6 characters.', true); return; }
    const recoveryToken = window.WA.Auth.recoverySession?.access_token;
    if (!recoveryToken) { setStatus('Session expired. Request a new reset link.', true); return; }
    btn.disabled = true;
    setStatus('Updating…');
    try {
      const { ok, data } = await authFetch('PUT', '/auth/v1/user', { password }, recoveryToken);
      if (ok) {
        const s = window.WA.Auth.recoverySession;
        window.WA.Auth.session = s;
        window.WA.Auth.recoverySession = null;
        saveSession(s); updateBtn();
        setStatus('Password updated. You are now signed in.');
        document.dispatchEvent(new CustomEvent('wa:signed-in'));
        setTimeout(closeOverlay, 1500);
      } else {
        setStatus(data.msg || data.error_description || 'Update failed.', true);
        btn.disabled = false;
      }
    } catch { setStatus('Network error.', true); btn.disabled = false; }
  };

  /* Account -------------------------------------------------- */
  const renderAccount = (p) => {
    const email = window.WA.Auth.session?.email || 'Your account';
    title('Account');
    body().innerHTML = `
      <div class="wa-cells" style="margin-top:0">
        <div class="wa-cell"><span class="wa-cell__label">Signed in as</span>
          <span class="wa-cell__value">${window.WA.UI.esc(email)}</span></div>
      </div>
      <p style="margin:var(--s-5) 0 0">
        <button class="wa-linkbtn" type="button" id="auth-signout">Sign out</button>
      </p>
      <p class="wa-field__consequence" id="auth-status" aria-live="polite" style="margin-top:var(--s-4)"></p>`;
    foot().innerHTML = `
      <button class="wa-btn wa-btn--quiet" type="button" id="auth-close">Close</button>
      <a class="wa-btn wa-btn--primary" href="./profile.html" style="flex:1">View profile</a>`;
    p.querySelector('#auth-close').addEventListener('click', closeOverlay);
    p.querySelector('#auth-signout').addEventListener('click', () => {
      window.WA.Auth.signOut();
      closeOverlay();
    });
  };

  /* ── Topbar button ───────────────────────────────────────── */

  /* Leading glyphs for the masthead marketing links — same stroke .ic
     family as the nav/return-bar icons. Icon + label keeps them legible. */
  const ICON_ABOUT = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.75h.01"/></svg>';
  const ICON_USER  = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21c0-4 3.5-6 7-6s7 2 7 6"/></svg>';

  const updateBtn = () => {
    if (!btn) return;
    if (window.WA.Auth.isSignedIn()) {
      /* Hide entirely when signed in — the Profile nav tab serves
         the same role, so two entry points add only confusion. */
      btn.hidden = true;
    } else {
      btn.hidden = false;
      btn.innerHTML = `${ICON_USER}<span>Sign in</span>`;
      btn.setAttribute('aria-label', 'Sign in');
    }
  };

  const injectUI = () => {
    const inner = document.querySelector('.topbar__inner');
    if (!inner) return;
    let right = inner.querySelector('.topbar__right');
    if (!right) {
      right = document.createElement('div');
      right.className = 'topbar__right';
      const cityBtn = inner.querySelector('.city-selector');
      inner.appendChild(right);
      if (cityBtn) right.appendChild(cityBtn);
    }
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'auth-btn';
    updateBtn();
    right.prepend(btn);

    /* About link — first item in the right group so signed-out
       first-time visitors have an obvious "what is this" entry that
       doesn't depend on the colophon. Stays visible when signed in
       (unlike the auth button). Skipped on the About page itself. */
    if (document.body.dataset.page !== 'about') {
      const about = document.createElement('a');
      about.className = 'topbar__about';
      about.href = './about.html';
      about.innerHTML = `${ICON_ABOUT}<span>About</span>`;
      about.setAttribute('aria-label', 'About');
      right.prepend(about);
    }

    btn.addEventListener('click', () => {
      if (window.WA.Auth.isSignedIn()) {
        window.location.href = './profile.html';
      } else if (window.WA.Auth.recoverySession) {
        openOverlay('set-password');
      } else {
        openOverlay('sign-in');
      }
    });

    /* Profile nav tab (bottom dock + masthead) shares the topbar button's
       gate: signed-in lets the link open profile.html; otherwise intercept
       and open the auth modal instead of bouncing through profile.html's
       redirect. Delegated so it covers every page that ships the nav. */
    document.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('[data-nav="profile"]');
      if (!link) return;
      if (window.WA.Auth.isSignedIn()) return;   // authed → navigate normally
      e.preventDefault();
      openOverlay(window.WA.Auth.recoverySession ? 'set-password' : 'sign-in');
    });

    document.addEventListener('wa:signed-in',  updateBtn);
    document.addEventListener('wa:signed-out', updateBtn);

    /* Auto-open set-password panel if a recovery link was clicked. */
    if (window.WA.Auth.recoverySession) {
      setTimeout(() => openOverlay('set-password'), 120);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
  } else {
    injectUI();
  }
})();
