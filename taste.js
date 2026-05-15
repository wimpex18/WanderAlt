/* ============================================================
   WanderAlt — taste preferences & match feedback (localStorage)
   ------------------------------------------------------------
   Lives in window.WA.taste. Stores three pieces of state:

     • wa-taste-prefs       { energy, company, money }
     • wa-match-feedback    { liked: id[], disliked: id[] }
     • wa-match-seen        id[]   (recently-shown pick ids, FIFO 200)

   Used by:
     • briefing.js  → re-orders This Week by taste alignment
     • search.js    → sends taste/feedback/seen to match-pick;
                      renders 👍/👎 controls on match hits
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
  const isOnboarded  = () => localStorage.getItem(ONBOARDED_KEY) === '1';
  const setOnboarded = () => localStorage.setItem(ONBOARDED_KEY, '1');
  const resetOnboarding = () => {
    localStorage.removeItem(ONBOARDED_KEY);
    localStorage.removeItem(PREFS_KEY);
  };

  /* — Feedback — capped so request bodies stay small. */
  const FEEDBACK_CAP = 50;
  const getFeedback  = () => {
    try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '{}'); }
    catch { return {}; }
  };
  const writeFeedback = (f) => localStorage.setItem(FEEDBACK_KEY, JSON.stringify(f));

  const recordLike = (id) => {
    const f = getFeedback();
    f.liked    = [id, ...((f.liked    || []).filter(x => x !== id))].slice(0, FEEDBACK_CAP);
    f.disliked =       (f.disliked || []).filter(x => x !== id);
    writeFeedback(f);
    document.dispatchEvent(new CustomEvent('wa:taste-feedback', { detail: { id, vote: 'like' } }));
  };
  const recordDislike = (id) => {
    const f = getFeedback();
    f.disliked = [id, ...((f.disliked || []).filter(x => x !== id))].slice(0, FEEDBACK_CAP);
    f.liked    =       (f.liked    || []).filter(x => x !== id);
    writeFeedback(f);
    document.dispatchEvent(new CustomEvent('wa:taste-feedback', { detail: { id, vote: 'dislike' } }));
  };
  const clearVote = (id) => {
    const f = getFeedback();
    f.liked    = (f.liked    || []).filter(x => x !== id);
    f.disliked = (f.disliked || []).filter(x => x !== id);
    writeFeedback(f);
    document.dispatchEvent(new CustomEvent('wa:taste-feedback', { detail: { id, vote: null } }));
  };
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

  window.WA = window.WA || {};
  window.WA.taste = {
    getPrefs, setPrefs, isOnboarded, setOnboarded, resetOnboarding,
    getFeedback, recordLike, recordDislike, clearVote, voteFor,
    getSeen, recordSeen,
    tasteScore, matchParams,
  };
})();
