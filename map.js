/* ============================================================
   WanderAlt — map sheet wiring + filter chips + drag-expand
   ------------------------------------------------------------
   Tap a pin → the bottom sheet swaps to that pin's content.
   Pin payload is read from window.WA.catalog (catalog.js);
   pin buttons in the HTML only need data-pin="N".

   Selected state is driven by aria-pressed; CSS does the
   visual work (accent fill on the selected pin).
   The close button hides the sheet; tapping any pin re-opens.

   Filter chips (All / Tonight / This week / Places) show and
   hide pins by matching catalog flags: tonight, thisWeek,
   and day===null (permanent places). The pos counter in the
   sheet updates to reflect the filtered total.

   Drag-expand: pointerdown on .map-sheet__handle lets the user
   drag the sheet up (or tap the handle to toggle). Snaps to
   either a peek height or 60 vh on release.
   ============================================================ */
(() => {
  /* Build the meta string shown in the map sheet:
     - Named-day events: venue · kind · Day HH:MM
     - Tonight / permanent places: neighborhood · kind · time  */
  const buildMeta = (entry) => {
    const parts = (entry.day && entry.day !== 'Tonight')
      ? [entry.venue, entry.kind, `${entry.day} ${entry.time}`]
      : [entry.neighborhood, entry.kind, entry.time].filter(Boolean);
    return parts.join(' · ');
  };

  const pad2 = (n) => String(n).padStart(2, '0');

  /* Chip label → catalog predicate. Keys match textContent.toLowerCase(). */
  const CHIP_PREDICATES = {
    'all':       ()  => true,
    'tonight':   (e) => !!e.tonight,
    'this week': (e) => !!e.thisWeek,
    'places':    (e) => !e.day,
  };

  /* Inject numbered pin buttons from catalog into .map-bleed.
     Removes any static placeholder pins in the HTML first so the
     live catalog is always the single source of truth.            */
  const renderPins = (pinEntries) => {
    const bleed = document.querySelector('.map-bleed');
    if (!bleed) return;

    /* Clear static pins. */
    bleed.querySelectorAll('.map-pin').forEach(p => p.remove());
    if (!pinEntries.length) return;

    const sheet = bleed.querySelector('.map-sheet');

    pinEntries.forEach((entry, i) => {
      const btn = document.createElement('button');
      btn.className = 'map-pin';
      btn.type      = 'button';
      btn.style.left = entry.pin.left;
      btn.style.top  = entry.pin.top;
      btn.setAttribute('aria-label', `Pin ${entry.pin.num}: ${entry.title}`);
      btn.setAttribute('data-pin',   String(entry.pin.num));
      if (i === 0) btn.setAttribute('aria-pressed', 'true');
      btn.innerHTML =
        `<svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true">
           <path d="M14 1 C 5 1 1 8 1 14 C 1 22 14 35 14 35 C 14 35 27 22 27 14 C 27 8 23 1 14 1 Z"
                 stroke-width="1.2" stroke-linejoin="round" />
           <text x="14" y="18" text-anchor="middle"
                 font-family="'JetBrains Mono', monospace" font-size="11"
                 font-weight="600">${entry.pin.num}</text>
         </svg>`;
      /* Insert before the sheet so pins sit beneath it in stacking order. */
      bleed.insertBefore(btn, sheet || null);
    });
  };

  const init = () => {
    const catalog    = (window.WA && window.WA.catalog) || [];
    /* Sort by pin number so pin 1 is always the default selection. */
    const pinEntries = catalog.filter(e => e.pin)
                              .sort((a, b) => a.pin.num - b.pin.num);

    /* Render dynamic pins before querying the DOM for them. */
    renderPins(pinEntries);

    /* The SVG neighborhood labels (KALAMAJA, VANALINN, etc.) are
       baked in as Tallinn-specific text. Hide them for other cities
       so the abstract cartography reads as a generic city plane.   */
    if ((window.WA && window.WA.CITY) !== 'tallinn') {
      document.querySelectorAll('.map-plane text').forEach(t => { t.style.display = 'none'; });
    }

    const pins       = Array.from(document.querySelectorAll('.map-pin[data-pin]'));
    const sheet      = document.querySelector('.map-sheet');
    if (!pins.length || !sheet) return;

    /* visibleTotal tracks the count after the active chip filter.
       Starts at all pins; updated by wireChips. */
    let visibleTotal = pinEntries.length;

    const elNum     = sheet.querySelector('.map-sheet__num');
    const elPos     = sheet.querySelector('.map-sheet__pos');
    const elEyebrow = sheet.querySelector('.eyebrow');
    const elTitle   = sheet.querySelector('.map-sheet__title');
    const elMeta    = sheet.querySelector('.meta');
    const elQuote   = sheet.querySelector('.map-sheet__quote');
    const elCta     = sheet.querySelector('.map-sheet__cta');
    const elBm      = sheet.querySelector('.map-sheet__bookmark');
    const closeBtn  = sheet.querySelector('.map-sheet__close');
    const handle    = sheet.querySelector('.map-sheet__handle');

    const curatorLink = (entry) => {
      const href = `curator.html?handle=${encodeURIComponent(entry.handle)}`;
      return `<a class="handle" href="${href}">${entry.handle}</a>`;
    };

    const select = (pin) => {
      const n     = Number(pin.dataset.pin);
      const entry = pinEntries.find(e => e.pin.num === n);
      if (!entry) return;

      pins.forEach(p => p.removeAttribute('aria-pressed'));
      pin.setAttribute('aria-pressed', 'true');

      if (elNum)     elNum.textContent     = String(n);
      if (elEyebrow) elEyebrow.textContent = entry.pin.eyebrow;
      if (elTitle)   elTitle.innerHTML      = `<a href="venue.html?id=${entry.id}">${entry.title}</a>`;
      if (elMeta)    elMeta.textContent    = buildMeta(entry);

      if (elPos) {
        elPos.innerHTML = `<strong>${pad2(n)}</strong> &thinsp;/&thinsp; ${pad2(visibleTotal)}`;
        elPos.setAttribute('aria-label', `Pin ${n} of ${visibleTotal}`);
      }

      if (elQuote) {
        elQuote.innerHTML = `— ${entry.quote} ${curatorLink(entry)}`;
      }

      if (elCta) {
        elCta.href = `venue.html?id=${encodeURIComponent(entry.id)}`;
      }

      if (elBm) {
        elBm.dataset.id = entry.id;
        elBm.setAttribute('aria-label', `Bookmark: ${entry.title}`);
        elBm.checked = !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[entry.id]);
      }

      sheet.hidden = false;
      collapseToPeek();
    };

    /* Track active filter states so both chip and mood filters compose. */
    let activeChipPred = () => true;
    let activeMoodTags = [];

    /* Recompute which pins are visible given the current chip + mood state. */
    const applyVisibility = () => {
      const visible = new Set(
        pinEntries
          .filter(e => activeChipPred(e))
          .filter(e => !activeMoodTags.length ||
                       activeMoodTags.every(tag => e.moodTags && e.moodTags.includes(tag)))
          .map(e => e.pin.num)
      );

      pins.forEach(pin => { pin.hidden = !visible.has(Number(pin.dataset.pin)); });
      visibleTotal = visible.size;

      /* If selected pin was hidden, jump to first visible or close sheet. */
      const pressed = pins.find(p => p.getAttribute('aria-pressed') === 'true');
      if (!pressed || pressed.hidden) {
        const first = pins.find(p => !p.hidden);
        if (first) select(first);
        else {
          sheet.hidden = true;
          pins.forEach(p => p.removeAttribute('aria-pressed'));
        }
      } else {
        select(pressed); /* re-render pos counter with new total */
      }
    };

    const wireChips = () => {
      /* Scope to .map-filters only — mood chips (.mood-chips) are separate. */
      const chips = Array.from(document.querySelectorAll('.map-filters .m-chip'));
      if (!chips.length) return;

      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          chips.forEach(c => c.classList.remove('m-chip--on'));
          chip.classList.add('m-chip--on');

          const label    = chip.textContent.trim().toLowerCase();
          activeChipPred = CHIP_PREDICATES[label] || (() => true);
          applyVisibility();
        });
      });
    };

    /* Mood filter: responds to wa:mood-changed from mood-chips.js */
    document.addEventListener('wa:mood-changed', (e) => {
      activeMoodTags = e.detail.tags;
      applyVisibility();
    });

    /* ── Drag-expand ─────────────────────────────────────────
       Drag the sheet handle to reveal more of the sheet.
       Tapping (no drag) the handle toggles peek ↔ expand.    */

    let dragStartY   = 0;
    let dragStartH   = 0;
    let isDragging   = false;
    const SNAP_DELTA = 48;   /* px drag needed to commit to expand */

    const peekHeight  = () => {
      /* Natural height from CSS — measured before any inline style. */
      const style = sheet.style.height;
      sheet.style.height = '';
      const h = sheet.getBoundingClientRect().height;
      if (style) sheet.style.height = style;
      return h;
    };
    const expandHeight = () => Math.round(window.innerHeight * 0.60);

    let _peekH = null;
    const getPeekH = () => {
      if (!_peekH) _peekH = peekHeight();
      return _peekH;
    };

    const collapseToPeek = () => {
      _peekH = null;   /* re-measure after content changes */
      sheet.style.transition = 'height 280ms cubic-bezier(0.4, 0, 0.2, 1)';
      sheet.style.height     = '';
      sheet.style.overflowY  = '';
      sheet.dataset.expanded = 'false';
    };

    const expandSheet = () => {
      const h = expandHeight();
      sheet.style.transition = 'height 280ms cubic-bezier(0.4, 0, 0.2, 1)';
      sheet.style.height     = `${h}px`;
      sheet.style.overflowY  = 'auto';
      sheet.dataset.expanded = 'true';
    };

    const toggleExpand = () => {
      if (sheet.dataset.expanded === 'true') collapseToPeek();
      else                                   expandSheet();
    };

    if (handle) {
      handle.style.cursor = 'grab';

      handle.addEventListener('pointerdown', (e) => {
        dragStartY  = e.clientY;
        dragStartH  = sheet.getBoundingClientRect().height;
        isDragging  = false;
        handle.style.cursor = 'grabbing';
        handle.setPointerCapture(e.pointerId);

        /* Disable transition during live drag. */
        sheet.style.transition = 'none';
      });

      handle.addEventListener('pointermove', (e) => {
        const delta = dragStartY - e.clientY;   /* positive = dragging up */
        if (Math.abs(delta) < 4) return;
        isDragging = true;

        const min = getPeekH() * 0.4;
        const max = expandHeight();
        const h   = Math.min(max, Math.max(min, dragStartH + delta));
        sheet.style.height = `${h}px`;
        if (h > getPeekH()) sheet.style.overflowY = 'auto';
        else                 sheet.style.overflowY = '';
      });

      const endDrag = (e) => {
        handle.style.cursor = 'grab';
        const delta = dragStartY - e.clientY;

        if (!isDragging) {
          /* Pure tap — toggle. */
          toggleExpand();
        } else if (delta > SNAP_DELTA) {
          expandSheet();
        } else if (delta < -SNAP_DELTA) {
          collapseToPeek();
        } else {
          /* Small drag — snap back to whichever is closer. */
          const midpoint = (getPeekH() + expandHeight()) / 2;
          if (sheet.getBoundingClientRect().height > midpoint) expandSheet();
          else collapseToPeek();
        }
        isDragging = false;
      };

      handle.addEventListener('pointerup',     endDrag);
      handle.addEventListener('pointercancel', () => {
        isDragging = false;
        collapseToPeek();
        handle.style.cursor = 'grab';
      });
    }

    pins.forEach(pin => pin.addEventListener('click', () => select(pin)));

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sheet.hidden = true;
        pins.forEach(p => p.removeAttribute('aria-pressed'));
      });
    }

    wireChips();

    /* Bookmark toggle in the sheet foot. */
    if (elBm && window.WA.Bookmarks) {
      elBm.addEventListener('change', () => {
        window.WA.Bookmarks.set(elBm.dataset.id, elBm.checked);
      });
      /* Keep checkbox in sync when bookmarks change from another source. */
      document.addEventListener('wa:bookmarks-synced', () => {
        const pressed = pins.find(p => p.getAttribute('aria-pressed') === 'true');
        if (!pressed) return;
        const n = Number(pressed.dataset.pin);
        const entry = pinEntries.find(e => e.pin.num === n);
        if (entry && elBm) {
          elBm.checked = !!(window.WA.Bookmarks.get()[entry.id]);
        }
      });
    }

    /* Auto-select whichever pin is marked pressed in the HTML
       (pin 1 by default) to populate the sheet from catalog. */
    const initial = pins.find(p => p.getAttribute('aria-pressed') === 'true');
    if (initial) select(initial);
  };

  document.addEventListener('wa:catalog-ready', init);
})();
