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

  window.WA.UI = { esc, buildMeta, isEchoQuote, bookmarkSVG, thumb, rowMedia };
})();
