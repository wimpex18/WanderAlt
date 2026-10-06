/* ============================================================
   review.js — the review queue: events with status 'review', facts about places that may have
   changed (place_fact_flags), possible duplicate places (place_match_reviews), reader reports.
   ------------------------------------------------------------
   Reads and writes with the Supabase secret key the reviewer types in,
   held in sessionStorage for this tab only. Publish or reject sets the
   status and a status_note starting with "manual", which the pipeline
   never overrides. Listing text is untrusted: esc() everywhere,
   safeUrl() for links. Not linked from the site; robots are told to
   stay out.
   ============================================================ */
(() => {
  'use strict';

  const BASE = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
  const esc = (s) => window.WA.UI.esc(s);
  const url = (u) => window.WA.UI.safeUrl(u);
  const $ = (id) => document.getElementById(id);
  const KEY = 'wa:review-key';

  const key = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
  const headers = () => {
    const k = key();
    return { apikey: k, ...(k.startsWith('eyJ') ? { authorization: `Bearer ${k}` } : {}), 'content-type': 'application/json' };
  };
  const api = async (method, path, body) => {
    const r = await fetch(`${BASE}/rest/v1/${path}`, { method, headers: { ...headers(), prefer: 'return=minimal' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    return method === 'GET' ? r.json() : null;
  };

  /* A function call, answered with JSON (merge_places returns the undo id). */
  const rpc = async (name, body) => {
    const r = await fetch(`${BASE}/rest/v1/rpc/${name}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    return r.json().catch(() => null);
  };
  const inList = (ids) => `(${ids.map(i => `"${String(i).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
  const placesById = async (ids) => {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return new Map();
    const rows = await api('GET', `places?id=in.${encodeURIComponent(inList(uniq))}&select=id,name,kind,address,opening_hours,hours_source,website,instagram,picked,status`);
    return new Map(rows.map(p => [p.id, p]));
  };
  const placeLine = (p) => p ? [p.name ? `<span data-notranslate>${esc(p.name)}</span>` : '',
    esc(p.kind ? p.kind[0].toUpperCase() + p.kind.slice(1) : ''), p.address ? `<span data-notranslate>${esc(p.address)}</span>` : '', p.picked ? 'Picked' : ''].filter(Boolean).join(' · ') : '';

  const when = (iso) => new Date(iso).toLocaleString(window.WA.Lang.locale(), { timeZone: 'Europe/Tallinn', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  /* Problems flagged on event pages: open ones, oldest first. A missing
     table (migration not applied) just hides the section. */
  const reports = async () => {
    try {
      const rows = await api('GET', 'problem_reports?status=eq.open&order=created_at.asc&limit=100&select=id,pick_id,reason,note,created_at');
      if (!rows.length) return '';
      return `<h2 class="wa-h2" style="margin-top:var(--s-6)">Flagged by readers</h2>
        <ul class="review__list">${rows.map(r => `<li class="review__item" data-report="${esc(String(r.id))}">
          <p class="wa-note">${esc([r.reason, new Date(r.created_at).toLocaleDateString(window.WA.Lang.locale())].join(' · '))}</p>
          ${r.note ? `<p class="review__desc" data-notranslate>${esc(r.note)}</p>` : ''}
          <div class="review__actions">
            <a class="wa-btn wa-btn--quiet" href="detail.html?id=${esc(encodeURIComponent(r.pick_id))}">Open the event</a>
            <button class="wa-btn" type="button" data-report-set="fixed">Fixed</button>
            <button class="wa-btn" type="button" data-report-set="dismissed">Dismiss</button>
          </div>
        </li>`).join('')}</ul>`;
    } catch { return ''; }
  };

  /* What a venue's own bio says that differs from what we hold (pipeline/drift.ts). Nothing was changed
     for these: using the new value, or flagging the place for a closer look, is the decision made here. */
  const FIELD = { hours: 'Opening hours', address: 'Address', closure: 'Closed or moved?' };
  const flags = async () => {
    try {
      const rows = await api('GET', 'place_fact_flags?state=eq.open&order=created_at.asc&limit=100&select=id,place_id,field,stored,found,source,created_at');
      if (!rows.length) return '';
      const places = await placesById(rows.map(r => r.place_id));
      return `<h2 class="wa-h2" style="margin-top:var(--s-6)">Facts that may have changed</h2>
        <ul class="review__list">${rows.map(r => {
          const p = places.get(r.place_id);
          return `<li class="review__item" data-flag="${esc(String(r.id))}" data-place="${esc(r.place_id)}" data-field="${esc(r.field)}" data-found="${esc(r.found)}">
            <p class="review__title" data-notranslate>${esc(p ? p.name : r.place_id)}</p>
            <p class="wa-note">${esc(`${FIELD[r.field] || r.field} · from its ${r.source} · ${new Date(r.created_at).toLocaleDateString(window.WA.Lang.locale())}`)}</p>
            ${r.field === 'closure' ? '' : `<p class="review__desc">${r.stored ? esc(`We hold: ${r.stored}`) : '<span>We hold:</span> <span>Nothing filed</span>'}</p>`}
            <p class="review__desc">${esc(`It says: ${r.found}`)}</p>
            <div class="review__actions">
              ${r.field === 'closure'
                ? '<button class="wa-btn wa-btn--primary" type="button" data-flag-set="review">Withhold the place</button>'
                : '<button class="wa-btn wa-btn--primary" type="button" data-flag-set="use">Use the new value</button>'}
              <button class="wa-btn" type="button" data-flag-set="dismissed">Keep what we hold</button>
              <a class="wa-btn wa-btn--quiet" href="detail.html?id=${esc(encodeURIComponent(r.place_id))}">Open the place</a>
            </div>
          </li>`;
        }).join('')}</ul>`;
    } catch { return ''; }
  };

  /* Two place rows the pipeline thinks may be one place. Merging moves the listings to the one kept; keep
     the picked one, because a merge does not carry the pick. */
  const dupes = async () => {
    try {
      const rows = await api('GET', 'place_match_reviews?state=eq.pending&order=updated_at.asc&limit=60&select=place_a,place_b,reason');
      if (!rows.length) return '';
      const places = await placesById(rows.flatMap(r => [r.place_a, r.place_b]));
      return `<h2 class="wa-h2" style="margin-top:var(--s-6)">Possible duplicate places</h2>
        <ul class="review__list">${rows.map(r => {
          const a = places.get(r.place_a), b = places.get(r.place_b);
          if (!a || !b) return '';
          return `<li class="review__item" data-a="${esc(a.id)}" data-b="${esc(b.id)}">
            <p class="review__desc">${placeLine(a)}</p>
            <p class="review__desc">${placeLine(b)}</p>
            <p class="wa-note">${esc(r.reason || '')}</p>
            <div class="review__actions">
              <button class="wa-btn wa-btn--primary" type="button" data-merge="b">${esc(`Merge into ${a.name}`)}</button>
              <button class="wa-btn wa-btn--primary" type="button" data-merge="a">${esc(`Merge into ${b.name}`)}</button>
              <button class="wa-btn" type="button" data-merge="separate">Different places</button>
            </div>
          </li>`;
        }).join('')}</ul>`;
    } catch { return ''; }
  };

  const render = async () => {
    const host = $('queue');
    if (!key()) { host.innerHTML = ''; return; }
    host.innerHTML = '<p class="wa-detail__note">Loading…</p>';
    try {
      const rows = await api('GET', 'events?status=eq.review&archived_at=is.null&order=starts_at.asc&limit=200' +
        '&select=id,title,title_en,summary_en,venue_name,starts_at,kind,relevance,status_note,url,ticket_url,engine');
      $('key-form').hidden = true;
      host.innerHTML = `<p class="wa-note review__count">${esc(`${rows.length} waiting · soonest first`)}</p>
        <ul class="review__list">${rows.map(e => `<li class="review__item" data-id="${esc(e.id)}">
          <p class="wa-note">${[esc(when(e.starts_at)), esc(e.kind ? e.kind[0].toUpperCase() + e.kind.slice(1) : ''), e.venue_name ? `<span data-notranslate>${esc(e.venue_name)}</span>` : '', e.status_note ? `<span data-notranslate>${esc(e.status_note)}</span>` : ''].filter(Boolean).join(' · ')}</p>
          <p class="review__title" data-notranslate>${esc(e.title_en || e.title)}</p>
          ${e.title_en && e.title_en !== e.title ? `<p class="wa-note" data-notranslate>${esc(e.title)}</p>` : ''}
          ${e.summary_en ? `<p class="review__desc" data-notranslate>${esc(e.summary_en)}</p>` : ''}
          <div class="review__actions">
            <button class="wa-btn wa-btn--primary" type="button" data-set="published">Publish</button>
            <button class="wa-btn" type="button" data-set="rejected">Reject</button>
            ${url(e.url || e.ticket_url) ? `<a class="wa-btn wa-btn--quiet" href="${esc(url(e.url || e.ticket_url))}" target="_blank" rel="noopener noreferrer"><span>Source</span> &nearr;</a>` : ''}
          </div>
        </li>`).join('')}</ul>${await flags()}${await dupes()}${await reports()}`;
    } catch (err) {
      try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
      $('key-form').hidden = false;
      host.innerHTML = `<p class="wa-note">${esc(`Supabase refused the key (${err.message}). Check it is the secret key, not the anon key or a Cloudflare token.`)}</p>`;
    }
  };

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'key-form') return;
    e.preventDefault();
    try { sessionStorage.setItem(KEY, $('key').value.trim()); } catch { /* private mode: nothing kept */ }
    $('key').value = '';
    render();
  });

  document.addEventListener('click', async (e) => {
    const fb = e.target.closest && e.target.closest('[data-flag-set]');
    if (fb) {
      const row = fb.closest('[data-flag]');
      const { place, field, found } = row.dataset, choice = fb.dataset.flagSet;
      fb.disabled = true;
      try {
        if (choice === 'use') {
          const value = field === 'hours' ? { opening_hours: found, hours_source: 'manual' }
            : { address: /,/.test(found) ? found : `${found}, Tallinn` };
          await api('PATCH', `places?id=eq.${encodeURIComponent(place)}`, value);
        } else if (choice === 'review') {
          await rpc('record_place_verification', { p_id: place, p_state: 'review', p_source: 'manual', p_url: null, p_note: `Its bio says: ${found}`.slice(0, 400) });
        }
        await api('PATCH', `place_fact_flags?id=eq.${encodeURIComponent(row.dataset.flag)}`, { state: choice === 'dismissed' ? 'dismissed' : 'accepted' });
        row.remove();
      } catch (err) { fb.disabled = false; alert(window.WA.Lang.t(`Not saved: ${err.message}`)); }
      return;
    }
    const mb = e.target.closest && e.target.closest('[data-merge]');
    if (mb) {
      const row = mb.closest('[data-a]');
      const a = row.dataset.a, b = row.dataset.b, how = mb.dataset.merge;
      mb.disabled = true;
      try {
        if (how === 'separate') {
          await api('PATCH', `place_match_reviews?place_a=eq.${encodeURIComponent(a < b ? a : b)}&place_b=eq.${encodeURIComponent(a < b ? b : a)}`, { state: 'separate' });
        } else {
          /* data-merge="b" keeps a and folds b into it; "a" keeps b. */
          const [duplicate, canonical] = how === 'b' ? [b, a] : [a, b];
          await rpc('merge_places', { p_duplicate: duplicate, p_canonical: canonical, p_reason: 'manual review' });
        }
        row.remove();
      } catch (err) { mb.disabled = false; alert(window.WA.Lang.t(`Not saved: ${err.message}`)); }
      return;
    }
    const rb = e.target.closest && e.target.closest('[data-report-set]');
    if (rb) {
      const row = rb.closest('[data-report]');
      rb.disabled = true;
      try {
        await api('PATCH', `problem_reports?id=eq.${encodeURIComponent(row.dataset.report)}`, { status: rb.dataset.reportSet });
        row.remove();
      } catch (err) { rb.disabled = false; alert(window.WA.Lang.t(`Not saved: ${err.message}`)); }
      return;
    }
    const b = e.target.closest && e.target.closest('[data-set]');
    if (!b) return;
    const row = b.closest('[data-id]');
    b.disabled = true;
    try {
      await api('PATCH', `events?id=eq.${encodeURIComponent(row.dataset.id)}`,
        { status: b.dataset.set, status_note: `manual ${b.dataset.set === 'published' ? 'publish' : 'reject'}` });
      row.remove();
    } catch (err) {
      b.disabled = false;
      alert(window.WA.Lang.t(`Not saved: ${err.message}`));
    }
  });

  document.addEventListener('DOMContentLoaded', render);
})();
