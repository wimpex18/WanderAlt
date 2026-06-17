/* ============================================================
   WanderAlt — ui-helpers.js (June 2026, ROADMAP P1)
   ------------------------------------------------------------
   The shared render helpers that used to be hand-copied into 5–6
   page scripts ("script-tag ordering is the module system, and
   nothing enforces it" — the copies drifted, and fixes like the
   F-12 'other' guard had to be applied five times). One extra
   <script defer> tag, no build step.

   Exposes window.WA.UI:
     esc(s)             HTML-escape for template interpolation
     buildMeta(e)       "Neighborhood · kind · day time" meta line
     isEchoQuote(e)     true when a pick's quote merely echoes its
                        curator's signature tagline (or is empty)
     bookmarkSVG()      the bookmark glyph
     thumb(e, large)    a .thumb span (photo or initials tile)
     rowMedia(e)        the .list-row__media link wrapping a --lg thumb
     socialButtons(v)   web/social link buttons for a venue/place
                        ({ name, website, facebook, instagram })

   Load order: any page script using WA.UI must load AFTER this file
   (all pages use <script defer>, so document order is the contract).
   saved.js keeps its own buildMeta on purpose — Going rows put the
   day in a separate time column, so its meta line differs.
   ============================================================ */
(() => {
  window.WA = window.WA || {};

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const buildMeta = (e) => {
    /* 'other' is a data bucket, not a place — never print it (F-12). */
    const nhood = e.neighborhood && e.neighborhood.toLowerCase() !== 'other' ? e.neighborhood : null;
    const parts = [nhood, e.kind];
    if (e.day && e.day !== 'Tonight') parts.push(e.time ? `${e.day} ${e.time}` : e.day);
    else if (e.time)                  parts.push(e.time);
    return parts.filter(Boolean).join(' · ');
  };

  /* A pick whose quote merely echoes the curator's signature tagline adds
     noise row after row (F-10) — render the quote only when it was written
     for the pick; otherwise attribute the row with a quiet "via @handle"
     (the Today list idiom). Empty quotes take the same path. */
  const isEchoQuote = (e) => {
    const q = (e.quote || '').trim().toLowerCase();
    if (!q) return true;
    const cs = (window.WA && (window.WA._curatorsAll || window.WA.curators)) || [];
    const c  = cs.find(x => x.handle === e.handle);
    return !!(c && c.tagline && q === c.tagline.trim().toLowerCase());
  };

  const bookmarkSVG = () =>
    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         stroke-width="1.25" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
       <path d="M6 3h12v18l-6-4-6 4V3z" />
     </svg>`;

  /* A .thumb span — real photo when entry.imageUrl is set, otherwise the
     initials tile. Used by the Tonight venue block + This Week rows. */
  const thumb = (entry, large = false) => {
    const cls   = `thumb${large ? ' thumb--lg' : ''}${entry.imageUrl ? ' thumb--has-img' : ''}`;
    const style = entry.imageUrl
      ? ` style="background-image:url('${WA.img(entry.imageUrl, 200).replace(/'/g, '%27')}')"` : '';
    const label = entry.imageUrl ? entry.venue : `${entry.venue} placeholder`;
    return `<span class="${cls}" role="img" aria-label="${esc(label)}"${style}>` +
           `<span class="thumb__fallback" aria-hidden="${!!entry.imageUrl}">${esc(entry.thumbInitials || '')}</span>` +
           `</span>`;
  };

  /* The photo-card row media: a decorative .list-row__media link wrapping a
     --lg thumb (the title link is the keyboard tab stop). Shared by
     Discover events, Saved, Curator picks, place "events here". */
  const rowMedia = (e) => {
    const imgUrl = e.imageUrl || e.image_url || null;
    const initials = (e.thumbInitials || e.thumb_initials
      || (e.venue || e.title || '?').slice(0, 2)).toUpperCase().slice(0, 2);
    const cls = `thumb thumb--lg${imgUrl ? ' thumb--has-img' : ''}`;
    const sty = imgUrl ? ` style="background-image:url('${WA.img(String(imgUrl), 200).replace(/'/g, '%27')}')"` : '';
    return `<a class="list-row__media" href="venue.html?id=${encodeURIComponent(e.id)}" tabindex="-1" aria-hidden="true">
      <span class="${cls}" role="img" aria-label="${esc(e.venue || e.title)}"${sty}>
        <span class="thumb__fallback" aria-hidden="${!!imgUrl}">${esc(initials)}</span>
      </span></a>`;
  };

  /* External web / social links for a venue or place, rendered as a compact
     icon-only row (.social-links / .social-icon in styles.css) — small
     recognizable brand marks like a link-in-bio card, not big labelled
     buttons. Two glyph sets ship in the markup and CSS swaps them by
     viewport: filled marks on mobile (Simple Icons Facebook + Instagram,
     Bootstrap globe), outline marks on desktop (Tabler). Both inherit
     currentColor and go petrol on hover, so the two-tone brand holds (no
     brand colours). Pass { name, website, facebook, instagram }; only the
     links present are rendered, and '' comes back when there are none.
     Single source of truth for the social glyphs on detail pages. */
  const SOCIAL_SVG = {
    website:   "<svg viewBox=\"0 0 16 16\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m7.5-6.923c-.67.204-1.335.82-1.887 1.855q-.215.403-.395.872c.705.157 1.472.257 2.282.287zM4.249 3.539q.214-.577.481-1.078a7 7 0 0 1 .597-.933A7 7 0 0 0 3.051 3.05q.544.277 1.198.49zM3.509 7.5c.036-1.07.188-2.087.436-3.008a9 9 0 0 1-1.565-.667A6.96 6.96 0 0 0 1.018 7.5zm1.4-2.741a12.3 12.3 0 0 0-.4 2.741H7.5V5.091c-.91-.03-1.783-.145-2.591-.332M8.5 5.09V7.5h2.99a12.3 12.3 0 0 0-.399-2.741c-.808.187-1.681.301-2.591.332zM4.51 8.5c.035.987.176 1.914.399 2.741A13.6 13.6 0 0 1 7.5 10.91V8.5zm3.99 0v2.409c.91.03 1.783.145 2.591.332.223-.827.364-1.754.4-2.741zm-3.282 3.696q.18.469.395.872c.552 1.035 1.218 1.65 1.887 1.855V11.91c-.81.03-1.577.13-2.282.287zm.11 2.276a7 7 0 0 1-.598-.933 9 9 0 0 1-.481-1.079 8.4 8.4 0 0 0-1.198.49 7 7 0 0 0 2.276 1.522zm-1.383-2.964A13.4 13.4 0 0 1 3.508 8.5h-2.49a6.96 6.96 0 0 0 1.362 3.675c.47-.258.995-.482 1.565-.667m6.728 2.964a7 7 0 0 0 2.275-1.521 8.4 8.4 0 0 0-1.197-.49 9 9 0 0 1-.481 1.078 7 7 0 0 1-.597.933M8.5 11.909v3.014c.67-.204 1.335-.82 1.887-1.855q.216-.403.395-.872A12.6 12.6 0 0 0 8.5 11.91zm3.555-.401c.57.185 1.095.409 1.565.667A6.96 6.96 0 0 0 14.982 8.5h-2.49a13.4 13.4 0 0 1-.437 3.008M14.982 7.5a6.96 6.96 0 0 0-1.362-3.675c-.47.258-.995.482-1.565.667.248.92.4 1.938.437 3.008zM11.27 2.461q.266.502.482 1.078a8.4 8.4 0 0 0 1.196-.49 7 7 0 0 0-2.275-1.52c.218.283.418.597.597.932m-.488 1.343a8 8 0 0 0-.395-.872C9.835 1.897 9.17 1.282 8.5 1.077V4.09c.81-.03 1.577-.13 2.282-.287z\"/></svg>",
    facebook:  "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z\"/></svg>",
    instagram: "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077\"/></svg>",
  };
  /* Outline variant (Tabler) — shown on desktop; the filled set above
     is shown on mobile. Same currentColor / petrol-hover treatment. */
  const SOCIAL_SVG_LINE = {
    website:   "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /> <path d=\"M3.6 9h16.8\" /> <path d=\"M3.6 15h16.8\" /> <path d=\"M11.5 3a17 17 0 0 0 0 18\" /> <path d=\"M12.5 3a17 17 0 0 1 0 18\" /></svg>",
    facebook:  "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3\" /></svg>",
    instagram: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4l0 -8\" /> <path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /> <path d=\"M16.5 7.5v.01\" /></svg>",
  };
  const SOCIAL_LABEL = { website: 'Website', facebook: 'Facebook', instagram: 'Instagram' };

  const socialButtons = (obj) => {
    if (!obj) return '';
    const name = obj.name || 'This venue';
    const btns = ['website', 'facebook', 'instagram']
      .filter(k => obj[k])
      .map(k => {
        const aria = k === 'website' ? `${name} website` : `${name} on ${SOCIAL_LABEL[k]}`;
        /* Both glyph variants ship in the markup; CSS shows the filled set on
           mobile and the outline set on desktop (.social-icon__g--* swap). */
        return `<a class="social-icon" data-social="${k}" href="${esc(obj[k])}" ` +
               `target="_blank" rel="noopener noreferrer" aria-label="${esc(aria)}">` +
               `<span class="social-icon__g social-icon__g--fill">${SOCIAL_SVG[k]}</span>` +
               `<span class="social-icon__g social-icon__g--line">${SOCIAL_SVG_LINE[k]}</span>` +
               `</a>`;
      })
      .join('');
    return btns ? `<div class="social-links">${btns}</div>` : '';
  };

  /* Password show/hide. passwordField() wraps a password <input> in a
     composite .field-pw with an embedded eye toggle (same borderless
     icon-button language as .social-icon); one delegated handler below
     toggles type + glyph for every such field, whenever rendered. The
     glyphs are the Tabler eye / eye-off marks. */
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

  window.WA.UI = { esc, buildMeta, isEchoQuote, bookmarkSVG, thumb, rowMedia, SOCIAL_SVG, SOCIAL_SVG_LINE, socialButtons, passwordField };
})();
