/* Global search: one responsive entry, a native modal, local grouped matches.
   Enter always opens the complete, shareable results. No model calls on typing. */
(() => {
  'use strict';
  const R = () => window.WA.R, G = () => window.WA.Geo;
  const esc = s => window.WA.UI.esc(s), I = n => window.WA.Icon(n);
  let dialog, engine, trigger, closing = false;
  const input = () => dialog.querySelector('input');
  const walking = x => {
    const from = window.WA.SearchData.origin().from;
    const m = from ? G().distanceTo(x,from) : null;
    return m == null ? '<span>Walking distance unavailable</span>' : `${I('walk')}<span>${esc(R().walkLabel(G().walkMinutes(m)))} walk</span>`;
  };
  const dateLabel = key => R().dateShort(key) + (key && key.slice(0,4) !== window.WA.when.todayKey().slice(0,4) ? ' ' + key.slice(0,4) : '');
  const eventRow = e => {
    const { src,logo,tone } = R().art(e);
    let source = e.handle || '';
    if (source && !source.startsWith('@')) source = '@' + source;
    if (!source) {
      const url = window.WA.UI.safeUrl(e.permalink);
      if (url) { try { source = new URL(url).hostname.replace(/^www\./,''); } catch (_) {} }
    }
    const time = window.WA.when.statedMinutes(e) == null ? 'Time not listed' : R().clockOf(e);
    return `<li><a class="wa-search-match" href="detail.html?id=${esc(encodeURIComponent(e.id))}" data-row="${esc(e.id)}">
      <span class="wa-search-match__art${R().logoCls(logo,tone)}">${src ? `<img src="${esc(window.WA.UI.safeUrl(src))}" alt="" loading="lazy" width="56" height="56">` : window.WA.Picto.kind(e.kind)}</span>
      <span class="wa-search-match__body"><b data-notranslate>${esc(e.title)}</b>
        <span><span>${esc(dateLabel(window.WA.when.resolveKey(e)))}</span> · <span>${esc(time)}</span> · <span${R().isFree(e) ? ' class="wa-free"' : ''}>${esc(R().price(e) || 'Price not listed')}</span></span>
        <span data-notranslate>${esc([e.venue,R().areaOf(e)].filter(Boolean).join(' · '))}</span>
        <span class="wa-search-match__walk">${walking(e)}</span>
        ${source ? `<small><span>Source</span> · <span data-notranslate>${esc(source)}</span></small>` : ''}
      </span></a></li>`;
  };
  const previews = () => {
    const host = dialog.querySelector('[data-search-matches]'), q = engine.state.q;
    const s = engine.state;
    const date = engine.placeOnly ? (engine.wantsOpen() ? 'Open now' : 'Places') : s.day ? dateLabel(s.day) : window.WA.SearchData.WHEN[s.when];
    dialog.querySelector('.wa-search-scope').innerHTML = `<span>Tallinn</span> · <span>${esc(date)}</span>`;
    dialog.querySelector('[data-search-clear]').hidden = !q;
    if (!window.WA.catalog) { host.innerHTML = '<p class="wa-note">Loading listings</p>'; return; }
    if (!q) {
      const candidates = ['Jazz tomorrow','Record shops','Free today'];
      const examples = candidates.filter(q => { const e = window.WA.SearchData.create(); e.query(q); return e.events().length || e.places().length; });
      host.innerHTML = `${examples.length ? `<h2 class="wa-kicker">Try a search</h2><div class="wa-search-ideas">${examples.map(q => `<button class="wa-chip" type="button" data-search-example="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
        <div class="wa-search-browse"><a href="discover.html">${I('calendar')}<span>All events</span></a><a href="places.html">${I('store')}<span>All places</span></a></div>`;
      dialog.querySelector('[data-search-all]').hidden = true;
      return;
    }
    const events = engine.events(), places = engine.places(), origin = window.WA.SearchData.origin();
    host.innerHTML = `${events.length || places.length ? `<p class="wa-note"><span>Walking from</span> <span${['where you are','the city centre'].includes(origin.label) ? '' : ' data-notranslate'}>${esc(origin.label)}</span></p>` : ''}
      ${events.length ? `<section><h2 class="wa-search-group"><span>Events</span><span>${events.length}</span></h2><ul class="wa-search-preview">${events.slice(0,4).map(eventRow).join('')}</ul></section>` : ''}
      ${places.length ? `<section><h2 class="wa-search-group"><span>Places</span><span>${places.length}</span></h2><ul class="wa-search-preview">${places.slice(0,3).map(v => R().placeRow(v,{ from:origin.from })).join('')}</ul></section>` : ''}
      ${events.length || places.length ? '' : '<p class="wa-note">No matches. Try another name or browse all events and places.</p><div class="wa-search-browse"><a href="discover.html">All events</a><a href="places.html">All places</a></div>'}
      ${s.maxPrice != null && !s.free && events.some(e => !R().isFree(e) && e.priceMin == null) ? '<p class="wa-note">Unknown prices included</p>' : ''}`;
    const button = dialog.querySelector('[data-search-all]');
    button.hidden = false;
    button.textContent = 'View all results';
  };
  const open = (from, q = '') => {
    if (closing || dialog?.open) return;
    trigger = from; engine = window.WA.SearchData.create(); engine.query(q);
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'wa-search-dialog';
      dialog.setAttribute('aria-labelledby','global-search-title');
      dialog.innerHTML = `<form class="wa-search-dialog__top" role="search"><h2 class="wa-sr" id="global-search-title">Search events or places</h2>
        <button class="wa-iconbtn" type="button" data-search-close aria-label="Close search">${I('back')}</button>
        <div class="wa-ask"><span class="wa-ask__mark">${I('search')}</span><label class="wa-sr" for="global-search-q">Search events or places</label>
          <input class="wa-ask__input" id="global-search-q" name="q" type="search" maxlength="140" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search events or places">
          <button class="wa-iconbtn" type="button" data-search-clear aria-label="Clear search" hidden>${I('close')}</button></div></form>
        <div class="wa-search-dialog__body"><p class="wa-search-scope"><span>Tallinn</span> · <span>All dates</span></p><div data-search-matches aria-live="polite"></div></div>
        <div class="wa-search-dialog__foot"><button class="wa-btn wa-btn--primary wa-btn--wide" type="button" data-search-all hidden>View all results</button></div>`;
      document.body.append(dialog);
      dialog.addEventListener('input', e => { if (e.target.name === 'q') { engine.query(e.target.value); previews(); } });
      dialog.addEventListener('submit', e => { e.preventDefault(); submit(); });
      // A search input can consume Escape to clear itself. Close the modal
      // on the first press, consistently with its visible close action.
      dialog.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); dialog.close(); } });
      dialog.addEventListener('click', e => {
        if (e.target.closest('[data-search-close]') || e.target === dialog) dialog.close();
        if (e.target.closest('[data-search-clear]')) { input().value = ''; engine.query(''); previews(); input().focus(); }
        const example = e.target.closest('[data-search-example]');
        if (example) { input().value = example.dataset.searchExample; engine.query(input().value); previews(); input().focus(); }
        if (e.target.closest('[data-search-all]')) submit();
      });
      dialog.addEventListener('close', () => {
        document.body.classList.remove('search-open');
        closing = true; trigger?.focus({ preventScroll:true }); closing = false;
      });
    }
    input().value = engine.state.q; previews();
    document.body.classList.add('search-open');
    dialog.showModal(); input().focus();
  };
  const submit = () => {
    engine.query(input().value);
    const q = engine.params();
    if (engine.state.q) q.set('submit','1');
    location.href = `discover.html${q.size ? '?' + q : ''}`;
  };
  const init = () => {
    // Static links remain a working fallback until this module loads.
    const old = document.querySelector('.wa-topbar__end a[href*="focus=search"]');
    if (old) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'wa-search-entry'; button.dataset.searchOpen = '';
      button.setAttribute('aria-label','Search events or places'); button.setAttribute('aria-haspopup','dialog');
      button.innerHTML = `${I('search')}<span class="wa-search-entry__short">Search</span><span class="wa-search-entry__long">Search events or places</span>`;
      old.replaceWith(button);
    }
  };
  document.addEventListener('click', e => { const key = e.target.closest('[data-search-open]'); if (key) { e.preventDefault(); open(key); } });
  document.addEventListener('wa:catalog-ready', () => { if (dialog?.open) { engine.query(input().value); previews(); } });
  document.addEventListener('wa:language-changed', () => { if (dialog?.open) previews(); });
  document.addEventListener('wa:location-ready', () => { if (dialog?.open) previews(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{ once:true }); else init();
  window.WA.Search = { open };
})();
