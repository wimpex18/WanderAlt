/* ============================================================
   WanderAlt — City switcher
   ------------------------------------------------------------
   Reads / writes 'wa:city' in localStorage so the selected city
   persists across pages and sessions.

   Sets window.WA.CITY before supabase.js runs (both are defer;
   city.js appears first in every HTML file so document order
   guarantees it executes first).

   Wires the .city-selector button as a keyboard-accessible
   dropdown. Selecting a new city saves to localStorage and
   reloads the page — supabase.js then fetches the right data.

   Load order (all HTML files):
     catalog.js → city.js → supabase.js → auth.js → …
   ============================================================ */
(() => {
  /* Each city has a static illustrated overview plate at /assets/
     <city>-overview.svg. Live plates: Tallinn, Helsinki, Riga.
     Coming-soon plate: Vilnius. All ship under the city-plates-v2
     brand bundle — see brand/BRAND.md § 5 for the canonical
     two-mark rule (one national flag + one lime accent). */
  const CITIES = [
    { id: 'tallinn',  label: 'TALLINN',  status: 'live',   thumb: './assets/tallinn-overview.svg'  },
    { id: 'helsinki', label: 'HELSINKI', status: 'live',   thumb: './assets/helsinki-overview.svg' },
    { id: 'riga',     label: 'RIGA',     status: 'live',   thumb: './assets/riga-overview.svg'     },
    { id: 'vilnius',  label: 'VILNIUS',  status: 'coming', thumb: './assets/vilnius-overview.svg'  },
  ];

  const LS_KEY  = 'wa:city';
  const DEFAULT = 'tallinn';

  /* Expose for supabase.js and any page script that needs it. */
  window.WA       = window.WA || {};
  window.WA.CITY  = localStorage.getItem(LS_KEY) || DEFAULT;

  const setCity = (id) => {
    localStorage.setItem(LS_KEY, id);
    window.WA.CITY = id;
    window.location.reload();
  };

  /* ── DOM wiring (runs after DOMContentLoaded) ────────────── */
  const init = () => {
    const btn    = document.querySelector('.city-selector');
    const nameEl = btn && btn.querySelector('.city-selector__name');
    if (!btn) return;

    /* Update button label to reflect the stored city. */
    const current = CITIES.find(c => c.id === window.WA.CITY) || CITIES[0];
    if (nameEl) nameEl.textContent = current.label;

    /* Stamp the active city on <body> so CSS can hook off it. */
    document.body.dataset.city = current.id;

    /* Inject the city banner — a cityscape ribbon (96px mobile / 120px
       desktop, cropped to the skyline via object-position) below
       the topbar that shows the current city's illustrated plate.
       Visible on every content page (skipped on admin to keep the
       internal tool dense). Doing this from JS means we don't have
       to edit every HTML file's body.

       Implementation note: the banner used to be a CSS background-image
       on the wrapper <div>. That meant the browser couldn't reserve
       layout for the image before fetching it, which leaked 0.5+ CLS
       on first paint. Now the wrapper holds a real <img> with
       explicit width/height (giving the browser an intrinsic ratio
       BEFORE network), object-fit: cover (so it still center-crops),
       and fetchpriority="high" (the banner is in the LCP region for
       most pages). Drops CLS from ~0.5 to ~0.05.                       */
    const onAdminPage = document.body.dataset.page === 'admin';
    if (!onAdminPage && !document.querySelector('.city-banner')) {
      const topbar = document.querySelector('.topbar');
      if (topbar) {
        const banner = document.createElement('div');
        banner.className = 'city-banner';
        banner.setAttribute('aria-hidden', 'true');
        const img = document.createElement('img');
        img.src = `./assets/${current.id}-overview.svg`;
        img.alt = '';
        img.width = 1800;
        img.height = 1200;
        img.decoding = 'async';
        img.fetchPriority = 'high';
        img.className = 'city-banner__img';
        banner.appendChild(img);
        /* Clicking the banner opens the city dropdown — quick affordance
           for "I want a different city" without scrolling back to the
           topbar selector. stopPropagation prevents the same click
           bubbling to the document-level close-on-outside handler. */
        banner.addEventListener('click', (e) => {
          e.stopPropagation();
          btn.click();
        });
        topbar.insertAdjacentElement('afterend', banner);
      }
    }

    /* Update page <title>: replace any city name with the current one. */
    CITIES.forEach(c => {
      const cap = c.id.charAt(0).toUpperCase() + c.id.slice(1);
      if (document.title.includes(cap)) {
        document.title = document.title.replace(
          cap, current.id.charAt(0).toUpperCase() + current.id.slice(1)
        );
      }
    });

    /* Populate .print-head with "WanderAlt · CITY · Day Month Year".
       The element is hidden on screen; the print stylesheet reveals it. */
    const printDate = new Date().toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    document.querySelectorAll('.print-head').forEach(el => {
      el.textContent = `WanderAlt · ${current.label} · ${printDate}`;
    });

    /* Home-page standfirst: swap "your city" for the active city in
       title case (e.g. "Tallinn"). Works for any city in CITIES, so
       new cities need no copy change. */
    const cityCap = current.id.charAt(0).toUpperCase() + current.id.slice(1);
    document.querySelectorAll('.standfirst__city, .discover-lede__city').forEach(el => {
      el.textContent = cityCap;
    });

    /* Build dropdown on click; toggle on repeated click. */
    let dropdown = null;

    const closeDropdown = () => {
      if (!dropdown) return;
      dropdown.remove();
      dropdown = null;
      btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown) { closeDropdown(); return; }

      dropdown = document.createElement('ul');
      dropdown.className = 'city-dropdown';
      dropdown.setAttribute('role', 'listbox');
      dropdown.setAttribute('aria-label', 'Select city');

      CITIES.forEach(city => {
        const selected = city.id === window.WA.CITY;
        const disabled = city.status !== 'live';
        const li = document.createElement('li');
        li.className = 'city-dropdown__item' +
          (selected ? ' city-dropdown__item--on' : '') +
          (disabled ? ' city-dropdown__item--soon' : '');
        li.setAttribute('role',          'option');
        li.setAttribute('aria-selected', String(selected));
        li.setAttribute('aria-disabled', String(disabled));
        li.setAttribute('tabindex',      disabled ? '-1' : '0');

        /* Illustrated thumbnail + name + status. The img tag is lazy so
           the 100KB Tallinn SVG only loads when the dropdown opens.    */
        li.innerHTML =
          `<span class="city-dropdown__thumb">` +
          `  <img src="${city.thumb}" alt="" loading="lazy" />` +
          `</span>` +
          `<span class="city-dropdown__body">` +
          `  <span class="city-dropdown__name">${city.label}</span>` +
          `  <span class="city-dropdown__status">${disabled ? 'Coming soon' : 'Live'}</span>` +
          `</span>`;

        if (!disabled) {
          const choose = () => { closeDropdown(); setCity(city.id); };
          li.addEventListener('click',   choose);
          li.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); }
          });
        }
        dropdown.appendChild(li);
      });

      /* Anchor to the button's parent container. */
      const anchor = btn.closest('.topbar__right') || btn.parentElement;
      anchor.style.position = 'relative';
      anchor.appendChild(dropdown);
      btn.setAttribute('aria-expanded', 'true');

      /* Focus first enabled item. */
      dropdown.querySelector('.city-dropdown__item:not(.city-dropdown__item--soon)')?.focus();
    });

    /* Close on outside click or Escape. */
    document.addEventListener('click',   closeDropdown);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });

    /* Forms marked [data-no-submit] are client-side-only (e.g. the
       digest opt-in + Discover's search box, both of which are JS-
       driven). Wire submit → preventDefault here so the markup stays
       free of inline onsubmit handlers — required for a tight CSP
       (no 'unsafe-inline' on script-src). */
    document.querySelectorAll('form[data-no-submit]').forEach(f => {
      f.addEventListener('submit', e => e.preventDefault());
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
