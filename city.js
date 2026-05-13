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
  const CITIES = [
    { id: 'tallinn',  label: 'TALLINN'  },
    { id: 'helsinki', label: 'HELSINKI' },
    { id: 'riga',     label: 'RIGA'     },
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
        const li = document.createElement('li');
        li.className  = 'city-dropdown__item';
        li.textContent = city.label;
        li.setAttribute('role',          'option');
        li.setAttribute('aria-selected', String(city.id === window.WA.CITY));
        li.setAttribute('tabindex',      '0');
        const choose = () => { closeDropdown(); setCity(city.id); };
        li.addEventListener('click',   choose);
        li.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); }
        });
        dropdown.appendChild(li);
      });

      /* Anchor to the button's parent container. */
      const anchor = btn.closest('.topbar__right') || btn.parentElement;
      anchor.style.position = 'relative';
      anchor.appendChild(dropdown);
      btn.setAttribute('aria-expanded', 'true');

      /* Focus first item. */
      dropdown.querySelector('.city-dropdown__item')?.focus();
    });

    /* Close on outside click or Escape. */
    document.addEventListener('click',   closeDropdown);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
