/* ============================================================
   tabbar.js — the phone tab bar's glass drop.
   ------------------------------------------------------------
   At rest a tinted pill sits under the current tab. Press the bar and
   the bar swells a little and a drop of clear glass lifts under the
   finger, larger than a tab. It follows the finger; what it covers is
   magnified and turns vermilion, and only what it covers, so a tab
   half under the drop is half tinted. Let go and the drop settles on
   the nearest tab and opens it. A quick tap still just follows the
   link. From 1024 the bar is the masthead nav and none of this runs.
   ============================================================ */
(() => {
  'use strict';

  const bar = document.querySelector('.wa-tabbar');
  if (!bar) return;
  const items = [...bar.querySelectorAll('.wa-tabbar__item')];
  if (!items.length) return;

  const phone = matchMedia('(max-width: 1023px)');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The rest pill, and the drop. The drop holds an inert, tinted copy
     of the tabs, laid exactly over the real ones and clipped to the
     drop's shape: that copy is what shows through the glass. */
  const pill = document.createElement('span');
  pill.className = 'wa-tabbar__pill';
  pill.setAttribute('aria-hidden', 'true');
  const drop = document.createElement('span');
  drop.className = 'wa-tabbar__drop';
  drop.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.className = 'wa-tabbar__copy';
  copy.innerHTML = items.map(a => `<span class="wa-tabbar__item">${a.innerHTML}</span>`).join('');
  drop.append(copy);
  bar.prepend(pill);
  bar.append(drop);

  const current = items.findIndex(a => a.getAttribute('aria-current') === 'page');

  /* Bar-local geometry, correct while the bar is scaled up. */
  const local = () => {
    const r = bar.getBoundingClientRect();
    return { r, k: r.width / bar.offsetWidth || 1 };
  };
  const box = (i) => {
    const a = items[i];
    return { x: a.offsetLeft, w: a.offsetWidth, cx: a.offsetLeft + a.offsetWidth / 2 };
  };
  const rest = (i) => {
    if (i < 0) { pill.hidden = true; return; }
    pill.hidden = false;
    const b = box(i);
    pill.style.width = `${b.w}px`;
    pill.style.transform = `translate3d(${b.x}px, 0, 0)`;
  };
  const nearest = (x) => {
    let best = 0, d = Infinity;
    items.forEach((_, i) => { const dd = Math.abs(x - box(i).cx); if (dd < d) { d = dd; best = i; } });
    return best;
  };

  /* Centre the drop on bar-local x; the copy moves the other way so its
     tabs stay over the real ones, magnified about the drop's centre. */
  const ZOOM = 1.12;
  const aim = (cx) => {
    const w = drop.offsetWidth;
    const pad = 2;
    const x = Math.min(Math.max(cx - w / 2, pad - 6), bar.clientWidth - w - pad + 6);
    drop.style.transform = `translate3d(${x}px, 0, 0)`;
    copy.style.left = `${-x}px`;
    copy.style.transformOrigin = `${x + w / 2}px 50%`;
    return x + w / 2;
  };

  const place = () => {
    bar.classList.add('is-placing');
    copy.style.width = `${bar.clientWidth}px`; copy.style.height = `${bar.clientHeight}px`;
    rest(current); aim(current < 0 ? 0 : box(current).cx);
    requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('is-placing'))); };
  place();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  addEventListener('resize', place);
  addEventListener('pageshow', (e) => { if (e.persisted) { bar.classList.remove('is-lifted', 'is-going'); items.forEach(a => a.classList.remove('is-to')); place(); } });

  /* ── Press, slide, release ─────────────────────────────────── */
  let g = null, swallow = false;
  const SLOP = 6, HOLD = 140;

  const lift = () => {
    if (!g || g.lifted) return;
    g.lifted = true;
    try { bar.setPointerCapture(g.id); } catch (_) { /* pointer already gone */ }
    bar.classList.add('is-lifted');
    const { r, k } = local();
    g.i = nearest((g.x - r.left) / k);
    /* Lift where the finger is, from the tab it pressed. */
    bar.classList.add('is-placing');
    aim(box(g.i).cx);
    drop.getBoundingClientRect();
    bar.classList.remove('is-placing');
    aim((g.x - r.left) / k);
  };

  bar.addEventListener('pointerdown', (e) => {
    if (!phone.matches || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    g = { id: e.pointerId, x0: e.clientX, x: e.clientX, lifted: false, i: -1 };
    g.t = setTimeout(lift, HOLD);
  });

  bar.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    g.x = e.clientX;
    if (!g.lifted) {
      if (Math.abs(e.clientX - g.x0) < SLOP) return;
      clearTimeout(g.t);
      lift();
    }
    e.preventDefault();
    const { r, k } = local();
    const cx = aim((e.clientX - r.left) / k);
    const i = nearest(cx);
    if (i !== g.i) { g.i = i; if (navigator.vibrate) navigator.vibrate(4); }
  });

  const end = (e, cancelled) => {
    if (!g || e.pointerId !== g.id) return;
    clearTimeout(g.t);
    const { lifted, i } = g;
    g = null;
    if (!lifted) return;          /* a tap: the link's own click follows */
    swallow = true;
    setTimeout(() => { swallow = false; }, 450);
    const to = cancelled ? current : i;
    aim(box(to).cx);              /* settle on the nearest tab */
    rest(to);
    bar.classList.remove('is-lifted');
    if (cancelled || to === current) return;
    items[to].classList.add('is-to');
    bar.classList.add('is-going');
    const go = () => { location.href = items[to].href; };
    if (still()) go(); else setTimeout(go, 200);
  };
  bar.addEventListener('pointerup', (e) => end(e, false));
  bar.addEventListener('pointercancel', (e) => end(e, true));

  /* The click after a slide belongs to the slide. A tap moves the pill
     first so the page change reads as the same motion. */
  bar.addEventListener('click', (e) => {
    if (swallow) { e.preventDefault(); e.stopPropagation(); swallow = false; return; }
    const a = e.target.closest('.wa-tabbar__item');
    if (a && phone.matches) rest(items.indexOf(a));
  }, true);
  bar.addEventListener('contextmenu', (e) => { if (phone.matches) e.preventDefault(); });
})();
