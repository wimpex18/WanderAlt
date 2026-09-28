/* ============================================================
   tabbar.js — the phone tab bar's glass drop.
   ------------------------------------------------------------
   One lens sits under the current tab. Press anywhere on the bar and
   slide: the lens lifts, follows the finger and magnifies the tab it
   is over; let go and it settles on that tab and opens it. A plain tap
   still follows the link. From 1024 the bar is the masthead nav and
   none of this runs.
   ============================================================ */
(() => {
  'use strict';

  const bar = document.querySelector('.wa-tabbar');
  if (!bar) return;
  const items = [...bar.querySelectorAll('.wa-tabbar__item')];
  if (!items.length) return;

  const phone = matchMedia('(max-width: 1023px)');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lens = document.createElement('span');
  lens.className = 'wa-tabbar__lens';
  lens.setAttribute('aria-hidden', 'true');
  bar.prepend(lens);

  const current = items.findIndex(a => a.getAttribute('aria-current') === 'page');
  let at = current;

  const box = (i) => {
    const b = bar.getBoundingClientRect(), r = items[i].getBoundingClientRect();
    return { x: r.left - b.left, w: r.width };
  };
  const put = (x, w) => { lens.style.width = `${w}px`; lens.style.transform = `translate3d(${x}px, 0, 0)`; };
  const mark = (i) => items.forEach((a, j) => a.classList.toggle('is-under', j === i));
  const settle = (i) => {
    at = i;
    if (i < 0) { lens.hidden = true; return; }
    lens.hidden = false;
    const r = box(i); put(r.x, r.w);
  };
  const indexAt = (clientX) => {
    let best = 0, d = Infinity;
    items.forEach((a, i) => {
      const r = a.getBoundingClientRect();
      const dd = Math.abs(clientX - (r.left + r.width / 2));
      if (dd < d) { d = dd; best = i; }
    });
    return best;
  };

  /* First placement without a tween, then let transitions run. */
  const first = () => { bar.classList.add('is-placing'); settle(current); requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('is-placing'))); };
  first();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => settle(at));
  addEventListener('resize', () => settle(at));
  addEventListener('pageshow', (e) => { if (e.persisted) { bar.classList.remove('is-dragging'); mark(-1); first(); } });

  /* ── Slide ─────────────────────────────────────────────────── */
  let drag = null, swallow = false;
  const SLOP = 6;

  bar.addEventListener('pointerdown', (e) => {
    if (!phone.matches || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, x0: e.clientX, on: false, i: indexAt(e.clientX) };
  });

  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on) {
      if (Math.abs(e.clientX - drag.x0) < SLOP) return;
      drag.on = true;
      try { bar.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
      bar.classList.add('is-dragging');
      lens.hidden = false;
    }
    e.preventDefault();
    const b = bar.getBoundingClientRect();
    const w = box(drag.i).w;
    const pad = 4;
    const x = Math.min(Math.max(e.clientX - b.left - w / 2, pad), b.width - w - pad);
    put(x, w);
    const i = indexAt(e.clientX);
    if (i !== drag.i) { drag.i = i; if (navigator.vibrate) navigator.vibrate(4); }
    mark(i);
  });

  const end = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { on, i } = drag;
    drag = null;
    if (!on) return;
    swallow = true;
    setTimeout(() => { swallow = false; }, 400);
    bar.classList.remove('is-dragging');
    mark(-1);
    if (cancelled) { settle(current); return; }
    settle(i);
    if (i === current) return;
    const go = () => { location.href = items[i].href; };
    if (still()) go(); else setTimeout(go, 170);
  };
  bar.addEventListener('pointerup', (e) => end(e, false));
  bar.addEventListener('pointercancel', (e) => end(e, true));

  /* The click after a slide belongs to the slide. A plain tap moves the
     lens first so the page change reads as the same motion. */
  bar.addEventListener('click', (e) => {
    if (swallow) { e.preventDefault(); e.stopPropagation(); swallow = false; return; }
    const a = e.target.closest('.wa-tabbar__item');
    if (a && phone.matches) settle(items.indexOf(a));
  }, true);
})();
