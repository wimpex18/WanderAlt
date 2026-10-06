/* ============================================================
   i18n.js — the interface in English, Estonian, Russian and Ukrainian.
   ------------------------------------------------------------
   English is the source language: every template in the pages is written in
   English and stays so. A language is a table (lang/et.js, lang/ru.js, lang/uk.js) of
   exact phrases and patterns with {placeholders}; this file looks each piece
   of rendered text up in them. Text nodes and the aria-label, title,
   placeholder and alt attributes are translated as they appear (a
   MutationObserver, before the browser paints) and a "a · b · c" line is
   translated piece by piece. Anything not in the table stays English, so a
   missing phrase is a gap, never a break. Listing titles, venue names and
   every other text from a source are not in the table and are left alone;
   mark an element data-notranslate to keep its text out of it.

   window.WA.Lang:
     .supported          ['en', 'et', 'ru', 'uk']
     .current()          'en' | 'et' | 'ru' | 'uk'
     .set(lang)          saves the choice and updates the page in place
   The language is, in order: ?lang= in the address (a shared link; it is then kept), the choice
   saved on this device, the browser's own list (the first of en, et, ru, uk it names), English.
   Every page gets a switch in the top bar (a globe and the code), built here.
     .locale()           'en-GB' | 'et-EE' | 'ru-RU' | 'uk-UA' for Intl
     .t(text, vars)      one string through the tables: t('{n} min walk', { n: 5 })
     .days() .daysFull() .months()   Sunday-first and January-first names for the current language
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const SUPPORTED = ['en', 'et', 'ru', 'uk'];
  const LOCALE = { en: 'en-GB', et: 'et-EE', ru: 'ru-RU', uk: 'uk-UA' };
  const KEY = 'wa:lang:v1';

  const NAMES = { en: 'English', et: 'Eesti', ru: 'Русский', uk: 'Українська' };
  /* What the switch shows: short codes. Ukrainian reads UA (UK would read as Britain). */
  const CODES = { en: 'EN', et: 'ET', ru: 'RU', uk: 'UA' };

  const detect = () => {
    try {
      const q = new URLSearchParams(location.search).get('lang');
      if (SUPPORTED.includes(q)) { try { localStorage.setItem(KEY, q); } catch (_) { /* this page only */ } return q; }
    } catch (_) { /* no URL API */ }
    try { const s = localStorage.getItem(KEY); if (SUPPORTED.includes(s)) return s; } catch (_) { /* private mode */ }
    for (const l of (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'])) {
      const short = String(l).slice(0, 2).toLowerCase();
      if (SUPPORTED.includes(short)) return short;
    }
    return 'en';
  };
  let lang = detect();

  /* ── The tables ─────────────────────────────────────────────── */
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* A placeholder's first letter says what it may be, so "till {t}" cannot swallow a sentence:
     n, h, m a number; t a time (21:30); u a host name (fienta.com); d a date as the page prints it ("Sat 3 Oct", "3 Oct"); anything else any text. */
  const SHAPE = { n: '(\\d+)', h: '(\\d+)', m: '(\\d+)', t: '(\\d{1,2}:\\d{2})', u: '([\\w-]+(?:\\.[\\w-]+)+)', d: '((?:[^\\s\\d]+\\.? )?\\d{1,2}(?: [^\\s\\d]+\\.?)?)' };
  const compiled = {};
  const table = () => {
    if (lang === 'en') return null;
    const raw = (window.WA.dict || {})[lang];
    if (!raw) return null;
    if (compiled[lang]) return compiled[lang];
    const patterns = (raw.patterns || []).map(([src, dst]) => {
      const names = [];
      const re = new RegExp('^' + esc(src).replace(/\\\{(\w+)\\\}/g, (_, n) => { names.push(n); return SHAPE[n[0]] || '(.+?)'; }) + '$');
      return { re, names, dst };
    });
    return (compiled[lang] = { exact: raw.exact || {}, patterns });
  };

  let plural = null;
  const category = (n) => { plural = plural || new Intl.PluralRules(LOCALE[lang]); return plural.select(n); };

  const fill = (dst, vars) => dst.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const lookup = (core) => {
    const t = table();
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(t.exact, core)) return t.exact[core];
    for (const p of t.patterns) {
      const m = p.re.exec(core);
      if (!m) continue;
      const vars = {};
      // Source names stay literal even if one is also an interface word ("Festival").
      p.names.forEach((n, i) => { const v = m[i + 1]; vars[n] = n.startsWith('raw') ? v : lookup(v) ?? v; });
      /* A pattern whose target is an object picks a plural form by the number in {n}. */
      const dst = typeof p.dst === 'string' ? p.dst : (p.dst[category(Number(m[p.names.indexOf('n') + 1]))] || p.dst.other);
      return fill(dst, vars);
    }
    return null;
  };

  /* One piece of rendered text, whitespace around it kept. A line of pieces joined by "·" is translated
     piece by piece ("nearest first · 10 open now"), the dots and their spacing kept as they were. */
  const tr = (s) => {
    if (!table() || typeof s !== 'string') return s;
    const core = s.trim();
    if (!core) return s;
    let out = lookup(core);
    if (out == null && core.includes('·')) {
      const parts = core.split(/(\s*·\s*)/);            // pieces at even indexes, separators at odd
      let any = false;
      const done = parts.map((p, i) => {
        if (i % 2 || !p.trim()) return p;
        const r = lookup(p.trim());
        if (r == null) return p;
        any = true;
        return p.slice(0, p.indexOf(p.trim())) + r + p.slice(p.indexOf(p.trim()) + p.trim().length);
      });
      if (any) out = done.join('');
    }
    if (out == null) return s;
    return s.slice(0, s.indexOf(core)) + out + s.slice(s.indexOf(core) + core.length);
  };

  const t = (text, vars) => tr(vars ? fill(String(text), vars) : String(text));

  /* ── The page ───────────────────────────────────────────────── */
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  /* Names and titles from a source or a person are never looked up: an event called "Festival" or
     a bar called "Terminal" must not be "translated". Our own copy in them comes from the data. */
  const SKIP = 'script, style, noscript, textarea, code, pre, [translate="no"], [data-notranslate], '
    + '.wa-row__title, .wa-feed__title, .wa-place__name, .wa-place__why, .wa-poster__title, .det-next__name, .det-next__why, .vcard__name, '
    + '.map-preview__title, .rt__name, .rt-card__what b, .wa-gone__title, .wa-listcard__name, .det-summary';
  const textOrig = new WeakMap(), textLast = new WeakMap();
  const attrOrig = new WeakMap(), attrLast = new WeakMap();

  /* Pieces with letters that found no translation, for finding gaps: WA.Lang.missed(). Text from a
     source (titles, names) lands here too, by design. */
  const missed = new Set();
  const miss = (s) => { const c = s.trim(); if (missed.size < 3000 && /\p{L}{2}/u.test(c)) missed.add(c); };
  const skipped = (node) => { const el = node.nodeType === 1 ? node : node.parentElement; return !el || !!el.closest(SKIP); };

  const text = (n, force = false) => {
    if (skipped(n)) return;
    const cur = n.data, last = textLast.get(n);
    if (!force && last !== undefined && cur === last) return; // our own write
    const source = last !== undefined && cur === last ? textOrig.get(n) ?? cur : cur;
    const out = tr(source);
    textOrig.set(n, source);
    if (out !== source) textLast.set(n, out); else textLast.delete(n);
    if (out !== cur) n.data = out;
    if (out === source) miss(source);
  };
  const attr = (el, name, force = false) => {
    if (skipped(el)) return;
    const cur = el.getAttribute(name);
    if (cur == null) return;
    const lasts = attrLast.get(el) || {};
    if (!force && lasts[name] !== undefined && cur === lasts[name]) return;
    const origs = attrOrig.get(el) || {};
    const source = lasts[name] !== undefined && cur === lasts[name] ? origs[name] ?? cur : cur;
    const out = tr(source);
    origs[name] = source; attrOrig.set(el, origs);
    if (out !== source) lasts[name] = out; else delete lasts[name];
    attrLast.set(el, lasts);
    if (out !== cur) el.setAttribute(name, out);
    if (out === source) miss(source);
  };
  const walk = (root, force = false) => {
    if (!root) return;
    if (root.nodeType === 3) { text(root, force); return; }
    if (root.nodeType !== 1) return;
    if (root.matches && root.matches(SKIP)) return;
    for (const a of ATTRS) if (root.hasAttribute && root.hasAttribute(a)) attr(root, a, force);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) text(n, force);
      else for (const a of ATTRS) if (n.hasAttribute(a)) attr(n, a, force);
    }
  };

  let observer = null;
  const observe = () => {
    if (observer) return;
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach(n => walk(n));
        else if (r.type === 'characterData') text(r.target);
        else if (r.type === 'attributes') attr(r.target, r.attributeName);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };

  let titleOrig = '', titleLast = '';
  const titleOf = () => {
    const cur = document.title;
    const source = cur === titleLast ? titleOrig : cur;
    titleOrig = source; titleLast = tr(source);
    if (titleLast !== cur) document.title = titleLast;
  };

  const start = () => {
    document.documentElement.lang = lang;
    walk(document.body);
    titleOf();
    observe();
  };

  const set = (next) => {
    if (!SUPPORTED.includes(next) || next === lang) return;
    /* Keep drafts, open disclosures and the reading position through page redraws. */
    const fields = [...document.querySelectorAll('input[id], textarea[id], select[id]')].map(el =>
      ({ id: el.id, value: el.value, checked: el.checked, start: el.selectionStart, end: el.selectionEnd }));
    const folds = [...document.querySelectorAll('details[id]')].map(el => ({ id: el.id, open: el.open }));
    const focus = document.activeElement && document.activeElement.id;
    const position = [window.scrollX, window.scrollY];
    if (observer) observer.disconnect();
    lang = next; plural = null;
    Object.keys(cache).forEach(k => delete cache[k]);
    missed.clear();
    try { localStorage.setItem(KEY, next); } catch (_) { /* this page only */ }
    try {
      const u = new URL(location.href);
      if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); history.replaceState(history.state, '', u.toString()); }
    } catch (_) { /* no history API */ }
    document.documentElement.lang = next;
    walk(document.body, true);
    titleOf();
    document.dispatchEvent(new CustomEvent('wa:language-changed', { detail: { lang: next } }));
    // Page renderers regenerate localized dates and the catalogue's own copy.
    walk(document.body, true);
    titleOf();
    fields.forEach(saved => {
      const el = document.getElementById(saved.id);
      if (!el) return;
      el.value = saved.value;
      if (typeof saved.checked === 'boolean') el.checked = saved.checked;
      if (saved.start != null && el.setSelectionRange) { try { el.setSelectionRange(saved.start, saved.end); } catch (_) {} }
    });
    folds.forEach(saved => { const el = document.getElementById(saved.id); if (el) el.open = saved.open; });
    if (focus) { const el = document.getElementById(focus); if (el) el.focus({ preventScroll: true }); }
    window.scrollTo(...position);
    requestAnimationFrame(() => window.scrollTo(...position));
    if (observer) observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    else observe();
  };

  /* The switch in the top bar, left of the theme key: a globe and the current code. It opens a
     small pill of codes; the full names are only for screen readers. Never translated. */
  const GLOBE = '<circle class="t" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path class="k" d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z"/>';
  const mountSwitch = () => {
    const end = document.querySelector('.wa-topbar__end');
    if (!end || end.querySelector('.wa-lang')) return;
    const wrap = document.createElement('div');
    wrap.className = 'wa-lang';
    wrap.setAttribute('data-notranslate', '');
    wrap.innerHTML = `<button class="wa-lang__key" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Language: ${NAMES[lang]}">`
      + `<svg class="wa-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${GLOBE}</svg><span>${CODES[lang]}</span></button>`
      + `<div class="wa-lang__menu" role="menu" hidden>${SUPPORTED.map(c => `<button type="button" class="wa-lang__opt" role="menuitemradio" lang="${c}" data-lang-pick="${c}" aria-checked="${c === lang}" aria-label="${NAMES[c]}">${CODES[c]}</button>`).join('')}</div>`;
    const key = wrap.querySelector('.wa-lang__key'), menu = wrap.querySelector('.wa-lang__menu');
    let slider = null;
    const sync = () => {
      key.setAttribute('aria-label', `Language: ${NAMES[lang]}`);
      key.querySelector('span').textContent = CODES[lang];
      menu.querySelectorAll('[data-lang-pick]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.langPick === lang)));
      if (slider && !menu.hidden) slider.sync();
    };
    const open = (on) => {
      menu.hidden = !on; key.setAttribute('aria-expanded', String(on));
      if (on) { if (slider) slider.reset(); (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button')).focus(); }
      else if (slider) slider.reset();
    };
    const choose = (code) => { open(false); set(code); sync(); key.focus({ preventScroll: true }); };
    if (window.WA.glassDrop) slider = window.WA.glassDrop(menu, { name: 'wa-lang', item: '[data-lang-pick]', itemClass: 'wa-lang__opt', current: () => SUPPORTED.indexOf(lang), enabled: () => !menu.hidden, commitSame: true, commit: (i) => choose(SUPPORTED[i]) });
    document.addEventListener('wa:language-changed', sync);
    key.addEventListener('click', () => open(menu.hidden));
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-lang-pick]'); if (b) choose(b.dataset.langPick); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !wrap.contains(e.target)) open(false); });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { open(false); key.focus(); }
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (step && !menu.hidden) {
        e.preventDefault();
        const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
        items[(i + step + items.length) % items.length].focus();
      }
    });
    end.insertBefore(wrap, end.querySelector('.wa-theme') || end.querySelector('#account') || null);
  };

  /* Names for dates, from the browser's own data, in the current language. */
  const names = (opts, count, from) => Array.from({ length: count }, (_, i) =>
    new Intl.DateTimeFormat(LOCALE[lang], { ...opts, timeZone: 'UTC' }).format(from(i)));
  const cache = {};
  /* English keeps the fixed names the pages always used ("Sep", not en-GB's "Sept"). */
  const EN = {
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    full: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  };
  const days = () => (lang === 'en' ? EN.days : (cache.days = cache.days || names({ weekday: 'short' }, 7, i => new Date(Date.UTC(2023, 0, 1 + i)))));   // 1 Jan 2023 was a Sunday
  const daysFull = () => (lang === 'en' ? EN.full : (cache.full = cache.full || names({ weekday: 'long' }, 7, i => new Date(Date.UTC(2023, 0, 1 + i)))));
  const months = () => (lang === 'en' ? EN.months : (cache.months = cache.months || names({ month: 'short' }, 12, i => new Date(Date.UTC(2023, i, 15)))));

  window.WA.Lang = { supported: SUPPORTED, names: NAMES, codes: CODES, current: () => lang, set, missed: () => [...missed], locale: () => LOCALE[lang], t, tr, days, daysFull, months };
  document.documentElement.lang = lang;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  // Deferred scripts run while readyState is interactive; wait for tabbar.js too.
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', mountSwitch, { once: true }); else mountSwitch();
})();
