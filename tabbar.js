/* ============================================================
   tabbar.js — the glass drop: the phone tab bar's slider, and the
   same one on the Map's Show control.
   ------------------------------------------------------------
   At rest a tinted pill sits under the current option. Press the bar and
   the bar swells a little and a drop of clear glass lifts under the
   finger, larger than an option. It follows the finger; what it covers is
   magnified and turns vermilion, and only what it covers, so an option
   half under the drop is half tinted. Let go and the drop settles on
   the nearest option and picks it. A quick tap still just presses the
   option. From 1024 the tab bar is the masthead nav and none of this
   runs there.

   WA.glassDrop(bar, { name, item, itemClass, current, commit, enabled,
   dropWidth }) wires any row of options; the tab bar is one, the Map's
   Show control (map.js) is the other. It returns { sync }, to be called
   when an option's text or the current option changes.
   ============================================================ */
(() => {
  'use strict';

  window.WA = window.WA || {};
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const glassDrop = (bar, cfg) => {
    const items = [...bar.querySelectorAll(cfg.item)];
    if (!items.length) return null;
    const enabled = cfg.enabled || (() => true);
    const cur = cfg.current;

    /* The rest pill, and the drop. The drop holds an inert, tinted copy
       of the options, laid exactly over the real ones and clipped to the
       drop's shape: that copy is what shows through the glass. */
    const pill = document.createElement('span');
    pill.className = `${cfg.name}__pill`;
    pill.setAttribute('aria-hidden', 'true');
    const drop = document.createElement('span');
    drop.className = `${cfg.name}__drop`;
    drop.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = `${cfg.name}__copy`;
    drop.append(copy);
    bar.prepend(pill);
    bar.append(drop);
    const fill = () => {
      copy.innerHTML = items.map(a => `<span class="${cfg.itemClass}">${a.innerHTML.replace(/\sid="[^"]*"/g, '')}</span>`).join('');
    };

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
       options stay over the real ones, magnified about the drop's centre. */
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
      if (cfg.dropWidth) drop.style.width = `${cfg.dropWidth(items.map((_, i) => box(i).w))}px`;
      copy.style.width = `${bar.clientWidth}px`; copy.style.height = `${bar.clientHeight}px`;
      const c = cur();
      rest(c); aim(c < 0 ? 0 : box(c).cx);
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.remove('is-placing')));
    };
    fill();
    place();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    addEventListener('resize', place);

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
      /* Lift where the finger is, from the option it pressed. */
      bar.classList.add('is-placing');
      aim(box(g.i).cx);
      drop.getBoundingClientRect();
      bar.classList.remove('is-placing');
      aim((g.x - r.left) / k);
    };

    bar.addEventListener('pointerdown', (e) => {
      if (!enabled() || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
      if (!lifted) return;          /* a tap: the option's own click follows */
      swallow = true;
      setTimeout(() => { swallow = false; }, 450);
      const now = cur();
      const to = cancelled ? now : i;
      aim(box(to).cx);              /* settle on the nearest option */
      rest(to);
      bar.classList.remove('is-lifted');
      if (cancelled || to === now) return;
      cfg.commit(to, items[to]);
    };
    bar.addEventListener('pointerup', (e) => end(e, false));
    bar.addEventListener('pointercancel', (e) => end(e, true));

    /* The click after a slide belongs to the slide. A tap moves the pill
       first so the change reads as the same motion. */
    bar.addEventListener('click', (e) => {
      if (swallow) { e.preventDefault(); e.stopPropagation(); swallow = false; return; }
      const a = e.target.closest(cfg.item);
      if (a && enabled()) rest(items.indexOf(a));
    }, true);
    bar.addEventListener('contextmenu', (e) => { if (enabled()) e.preventDefault(); });

    return {
      sync() { fill(); place(); },
      reset() { bar.classList.remove('is-lifted', 'is-going'); items.forEach(a => a.classList.remove('is-to')); place(); },
    };
  };
  window.WA.glassDrop = glassDrop;

  /* ── The tab bar ───────────────────────────────────────────── */
  const bar = document.querySelector('.wa-tabbar');
  if (!bar) return;
  const phone = matchMedia('(max-width: 1023px)');
  const current = [...bar.querySelectorAll('.wa-tabbar__item')].findIndex(a => a.getAttribute('aria-current') === 'page');
  const drop = glassDrop(bar, {
    name: 'wa-tabbar', item: '.wa-tabbar__item', itemClass: 'wa-tabbar__item',
    current: () => current, enabled: () => phone.matches,
    /* Settle, then open the tab. */
    commit: (to, a) => {
      a.classList.add('is-to');
      bar.classList.add('is-going');
      const go = () => { location.href = a.href; };
      if (still()) go(); else setTimeout(go, 200);
    },
  });
  if (drop) addEventListener('pageshow', (e) => { if (e.persisted) drop.reset(); });
})();
