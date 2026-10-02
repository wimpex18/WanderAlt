/* ============================================================
   WanderAlt — Auth module
   ------------------------------------------------------------
   Supports: an emailed sign-in link (the default, with an optional code),
   Google OAuth, email + password, password recovery, and session restore.

   Public API (window.WA.Auth):
     .session         — { access_token, user_id, email, expires_at } | null
     .isSignedIn()    — bool
     .getAuthHeaders()— { apikey, Authorization: 'Bearer …' }
     .signOut()       — drops this device's push subscription, revokes the
                        session, dispatches 'wa:signed-out' (returns a promise)
     .deleteAccount() — deletes the account and its data, then wipes the device
     .wipeDevice()    — forgets everything WanderAlt keeps in this browser

   Dispatches on document:
     'wa:signed-in'   — after token parse, restore, or sign-up
     'wa:signed-out'  — after signOut()

   The sign-in overlay is a .wa-sheet dialog re-rendered per state
   (start | sent | sign-in | sign-up | forgot | set-password). You opens it through
   .openSignIn(); a password-recovery link opens it by itself.

   Load order (all HTML files):
     city.js → supabase.js → auth.js → …
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
      /* An expired token with a refresh token is not signed out: it is
         renewed below before anything reads the session. */
      if (s.expires_at && Date.now() / 1000 > s.expires_at && !s.refresh_token) {
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

  const sessionFromToken = (token, refresh) => {
    const p = decodeJWT(token);
    if (!p) return null;
    return { access_token: token, refresh_token: refresh || '', user_id: p.sub, email: p.email || '', expires_at: p.exp || null };
  };

  /* ── Parse URL hash (set by Supabase after auth redirect) ── */

  const parseHash = () => {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const token  = params.get('access_token');
    const type   = params.get('type');   /* 'recovery' | 'signup' | 'magiclink' */
    if (!token) {
      /* A refused or cancelled sign-in comes back as #error=…; say so. */
      if (params.get('error')) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return { error: params.get('error_description') || params.get('error') };
      }
      return null;
    }
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return { session: sessionFromToken(token, params.get('refresh_token')), type };
  };

  /* ── Public Auth object ──────────────────────────────────── */

  window.WA      = window.WA || {};
  window.WA.Auth = {
    session:         null,
    /* Exported so the You page can offer Google beside email without a
       second copy of the redirect URL. */
    googleHref:      () => googleHref(),
    recoverySession: null,   /* set when hash type=recovery; cleared after password update */
    isSignedIn:      () => !!(window.WA.Auth.session),
    getAuthHeaders:  () => {
      const key = window.WA.ANON_KEY || '';
      const tok = window.WA.Auth.session ? window.WA.Auth.session.access_token : key;
      return { apikey: key, Authorization: `Bearer ${tok}` };
    },
    signOut: async () => {
      /* The push subscription belongs to this device, not the account: drop it
         first (it needs the session to remove its row) so the next person on a
         shared device is not sent this reader's alerts. */
      if (window.WA.Push) await Promise.race([window.WA.Push.disable(), new Promise(r => setTimeout(r, 3000))]).catch(() => {});
      /* Revoke on the server too, so a copied token stops working. */
      const tok = window.WA.Auth.session && window.WA.Auth.session.access_token;
      if (tok) fetch(`${window.WA.BASE_URL || ''}/auth/v1/logout`, { method: 'POST', keepalive: true,
        headers: { apikey: window.WA.ANON_KEY || '', Authorization: `Bearer ${tok}` } }).catch(() => {});
      clearTimeout(refreshTimer);
      window.WA.Auth.session = null;
      window.WA.Auth.recoverySession = null;
      localStorage.removeItem(SESSION_KEY);
      document.dispatchEvent(new CustomEvent('wa:signed-out'));
    },
    /* Everything this browser keeps for WanderAlt: saves, lists, follows,
       interests, history, the cached catalogue and the service worker's data. */
    wipeDevice: async () => {
      if (window.WA.Push) await Promise.race([window.WA.Push.disable(), new Promise(r => setTimeout(r, 3000))]).catch(() => {});
      try {
        Object.keys(localStorage).filter(k => /^(wa:|wanderalt:)/.test(k)).forEach(k => localStorage.removeItem(k));
        Object.keys(sessionStorage).filter(k => /^(wa:|wanderalt:)/.test(k)).forEach(k => sessionStorage.removeItem(k));
      } catch {}
      try { if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k))); } catch {}
    },
    /* Deletes the account and, through cascades, everything it owns. True when
       the server confirms; the caller reloads. */
    deleteAccount: async () => {
      const A = window.WA.Auth;
      if (!A.session) return false;
      const sub = window.WA.Push ? window.WA.Push.disable() : null;   /* while the session can still remove its row */
      if (sub) await Promise.race([sub, new Promise(r => setTimeout(r, 3000))]).catch(() => {});
      try {
        const r = await fetch(`${BASE()}/functions/v1/delete-account`, { method: 'POST', headers: A.getAuthHeaders() });
        if (r.status !== 204) return false;
      } catch { return false; }
      clearTimeout(refreshTimer);
      A.session = null; A.recoverySession = null;
      await A.wipeDevice();
      return true;
    },
    openSignIn: () => openOverlay('start'),
  };

  /* ── Restore or parse session ────────────────────────────── */

  /* Supabase access tokens last an hour. Without a refresh the reader would
     be signed out once an hour, so the refresh token renews the session. */
  let refreshTimer = null;
  const announce = () => document.dispatchEvent(new CustomEvent('wa:signed-in'));

  const refresh = async () => {
    const cur = window.WA.Auth.session || loadSession();
    if (!cur || !cur.refresh_token) return false;
    try {
      const r = await fetch(`${window.WA.BASE_URL || ''}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: window.WA.ANON_KEY || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: cur.refresh_token }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.access_token) {
        const s = sessionFromToken(d.access_token, d.refresh_token || cur.refresh_token);
        const was = !!window.WA.Auth.session;
        window.WA.Auth.session = s; saveSession(s); schedule();
        if (!was) announce();
        return true;
      }
      /* 4xx: the refresh token is spent or revoked, so sign out for real.
         A network error or 5xx leaves the session for the next try. */
      if (r.status >= 400 && r.status < 500) {
        window.WA.Auth.session = null;
        try { localStorage.removeItem(SESSION_KEY); } catch {}
        document.dispatchEvent(new CustomEvent('wa:signed-out'));
      }
    } catch {}
    return false;
  };

  function schedule() {
    clearTimeout(refreshTimer);
    const s = window.WA.Auth.session;
    if (!s || !s.refresh_token || !s.expires_at) return;
    const ms = Math.max(5000, (s.expires_at - 120) * 1000 - Date.now());
    refreshTimer = setTimeout(refresh, Math.min(ms, 2 ** 31 - 1));
  }

  /* A second tab renewing or signing out is picked up here. */
  window.addEventListener('storage', (e) => {
    if (e.key !== SESSION_KEY) return;
    const next = loadSession();
    const had = !!window.WA.Auth.session;
    window.WA.Auth.session = next && !(next.expires_at && Date.now() / 1000 > next.expires_at) ? next : null;
    if (window.WA.Auth.session) { schedule(); if (!had) announce(); }
    else if (had) document.dispatchEvent(new CustomEvent('wa:signed-out'));
  });

  const parsed = parseHash();
  if (parsed && parsed.error) {
    window.WA.Auth.signInError = parsed.error;
  } else if (parsed) {
    if (parsed.type === 'recovery' && parsed.session) {
      window.WA.Auth.recoverySession = parsed.session;
      /* Do NOT log in — show set-password form instead. */
    } else if (parsed.session) {
      window.WA.Auth.session = parsed.session;
      saveSession(parsed.session);
      schedule();
      Promise.resolve().then(announce);
    }
  } else {
    const stored = loadSession();
    if (stored) {
      const stale = stored.expires_at && Date.now() / 1000 > stored.expires_at - 30;
      if (stale) {
        /* Renew first; the reader is announced signed in once it works. */
        refresh();
      } else {
        window.WA.Auth.session = stored;
        schedule();
        Promise.resolve().then(announce);
      }
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

  /* The auth surface is the system's sheet: a <dialog class="wa-sheet">
     opened with showModal(), which supplies the backdrop, focus trapping
     and Escape. Every control inside is a .wa-btn or .wa-input. */
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

  /* Returns the dialog, not the body: the submit key lives in the sheet's
     foot while the fields live in its body. */
  const panel = () => overlay;
  const body  = () => overlay.querySelector('#auth-body');
  const foot  = () => overlay.querySelector('#auth-foot');
  const title = (t) => { overlay.querySelector('#auth-panel-title').textContent = t; };

  const render = (state) => {
    const renderers = { 'start': renderStart, 'sent': renderSent, 'sign-in': renderSignIn, 'sign-up': renderSignUp,
      'forgot': renderForgot, 'set-password': renderSetPassword };
    (renderers[state] || renderStart)(panel());
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
    /* --warn: a state the reader has to act on. */
    el.style.color = isError ? 'var(--warn)' : 'var(--ink-mute)';
  };

  /* ── Start: one way in for new and returning readers ─────────
     Google, or an email link. No password to remember; the password form
     is one step away for anyone who has one. */
  const renderStart = (p) => {
    title('Sign in or create an account');
    body().innerHTML = `
      <p class="wa-note" style="margin:0 0 var(--s-4)">One step for both. What you saved on this device comes with you.</p>
      <a href="${googleHref()}" class="wa-btn" style="width:100%">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.566 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
        Continue with Google
      </a>
      <p class="wa-field__consequence" style="text-align:center;margin:var(--s-4) 0">or</p>
      <div class="wa-field">
        <label class="wa-field__label" for="auth-email">Email</label>
        <input class="wa-input" id="auth-email" type="email" placeholder="you@example.com"
               autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" style="width:100%" />
      </div>
      <p class="wa-note" style="margin:0">We email a sign-in link. No password to remember. <button class="wa-linkbtn" type="button" id="auth-to-password">Use a password instead</button></p>
      <p class="wa-field__consequence" id="auth-status" aria-live="polite" style="margin-top:var(--s-4)"></p>`;
    foot().innerHTML = `
      <button class="wa-btn wa-btn--quiet" type="button" id="auth-close">Cancel</button>
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit">Email me a link</button>`;
    p.querySelector('#auth-close').addEventListener('click', closeOverlay);
    p.querySelector('#auth-to-password').addEventListener('click', () => render('sign-in'));
    p.querySelector('#auth-submit').addEventListener('click', doStart);
    p.querySelector('#auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doStart(); } });
    p.querySelector('#auth-email').focus();
  };

  const doStart = async () => {
    const p = panel();
    const email = p.querySelector('#auth-email').value.trim();
    const btn = p.querySelector('#auth-submit');
    if (!/^\S+@\S+\.\S+$/.test(email)) { setStatus('Enter your email address.', true); return; }
    btn.disabled = true;
    setStatus('Sending…');
    try {
      const redirect = encodeURIComponent(window.location.origin + window.location.pathname);
      const { ok, data } = await authFetch('POST', `/auth/v1/otp?redirect_to=${redirect}`, { email, create_user: true });
      if (ok) { sentTo = email; render('sent'); return; }
      setStatus(data.msg || data.error_description || 'Could not send the link. Try again.', true);
      btn.disabled = false;
    } catch { setStatus('Network error.', true); btn.disabled = false; }
  };

  /* ── Sent: open the link, or type the code if the email carries one ── */
  let sentTo = '';
  const renderSent = (p) => {
    title('Check your email');
    body().innerHTML = `
      <p class="wa-note" style="margin:0 0 var(--s-4)">We sent a sign-in link to <strong>${window.WA.UI.esc(sentTo)}</strong>. Open it on this device to finish.</p>
      <p style="margin:0"><button class="wa-linkbtn" type="button" id="auth-have-code">The email has a code</button></p>
      <div class="wa-field" id="auth-code-field" hidden style="margin-top:var(--s-4)">
        <label class="wa-field__label" for="auth-code">Code from the email</label>
        <input class="wa-input" id="auth-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456" style="width:100%" />
      </div>
      <p class="wa-field__consequence" id="auth-status" aria-live="polite" style="margin-top:var(--s-4)"></p>`;
    foot().innerHTML = `
      <button class="wa-btn wa-btn--quiet" type="button" id="auth-back">Use another email</button>
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit" hidden>Verify</button>`;
    p.querySelector('#auth-back').addEventListener('click', () => render('start'));
    p.querySelector('#auth-have-code').addEventListener('click', () => {
      p.querySelector('#auth-code-field').hidden = false; p.querySelector('#auth-submit').hidden = false;
      p.querySelector('#auth-have-code').hidden = true; p.querySelector('#auth-code').focus();
    });
    p.querySelector('#auth-submit').addEventListener('click', doVerify);
    p.querySelector('#auth-code').addEventListener('keydown', e => { if (e.key === 'Enter') doVerify(); });
  };

  const doVerify = async () => {
    const p = panel();
    const token = p.querySelector('#auth-code').value.replace(/\s+/g, '');
    const btn = p.querySelector('#auth-submit');
    if (!/^\d{4,8}$/.test(token)) { setStatus('Enter the digits from the email.', true); return; }
    btn.disabled = true;
    setStatus('Checking…');
    try {
      const { ok, data } = await authFetch('POST', '/auth/v1/verify', { type: 'email', email: sentTo, token });
      if (ok && data.access_token) {
        const s = sessionFromToken(data.access_token, data.refresh_token);
        window.WA.Auth.session = s; saveSession(s); schedule(); closeOverlay();
        document.dispatchEvent(new CustomEvent('wa:signed-in'));
      } else {
        setStatus(data.msg || data.error_description || 'That code did not work. Try again or use the link.', true);
        btn.disabled = false;
      }
    } catch { setStatus('Network error.', true); btn.disabled = false; }
  };

  /* ── Sign in ───────────────────────────────────────────────── */
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
        <button class="wa-linkbtn" type="button" id="auth-to-start">Email me a link instead</button>
        <span aria-hidden="true" style="color:var(--rule-strong)"> · </span>
        <button class="wa-linkbtn" type="button" id="auth-to-forgot">Forgot password?</button>
        <span aria-hidden="true" style="color:var(--rule-strong)"> · </span>
        <button class="wa-linkbtn" type="button" id="auth-to-signup">Create account</button>
      </p>
      <p class="wa-field__consequence" id="auth-status" aria-live="polite" style="margin-top:var(--s-4)"></p>`;
    foot().innerHTML = `
      <button class="wa-btn wa-btn--quiet" type="button" id="auth-close">Cancel</button>
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit">Sign in</button>`;
    p.querySelector('#auth-close').addEventListener('click', closeOverlay);
    p.querySelector('#auth-to-start').addEventListener('click', () => render('start'));
    p.querySelector('#auth-to-forgot').addEventListener('click', () => render('forgot'));
    p.querySelector('#auth-to-signup').addEventListener('click', () => render('sign-up'));
    p.querySelector('#auth-submit').addEventListener('click', doSignIn);
    p.querySelector('#auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
    p.querySelector('#auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); p.querySelector('#auth-password').focus(); } });
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
        const s = sessionFromToken(data.access_token, data.refresh_token);
        window.WA.Auth.session = s; saveSession(s); schedule(); closeOverlay();
        document.dispatchEvent(new CustomEvent('wa:signed-in'));
      } else {
        setStatus(data.error_description || data.msg || 'Invalid email or password.', true);
        btn.disabled = false;
      }
    } catch { setStatus('Network error.', true); btn.disabled = false; }
  };

  /* ── Sign up ───────────────────────────────────────────────── */
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
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit">Create account</button>`;
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
          const s = sessionFromToken(data.access_token, data.refresh_token);
          window.WA.Auth.session = s; saveSession(s); schedule(); closeOverlay();
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

  /* ── Forgot password ───────────────────────────────────────── */
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
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit">Send reset link</button>`;
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

  /* ── Set new password (recovery flow) ──────────────────────── */
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
      <button class="wa-btn wa-btn--primary" type="button" id="auth-submit">Update password</button>`;
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
        saveSession(s);
        setStatus('Password updated. You are now signed in.');
        document.dispatchEvent(new CustomEvent('wa:signed-in'));
        setTimeout(closeOverlay, 1500);
      } else {
        setStatus(data.msg || data.error_description || 'Update failed.', true);
        btn.disabled = false;
      }
    } catch { setStatus('Network error.', true); btn.disabled = false; }
  };

  /* A recovery link lands on any page; ask for the new password at once. */
  const openRecovery = () => { if (window.WA.Auth.recoverySession) setTimeout(() => openOverlay('set-password'), 120); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openRecovery);
  else openRecovery();
})();
