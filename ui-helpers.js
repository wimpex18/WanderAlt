/* ============================================================
   ui-helpers.js — WA.UI.
   ------------------------------------------------------------
   The two escapers every page routes database text through, the price
   formatter, the description guard, and the password field auth.js
   builds.

   Load order: any page script using WA.UI must load AFTER this file.
   All pages use <script defer>, so document order is the contract.
   ============================================================ */
(() => {
  window.WA = window.WA || {};

  /* Escapes the single quote as well as the double, so this stays correct
     if someone writes attr='${esc(x)}'. Reading a value back through
     .dataset or .textContent decodes the entities, so nothing downstream
     sees &#39;.

     Pick, venue and source text comes from outside sources and is
     interpolated into innerHTML. Every
     one of those fields goes through here AT THE INTERPOLATION SITE —
     including inside aria-label, title and data-* attributes. */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  /* Only http(s) URLs may become an href or an image source. Stored
     URLs come from outside sources, so a `javascript:` value is a realistic
     input, and esc() would happily pass it through — it escapes quotes,
     not schemes. Relative paths stay allowed; everything else is dropped
     rather than rendered dead. */
  const safeUrl = (u) => {
    if (!u) return '';
    const raw = String(u).trim();
    if (/^[\\/][^\\/]/.test(raw) || raw.startsWith('./') || raw.startsWith('../')) return raw;
    try {
      const proto = new URL(raw, location.origin).protocol;
      return (proto === 'http:' || proto === 'https:') ? raw : '';
    } catch (_) { return ''; }
  };

  /* "Free" / "€12" / "€24–75". Only ever from a stated source value —
     picks with no price data print nothing, never "price TBC". */
  const priceLabel = (p) => {
    if (!p) return '';
    if (p.isFree) return 'Free';
    if (p.priceMin == null) return '';
    const sym = p.currency === 'EUR' ? '€' : (p.currency ? p.currency + ' ' : '');
    const n = (v) => (Number(v) % 1 === 0 ? String(Number(v)) : Number(v).toFixed(2));
    return (p.priceMax != null && Number(p.priceMax) !== Number(p.priceMin))
      ? `${sym}${n(p.priceMin)}–${n(p.priceMax)}`
      : `${sym}${n(p.priceMin)}`;
  };

  /* ── Does this line earn its place? ─────────────────────────
     A description that only paraphrases the title counts as missing.
     The test is content words added beyond the title: zero is a
     restatement, one or more stands. Suppressing a real sentence is the
     worse error, so the ambiguous middle is kept. Stopwords include the
     generic listings vocabulary (live, event, party, night, concert).
     The same filler list exists in functions/_middleware.js and og-image;
     keep all three identical. */
  const FILLER = new Set(['the','and','with','for','from','out','you','your','its','are','was','this','that','into','all','new','one','two','live','event','events','show','shows','night','nights','music','party','concert','set','series','performs','presents','featuring','join','come','experience','enjoy','celebrate','discover','more','than','their','his','her']);

  const contentWords = (s) =>
    String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 3 && !FILLER.has(w));

  /* Returns the description when it says something, '' when it does not
     — so callers keep their "No description filed" path unchanged. */
  const descriptionOr = (text, title) => {
    const s = String(text == null ? '' : text).trim();
    if (!s) return '';
    /* "TBA", "n/a", "-": a placeholder is not a sentence. */
    if (s.length < 12 || /^(tba|tbc|n\/a|none|null|-|—)$/i.test(s)) return '';
    const t = new Set(contentWords(title));
    /* Only the opening needs judging: a long programme blob has
       plenty of new words further down and is not a paraphrase. */
    return contentWords(s.slice(0, 300)).some(w => !t.has(w)) ? s : '';
  };

  /* ── Password field ─────────────────────────────────────────
     auth.js builds its own overlay markup; this is the one control it
     cannot express as a plain input, because the reveal toggle needs a
     handler and the CSP forbids inline ones. */
  const EYE_SVG     = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></svg>';
  const EYE_OFF_SVG = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></svg>';

  const passwordField = (inputHtml, wrapStyle) =>
    `<span class="field-pw"${wrapStyle ? ` style="${wrapStyle}"` : ''}>${inputHtml}` +
    `<button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">${EYE_SVG}</button></span>`;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.pw-toggle');
    if (!btn) return;
    const input = btn.parentNode && btn.parentNode.querySelector('input');
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    btn.innerHTML = reveal ? EYE_OFF_SVG : EYE_SVG;
    btn.setAttribute('aria-pressed', reveal ? 'true' : 'false');
    btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });

  /* Rows that scroll sideways (the kind bar, the chip rows) fade out at the
     edge that has more behind it, so a row cut off by the screen reads as
     "there is more this way". The CSS reads .is-more-start / .is-more-end. */
  const SCROLLERS = '.wa-chips--scroll';
  const edges = (el) => {
    const room = el.scrollWidth - el.clientWidth;
    const x = Math.abs(el.scrollLeft);
    el.classList.toggle('is-more-start', x > 4);
    el.classList.toggle('is-more-end', x < room - 4);
  };
  const watch = (el) => {
    if (el.__edges) return;
    el.__edges = true;
    new ResizeObserver(() => edges(el)).observe(el);
    new MutationObserver(() => edges(el)).observe(el, { childList: true, subtree: true });
    edges(el);
  };
  const scan = () => document.querySelectorAll(SCROLLERS).forEach(watch);
  /* Scroll does not bubble; the capture phase sees every row's scroll. */
  document.addEventListener('scroll', (e) => { if (e.target.matches && e.target.matches(SCROLLERS)) edges(e.target); }, { capture: true, passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once: true }); else scan();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => document.querySelectorAll(SCROLLERS).forEach(edges));

  window.WA.UI = { esc, safeUrl, priceLabel, descriptionOr, passwordField, edges: scan };

  /* Every bottom sheet follows the finger. On a phone the grip, the head and,
     when its list is at the top, the body drag the panel down; let go past a
     third of its height (or with a flick) and it closes, otherwise it springs
     back. Upwards it gives a little and no more. Dismissal goes through a
     cancelable 'cancel' event, as Escape does, so a sheet that answers its
     own Cancel (a confirm) hears it. A tap on the backdrop closes too. */
  (() => {
    const phone = window.matchMedia ? window.matchMedia('(max-width: 767px)') : { matches: true };
    let drag = null;
    const dismiss = (d) => {
      if (!d.open) return;
      const ev = new Event('cancel', { cancelable: true });
      if (d.dispatchEvent(ev) && d.open) d.close();
    };
    const settle = (panel, to, done) => {
      panel.style.transition = `transform ${to ? 220 : 380}ms ${to ? 'var(--ease)' : 'var(--spring)'}`;
      panel.style.transform = to ? 'translateY(110%)' : '';
      setTimeout(() => {
        panel.style.transition = '';
        if (to) { if (done) done(); panel.style.transform = ''; }
        /* The entrance animation was held while dragging; give it back for the next opening. */
        const d = panel.closest('dialog');
        if (d && !d.open) panel.style.animation = '';
        else if (d) d.addEventListener('close', () => { panel.style.animation = ''; }, { once: true });
      }, to ? 200 : 380);
    };
    const start = (e, y) => {
      if (!phone.matches) return;
      const d = e.target.closest && e.target.closest('dialog.wa-sheet[open]');
      const panel = d && d.querySelector('.wa-sheet__panel');
      if (!panel || !panel.contains(e.target)) return;
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      const head = !!e.target.closest('.wa-sheet__head');
      const body = e.target.closest('.wa-sheet__body');
      if (!head && !body) return;
      drag = { d, panel, body, y0: y, y, t: performance.now(), v: 0, moving: false };
    };
    const move = (e, y) => {
      if (!drag) return;
      const dy = y - drag.y0;
      if (!drag.moving) {
        if (Math.abs(dy) < 8) return;
        /* From the body, only a pull down while the list is at its top moves the sheet. */
        if (drag.body && (dy < 0 || drag.body.scrollTop > 0)) { drag = null; return; }
        drag.moving = true;
        drag.panel.style.transition = 'none';
        drag.panel.style.animation = 'none';
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      drag.v = (y - drag.y) / Math.max(1, now - drag.t);
      drag.y = y; drag.t = now;
      drag.panel.style.transform = `translateY(${dy > 0 ? dy : -Math.sqrt(-dy) * 2}px)`;
    };
    const end = () => {
      if (!drag) return;
      const g = drag; drag = null;
      if (!g.moving) return;
      const dy = g.y - g.y0;
      if (dy > Math.min(160, g.panel.offsetHeight / 3) || (g.v > 0.6 && dy > 24)) settle(g.panel, true, () => dismiss(g.d));
      else settle(g.panel, false);
    };
    document.addEventListener('touchstart', (e) => start(e, e.touches[0].clientY), { passive: true });
    document.addEventListener('touchmove', (e) => move(e, e.touches[0].clientY), { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    /* A press that lands outside the panel is a press on the backdrop. */
    document.addEventListener('click', (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDialogElement) || !d.classList.contains('wa-sheet') || !d.open) return;
      const box = d.querySelector('.wa-sheet__panel');
      if (!box) return;
      const r = box.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dismiss(d);
    });
  })();

  /* On iPhone the on-screen keyboard shrinks the visual viewport and leaves
     the layout viewport alone, so a bottom sheet stays where it was and its
     fields and its button end up under the keys. Publish the visual
     viewport's box as --vv-top and --vv-h; .wa-sheet sizes itself to it.
     Without a keyboard both stay unset and the sheet fills the page. */
  (() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const sync = () => {
      const covered = window.innerHeight - vv.height > 80;
      if (covered) { root.style.setProperty('--vv-top', `${vv.offsetTop}px`); root.style.setProperty('--vv-h', `${vv.height}px`); }
      else { root.style.removeProperty('--vv-top'); root.style.removeProperty('--vv-h'); }
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    /* A focused field inside an open sheet is brought into view once the keyboard is up. */
    document.addEventListener('focusin', (e) => {
      if (e.target.closest && e.target.closest('dialog.wa-sheet, dialog.wa-search-dialog')) setTimeout(() => e.target.scrollIntoView({ block: 'nearest' }), 350);
    });
  })();
})();
