/* ============================================================
   install.js — WA.Install, the Home Screen invitation.
   ------------------------------------------------------------
   On iPhone a site becomes an app (full screen, its own icon, and the
   only place web notifications work) through Share > Add to Home Screen,
   which most people never open. This module asks once, late and
   quietly, then explains the steps.

   Three pieces:
     the nudge    a glass capsule above the tab bar, on Tonight, Programme
                  and Saved only, after the reader has shown interest
     the sheet    the steps, animated, opened from the nudge, from You and
                  from the notifications row on You
     the follow   inside the installed app, one invitation to switch
                  notifications on, for a signed-in reader who has not

   Interest means a second visit on another day, or something saved or
   followed, and never the first page of a session. A dismissal waits 14
   days, then 45, then stops for good; "I've added it" stops it at once.
   Chrome and Edge on Android and desktop use the browser's own install
   prompt when it offers one. Samsung Internet (27 and later) fires none, so
   it gets the menu steps and the nudge; other Android browsers get the menu
   steps from You only. Everything else stays silent.
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const KEY = 'wa:install:v1';
  const DAY = 86400000;
  const WAIT = [14 * DAY, 45 * DAY, 3650 * DAY];   /* after the 1st, 2nd, 3rd dismissal */
  const PAGES = ['tonight', 'programme', 'saved'];    /* data-page values that may show the nudge */
  const ua = navigator.userAgent || '';

  const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(ua) || (!/Android/i.test(ua) && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  /* An in-app browser (Instagram, Facebook, Threads) has no Safari token and no Share > Add to Home Screen. */
  const webview = () => (ios() && !/Safari\//.test(ua)) || /; wv\)/.test(ua);
  const otherIos = () => /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const android = () => /Android/i.test(ua);
  /* Samsung Internet stopped firing beforeinstallprompt in version 27; it wants installs from its own menu. */
  const samsung = () => /SamsungBrowser/i.test(ua);

  let deferred = null;   /* Chromium's install prompt, when it offers one */
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; save({ done: true }); drop(); });

  /* 'standalone' | 'ios' | 'chromium' (the browser offered its prompt) | 'menu' (Android, install from the
     browser's menu) | 'none' */
  const kind = () => (standalone() ? 'standalone' : ios() ? 'ios' : deferred ? 'chromium' : android() ? 'menu' : 'none');

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
  const save = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch (_) { /* private mode */ } };
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());

  /* Distinct days, last ten, and page views this session. */
  const noteVisit = () => {
    const s = read(), d = today();
    const days = (s.days || []).includes(d) ? s.days : [...(s.days || []), d].slice(-10);
    if (days !== s.days) save({ days });
    let v = 0;
    try { v = +sessionStorage.getItem('wa:install:views') || 0; sessionStorage.setItem('wa:install:views', String(++v)); } catch (_) { v = 2; }
    return { days: days.length, views: v };
  };

  const interested = (visit) => {
    const saves = Object.keys((window.WA.Bookmarks && window.WA.Bookmarks.get && window.WA.Bookmarks.get()) || {}).length;
    const follows = window.WA.Follows ? window.WA.Follows.keys().length : 0;
    return visit.views >= 2 && (visit.days >= 2 || saves > 0 || follows > 0);
  };

  const quiet = (field) => {
    const s = read();
    return !!s.done || Date.now() < (+s[field] || 0);
  };
  const dismissed = (count, until) => {
    const s = read(), n = (+s[count] || 0) + 1;
    save({ [count]: n, [until]: Date.now() + WAIT[Math.min(n, WAIT.length) - 1] });
  };

  /* ── Markup ──────────────────────────────────────────────── */

  /* The same mark as the header, so the invitation shows what will land on the Home Screen. */
  const MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#d83a14"/><path d="M6.5 12 11 23 16 14 21 23 23.5 17" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="m25 4.5 1.3 3.2 3.2 1.3-3.2 1.3L25 13.5l-1.3-3.2L20.5 9l3.2-1.3z" fill="#fff"/></svg>';
  const icon = (paths) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const IC = {
    share: icon('<path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5 13v6.5h14V13"/>'),
    add:   icon('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>'),
    web:   icon('<rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="16.5" cy="12" r="2.3" fill="currentColor" stroke="none"/>'),
    menu:  icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
  };

  let nudge = null;
  function drop() { if (nudge) { nudge.remove(); nudge = null; } }
  const leave = () => {
    if (!nudge) return;
    const n = nudge; nudge = null;
    n.classList.add('is-leaving');
    setTimeout(() => n.remove(), 260);
  };

  const showNudge = ({ title, sub, go, onGo, onNo }) => {
    drop();
    nudge = document.createElement('aside');
    nudge.className = 'wa-install';
    nudge.setAttribute('aria-label', title);
    nudge.innerHTML = `<span class="wa-install__icon">${MARK}</span>
      <span class="wa-install__text"><span class="wa-install__title"></span><span class="wa-install__sub"></span></span>
      <button class="wa-install__go" type="button"></button>
      <button class="wa-install__x" type="button" aria-label="Not now">${IC.close}</button>`;
    nudge.querySelector('.wa-install__title').textContent = title;
    nudge.querySelector('.wa-install__sub').textContent = sub;
    nudge.querySelector('.wa-install__go').textContent = go;
    nudge.querySelector('.wa-install__go').addEventListener('click', () => { leave(); onGo(); });
    nudge.querySelector('.wa-install__x').addEventListener('click', () => { leave(); onNo(); });
    document.body.appendChild(nudge);
  };

  /* ── The sheet ───────────────────────────────────────────── */

  const steps = () => {
    if (kind() === 'menu') {
      return samsung()
        ? [{ ic: IC.menu, title: 'Open the menu', text: 'Tap the ≡ button in the browser.', ping: true },
           { ic: IC.add,  title: 'Add page to', text: 'Choose Add page to, then Home screen. If you see Install, use that.' },
           { ic: IC.web,  title: 'Confirm', text: 'Tap Add.' }]
        : [{ ic: IC.menu, title: 'Open the menu', text: 'Tap the ⋮ button in the browser.', ping: true },
           { ic: IC.add,  title: 'Install app', text: 'Choose Install app, or Add to Home screen.' },
           { ic: IC.web,  title: 'Confirm', text: 'Tap Install or Add.' }];
    }
    const share = otherIos()
      ? 'Tap Share, the square with an arrow, in the toolbar or address bar.'
      : 'Tap the menu beside the address bar (≡ or ⋯), then Share.';
    return [
      { ic: IC.share, title: 'Share', text: share, ping: true },
      { ic: IC.add,   title: 'Add to Home Screen', text: 'Scroll the list. Not there? Tap Edit Actions at the bottom.' },
      { ic: IC.web,   title: 'Open as Web App', text: 'It is on by default. Leave it on, then tap Add.' },
    ];
  };

  const open = (from) => {
    const k = kind();
    const A = window.WA.Auth;
    const signedIn = !!(A && A.isSignedIn && A.isSignedIn());
    const saves = Object.keys((window.WA.Bookmarks && window.WA.Bookmarks.get && window.WA.Bookmarks.get()) || {}).length;
    const follows = window.WA.Follows ? window.WA.Follows.keys().length : 0;
    const carry = !signedIn && (saves > 0 || follows > 0);

    const d = document.createElement('dialog');
    d.className = 'wa-sheet wa-sheet--howto';
    d.setAttribute('aria-labelledby', 'howto-title');

    let body;
    if (k === 'standalone') {
      body = '<p class="wa-note">WanderAlt is already on your Home Screen.</p>';
    } else if (webview()) {
      body = `<p class="wa-note">This in-app browser cannot add WanderAlt to the Home Screen. Open <strong>wanderalt.app</strong> in ${ios() ? 'Safari' : 'your browser'}, then come back to this page.</p>`;
    } else if (k === 'ios' || k === 'menu') {
      body = `<p class="wa-note">${k === 'menu' ? 'Its own icon and window, one tap from your Home screen, and notifications as a real app.' : from === 'push' ? 'iPhone only sends web notifications from the Home Screen.' : 'Full screen, no browser bars, and the only way iPhone can send notifications.'}</p>
        <div class="wa-howto__stage" aria-hidden="true">
          <i class="wa-howto__ghost"></i><i class="wa-howto__ghost"></i><i class="wa-howto__ghost"></i>
          <span class="wa-howto__tile">${MARK}</span>
        </div>
        <ol class="wa-howto__steps">${steps().map((s, i) => `<li style="--i:${i}"><span class="wa-howto__chip${s.ping ? ' is-ping' : ''}">${s.ic}</span>
          <span class="wa-howto__copy"><strong>${s.title}</strong><span>${s.text}</span></span></li>`).join('')}</ol>
        ${carry && k === 'ios' ? `<div class="wa-howto__carry"><p>The app starts empty. Sign in first and your saves come with you.</p>
          <button class="wa-btn" type="button" id="howto-signin">Sign in first</button></div>` : ''}`;
    } else if (k === 'chromium') {
      body = '<p class="wa-note">Install it for its own window, one tap away.</p>';
    } else {
      body = '<p class="wa-note">This browser cannot install WanderAlt.</p>';
    }

    d.innerHTML = `<div class="wa-sheet__panel">
      <div class="wa-sheet__head"><h2 class="wa-sheet__title" id="howto-title">${k === 'standalone' ? 'Already installed' : k === 'menu' ? 'Add to Home screen' : 'Add to Home Screen'}</h2>
        <button class="wa-sheet__close" type="button" id="howto-x" aria-label="Close">${IC.close}</button></div>
      <div class="wa-sheet__body">${body}</div>
      <div class="wa-sheet__foot">${k === 'chromium'
        ? '<button class="wa-btn wa-btn--quiet" type="button" id="howto-no">Not now</button><button class="wa-btn wa-btn--primary" type="button" id="howto-go">Install</button>'
        : (k === 'ios' && !webview()) || k === 'menu'
          ? '<button class="wa-btn wa-btn--quiet" type="button" id="howto-no">Not now</button><button class="wa-btn wa-btn--primary" type="button" id="howto-done">I have added it</button>'
          : ''}</div></div>`;
    document.body.appendChild(d);
    const close = () => { if (d.open) d.close(); d.remove(); };
    d.addEventListener('click', (e) => {
      const box = d.querySelector('.wa-sheet__panel').getBoundingClientRect();
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) close();
    });
    d.addEventListener('close', () => d.remove());
    const on = (id, fn) => { const el = d.querySelector(id); if (el) el.addEventListener('click', fn); };
    on('#howto-x', close);
    on('#howto-no', () => { close(); if (from === 'nudge') dismissed('count', 'until'); });
    on('#howto-done', () => { save({ done: true }); close(); drop(); });
    on('#howto-signin', () => { close(); if (A && A.openSignIn) A.openSignIn(); });
    on('#howto-go', async () => {
      if (!deferred) { close(); return; }
      deferred.prompt();
      try { await deferred.userChoice; } catch (_) { /* closed */ }
      deferred = null; close();
    });
    d.showModal();
    return true;
  };

  /* ── When to ask ─────────────────────────────────────────── */

  const calm = () => {
    if (document.visibilityState !== 'visible') return false;
    if (document.querySelector('dialog[open], .wa-toast')) return false;
    const a = document.activeElement;
    return !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  };

  /* After a few seconds on the page, at a calm moment. A page that is out of sight waits to be seen. */
  const whenCalm = (fn, tries = 4) => setTimeout(() => {
    if (document.visibilityState !== 'visible') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') whenCalm(fn, tries); }, { once: true });
    } else if (calm()) fn();
    else if (tries > 1) whenCalm(fn, tries - 1);
  }, tries === 4 ? 9000 : 6000);

  const start = () => {
    const page = document.body && document.body.dataset.page;
    const visit = noteVisit();
    const k = kind();

    if (k === 'standalone') {
      /* Installed: stop asking, and invite once to notifications. */
      save({ done: true });
      const A = window.WA.Auth;
      if (!PAGES.includes(page) || !('Notification' in window) || Notification.permission !== 'default') return;
      if (Date.now() < (+read().nUntil || 0)) return;
      if (visit.views < 2) return;
      const ask = () => {
        if (!(A && A.isSignedIn && A.isSignedIn())) return;
        showNudge({
          title: 'Alerts when plans change',
          sub: 'Cancellations, and tonight at places you follow',
          go: 'Set up',
          onGo: () => { dismissed('nCount', 'nUntil'); location.assign('./profile.html#notifications'); },
          onNo: () => dismissed('nCount', 'nUntil'),
        });
      };
      document.addEventListener('wa:signed-in', () => whenCalm(ask), { once: true });
      whenCalm(ask);
      return;
    }

    if (!PAGES.includes(page) || quiet('until') || !interested(visit)) return;
    const ask = () => {
      const kk = kind();
      if (kk === 'none' || kk === 'standalone' || (kk === 'ios' && webview()) || (kk === 'menu' && !samsung())) return;
      showNudge({
        title: 'Make it an app',
        sub: kk === 'chromium' ? 'Install in one tap' : 'Add to Home Screen',
        go: kk === 'chromium' ? 'Install' : 'Show me',
        onGo: () => { save({ until: Date.now() + 7 * DAY }); open('nudge'); },
        onNo: () => dismissed('count', 'until'),
      });
    };
    whenCalm(ask);
  };

  window.WA.Install = { kind, open, standalone, webview, canOpen: () => ['ios', 'chromium', 'menu'].includes(kind()) && !webview() };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
