/* ============================================================
   i18n.js — the interface in English, Estonian and Russian.
   ------------------------------------------------------------
   English is the source language: every template in the pages is written in
   English and stays so. A language is two tables (lang/et.js, lang/ru.js) of
   exact phrases and patterns with {placeholders}; this file looks each piece
   of rendered text up in them. Text nodes and the aria-label, title,
   placeholder and alt attributes are translated as they appear (a
   MutationObserver, before the browser paints) and a "a · b · c" line is
   translated piece by piece. Anything not in the table stays English, so a
   missing phrase is a gap, never a break. Listing titles, venue names and
   every other text from a source are not in the table and are left alone;
   mark an element data-notranslate to keep its text out of it.

   window.WA.Lang:
     .supported          ['en', 'et', 'ru']
     .current()          'en' | 'et' | 'ru'
     .set(lang)          saves the choice (wa:lang:v1) and reloads the page
     .locale()           'en-GB' | 'et-EE' | 'ru-RU' for Intl
     .t(text, vars)      one string through the tables: t('{n} min walk', { n: 5 })
     .days() .daysFull() .months()   Sunday-first and January-first names for the current language
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const SUPPORTED = ['en', 'et', 'ru'];
  const LOCALE = { en: 'en-GB', et: 'et-EE', ru: 'ru-RU' };
  const KEY = 'wa:lang:v1';

  const detect = () => {
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
      p.names.forEach((n, i) => { const v = m[i + 1]; vars[n] = lookup(v) ?? v; });
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
  const SKIP = 'script, style, noscript, textarea, code, pre, [translate="no"], [data-notranslate]';
  const textOrig = new WeakMap(), textLast = new WeakMap();
  const attrOrig = new WeakMap(), attrLast = new WeakMap();

  const skipped = (node) => { const el = node.nodeType === 1 ? node : node.parentElement; return !el || !!el.closest(SKIP); };

  const text = (n) => {
    if (skipped(n)) return;
    const cur = n.data, last = textLast.get(n);
    if (last !== undefined && cur === last) return;           // our own write
    const out = tr(cur);
    textOrig.set(n, cur);
    if (out !== cur) { textLast.set(n, out); n.data = out; } else { textLast.delete(n); }
  };
  const attr = (el, name) => {
    if (skipped(el)) return;
    const cur = el.getAttribute(name);
    if (cur == null) return;
    const lasts = attrLast.get(el) || {};
    if (lasts[name] !== undefined && cur === lasts[name]) return;
    const out = tr(cur);
    const origs = attrOrig.get(el) || {};
    origs[name] = cur; attrOrig.set(el, origs);
    if (out !== cur) { lasts[name] = out; attrLast.set(el, lasts); el.setAttribute(name, out); } else if (lasts[name] !== undefined) { delete lasts[name]; }
  };
  const walk = (root) => {
    if (root.nodeType === 3) { text(root); return; }
    if (root.nodeType !== 1) return;
    if (root.matches && root.matches(SKIP)) return;
    for (const a of ATTRS) if (root.hasAttribute && root.hasAttribute(a)) attr(root, a);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) text(n);
      else for (const a of ATTRS) if (n.hasAttribute(a)) attr(n, a);
    }
  };

  let observer = null;
  const observe = () => {
    if (observer || !table()) return;
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach(walk);
        else if (r.type === 'characterData') text(r.target);
        else if (r.type === 'attributes') attr(r.target, r.attributeName);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };

  const titleOf = () => { const o = document.title; const out = tr(o); if (out !== o) document.title = out; };

  const start = () => {
    document.documentElement.lang = lang;
    if (!table()) return;
    walk(document.body);
    titleOf();
    observe();
  };

  const set = (next) => {
    if (!SUPPORTED.includes(next) || next === lang) return;
    try { localStorage.setItem(KEY, next); } catch (_) { /* kept for this page only */ }
    location.reload();
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

  window.WA.Lang = { supported: SUPPORTED, current: () => lang, set, locale: () => LOCALE[lang], t, tr, days, daysFull, months };
  document.documentElement.lang = lang;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
