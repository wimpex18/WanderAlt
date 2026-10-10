/* ============================================================
   review.js — the audit and override page. The pipeline settles every held listing itself
   (pipeline/review-decider.ts); this shows what it decided for upcoming listings and why: the
   listing's own words each decision rests on and where they were found. Also listings still
   waiting, facts about places that may have changed (place_fact_flags), possible duplicate places
   (place_match_reviews), reader reports.
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

  /* Why a listing waits, in the reviewer's words: the rule that held it (pipeline/run.ts offPromise), a date
     read from a poster, or the model's doubt. A group keeps one reason together so it can be settled at once;
     the rows of one show on several dates are one decision. */
  const RULE = { wellness: 'Wellness and spiritual', 'hobby class': 'Hobby classes', 'self-help': 'Self-help and social',
    mainstream: 'Mainstream and commercial', children: "Children's events", 'restaurant venue': 'At a restaurant',
    'hotel venue': 'At a hotel', 'wellness venue': 'At a yoga or wellness studio', 'children venue': 'At a puppet theatre or youth centre',
    'mainstream venue': 'At an arena', 'not a title': 'A sentence instead of a name' };
  const reasonOf = (note) => {
    const n = String(note || '');
    const rule = n.match(/^rule: ([a-z' -]+?) \(/);
    if (rule) return { key: `rule:${rule[1]}`, label: RULE[rule[1]] || rule[1], order: 0 };
    if (/poster/i.test(n)) return { key: 'poster', label: 'Dates read from a poster', order: 1 };
    if (/^trusted source, low fit/.test(n)) return { key: 'trusted-low', label: 'Trusted source, low fit', order: 2 };
    if (/^borderline fit/.test(n)) return { key: 'borderline', label: 'Borderline fit', order: 3 };
    return { key: 'other', label: 'Other reasons', order: 4 };
  };
  const showKey = (e) => `${String(e.title_en || e.title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}|${String(e.venue_name || '').toLowerCase()}`;
  const groupsOf = (rows) => {
    const groups = new Map();
    for (const e of rows) {
      const r = reasonOf(e.status_note);
      if (!groups.has(r.key)) groups.set(r.key, { ...r, shows: new Map() });
      const g = groups.get(r.key), k = showKey(e);
      if (!g.shows.has(k)) g.shows.set(k, []);
      g.shows.get(k).push(e);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  };
  const showItem = (list) => {
    const e = list[0], ids = list.map(x => x.id).join(','), many = list.length > 1;
    const source = url(e.url || e.ticket_url);
    return `<li class="review__item" data-ids="${esc(ids)}">
      <p class="wa-note">${[esc(when(e.starts_at)), many ? esc(`${list.length} dates`) : '', esc(e.kind ? e.kind[0].toUpperCase() + e.kind.slice(1) : ''), e.venue_name ? `<span data-notranslate>${esc(e.venue_name)}</span>` : '', e.status_note ? `<span data-notranslate>${esc(e.status_note)}</span>` : ''].filter(Boolean).join(' · ')}</p>
      <p class="review__title" data-notranslate>${esc(e.title_en || e.title)}</p>
      ${e.title_en && e.title_en !== e.title ? `<p class="wa-note" data-notranslate>${esc(e.title)}</p>` : ''}
      ${e.summary_en ? `<p class="review__desc" data-notranslate>${esc(e.summary_en)}</p>` : ''}
      ${many ? `<p class="review__desc">${list.slice(1).map(x => `<span class="review__date">${esc(when(x.starts_at))}</span>`).join(' ')}</p>` : ''}
      <div class="review__actions">
        <button class="wa-btn wa-btn--primary" type="button" data-set="published">${esc(many ? `Publish all ${list.length}` : 'Publish')}</button>
        <button class="wa-btn" type="button" data-set="rejected">${esc(many ? `Reject all ${list.length}` : 'Reject')}</button>
        ${source ? `<a class="wa-btn wa-btn--quiet" href="${esc(source)}" target="_blank" rel="noopener noreferrer"><span>Source</span> &nearr;</a>` : ''}
      </div>
    </li>`;
  };
  const groupHtml = (g) => {
    const shows = [...g.shows.values()], n = shows.reduce((t, l) => t + l.length, 0);
    return `<section class="review__group" data-group="${esc(g.key)}">
      <div class="review__group-head">
        <h2 class="wa-h2">${esc(g.label)}</h2>
        <span class="wa-note review__group-n">${esc(n === 1 ? '1 listing' : `${n} listings`)}</span>
        <div class="review__bulk">
          <button class="wa-btn" type="button" data-bulk="rejected">Reject this group</button>
          <button class="wa-btn wa-btn--quiet" type="button" data-bulk="published">Publish this group</button>
        </div>
      </div>
      <ul class="review__list">${shows.map(showItem).join('')}</ul>
    </section>`;
  };
  /* What is left in a group after a decision: its count, or the group itself when empty. */
  const recount = (group) => {
    if (!group) return;
    const n = [...group.querySelectorAll('[data-ids]')].reduce((t, li) => t + li.dataset.ids.split(',').length, 0);
    if (!n) { group.remove(); return; }
    group.querySelector('.review__group-n').textContent = n === 1 ? '1 listing' : `${n} listings`;
  };
  const setStatus = (ids, status) => api('PATCH', `events?id=in.${encodeURIComponent(inList(ids))}`,
    { status, status_note: `manual ${status === 'published' ? 'publish' : 'reject'}` });

  /* What the decider decided (review_decisions), for upcoming listings it still holds that way: the
     latest decision per listing whose note is still the automatic one. A person's override replaces the
     note with "manual …", and the listing leaves this list. */
  const REASON = { fits: 'Fits the guide', elsewhere: 'Outside the city', dining: 'A restaurant, hotel or dining', mainstream: 'Mainstream or commercial',
    wellness: 'Wellness or spiritual', hobby: 'A hobby class', 'self-help': 'Self-help', children: "Children's or family", 'not-culture': 'Not culture',
    'not-a-title': "No show's name", unclear: 'Nothing shows it fits', 'poster-date': 'Date only on a poster', duplicate: 'Listed already' };
  const WHERE = { title: 'In the title', venue: 'In the venue', address: 'In the address', text: 'In the text', page: 'On its own page',
    caption: 'In the caption', source: 'In another source', rule: 'From the rule' };
  const decided = (decisions, events) => {
    const byId = new Map(events.map(e => [e.id, e])), seen = new Set(), out = [];
    for (const d of decisions) {
      if (seen.has(d.event_id)) continue;
      seen.add(d.event_id);
      const e = byId.get(d.event_id);
      if (e && String(e.status_note || '').startsWith('auto ') && e.status === d.outcome) out.push({ d, e });
    }
    const groups = new Map();
    for (const x of out) {
      const key = `${x.d.outcome}:${x.d.outcome === 'published' ? 'fits' : x.d.reason}`;
      if (!groups.has(key)) groups.set(key, { key, outcome: x.d.outcome, reason: x.d.reason, items: [] });
      groups.get(key).items.push(x);
    }
    for (const g of groups.values()) g.items.sort((a, b) => a.e.starts_at.localeCompare(b.e.starts_at));
    return [...groups.values()].sort((a, b) => Number(b.outcome === 'published') - Number(a.outcome === 'published') || b.items.length - a.items.length);
  };
  const decidedItem = ({ d, e }) => {
    const source = url(e.url || e.ticket_url), flip = d.outcome === 'published' ? 'rejected' : 'published';
    const votes = d.evidence && d.evidence.fit && Array.isArray(d.evidence.fit.votes) ? d.evidence.fit.votes.join(' ') : '';
    return `<li class="review__item" data-ids="${esc(e.id)}">
      <p class="wa-note">${[esc(when(e.starts_at)), e.venue_name ? `<span data-notranslate>${esc(e.venue_name)}</span>` : '', d.held_by ? `<span data-notranslate>${esc(`held: ${d.held_by}`)}</span>` : ''].filter(Boolean).join(' · ')}</p>
      <p class="review__title" data-notranslate>${esc(e.title_en || e.title)}</p>
      ${d.quote ? `<blockquote class="review__quote" data-notranslate>${esc(d.quote)}</blockquote>` : ''}
      <p class="wa-note">${[d.quote_in && WHERE[d.quote_in] ? esc(WHERE[d.quote_in]) : '', d.engine ? `<span data-notranslate>${esc(d.engine)}</span>` : '', votes ? `<span data-notranslate>${esc(votes)}</span>` : ''].filter(Boolean).join(' · ')}</p>
      ${d.why ? `<p class="review__desc" data-notranslate>${esc(d.why)}</p>` : ''}
      <div class="review__actions">
        <button class="wa-btn" type="button" data-set="${flip}">${esc(flip === 'published' ? 'Publish' : 'Reject')}</button>
        ${source ? `<a class="wa-btn wa-btn--quiet" href="${esc(source)}" target="_blank" rel="noopener noreferrer"><span>Source</span> &nearr;</a>` : ''}
      </div>
    </li>`;
  };
  const decidedHtml = async () => {
    try {
      const since = new Date(Date.now() - 12 * 3600_000).toISOString();
      const decisions = await api('GET', 'review_decisions?outcome=neq.waits&order=decided_at.desc&limit=1000&select=event_id,decided_at,outcome,reason,why,quote,quote_in,held_by,evidence,engine');
      const ids = [...new Set(decisions.map(d => d.event_id))];
      const events = [];
      for (let i = 0; i < ids.length; i += 150) {
        events.push(...await api('GET', `events?id=in.${encodeURIComponent(inList(ids.slice(i, i + 150)))}&archived_at=is.null&merged_into=is.null&starts_at=gte.${since}`
          + '&select=id,title,title_en,venue_name,starts_at,status,status_note,url,ticket_url'));
      }
      const groups = decided(decisions, events);
      if (!groups.length) return '<h2 class="wa-h2 review__section">Decided automatically</h2><p class="wa-note">No decisions on upcoming listings yet.</p>';
      return `<h2 class="wa-h2 review__section">Decided automatically</h2>
        <p class="wa-note">Upcoming listings the pipeline settled, with the listing's own words each decision rests on. Publish or Reject overrides it.</p>
        ${groups.map(g => `<details class="review__group"${g.outcome === 'published' ? ' open' : ''} data-group="${esc(g.key)}">
          <summary class="review__group-head"><span class="review__group-title">${esc(g.outcome === 'published' ? 'Published automatically' : REASON[g.reason] || g.reason)}</span>
            <span class="wa-note review__group-n">${esc(g.items.length === 1 ? '1 listing' : `${g.items.length} listings`)}</span></summary>
          <ul class="review__list">${g.items.map(decidedItem).join('')}</ul>
        </details>`).join('')}`;
    } catch { return ''; }
  };

  const render = async () => {
    const host = $('queue');
    if (!key()) { host.innerHTML = ''; return; }
    host.innerHTML = '<p class="wa-detail__note">Loading…</p>';
    try {
      const rows = await api('GET', 'events?status=eq.review&archived_at=is.null&merged_into=is.null&order=starts_at.asc&limit=500' +
        '&select=id,title,title_en,summary_en,venue_name,starts_at,kind,relevance,status_note,url,ticket_url,engine');
      $('key-form').hidden = true;
      host.innerHTML = `<h2 class="wa-h2 review__section">Still waiting</h2>
        ${rows.length ? `<p class="wa-note review__count">${esc(rows.length === 1 ? '1 listing' : `${rows.length} listings`)}</p>${groupsOf(rows).map(groupHtml).join('')}`
          : '<p class="wa-note">Nothing is waiting: the pipeline settled every held listing.</p>'}
        ${await decidedHtml()}${await flags()}${await dupes()}${await reports()}`;
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
    /* A whole group: the first click asks, in place, how many listings it settles; the second does it. */
    const bulk = e.target.closest && e.target.closest('[data-bulk]');
    if (bulk) {
      const group = bulk.closest('[data-group]'), box = bulk.closest('.review__bulk');
      const ids = [...group.querySelectorAll('[data-ids]')].flatMap(li => li.dataset.ids.split(','));
      const verb = bulk.dataset.bulk === 'published' ? 'Publish' : 'Reject';
      box.dataset.was = box.innerHTML;
      box.innerHTML = `<span class="wa-note" role="status">${esc(`${verb} ${ids.length === 1 ? '1 listing' : `${ids.length} listings`}?`)}</span>
        <button class="wa-btn ${verb === 'Reject' ? '' : 'wa-btn--primary'}" type="button" data-bulk-yes="${esc(bulk.dataset.bulk)}">${esc(`Yes, ${verb.toLowerCase()}`)}</button>
        <button class="wa-btn wa-btn--quiet" type="button" data-bulk-no>Cancel</button>`;
      box.querySelector('[data-bulk-no]').focus();
      return;
    }
    const no = e.target.closest && e.target.closest('[data-bulk-no]');
    if (no) { const box = no.closest('.review__bulk'); box.innerHTML = box.dataset.was; box.querySelector('[data-bulk]').focus(); return; }
    const yes = e.target.closest && e.target.closest('[data-bulk-yes]');
    if (yes) {
      const group = yes.closest('[data-group]');
      const ids = [...group.querySelectorAll('[data-ids]')].flatMap(li => li.dataset.ids.split(','));
      yes.disabled = true;
      try { await setStatus(ids, yes.dataset.bulkYes); group.remove(); }
      catch (err) { yes.disabled = false; alert(window.WA.Lang.t(`Not saved: ${err.message}`)); }
      return;
    }
    const b = e.target.closest && e.target.closest('[data-set]');
    if (!b) return;
    const row = b.closest('[data-ids]'), group = row.closest('[data-group]');
    b.disabled = true;
    try {
      await setStatus(row.dataset.ids.split(','), b.dataset.set);
      row.remove();
      recount(group);
    } catch (err) {
      b.disabled = false;
      alert(window.WA.Lang.t(`Not saved: ${err.message}`));
    }
  });

  document.addEventListener('DOMContentLoaded', render);
  window.WA.ReviewQueue = { reasonOf, groupsOf, decided };
})();
