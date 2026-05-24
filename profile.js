/* ============================================================
   WanderAlt — Profile page
   ------------------------------------------------------------
   Renders the signed-in user's account: email, bookmark stats,
   change-password form, digest toggle, export, delete account,
   sign-out.

   Auth gate: if no session is present, redirect to index.html
   so the user can sign in via the topbar auth panel.

   Load order:
     catalog.js → city.js → supabase.js → auth.js → bookmark.js → profile.js
   ============================================================ */
(() => {
  /* ── Helpers ─────────────────────────────────────────────── */

  const $ = (sel) => document.querySelector(sel);

  const _statusTimers = {};
  const setStatus = (id, msg, isError = false) => {
    const el = $(`#${id}`);
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? 'var(--c-accent)' : 'var(--c-ink-mute)';
    if (msg && !isError) {
      clearTimeout(_statusTimers[id]);
      _statusTimers[id] = setTimeout(() => {
        if (el.textContent === msg) el.textContent = '';
      }, 4000);
    }
  };

  /* ── Auth gate ───────────────────────────────────────────── */

  const auth = window.WA && window.WA.Auth;
  if (!auth || !auth.isSignedIn()) {
    Promise.resolve().then(() => { window.location.replace('./index.html'); });
    return;
  }

  /* ── Render account header ───────────────────────────────── */

  const session = auth.session;
  const emailEl = $('#profile-email');
  if (emailEl) emailEl.textContent = session.email || 'Account';

  /* Avatar initial — first non-symbol character of the local part */
  const initialEl = $('#profile-avatar-initial');
  if (initialEl && session.email) {
    initialEl.textContent = session.email.charAt(0);
  }

  /* Member-since — decode iat from JWT payload */
  const metaEl = $('#profile-meta');
  const _decodeJWT = (token) => {
    try {
      return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return null; }
  };
  const payload = session.access_token ? _decodeJWT(session.access_token) : null;
  if (metaEl && payload?.iat) {
    const joined = new Date(payload.iat * 1000).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    /* metaEl is also updated by renderStats; pre-fill until bookmarks load */
    metaEl.dataset.joinedSuffix = `· joined ${joined}`;
  }

  /* ── Stats strip (bookmark count + city) ─────────────────── */

  const renderStats = () => {
    const el    = $('#profile-meta');
    if (!el) return;
    const total  = (window.WA.Bookmarks?.ids() || []).length;
    const city   = (window.WA.CITY || 'tallinn').replace(/^\w/, c => c.toUpperCase());
    const suffix = el.dataset.joinedSuffix || '';
    el.textContent = `${total} saved · ${city}${suffix ? ' ' + suffix : ''}`;
  };
  renderStats();
  document.addEventListener('wa:bookmarks-synced', renderStats);

  /* ── Bookmark count (section sub-heading) ────────────────── */

  const renderBookmarkCount = () => {
    const countEl  = $('#profile-bookmark-count');
    const exportBtn = $('#profile-export-btn');
    const ctaEl    = $('#profile-bookmark-cta');
    const total    = (window.WA.Bookmarks?.ids() || []).length;
    if (countEl) countEl.textContent = `${total} pick${total !== 1 ? 's' : ''}`;
    if (exportBtn) exportBtn.disabled = total === 0;
    if (ctaEl) ctaEl.hidden = total > 0;
  };
  renderBookmarkCount();
  document.addEventListener('wa:bookmarks-synced', renderBookmarkCount);

  /* ── Export bookmarks as JSON ────────────────────────────── */

  $('#profile-export-btn')?.addEventListener('click', () => {
    const store   = window.WA.Bookmarks?.get() || {};
    /* Export every bookmarked pick regardless of the user's active city
       setting — bookmarks are a global state, not a per-city slice. */
    const catalog = window.WA._catalogAll || window.WA.catalog || [];
    const city    = window.WA.CITY || 'tallinn';

    const picks = Object.keys(store)
      .filter(id => store[id])
      .map(id => {
        const entry = catalog.find(e => e.id === id);
        return entry
          ? { id, title: entry.title, venue: entry.venue,
              neighborhood: entry.neighborhood, handle: entry.handle }
          : { id };
      });

    const payload = {
      exported:  new Date().toISOString().slice(0, 10),
      city,
      count:     picks.length,
      picks,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `wanderalt-bookmarks-${payload.exported}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  /* ── Digest preference ───────────────────────────────────── */

  const BASE = () => window.WA.BASE_URL || '';
  const KEY  = () => window.WA.ANON_KEY  || '';

  const loadDigestPref = async () => {
    const check = $('#profile-digest-check');
    if (!check) return;
    try {
      const res = await fetch(
        `${BASE()}/rest/v1/profiles?user_id=eq.${encodeURIComponent(session.user_id)}&select=digest_enabled&limit=1`,
        { headers: { apikey: KEY(), Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) return;
      const rows = await res.json().catch(() => []);
      check.checked = !!(rows[0]?.digest_enabled);
    } catch { /* silently absent */ }
  };

  const saveDigestPref = async (enabled) => {
    setStatus('profile-digest-status', 'Saving…');
    try {
      const res = await fetch(`${BASE()}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          apikey:         KEY(),
          Authorization:  `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          Prefer:         'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ user_id: session.user_id, digest_enabled: enabled }),
      });
      if (res.ok || res.status === 204) {
        setStatus('profile-digest-status',
          enabled ? 'You\'re in — next digest: Saturday.' : 'Unsubscribed.');
      } else {
        setStatus('profile-digest-status', 'Could not save — try again.', true);
      }
    } catch {
      setStatus('profile-digest-status', 'Network error.', true);
    }
  };

  loadDigestPref();
  $('#profile-digest-check')?.addEventListener('change', (e) => {
    saveDigestPref(e.target.checked);
  });

  /* ── Change password ─────────────────────────────────────── */

  const updatePassword = async () => {
    const input = $('#profile-pw');
    const btn   = $('#profile-pw-submit');
    if (!input || !btn) return;
    const password = input.value;
    if (password.length < 6) {
      setStatus('profile-pw-status', 'Password must be at least 6 characters.', true);
      return;
    }
    btn.disabled = true;
    setStatus('profile-pw-status', 'Updating…');
    try {
      const res = await fetch(`${BASE()}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey:         KEY(),
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${auth.session.access_token}`,
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        input.value = '';
        setStatus('profile-pw-status', 'Password updated.');
      } else {
        setStatus('profile-pw-status', data.msg || data.error_description || 'Update failed.', true);
      }
    } catch {
      setStatus('profile-pw-status', 'Network error.', true);
    } finally {
      btn.disabled = false;
    }
  };

  $('#profile-pw-submit')?.addEventListener('click', updatePassword);
  $('#profile-pw')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') updatePassword();
  });

  /* ── Taste section ──────────────────────────────────────── */

  /* Map raw axis values to display-friendly labels. The capitalised
     short form reads cleanly when joined by middots — e.g. "Loud · Solo · Free". */
  const TASTE_LABELS = {
    loud: 'Loud', quiet: 'Quiet',
    solo: 'Solo', social: 'Social',
    free: 'Free', ticketed: 'Ticketed',
  };
  /* Stable axis order so the summary doesn't reshuffle when prefs are set
     in different sequences (Object.keys order = insertion order). */
  const AXIS_ORDER = ['energy', 'company', 'money'];

  const renderTasteSection = () => {
    const taste = window.WA?.taste;
    if (!taste) return;

    const summaryEl  = $('#taste-prefs-summary');
    const feedbackEl = $('#taste-feedback-count');

    if (summaryEl) {
      const prefs = taste.getPrefs();
      const parts = AXIS_ORDER
        .filter(axis => prefs[axis])
        .map(axis => TASTE_LABELS[prefs[axis]] || prefs[axis]);
      if (parts.length) {
        summaryEl.textContent = parts.join(' · ');
      } else {
        summaryEl.textContent = taste.isOnboarded() ? 'No preferences set' : 'Not set up yet — visit Today';
      }
    }

    if (feedbackEl) {
      const fb      = taste.getFeedback();
      const liked   = (fb.liked    || []).length;
      const disliked = (fb.disliked || []).length;
      const seen    = taste.getSeen().length;
      if (liked || disliked || seen) {
        feedbackEl.textContent =
          `${liked} liked · ${disliked} disliked · ${seen} seen`;
      } else {
        feedbackEl.textContent = 'No feedback recorded yet';
      }
    }
  };

  renderTasteSection();
  document.addEventListener('wa:taste-changed', renderTasteSection);

  $('#taste-reset-prefs-btn')?.addEventListener('click', () => {
    const taste = window.WA?.taste;
    if (!taste) return;
    taste.resetOnboarding();
    renderTasteSection();
    const el = $('#taste-status');
    if (el) {
      el.textContent = 'Preferences cleared — next Today visit will re-run setup.';
      el.style.color = 'var(--c-ink-mute)';
    }
  });

  $('#taste-clear-feedback-btn')?.addEventListener('click', () => {
    const taste = window.WA?.taste;
    if (!taste) return;
    taste.clearAllFeedback();
    renderTasteSection();
    const el = $('#taste-status');
    if (el) {
      el.textContent = 'Feedback and seen history cleared.';
      el.style.color = 'var(--c-ink-mute)';
    }
  });

  /* ── Sign out ────────────────────────────────────────────── */

  $('#profile-signout')?.addEventListener('click', () => {
    auth.signOut();
    window.location.href = './index.html';
  });

  document.addEventListener('wa:signed-out', () => {
    window.location.href = './index.html';
  });

  /* ── Delete account ──────────────────────────────────────── */

  const deleteBtn    = $('#profile-delete-btn');
  const deleteConf   = $('#profile-delete-confirm');
  const deleteCancel = $('#profile-delete-cancel');
  const deleteInput  = $('#profile-delete-input');
  const deleteSubmit = $('#profile-delete-submit');

  deleteBtn?.addEventListener('click', () => {
    if (deleteConf) deleteConf.hidden = false;
    deleteBtn.hidden = true;
    deleteInput?.focus();
  });

  deleteCancel?.addEventListener('click', () => {
    if (deleteConf) deleteConf.hidden = true;
    if (deleteBtn)  deleteBtn.hidden  = false;
    if (deleteInput) deleteInput.value = '';
    setStatus('profile-delete-status', '');
  });

  deleteSubmit?.addEventListener('click', async () => {
    if (!deleteInput || deleteInput.value.trim() !== 'DELETE') {
      setStatus('profile-delete-status', 'Type DELETE (all caps) to confirm.', true);
      return;
    }
    deleteSubmit.disabled = true;
    setStatus('profile-delete-status', 'Deleting…');
    try {
      const res = await fetch(`${BASE()}/auth/v1/user`, {
        method: 'DELETE',
        headers: {
          apikey:        KEY(),
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (res.ok || res.status === 204) {
        /* Clear local session + bookmarks before leaving. */
        try { localStorage.removeItem('wanderalt:bookmarks:v1'); } catch {/* ok */}
        auth.signOut();
        window.location.href = './index.html';
      } else {
        const data = await res.json().catch(() => ({}));
        const msg  = data.message || data.error_description || `Error ${res.status}`;
        setStatus('profile-delete-status',
          res.status === 403
            ? 'Account deletion is not enabled. Contact support to delete your account.'
            : msg, true);
        deleteSubmit.disabled = false;
      }
    } catch {
      setStatus('profile-delete-status', 'Network error — try again.', true);
      deleteSubmit.disabled = false;
    }
  });
})();
