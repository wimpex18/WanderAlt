/* ============================================================
   review.js — the review queue: events with status 'review'.
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

  const when = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Tallinn', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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
          <p class="wa-note">${esc([when(e.starts_at), e.kind, e.venue_name, e.status_note].filter(Boolean).join(' · '))}</p>
          <p class="review__title">${esc(e.title_en || e.title)}</p>
          ${e.title_en && e.title_en !== e.title ? `<p class="wa-note">${esc(e.title)}</p>` : ''}
          ${e.summary_en ? `<p class="review__desc">${esc(e.summary_en)}</p>` : ''}
          <div class="review__actions">
            <button class="wa-btn wa-btn--primary" type="button" data-set="published">Publish</button>
            <button class="wa-btn" type="button" data-set="rejected">Reject</button>
            ${url(e.url || e.ticket_url) ? `<a class="wa-btn wa-btn--quiet" href="${esc(url(e.url || e.ticket_url))}" target="_blank" rel="noopener noreferrer">Source &nearr;</a>` : ''}
          </div>
        </li>`).join('')}</ul>`;
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
      alert(`Not saved: ${err.message}`);
    }
  });

  document.addEventListener('DOMContentLoaded', render);
})();
