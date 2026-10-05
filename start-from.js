/* start-from.js — one starting-point picker for Now and You. No search requests. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => window.WA.UI.esc(s);
  const I = (n) => window.WA.Icon(n);
  let dialog = null, opener = null, locateId = 0;
  const editing = () => {
    const field = $('wa-start-input');
    return field && document.activeElement === field ? { start: field.selectionStart, end: field.selectionEnd,
      open: field.getAttribute('aria-expanded') === 'true' } : null;
  };
  const restore = (state) => {
    if (!state || !$('wa-start-input')) return;
    const field = $('wa-start-input'); field.focus(); field.setSelectionRange(state.start, state.end);
    if (state.open) showStarts(); else closeStart();
  };
  const refresh = () => {
    const host = $('start-from-field');
    if (!host) return;
    const state = editing(); host.innerHTML = startField(); restore(state);
  };
  const dismiss = () => {
    if (!dialog) return;
    dialog.close(); dialog.remove(); dialog = null; startDraft = null; startError = '';
    locateId++; locating = false;
    document.dispatchEvent(new CustomEvent('wa:start-state'));
    if (opener && opener.isConnected) opener.focus();
    else document.querySelector('[data-near]')?.focus();
  };
  const open = (button) => {
    if (dialog) return;
    opener = button; startDraft = null; startError = '';
    dialog = document.createElement('dialog'); dialog.className = 'wa-sheet wa-sheet--start';
    dialog.setAttribute('aria-labelledby', 'start-from-title');
    dialog.innerHTML = `<div class="wa-sheet__panel"><div class="wa-sheet__head"><h2 class="wa-sheet__title" id="start-from-title">Start from</h2></div>
      <div class="wa-sheet__body"><div id="start-from-field">${startField()}</div></div>
      <div class="wa-sheet__foot"><button class="wa-btn wa-btn--quiet" type="button" data-start-close>Cancel</button><button class="wa-btn wa-btn--sm" type="button" data-start-whole>Whole city</button></div></div>`;
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(); });
    document.body.appendChild(dialog); dialog.showModal(); $('wa-start-input').focus();
  };
  /* Local, coverage-aware suggestions: no geocoder request while typing. */
  let startDraft = null, startMatches = [], startActive = -1, locating = false, startError = '';
  const deviceCity = () => {
    return window.WA.cityForLocation(window.WA.Geo.deviceLoc());
  };
  const startValue = () => {
    const a = window.WA.Geo.anchor(), city = deviceCity();
    return a ? a.label : city ? city.name : '';
  };
  const startField = () => {
    const G = window.WA.Geo, a = G.anchor(), loc = G.deviceLoc();
    const cityAnchor = a && (window.WA.CITIES || []).some(c => c.name === a.label && c.centre.lat === a.lat && c.centre.lng === a.lng);
    const note = startError || (cityAnchor ? 'City centre. Pick a venue for a more precise starting point.' : a
      ? 'Walking times and routes start here. Clear the box to use your location.' : loc
      ? 'Walking times and routes start at your current location.'
      : 'Choose Tallinn or a place you know, or use your location.');
    return `<label class="wa-field__label wa-sr" for="wa-start-input">Place to start from</label>
      <div class="wa-start__control">
        <div class="wa-start__search">
          <input class="wa-input" id="wa-start-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="wa-start-options" aria-describedby="wa-start-note" autocomplete="off" placeholder="City or place" value="${esc(startDraft === null ? startValue() : startDraft)}" />
          <div class="wa-start__options" id="wa-start-options" role="listbox" aria-label="Place to start from" hidden></div>
        </div>
        <button class="wa-iconbtn wa-start__locate" id="wa-start-locate" type="button" aria-label="Use my location" title="Use my location"${locating ? ' disabled aria-busy="true"' : ''}>${I('locate')}</button>
      </div>
      <p class="wa-note" id="wa-start-note" role="status">${esc(note)}</p>`;
  };
  const originMarkup = () => {
    const G = window.WA.Geo, anchor = G.anchor();
    const label = anchor ? anchor.label : G.currentLoc() ? 'My location' : 'Choose a place';
    return `<div class="rt-card__origin"><button class="rt-card__from" type="button" data-near aria-haspopup="dialog"><span>From</span><b${anchor ? ' data-notranslate' : ''}>${esc(label)}</b>${I('chevron')}</button>
      <button class="wa-iconbtn wa-start__locate" type="button" data-start-device aria-label="Use my location" title="Use my location"${locating ? ' disabled aria-busy="true"' : ''}>${I('locate')}</button></div>
      ${startError ? `<p class="wa-note" role="status">${esc(startError)}</p>` : ''}`;
  };
  const closeStart = () => {
    const field = $('wa-start-input'), list = $('wa-start-options');
    if (list) list.hidden = true;
    if (field) { field.setAttribute('aria-expanded', 'false'); field.removeAttribute('aria-activedescendant'); }
    startActive = -1;
  };
  const showStarts = () => {
    const field = $('wa-start-input'), list = $('wa-start-options');
    if (!field || !list) return;
    startMatches = window.WA.startSuggestions(field.value, window.WA._venuesAll || []);
    startActive = -1;
    list.innerHTML = startMatches.map((s, i) => `<button type="button" role="option" aria-selected="false" tabindex="-1" id="wa-start-${i}" data-start-option="${i}" data-notranslate>${esc(s.label)}</button>`).join('');
    list.hidden = !startMatches.length;
    field.setAttribute('aria-expanded', String(!!startMatches.length));
    field.removeAttribute('aria-activedescendant');
  };
  const chooseStart = (s) => {
    startDraft = null; startError = ''; locateId++; locating = false;
    try { localStorage.setItem('wa:near:v1', '1'); } catch (_) { /* this page only */ }
    window.WA.Geo.setAnchor(s ? { lat: s.lat, lng: s.lng, label: s.label } : null);
    document.dispatchEvent(new CustomEvent('wa:near-changed', { detail: true }));
    if (s && s.city) {
      const city = window.WA.CITIES.find(c => c.name === s.label);
      if (city && city.id !== window.WA.CITY) window.WA.setCity(city.id);
    }
    refresh();
    if (dialog) dismiss(); else { $('wa-start-input').focus(); closeStart(); }
  };

  const locate = (button) => {
    if (locating) return;
    const requestId = ++locateId;
    locating = true; startError = ''; closeStart();
    document.dispatchEvent(new CustomEvent('wa:start-state'));
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    window.WA.Geo.userLoc(true).then((loc) => {
      if (requestId !== locateId) return;
      locating = false;
      if (loc) {
        try { localStorage.setItem('wa:near:v1', '1'); } catch (_) { /* this page only */ }
        startDraft = null; window.WA.Geo.setAnchor(null);
        document.dispatchEvent(new CustomEvent('wa:near-changed', { detail: true }));
        const city = window.WA.cityForLocation(loc);
        if (city && city.id !== window.WA.CITY) window.WA.setCity(city.id);
      }
      else startError = window.WA.Geo.locationError() === 1
        ? 'Location is blocked. Allow it in browser settings, or choose a place.'
        : 'Could not get your location. Try again or choose a place.';
      refresh();
      document.dispatchEvent(new CustomEvent('wa:start-state'));
      if (loc && dialog) dismiss(); else { const key = $('wa-start-locate') || document.querySelector('[data-start-device]'); if (key) key.focus(); }
    });
  };

  document.addEventListener('click', (e) => {
    const hit = (s) => e.target.closest && e.target.closest(s);
    if (hit('[data-start-whole]')) {
      document.dispatchEvent(new CustomEvent('wa:near-changed', { detail: false })); dismiss(); return;
    }
    if (hit('[data-start-close]')) { dismiss(); return; }
    const option = hit('[data-start-option]');
    if (option) { const s = startMatches[Number(option.dataset.startOption)]; if (s) chooseStart(s); return; }
    const device = hit('#wa-start-locate, [data-start-device]');
    if (device) { locate(device); return; }
    if (!hit('.wa-start__control')) closeStart();
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'wa-start-input') return;
    startDraft = e.target.value; startError = ''; showStarts();
  });
  document.addEventListener('focusin', (e) => { if (e.target.id === 'wa-start-input') showStarts(); });
  document.addEventListener('focusout', (e) => {
    if (e.target.id === 'wa-start-input') closeStart();
  });
  /* Keep focus in the combobox when a mouse or finger picks a suggestion. */
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('[data-start-option], #wa-start-locate, [data-start-close], [data-start-whole]')) e.preventDefault();
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id !== 'wa-start-input' || e.isComposing) return;
    const list = $('wa-start-options');
    if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); closeStart(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) showStarts();
      if (!startMatches.length) return;
      startActive = startActive < 0 ? (e.key === 'ArrowDown' ? 0 : startMatches.length - 1)
        : (startActive + (e.key === 'ArrowDown' ? 1 : -1) + startMatches.length) % startMatches.length;
      $('wa-start-' + startActive).scrollIntoView({ block: 'nearest' });
      list.querySelectorAll('[role="option"]').forEach((o, i) => o.setAttribute('aria-selected', String(i === startActive)));
      e.target.setAttribute('aria-activedescendant', `wa-start-${startActive}`);
    } else if (e.key === 'Enter' && !list.hidden && startMatches.length) {
      e.preventDefault(); chooseStart(startMatches[Math.max(0, startActive)]);
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'wa-start-input' || dialog) return;
    const name = e.target.value.trim();
    if (!name) { chooseStart(null); return; }
    const s = window.WA.startSuggestions(name, window.WA._venuesAll || []).find(x => x.label.toLowerCase() === name.toLowerCase());
    if (s) chooseStart(s);
    /* An incomplete draft never silently clears a saved starting point. */
  });

  document.addEventListener('wa:location-ready', () => {
    if (startDraft === null && !locating) refresh();
  });

  document.addEventListener('wa:catalog-ready', refresh);
  document.addEventListener('wa:language-changed', refresh);
  window.WA.StartFrom = { markup: startField, originMarkup, open, editing, restore };
})();
