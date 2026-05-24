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

  const closeOverlay = () => { if (overlay) overlay.hidden = true; };

  const openOverlay = (state) => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'auth-overlay';
      overlay.hidden    = true;
      overlay.setAttribute('role',            'dialog');
      overlay.setAttribute('aria-modal',      'true');
      overlay.setAttribute('aria-labelledby', 'auth-panel-title');
      overlay.innerHTML = `<div class="auth-panel" id="auth-panel-inner"></div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeOverlay(); });
    }
    overlay.hidden = false;
    render(state);
  };

  /* ── State renderers ─────────────────────────────────────── */

  const panel = () => overlay.querySelector('#auth-panel-inner');

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
    el.style.color = isError ? 'var(--c-accent)' : 'var(--c-ink-mute)';
  };

  /* Sign in -------------------------------------------------- */
  const renderSignIn = (p) => {
    p.innerHTML = `
      <p id="auth-panel-title" class="auth-panel__title">Sign in</p>
      <a href="${googleHref()}" class="auth-panel__google">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.566 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
        Continue with Google
      </a>
      <p class="auth-panel__divider"><span>or</span></p>
      <input class="auth-panel__input" id="auth-email"    type="email"    placeholder="Email"    autocomplete="email"            spellcheck="false" />
      <input class="auth-panel__input" id="auth-password" type="password" placeholder="Password" autocomplete="current-password" style="margin-top:var(--s-3)" />
      <div class="auth-panel__actions">
        <button class="auth-panel__submit" id="auth-submit">Sign in</button>
        <button class="auth-panel__close"  id="auth-close">Cancel</button>
      </div>
      <p class="auth-panel__links">
        <button class="auth-panel__link" id="auth-to-forgot">Forgot password?</button>
        <span aria-hidden="true" style="color:var(--c-rule-strong)">·</span>
        <button class="auth-panel__link" id="auth-to-signup">Create account</button>
      </p>
      <p class="auth-panel__status" id="auth-status" aria-live="polite"></p>`;
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
    p.innerHTML = `
      <p id="auth-panel-title" class="auth-panel__title">Create account</p>
      <input class="auth-panel__input" id="auth-email"    type="email"    placeholder="Email"              autocomplete="email"       spellcheck="false" />
      <input class="auth-panel__input" id="auth-password" type="password" placeholder="Password (min 6 chars)" autocomplete="new-password" style="margin-top:var(--s-3)" />
      <div class="auth-panel__actions">
        <button class="auth-panel__submit" id="auth-submit">Create account</button>
        <button class="auth-panel__close"  id="auth-close">Cancel</button>
      </div>
      <p class="auth-panel__links">
        <button class="auth-panel__link" id="auth-to-signin">Already have an account? Sign in</button>
      </p>
      <p class="auth-panel__status" id="auth-status" aria-live="polite"></p>`;
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
    p.innerHTML = `
      <p id="auth-panel-title" class="auth-panel__title">Reset password</p>
      <p class="auth-panel__desc">Enter your email — we'll send a reset link.</p>
      <input class="auth-panel__input" id="auth-email" type="email" placeholder="Email" autocomplete="email" spellcheck="false" />
      <div class="auth-panel__actions">
        <button class="auth-panel__submit" id="auth-submit">Send reset link</button>
        <button class="auth-panel__close"  id="auth-close">Cancel</button>
      </div>
      <p class="auth-panel__links">
        <button class="auth-panel__link" id="auth-to-signin">Back to sign in</button>
      </p>
      <p class="auth-panel__status" id="auth-status" aria-live="polite"></p>`;
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
    p.innerHTML = `
      <p id="auth-panel-title" class="auth-panel__title">Set new password</p>
      <p class="auth-panel__desc">Choose a new password for your account.</p>
      <input class="auth-panel__input" id="auth-password" type="password" placeholder="New password (min 6 chars)" autocomplete="new-password" />
      <div class="auth-panel__actions">
        <button class="auth-panel__submit" id="auth-submit">Update password</button>
        <button class="auth-panel__close"  id="auth-close">Cancel</button>
      </div>
      <p class="auth-panel__status" id="auth-status" aria-live="polite"></p>`;
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
    p.innerHTML = `
      <p id="auth-panel-title" class="auth-panel__title">Account</p>
      <p class="auth-panel__desc">${email}</p>
      <div class="auth-panel__actions">
        <a class="auth-panel__submit" href="./profile.html">View profile</a>
        <button class="auth-panel__close" id="auth-close">Close</button>
      </div>
      <button class="auth-panel__link" id="auth-signout" style="margin-top:var(--s-4)">Sign out</button>
      <p class="auth-panel__status" id="auth-status" aria-live="polite"></p>`;
    p.querySelector('#auth-close').addEventListener('click', closeOverlay);
    p.querySelector('#auth-signout').addEventListener('click', () => {
      window.WA.Auth.signOut();
      closeOverlay();
    });
  };

  /* ── Topbar button ───────────────────────────────────────── */

  const updateBtn = () => {
    if (!btn) return;
    if (window.WA.Auth.isSignedIn()) {
      /* Hide entirely when signed in — the Profile nav tab serves
         the same role, so two entry points add only confusion. */
      btn.hidden = true;
    } else {
      btn.hidden = false;
      btn.textContent = 'Sign in';
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
      about.textContent = 'About';
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
