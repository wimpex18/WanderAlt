/* ============================================================
   ask.js — search that reads a sentence.
   ------------------------------------------------------------
   "techno tonight in Kalamaja under 15" becomes filters: when, kinds,
   free, price cap, English, and the words left to look for. Two
   readers give the same shape:
   - local(q): instant, in the page, knows the obvious words in
     English, Estonian and Russian.
   - remote(q): /api/ask, a small free model on Workers AI, for the
     rest ("something quiet with a drink", "где послушать джаз").
     It answers null when the model is unavailable; local stands.

   Shape: { when, day, kinds[], free, english, maxPrice, must[], any[], note }
   when: tonight | tomorrow | weekend | thisweek | '' ; day: YYYY-MM-DD | ''
   must: words that all have to match; any: at least one has to.

   window.WA.Ask: .local(q) .remote(q) → Promise .isQuestion(q) .match(e, parsed)
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const fold = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* Whole words in any script; the query is folded first, so Estonian
     words are written here without their accents (täna → tana). */
  const w = (alts, g = '') => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, `u${g}`);
  const WHEN = [
    ['tonight', w('tonight|today|this evening|right now|tana|tana ohtul|сегодня|вечером')],
    ['tomorrow', w('tomorrow|homme|завтра')],
    ['weekend', w('(?:this )?weekend|nadalavahetusel?|на выходных|выходные')],
    ['thisweek', w('this week|next few days|sel nadalal|на этой неделе')],
  ];
  const KINDS = [
    ['gig', w('gigs?|concerts?|live music|bands?|jazz|punk|rock|metal|indie|folk|kontserd?t?|концерт\\p{L}*|джаз', 'g')],
    ['club', w('club|clubbing|party|parties|rave|techno|house music|dj|klubi|pidu|клуб\\p{L}*|вечеринк\\p{L}*|техно', 'g')],
    ['film', w('films?|movies?|cinema|screenings?|kino|кино|фильм\\p{L}*', 'g')],
    ['exhibition', w('art|exhibitions?|gallery|galleries|naitus|kunst|выставк\\p{L}*', 'g')],
    ['talk', w('talks?|lectures?|readings?|books?|authors?|discussions?|loeng|лекци\\p{L}*', 'g')],
    ['theatre', w('theatre|theater|plays?|dance|performances?|teater|etendus|театр\\p{L}*|спектакл\\p{L}*', 'g')],
    ['market', w('markets?|flea|fair|vinyl|records|turg|laat|ярмарк\\p{L}*|рын\\p{L}*', 'g')],
    ['workshop', w('workshops?|class|masterclass|tootuba|мастер-?класс\\p{L}*', 'g')],
    ['festival', w('festivals?|фестивал\\p{L}*', 'g')],
  ];
  const WEEKDAYS = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
  const STOP = new Set(('a an the in at on for to of and or with near around something some any anything events event ' +
    'what whats what\'s is are there go going out me i want looking find show where cheap under below less than eur euro euros € ' +
    'free english in english tallinn please good best nice cool fun').split(' '));

  const empty = () => ({ when: '', day: '', kinds: [], free: false, english: false, maxPrice: null, must: [], any: [], note: '' });

  const dayKeyFor = (dow) => {
    const W = window.WA.when;
    for (let i = 0; i < 7; i++) {
      const k = W.keyPlus(i);
      if (new Date(`${k}T12:00:00`).getDay() === dow) return k;
    }
    return '';
  };

  const local = (raw) => {
    const out = empty();
    let q = ` ${fold(raw)} `;
    const take = (re) => { q = q.replace(re, ' '); };
    for (const [v, re] of WHEN) if (re.test(q)) { out.when = out.when || v; take(re); }
    for (const [name, dow] of Object.entries(WEEKDAYS)) {
      const re = w(`(?:on )?${name}`);
      if (re.test(q) && window.WA.when) { out.day = dayKeyFor(dow); out.when = ''; take(re); }
    }
    for (const [k, re] of KINDS) {
      const m = q.match(re);
      if (!m) continue;
      out.kinds.push(k);
      /* A genre word also narrows the list; a format word only picks the kind. */
      m.forEach(x => { if (/jazz|punk|rock|metal|indie|folk|techno|house|vinyl|records|flea|book|author|джаз|техно/.test(x)) out.any.push(({ 'джаз': 'jazz', 'техно': 'techno' })[x.trim()] || x.trim()); });
      take(re);
    }
    const FREE = w('free|tasuta|бесплатн\\p{L}*', 'g'), EN = w('in english|english|inglise keeles|на английском', 'g');
    if (FREE.test(q)) { out.free = true; take(FREE); }
    if (EN.test(q)) { out.english = true; take(EN); }
    const cap = q.match(/(?:under|below|less than|up to|max|до|kuni)\s*€?\s*(\d{1,3})\s*(?:€|eur|euros?)?/) || q.match(/€\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:€|eur)\b/);
    if (cap) { out.maxPrice = Number(cap[1] || cap[2]); take(cap[0]); }
    out.must = q.split(/[\s,.;!?]+/).filter(x => x.length > 1 && !STOP.has(x));
    out.kinds = [...new Set(out.kinds)];
    return out;
  };

  /* A sentence, not a title: several words, or words local understood. */
  const isQuestion = (q) => {
    const s = String(q || '').trim();
    if (s.length < 4) return false;
    const p = local(s);
    return s.split(/\s+/).length >= 3 || !!(p.when || p.day || p.kinds.length || p.free || p.english || p.maxPrice);
  };

  const cache = new Map();
  const remote = async (q) => {
    const key = fold(q).trim().slice(0, 140);
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`/api/ask?q=${encodeURIComponent(key)}&today=${encodeURIComponent(window.WA.when.todayKey())}`, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return null;
      const j = await r.json();
      const out = { ...empty(), ...j, kinds: Array.isArray(j.kinds) ? j.kinds : [], must: Array.isArray(j.must) ? j.must : [], any: Array.isArray(j.any) ? j.any : [] };
      cache.set(key, out);
      return out;
    } catch { return null; }
  };

  /* The words part of a reading, against one listing. */
  const match = (e, p) => {
    const R = window.WA.R;
    if (p.must.length && !p.must.every(w => R.matches(e, w))) return false;
    if (p.any.length && !p.any.some(w => R.matches(e, w))) return false;
    return true;
  };

  window.WA.Ask = { local, remote, isQuestion, match, empty };
})();
