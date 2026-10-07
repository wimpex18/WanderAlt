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
     city.js → supabase.js → auth.js → …
   ============================================================ */
(() => {
  window.WA = window.WA || {};

  /* Tallinn is the only city with catalogue coverage. */
  const CITIES = [
    /* `centre` is where "Walking from" starts when we have neither a location nor a place the reader chose. */
    { id: 'tallinn',  label: 'TALLINN', name: 'Tallinn', aliases: ['Таллин', 'Таллінн'], languages: ['en', 'et', 'ru', 'uk'], status: 'live',     thumb: './assets/tallinn-overview.svg', centre: { lat: 59.4342, lng: 24.7436, label: 'Vabaduse väljak' } },
  ];

  /* Add Helsinki (fi), Riga (lv), Vilnius (lt, pl) here when their data and
     interface translations are ready. Only live cities enter suggestions. */
  const fold = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  window.WA.startSuggestions = (query, venues = []) => {
    const q = fold(query);
    if (!q) return [];
    const cities = CITIES.filter(c => c.status === 'live' && c.centre &&
      [c.name, c.label, ...(c.aliases || [])].some(n => fold(n).startsWith(q)))
      .map(c => ({ label: c.name, lat: c.centre.lat, lng: c.centre.lng, city: true }));
    const seen = new Set(cities.map(c => fold(c.label)));
    const places = venues.filter(v => v.name && !v.isClosed && Number.isFinite(v.lat) && Number.isFinite(v.lng) &&
      (!v.city || v.city === window.WA.CITY) && fold(v.name).includes(q))
      .sort((a, b) => Number(!fold(a.name).startsWith(q)) - Number(!fold(b.name).startsWith(q)) || a.name.localeCompare(b.name))
      .filter(v => { const k = fold(v.name); if (seen.has(k)) return false; seen.add(k); return true; })
      .map(v => ({ label: v.name, lat: v.lat, lng: v.lng, city: false }));
    return [...cities, ...places].slice(0, 8);
  };

  /* Only cities with live catalogue coverage may be selected from a position. */
  window.WA.cityForLocation = (loc) => {
    const G = window.WA.Geo;
    if (!G || !loc) return null;
    return CITIES.filter(c => c.status === 'live' && c.centre)
      .map(c => ({ city: c, distance: G.distanceTo(c.centre, loc) }))
      .filter(c => c.distance != null && c.distance < 25000)
      .sort((a, b) => a.distance - b.distance)[0]?.city || null;
  };

  const LS_KEY  = 'wa:city';
  const DEFAULT = 'tallinn';

  /* Shared catalogue coverage and starting-point suggestions. */
  window.WA        = window.WA || {};
  const stored = localStorage.getItem(LS_KEY);
  window.WA.CITY   = CITIES.some(c => c.id === stored) ? stored : DEFAULT;
  window.WA.CITIES = CITIES.map(c => ({ ...c }));

  const setCity = (id) => {
    localStorage.setItem(LS_KEY, id);
    window.WA.CITY = id;
    window.location.reload();
  };

  /* One writer for the stored city key. */
  window.WA.setCity = setCity;

  /* ── DOM wiring (runs after DOMContentLoaded) ────────────── */
  const init = () => {
    const btn    = document.querySelector('.city-selector');
    const nameEl = btn && btn.querySelector('.city-selector__name');
    if (!btn) return;

    const current = CITIES.find(c => c.id === window.WA.CITY) || CITIES[0];
    if (nameEl) nameEl.textContent = current.label;

    /* Stamp the active city on <body> so CSS can hook off it. */
    document.body.dataset.city = current.id;

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
    document.querySelectorAll('.page-head__city').forEach(el => {
      el.textContent = cityCap;
    });

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
          `  <span class="city-dropdown__status">${disabled ? 'Coming soon' : ''}</span>` +   /* "Live" on every row was noise — status only informs when it varies */
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

      const anchor = btn.closest('.topbar__right') || btn.parentElement;
      anchor.style.position = 'relative';
      anchor.appendChild(dropdown);
      btn.setAttribute('aria-expanded', 'true');

      dropdown.querySelector('.city-dropdown__item:not(.city-dropdown__item--soon)')?.focus();
    });

    document.addEventListener('click',   closeDropdown);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });

    /* Forms marked [data-no-submit] are client-side-only (e.g.
       Discover's search box, which is JS-driven). Wire submit → preventDefault here so the markup stays
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
