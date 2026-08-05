/* ============================================================
   ui-helpers.js — WA.UI, what is left of it.
   ------------------------------------------------------------
   This was 489 lines of shared render helpers for the Dusk Glass pages:
   thumbs, glyph tiles, row media, social button rows, venue_details
   fact blocks, quote-echo detection, empty states. The Aug 2026
   redesign replaced every one of those with a component in wa.css or a
   module of its own, and the pages that called them are gone.

   Four things survive, and they survive because they are logic rather
   than markup — the two escapers that every page must route scraped
   text through, the password field auth.js builds, and the one price
   formatter. Everything else was deleted with its callers; see the
   cutover commit rather than reviving it from git history, because the
   markup it emitted no longer matches any stylesheet in the repo.

   Load order: any page script using WA.UI must load AFTER this file.
   All pages use <script defer>, so document order is the contract.
   ============================================================ */
(() => {
  window.WA = window.WA || {};

  /* Escapes the single quote as well as the double, so this stays correct
     if someone writes attr='${esc(x)}'. Reading a value back through
     .dataset or .textContent decodes the entities, so nothing downstream
     sees &#39;.

     Pick, venue and source text is scraped from Telegram, RSS and venue
     pages, passed through an LLM, and interpolated into innerHTML. Every
     one of those fields goes through here AT THE INTERPOLATION SITE —
     including inside aria-label, title and data-* attributes. */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  /* Only http(s) URLs may become an href or an image source. Scraped
     URLs reach us via an LLM, so a `javascript:` value is a realistic
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

  window.WA.UI = { esc, safeUrl, priceLabel, passwordField };
})();
