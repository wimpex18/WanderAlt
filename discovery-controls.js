/* Shared mood/price and date sheets. Drafts apply only on submit. */
(() => {
  'use strict';
  const D = () => window.WA.Discovery, M = () => window.WA.Moods;
  const esc = s => window.WA.UI.esc(s), I = n => window.WA.Icon(n);
  let sheet = null, opener = null, draft = null, applied = false, applyDates = null;
  const keys = () => {
    const p = D().pref(), set = p.moods.length || p.cap != null;
    const anchor = window.WA.Geo.anchor(), words = M().words(p);
    const mood = !words.length ? '<span>Any mood</span>' : words.length <= 2 ? words.map(w => `<span>${esc(w)}</span>`).join(', ') : `<span>${esc(words[0])}</span> +${words.length - 1}`;
    const summary = `${mood} · <span>${esc(M().capText(p.cap))}</span>`;
    return `<button class="wa-chip home-mood__key${set ? ' is-set' : ''}" type="button" data-filter-open aria-haspopup="dialog">${I('filter')}<span>${summary}</span></button>
      <button class="wa-chip discovery-near" type="button" data-discovery-near aria-pressed="${D().nearOn()}" aria-haspopup="dialog">${I('locate')}<span${anchor ? ' data-notranslate' : ''}>${esc(anchor ? anchor.label : 'Near me')}</span></button>`;
  };
  /* When: one key that pours out Today, Tomorrow, Weekend and Pick dates.
     Each preset names the nights it covers; Pick dates opens the date sheet. */
  const WHEN = [['tonight', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend']];
  const span = (s) => { const [a, b] = D().range(s), R = window.WA.R; return a === b ? R.dateShort(a) : `${R.dateShort(a)} – ${R.dateShort(b)}`; };
  const dateKey = (cls = '') => {
    const s = D().dates(), set = !!s.date || s.when !== 'tonight';
    return `<button class="wa-chip discovery-date${set ? ' is-set' : ''} ${cls}" type="button" data-when-open aria-haspopup="dialog" aria-expanded="false">${I('calendar')}<span>${esc(D().label())}</span>${I('down')}</button>`;
  };
  const whenPanel = () => {
    const s = D().dates(), panel = document.createElement('div');
    panel.className = 'wa-when';
    panel.setAttribute('aria-label', 'When');
    panel.innerHTML = WHEN.map(([when, label]) => `<button class="wa-when__opt" type="button" data-when-pick="${when}" aria-pressed="${!s.date && s.when === when}"><b>${esc(label)}</b><small>${esc(span({ when }))}</small></button>`).join('')
      + `<button class="wa-when__opt" type="button" data-when-dates aria-pressed="${!!s.date}">${I('calendar')}<b>${esc(s.date ? D().label() : 'Pick dates')}</b><small>${esc(s.date ? 'Change dates' : 'A day or a range')}</small></button>`;
    return panel;
  };
  let whenKey = null;
  const close = (commit = false) => { applied = commit; if (sheet) sheet.close(); };
  const open = (button, title, body, foot, kind) => {
    if (sheet) return;
    opener = button; applied = false;
    sheet = document.createElement('dialog'); sheet.className = 'wa-sheet wa-sheet--discovery';
    sheet.dataset.kind = kind; sheet.setAttribute('aria-labelledby', 'discovery-title');
    sheet.innerHTML = `<div class="wa-sheet__panel"><div class="wa-sheet__head"><h2 id="discovery-title" class="wa-sheet__title">${esc(title)}</h2><button class="wa-iconbtn" type="button" data-discovery-close aria-label="Close">${I('close')}</button></div>
      <form id="discovery-form"><div class="wa-sheet__body" id="discovery-body">${body}</div><div class="wa-sheet__foot">${foot}</div></form></div>`;
    sheet.addEventListener('close', () => {
      sheet.remove(); sheet = null; draft = null; applyDates = null;
      const result = applied && kind === 'mood' && document.querySelector('.home-view [aria-pressed="true"]');
      const target = result || (opener && opener.isConnected ? opener : document.querySelector(kind === 'dates' ? '[data-when-open], [data-pick-dates]' : '[data-filter-open]'));
      if (target) target.focus({ preventScroll: true });
      if (applied) document.dispatchEvent(new CustomEvent('wa:discovery-applied', { detail:kind }));
    }, { once: true });
    document.body.append(sheet); sheet.showModal();
  };
  const moodBody = () => {
    const moods = M().available({ allHours: true });
    return `<p class="mood-lead">No selection means all</p><ul class="mood-list" role="group" aria-label="Moods">${moods.map(m => {
      const on = draft.moods.includes(m.id);
      return `<li class="mood-item"><button class="mood-row" type="button" data-mood="${esc(m.id)}" aria-pressed="${on}">${window.WA.Picto(m.picto)}<span class="mood-row__t"><b>${esc(m.label)}</b><small>${esc(m.hint)}</small></span><span class="mood-row__tick">${I('check')}</span></button>
        ${m.subs.length > 1 ? `<div class="mood-subs" data-subs-of="${esc(m.id)}" role="group" aria-label="Narrow it down"${on ? '' : ' hidden'}>${m.subs.map(s => `<button class="wa-chip" type="button" data-sub="${esc(s.id)}" aria-pressed="${draft.subs.includes(s.id)}">${esc(s.label)}</button>`).join('')}</div>` : ''}</li>`;
    }).join('')}</ul><h3 class="mood-h">Tickets</h3><div class="mood-seg" role="group" aria-label="Ticket price limit">${[[0,'Free'],[20,'Up to €20'],[null,'Any']].map(([cap,label]) => `<button type="button" data-cap="${cap == null ? '' : cap}" aria-pressed="${cap === draft.cap}">${esc(label)}</button>`).join('')}</div><p class="wa-note">Unknown prices included</p>`;
  };
  const openMood = button => {
    draft = M().pref();
    open(button, "What's the mood?", moodBody(), '<button class="wa-btn wa-btn--quiet" type="button" data-mood-clear>Clear</button><button class="wa-btn wa-btn--primary" type="submit">Show results</button>', 'mood');
  };
  // Search supplies its own dates/apply callback; the shared picker never copies
  // a search selection into Now's stored discovery state.
  const openDates = (button, options = {}) => {
    if (sheet) return;
    const s = options.dates || D().dates(), today = window.WA.when.todayKey();
    applyDates = options.apply || (value => { D().setDates(value); D().writeURL(); });
    open(button, 'Pick dates', `<label class="wa-field"><span class="wa-field__label">Date</span><input class="wa-input" type="date" name="date" required min="${esc(today)}" value="${esc(s.date || D().range(s)[0])}"></label>
      <label class="discovery-range"><input type="checkbox" name="range"${s.to ? ' checked' : ''}> <span>Date range</span></label>
      <label class="wa-field" id="discovery-end"${s.to ? '' : ' hidden'}><span class="wa-field__label">Through</span><input class="wa-input" type="date" name="to" min="${esc(s.date || today)}" value="${esc(s.to)}"${s.to ? ' required' : ' disabled'}></label>`, '<button class="wa-btn wa-btn--quiet" type="button" data-discovery-close>Cancel</button><button class="wa-btn wa-btn--primary" type="submit">Apply</button>', 'dates');
  };
  document.addEventListener('click', e => {
    const hit = s => e.target.closest && e.target.closest(s);
    if (hit('[data-filter-open]')) { window.WA.UI.genie.close(false); openMood(hit('[data-filter-open]')); return; }
    if (hit('[data-pick-dates]')) { openDates(hit('[data-pick-dates]')); return; }
    if (hit('[data-when-open]')) {
      const key = hit('[data-when-open]');
      if (key.getAttribute('aria-expanded') === 'true') { window.WA.UI.genie.close(true); return; }
      whenKey = key; window.WA.UI.genie(key, whenPanel());
      return;
    }
    if (hit('[data-when-pick]')) {
      window.WA.UI.genie.close(true);
      D().setDates({ when: hit('[data-when-pick]').dataset.whenPick }); D().writeURL();
      return;
    }
    if (hit('[data-when-dates]')) {
      window.WA.UI.genie.close(false);
      openDates(whenKey && whenKey.isConnected ? whenKey : document.querySelector('[data-when-open]'));
      return;
    }
    if (hit('[data-discovery-near]')) {
      if (D().nearOn()) D().setNear(false); else window.WA.StartFrom.open(hit('[data-discovery-near]'));
      return;
    }
    if (!sheet) return;
    if (hit('[data-discovery-close]')) { close(); return; }
    if (sheet.dataset.kind !== 'mood') return;
    const mood = hit('[data-mood]'), sub = hit('[data-sub]'), cap = hit('[data-cap]');
    if (mood) {
      const id = mood.dataset.mood, on = !draft.moods.includes(id);
      draft.moods = on ? [...draft.moods, id] : draft.moods.filter(x => x !== id);
      if (!on) draft.subs = draft.subs.filter(x => !M().get(id).subs.some(s => s.id === x));
      mood.setAttribute('aria-pressed', on);
      const subs = sheet.querySelector(`[data-subs-of="${CSS.escape(id)}"]`);
      if (subs) { subs.hidden = !on; if (!on) subs.querySelectorAll('[data-sub]').forEach(b => b.setAttribute('aria-pressed', false)); }
    } else if (sub) {
      const id = sub.dataset.sub, on = !draft.subs.includes(id);
      draft.subs = on ? [...draft.subs,id] : draft.subs.filter(x => x !== id); sub.setAttribute('aria-pressed', on);
    } else if (cap) {
      draft.cap = cap.dataset.cap === '' ? null : Number(cap.dataset.cap);
      sheet.querySelectorAll('[data-cap]').forEach(b => b.setAttribute('aria-pressed', b === cap));
    } else if (hit('[data-mood-clear]')) { draft = { moods:[], subs:[], cap:null }; sheet.querySelector('#discovery-body').innerHTML = moodBody(); }
  });
  document.addEventListener('change', e => {
    if (!sheet || sheet.dataset.kind !== 'dates') return;
    const form = sheet.querySelector('form'), end = form.elements.to;
    const ranged = form.elements.range.checked;
    sheet.querySelector('#discovery-end').hidden = !ranged;
    end.disabled = !ranged; end.required = ranged; end.min = form.elements.date.value || window.WA.when.todayKey();
  });
  document.addEventListener('submit', e => {
    if (!sheet || e.target.id !== 'discovery-form') return;
    e.preventDefault();
    const kind = sheet.dataset.kind;
    if (kind === 'mood') M().setPref(draft);
    else {
      const form = e.target, date = form.elements.date.value, ranged = form.elements.range.checked, to = ranged ? form.elements.to.value : '';
      if (!D().validDate(date) || date < window.WA.when.todayKey() || (ranged && (!D().validDate(to) || to < date))) return;
      applyDates({ date, to });
    }
    close(true);
  });
  window.WA.DiscoveryControls = { keys, dateKey, openDates };
})();
