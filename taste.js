/* ============================================================
   WanderAlt — taste preferences & match feedback (localStorage)
   ------------------------------------------------------------
   Lives in window.WA.taste. Stores three pieces of state:

     • wa-taste-prefs       { energy, company, money }
     • wa-match-feedback    { liked: id[], disliked: id[] }
     • wa-match-seen        id[]   (recently-shown pick ids, FIFO 200)

   Used by:
     • briefing.js / discover.js / saved.js / curator.js
                    → re-order lists by taste alignment (orderByTaste)
     • discover.js  → sends taste/feedback/seen to match-pick (matchParams)
     • match-pick   → biases the LLM rerank prompt
   ============================================================ */
(() => {
  const PREFS_KEY     = 'wa-taste-prefs';
  const FEEDBACK_KEY  = 'wa-match-feedback';
  const SEEN_KEY      = 'wa-match-seen';
  const ONBOARDED_KEY = 'wa-taste-onboarded';

  /* — Prefs — */
  const getPrefs = () => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
    catch { return {}; }
  };
  const setPrefs = (next) => {
    const merged = { ...getPrefs(), ...next };
    localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
    document.dispatchEvent(new CustomEvent('wa:taste-changed', { detail: merged }));
    return merged;
  };
  /* Clears one axis back to "no preference" — lets a chip be tapped
     again to deselect, instead of every axis being permanently sticky
     once chosen. */
  const unsetPref = (axis) => {
    const prefs = getPrefs();
    delete prefs[axis];
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    document.dispatchEvent(new CustomEvent('wa:taste-changed', { detail: prefs }));
    return prefs;
  };
  const isOnboarded  = () => localStorage.getItem(ONBOARDED_KEY) === '1';
  const setOnboarded = () => localStorage.setItem(ONBOARDED_KEY, '1');
  const resetOnboarding = () => {
    localStorage.removeItem(ONBOARDED_KEY);
    localStorage.removeItem(PREFS_KEY);
  };

  const clearAllFeedback = () => {
    localStorage.removeItem(FEEDBACK_KEY);
    localStorage.removeItem(SEEN_KEY);
    document.dispatchEvent(new CustomEvent('wa:taste-changed'));
  };

  /* — Feedback — written only by the DB merge on sign-in these days
     (the 👍/👎 write path went with the retired search page). */
  const getFeedback  = () => {
    try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '{}'); }
    catch { return {}; }
  };
  const writeFeedback = (f) => localStorage.setItem(FEEDBACK_KEY, JSON.stringify(f));

  const voteFor = (id) => {
    const f = getFeedback();
    if ((f.liked    || []).includes(id)) return 'like';
    if ((f.disliked || []).includes(id)) return 'dislike';
    return null;
  };

  /* — Seen list — used to avoid recycling the same results. */
  const SEEN_CAP = 200;
  const getSeen  = () => {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); }
    catch { return []; }
  };
  const recordSeen = (ids) => {
    if (!Array.isArray(ids) || !ids.length) return;
    const prev = getSeen();
    const next = [...new Set([...ids, ...prev])].slice(0, SEEN_CAP);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  };

  /* — Taste score — used by briefing to re-order picks by alignment.
     +1 per matching mood_tag; -1 if the user disliked the pick. */
  const TAG_FOR = {
    'energy:loud': 'loud', 'energy:quiet': 'quiet',
    'company:solo': 'solo', 'company:social': 'social',
    'money:free': 'free',  'money:ticketed': 'ticketed',
  };
  const tasteScore = (entry) => {
    const prefs = getPrefs();
    const tags  = entry?.moodTags || [];
    let s = 0;
    for (const [axis, choice] of Object.entries(prefs)) {
      const tag = TAG_FOR[`${axis}:${choice}`];
      if (tag && tags.includes(tag)) s++;
    }
    if (voteFor(entry?.id) === 'like')    s += 2;
    if (voteFor(entry?.id) === 'dislike') s -= 3;
    return s;
  };

  /* — Taste re-ordering — the one shared implementation (was hand-copied
     into briefing/discover/saved/curator). Higher tasteScore first; a
     stable sort so 0-score ties keep the caller's (curation) order.
     Returns the input untouched when no prefs are set, so untuned
     visitors always see pure curation order. */
  const orderByTaste = (entries) => {
    if (!Object.keys(getPrefs()).length) return entries;
    return entries
      .map((e, i) => ({ e, i, s: tasteScore(e) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map(x => x.e);
  };

  /* — Convenience: spread into a match-pick request body. */
  const matchParams = () => {
    const prefs = getPrefs();
    const fb    = getFeedback();
    const seen  = getSeen();
    const out   = {};
    if (Object.keys(prefs).length) out.taste = prefs;
    if (fb.liked?.length)          out.liked_ids    = fb.liked.slice(0, 20);
    if (fb.disliked?.length)       out.disliked_ids = fb.disliked.slice(0, 20);
    if (seen.length)               out.seen_ids     = seen.slice(0, 30);
    return out;
  };

  /* — DB sync: load from user_match_history when signed in. */
  const loadFromDb = async (session) => {
    const base = window.WA?.BASE_URL;
    if (!base || !session?.access_token) return;
    try {
      const res = await fetch(
        `${base}/rest/v1/user_match_history?select=pick_id,vote,seen_at&order=seen_at.desc&limit=200`,
        { headers: { apikey: window.WA.ANON_KEY, Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) return;

      /* Merge DB rows into local state (DB wins for vote; seen always merged). */
      const fb = getFeedback();
      const seenFromDb = [];
      for (const row of rows) {
        const id = row.pick_id;
        seenFromDb.push(id);
        if (row.vote === 'like') {
          fb.liked    = [id, ...((fb.liked    || []).filter(x => x !== id))];
          fb.disliked = (fb.disliked || []).filter(x => x !== id);
        } else if (row.vote === 'dislike') {
          fb.disliked = [id, ...((fb.disliked || []).filter(x => x !== id))];
          fb.liked    = (fb.liked    || []).filter(x => x !== id);
        }
      }
      writeFeedback(fb);
      recordSeen(seenFromDb);
    } catch { /* gracefully absent */ }
  };

  /* Wire auto-sync on sign-in. */
  document.addEventListener('wa:signed-in', (e) => {
    const session = e.detail?.session || window.WA?.Auth?.session;
    if (session) loadFromDb(session);
  });

  window.WA = window.WA || {};
  window.WA.taste = {
    getPrefs, setPrefs, unsetPref, isOnboarded, setOnboarded, resetOnboarding,
    clearAllFeedback,
    getFeedback,
    getSeen, recordSeen,
    tasteScore, orderByTaste, matchParams,
  };
})();
