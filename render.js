/* ============================================================
   render.js — WA.R, every shared piece of markup.
   ------------------------------------------------------------
   One implementation per pattern: the event row, the place row, the
   poster card, section heads, skeletons and empty states all live here,
   and every page builds from them. Also the shared readings of the
   catalogue that more than one page needs: areas, kinds, the one
   "why it's listed" tag, what is on right now, interests and the
   last visit.

   Everything interpolated is database text: esc() at the site, and
   safeUrl() for anything that becomes an href or src.
   ============================================================ */
(() => {
  'use strict';
  window.WA = window.WA || {};

  const UI   = () => window.WA.UI;
  const esc  = (s) => UI().esc(s);
  const url  = (u) => UI().safeUrl(u);
  const I    = (n, c) => window.WA.Icon(n, c);
  const W    = () => window.WA.when;
  const G    = () => window.WA.Geo;
  const H    = () => window.WA.Hours;

  const PLACEHOLDER = /^(unknown|tba|tbc|n\/a|none|null|undefined|other|-)$/i;
  const real = (v) => {
    const s = String(v == null ? '' : v).trim();
    return s && !PLACEHOLDER.test(s) ? s : '';
  };

  /* Names print in Latin script (English or Estonian). A Cyrillic name in a
     venue or area field is a source's phrase, not the place's name. */
  const latin = (v) => { const s = real(v); return s && !/[\u0400-\u04ff]/.test(s) ? s : ''; };

  const fold = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ── Areas ───────────────────────────────────────────────────
     Sources file districts in the genitive ("Põhja-Tallinna") or as
     asum names. People know Kalamaja, the Old Town and Noblessner, so
     every area is printed in the name a visitor would use. */
  const AREA = {
    'pohja-tallinna': 'Põhja-Tallinn', 'pohja-tallinn': 'Põhja-Tallinn',
    'kalamaja': 'Kalamaja', 'telliskivi': 'Telliskivi', 'kopli': 'Kopli', 'noblessner': 'Noblessner',
    'kesklinna': 'City centre', 'kesklinn': 'City centre',
    'all-linn': 'Old Town', 'vanalinn': 'Old Town', 'old town': 'Old Town',
    'kristiine': 'Kristiine', 'pirita': 'Pirita', 'lasnamae': 'Lasnamäe', 'mustamae': 'Mustamäe', 'nomme': 'Nõmme',
  };
  /* Small asum names fold into the area a visitor would look under, so the
     Tonight list stays short: the city centre's quarters, the rest of
     Põhja-Tallinn, and so on. Only names whose district is certain are here;
     any other name is printed as filed. */
  const FOLD = {
    'City centre': ['sudalinn', 'sadama', 'rotermanni', 'kompassi', 'tonismae', 'veerenni', 'kadriorg', 'uus maailm', 'maakri',
      'tatari', 'keldrimae', 'juhkentali', 'raua', 'kassisaba', 'torupilli', 'sibulakula', 'rotermann'],
    'Old Town': ['toompea'],
    'Põhja-Tallinn': ['pelgulinn', 'karjamaa', 'kelmikula', 'sitsi', 'paljassaare', 'pelguranna', 'merimetsa', 'volta', 'stroomi'],
    'Kristiine': ['lillekula', 'tondi', 'jarve'],
    'Lasnamäe': ['laagna', 'tondiraba', 'ulemiste', 'sikupilli', 'saase', 'priisle', 'kurepolle', 'vao', 'pae', 'katleri', 'mustakivi'],
    'Õismäe': ['vaike-oismae', 'oismae', 'haabersti'],
    'Nõmme': ['hiiu', 'rahumae', 'paaskula', 'kitsekula', 'liiva', 'kivimae', 'raudalu'],
  };
  for (const [group, names] of Object.entries(FOLD)) for (const n of names) AREA[n] = group;
  /* The areas people look for, west to east and north to south, for the
     Tonight list; anything else is reachable by search or the programme. */
  const AREA_LIST = ['Old Town', 'City centre', 'Kalamaja', 'Telliskivi', 'Noblessner', 'Kopli', 'Põhja-Tallinn', 'Kristiine',
    'Pirita', 'Lasnamäe', 'Mustamäe', 'Õismäe', 'Nõmme'];
  const AREA_SUB = {
    'Põhja-Tallinn': 'Pelgulinn, Paljassaare, Karjamaa',
    'City centre': 'Rotermann, Kadriorg, Uus Maailm',
    'Old Town': 'Inside the walls',
  };
  const area = (raw) => {
    const s = real(raw);
    if (!s) return '';
    return AREA[fold(s)] || s;
  };
  const areaOf = (e) => {
    const direct = area(e && e.neighborhood);
    if (direct) return direct;
    const v = e && !e.name && window.WA.venueFor ? window.WA.venueFor(e) : null;
    return v ? area(v.neighborhood) : '';
  };

  /* ── Kinds ───────────────────────────────────────────────── */
  const KIND = {
    gig: 'Gig', club: 'Club night', film: 'Film', theatre: 'Theatre', workshop: 'Workshop',
    exhibition: 'Exhibition', talk: 'Talk', festival: 'Festival', market: 'Market',
    'record store': 'Record shop', bookshop: 'Bookshop', gallery: 'Gallery', thrift: 'Thrift shop',
    'arts centre': 'Arts centre', cinema: 'Cinema', community: 'Community centre', bar: 'Bar', museum: 'Museum',
  };
  const PLACE_KIND = { club: 'Club', theatre: 'Theatre' };
  const kindLabel = (k, isPlace) => {
    const key = String(k || '').toLowerCase().trim();
    if (!real(key)) return '';
    if (isPlace && PLACE_KIND[key]) return PLACE_KIND[key];
    return KIND[key] || key.charAt(0).toUpperCase() + key.slice(1);
  };

  /* ── The one tag that says why it's listed ───────────────────
     A genre or scene word when the source gave one, then "In English"
     (the question expats ask first), then what the venue is known for.
     Generic words ("event", "estonia", the kind itself) never qualify. */
  const WHY = {
    diy: 'DIY', experimental: 'Experimental', techno: 'Techno', house: 'House', electronic: 'Electronic',
    ambient: 'Ambient', noise: 'Noise', punk: 'Punk', indie: 'Indie', jazz: 'Jazz', folk: 'Folk',
    hiphop: 'Hip-hop', 'hip-hop': 'Hip-hop', rap: 'Hip-hop', metal: 'Metal', rock: 'Rock', classical: 'Classical',
    queer: 'Queer', drag: 'Drag', poetry: 'Poetry', zine: 'Zines', vinyl: 'Vinyl', arthouse: 'Arthouse',
    documentary: 'Documentary', contemporary: 'Contemporary', dance: 'Dance', standup: 'Stand-up', comedy: 'Comedy',
    improv: 'Improv', satire: 'Satire', political: 'Political', design: 'Design', fashion: 'Fashion',
    sauna: 'Sauna', climate: 'Climate', photography: 'Photography', printmaking: 'Print', illustration: 'Illustration',
    'open mic': 'Open mic', karaoke: 'Karaoke', 'live drawing': 'Life drawing', nude: 'Life drawing',
    'easy-alone': 'Easy alone',
  };
  const VENUE_WHY = [
    [/sõprus|soprus|artis|kai art/i, 'Arthouse'],
    [/kanuti|von krahl|vaba lava|sõltumatu tantsu/i, 'Independent stage'],
  ];
  const whyTag = (e) => {
    const tags = (e && e.tags) || [];
    for (const t of tags) {
      const w = WHY[String(t).toLowerCase().trim()];
      if (w && fold(w) !== fold(kindLabel(e.kind))) return w;
    }
    if ((e.eventLanguages || []).includes('en')) return 'In English';
    const v = real(e && e.venue);
    for (const [re, label] of VENUE_WHY) if (v && re.test(v)) return label;
    return '';
  };

  const isFree = (e) => e && (e.isFree === true || (e.priceMin != null && Number(e.priceMin) === 0));
  const price = (e) => (UI().priceLabel ? UI().priceLabel(e) : '');

  /* ── Time ────────────────────────────────────────────────── */
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYFULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const keyDate = (key) => new Date(`${key}T12:00:00Z`);
  const dow = (key) => DOW[keyDate(key).getUTCDay()];
  const dom = (key) => keyDate(key).getUTCDate();
  const dateShort = (key) => { const d = keyDate(key); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  const dayName = (key) => {
    if (key === W().todayKey()) return 'Tonight';
    if (key === W().keyPlus(1)) return 'Tomorrow';
    return DAYFULL[keyDate(key).getUTCDay()];
  };

  const clockOf = (e) => {
    const m = W().statedMinutes(e);
    return m == null ? '' : H().clock(m);
  };
  const startMs = (e) => (e && e.startsAt ? Date.parse(e.startsAt) : NaN);
  /* On right now: a stated start already passed, and not yet over. */
  const isLive = (e, now = Date.now()) => {
    /* A cancelled or postponed show is never on now. */
    if (!e || e.flag === 'cancelled' || e.flag === 'postponed' || W().statedMinutes(e) == null) return false;
    const t = startMs(e);
    return isFinite(t) && t <= now && !W().hasEnded(e, now);
  };
  let endKeyFmt = null, endClockFmt = null;
  const endClock = (e) => {
    if (!e || !e.endsAt) return '';
    const d = new Date(e.endsAt);
    if (isNaN(d)) return '';
    try {
      endKeyFmt = endKeyFmt || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit' });
      endClockFmt = endClockFmt || new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit', hour12: false });
      const key = endKeyFmt.format(d);
      const clock = endClockFmt.format(d);
      return key === W().todayKey() ? clock : `${dateShort(key)} · ${clock}`;
    } catch (_) { return ''; }
  };

  /* The catalogue as lists read it: nothing that has ended. */
  const live = () => (window.WA.catalog || []).filter(e => !e.isClosed && !W().hasEnded(e));
  const places = () => (window.WA.venues || []).filter(v => !v.isClosed && v.isVerified !== false);

  /* ── Walking ─────────────────────────────────────────────── */
  const walk = (e) => {
    const m = G().distanceTo(e);
    return m == null ? null : G().walkMinutes(m);
  };
  const walkLabel = (min) => (min == null ? '' : min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);

  /* ── Search ──────────────────────────────────────────────── */
  const matches = (e, q) => {
    const fq = fold(q).trim();
    if (!fq) return true;
    const hay = fold([e.title, e.originalTitle, e.name, e.venue, e.neighborhood, areaOf(e), e.kind, kindLabel(e.kind),
      (e.tags || []).join(' '), e.description, e.address].filter(Boolean).join(' '));
    return fq.split(/\s+/).every(w => hay.includes(w));
  };

  /* ── Follows, interests, the last visit ─────────────────── */
  const isFollowed = (e) => {
    const F = window.WA.Follows;
    return !!(F && F.matchesEvent(e));
  };

  const INTERESTS = [
    { id: 'gigs',   label: 'Gigs',              icon: 'gig',      kinds: ['gig'] },
    { id: 'club',   label: 'Club nights',       icon: 'club',     kinds: ['club'] },
    { id: 'film',   label: 'Film',              icon: 'film',     kinds: ['film'] },
    { id: 'stage',  label: 'Theatre and dance', icon: 'theatre',  kinds: ['theatre'] },
    { id: 'art',    label: 'Art',               icon: 'art',      kinds: ['exhibition'] },
    { id: 'talks',  label: 'Talks and workshops', icon: 'talk',   kinds: ['talk', 'workshop'] },
    { id: 'fest',   label: 'Festivals',         icon: 'festival', kinds: ['festival'] },
    { id: 'english', label: 'In English',       icon: 'globe',    tag: 'english' },
  ];
  const IKEY = 'wa:interests:v1';
  const interests = {
    OPTIONS: INTERESTS,
    get() { try { return JSON.parse(localStorage.getItem(IKEY)) || null; } catch (_) { return null; } },
    set(ids, skipped) {
      try { localStorage.setItem(IKEY, JSON.stringify({ ids: ids || [], skipped: !!skipped, at: Date.now() })); } catch (_) {}
      document.dispatchEvent(new CustomEvent('wa:interests-changed'));
    },
    ids() { const s = interests.get(); return (s && s.ids) || []; },
    matches(e) {
      const ids = interests.ids();
      if (!ids.length) return false;
      const k = String(e.kind || '').toLowerCase();
      return INTERESTS.some(o => ids.includes(o.id) &&
        ((o.kinds && o.kinds.includes(k)) || (o.id === 'english' && (e.eventLanguages || []).includes('en'))));
    },
  };

  /* The previous visit, so Tonight can say what arrived since. A visit
     counts as new after two hours away. */
  const VKEY = 'wa:visit:v1';
  const visit = () => {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(VKEY)); } catch (_) {}
    const now = Date.now();
    if (!v) { v = { prev: null, last: now }; }
    else if (now - v.last > 2 * 3600 * 1000) { v = { prev: v.last, last: now }; }
    else { v.last = now; }
    try { localStorage.setItem(VKEY, JSON.stringify(v)); } catch (_) {}
    return v;
  };
  const previousVisit = () => { try { return (JSON.parse(localStorage.getItem(VKEY)) || {}).prev || null; } catch (_) { return null; } };
  const isNewSince = (e, t) => !!(t && e.createdAt && Date.parse(e.createdAt) > t);

  /* ── Venue open state ────────────────────────────────────── */
  const openState = (v) => {
    const s = H().state(v && v.openingHours);
    if (v?.isClosed) return { cls: 'no', text: 'Listed as closed', open: false, s: { ...s, known: false } };
    if (v?.isVerified === false) return { cls: 'unknown', text: 'Status unverified', open: false, s: { ...s, known: false } };
    if (!s.known) return { cls: 'unknown', text: 'Hours not filed', open: null, s };
    if (s.open) return { cls: 'yes', text: s.closesAt == null ? 'Open, 24 hours' : `Open till ${H().clock(s.closesAt)}`, open: true, s };
    if (s.opensAt != null) return { cls: 'no', text: `Opens ${H().clock(s.opensAt)}`, open: false, s };
    return { cls: 'no', text: 'Shut today', open: false, s };
  };
  const openBadge = (v) => { const o = openState(v); return `<span class="wa-open wa-open--${o.cls}">${esc(o.text)}</span>`; };

  /* ── The event row ───────────────────────────────────────────
     opts.day: the list is not grouped by day, so the rail names it.
     opts.noThumb: skip the picture column.
     opts.drop: an id for a remove key (Saved). */
  /* A run that began before today and has not ended (an exhibition, a festival pass) is still on: its
     first and last day, else null. It is filed under today, not under the day it started,
     and its rail says from when to when. */
  const runningSpan = (e) => {
    if (!e || !e.startsAt || !e.endsAt) return null;
    const from = W().resolveKey(e), to = W().resolveKey({ startsAt: e.endsAt });
    return from && to && from < W().todayKey() && to >= W().todayKey() ? { from, to } : null;
  };
  const rail = (e, opts) => {
    const clock = clockOf(e);
    const key = W().resolveKey(e);
    const liveNow = isLive(e);
    let top;
    const span = runningSpan(e);
    if (liveNow) top = '<span class="wa-now">Now</span>';
    else if (span) top = `<span class="wa-row__time wa-row__time--word">${esc(dom(span.from))} ${esc(MON[keyDate(span.from).getUTCMonth()])} to ${esc(dom(span.to))} ${esc(MON[keyDate(span.to).getUTCMonth()])}</span>`;
    else if (opts.day && key) {
      const word = key === W().todayKey() ? 'Today' : key === W().keyPlus(1) ? 'Tmrw' : `${dow(key)} ${dom(key)}`;
      top = `<span class="wa-row__time wa-row__time--word">${esc(word)}</span>${clock ? `<span class="wa-row__time">${esc(clock)}</span>` : ''}`;
    }
    else if (clock) top = `<span class="wa-row__time">${esc(clock)}</span>`;
    else top = `<span class="wa-row__time wa-row__time--word">${key ? 'Time not listed' : 'Open'}</span>`;

    const m = walk(e);
    const bottom = m != null
      ? `<span class="wa-row__walk">${I('walk')}${esc(walkLabel(m))}</span>`
      : (areaOf(e) ? `<span class="wa-row__area">${esc(areaOf(e))}</span>` : '');
    return { html: top + bottom, areaInRail: m == null && !!areaOf(e), live: liveNow };
  };

  /* The picture for an event or a place, and where it came from: an event's
     own artwork first; without it the venue's own logo or photo (the venue
     was identified, never searched by name); without either, the kind's
     pictogram is drawn by the caller. */
  const art = (x) => {
    if (x.imageUrl) return { src: url(x.imageUrl), logo: x.imageSource === 'logo', venue: false };
    if (x.venueImageUrl) return { src: url(x.venueImageUrl), logo: x.venueImageSource === 'logo', venue: true, attr: x.venueImageAttr || '' };
    return { src: '', logo: false, venue: false };
  };

  const thumb = (e) => {
    const { src, logo } = art(e);
    return `<span class="wa-row__thumb${logo ? ' is-logo' : ''}">${src
      ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`
      : window.WA.Picto.kind(e.kind)}</span>`;
  };


  /* What the source says about the show's state. Cancelled and postponed
     dim the listing; sold out and few left only label it. */
  const FLAGS = { cancelled: 'Cancelled', postponed: 'Postponed', sold_out: 'Sold out', few_left: 'Few tickets left' };
  const flagLabel = (e) => (e && FLAGS[e.flag]) || '';
  const isOff = (e) => !!e && (e.flag === 'cancelled' || e.flag === 'postponed');
  const flagTag = (e, cls = '') => flagLabel(e) ? `<span class="wa-flag wa-flag--${esc(e.flag)}${cls}">${esc(flagLabel(e))}</span>` : '';

  const row = (e, opts = {}) => {
    const r = rail(e, opts);
    const why = whyTag(e);
    const kind = kindLabel(e.kind);
    const endsAt = r.live ? endClock(e) : '';
    const meta = [
      latin(e.venue),
      r.areaInRail ? '' : areaOf(e),
      price(e),
      r.live && endsAt ? `till ${endsAt}` : '',
    ].filter(Boolean).join(' · ');
    const fresh = opts.since && isNewSince(e, opts.since);
    return `<li><a class="wa-row${r.live ? ' wa-row--now' : ''}${isOff(e) ? ' wa-row--off' : ''}" href="detail.html?id=${esc(encodeURIComponent(e.id))}" data-row="${esc(e.id)}">
      <span class="wa-row__rail">${r.html}</span>
      <span class="wa-row__body">
        <span class="wa-row__top">
          ${flagTag(e)}
          ${kind ? `<span class="wa-tag">${window.WA.Icon.kind(e.kind, 'wa-ic--sm')}${esc(kind)}</span>` : ''}
          ${why ? `<span class="wa-tag wa-tag__why">${esc(why)}</span>` : ''}
          ${fresh ? '<span class="wa-new">New</span>' : ''}
        </span>
        <span class="wa-row__title">${esc(e.title || '')}</span>
        ${meta ? `<span class="wa-row__meta">${esc(meta)}</span>` : ''}
      </span>
      ${opts.drop ? `<span class="wa-row__side"><button class="wa-iconbtn" type="button" data-unsave="${esc(e.id)}" aria-label="${esc(`Remove ${e.title || ''} from saved`)}">${I('close')}</button></span>`
                  : opts.noThumb ? '' : thumb(e)}
    </a></li>`;
  };

  /* ── The place row ───────────────────────────────────────── */
  const placeRow = (v, opts = {}) => {
    const m = opts.from ? G().walkMinutes(G().distanceTo(v, opts.from)) : walk(v);
    const photo = v.imageUrl ? url(v.imageUrl) : '';   /* a venue's own logo counts: it identifies the place */
    const meta = [kindLabel(v.kind, true), areaOf(v), opts.extra].filter(Boolean).join(' · ');
    return `<li><a class="wa-place" href="detail.html?id=${esc(encodeURIComponent(v.id))}" data-place="${esc(v.id)}">
      <span class="wa-place__glyph${photo && v.imageSource === 'logo' ? ' is-logo' : ''}">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : window.WA.Picto.kind(v.kind)}</span>
      <span class="wa-place__body">
        <span class="wa-place__name">${esc(v.name || '')}${v.picked ? ' <span class="wa-place__pick">Picked</span>' : ''}</span>
        <span class="wa-place__meta">${esc(meta)}</span>
        ${v.pickNote ? `<span class="wa-place__why">${esc(v.pickNote)}</span>` : ''}
        ${openBadge(v)}
      </span>
      <span class="wa-place__side">
        ${opts.drop ? `<button class="wa-iconbtn" type="button" data-unsave="${esc(v.id)}" aria-label="${esc(`Remove ${v.name || ''} from saved`)}">${I('close')}</button>`
          : m != null ? `<span class="wa-place__walk">${I('walk')}${esc(walkLabel(m))}</span>` : ''}
      </span>
    </a></li>`;
  };

  /* ── The event card ────────────────────────────────────────
     Photo first with a glass badge (when) and a heart (save), then the
     title and quiet lines: venue · area, and walk · price. */
  const saved = (id) => !!(window.WA.Bookmarks && window.WA.Bookmarks.get()[id]);
  const heart = (id, title) => `<button class="wa-heart" type="button" data-heart="${esc(id)}" aria-pressed="${saved(id)}"
      aria-label="${esc(`${saved(id) ? 'Saved' : 'Save'}: ${title || ''}`)}">${I('heart')}</button>`;

  const badgeFor = (e) => {
    if (isLive(e)) return { now: true, text: endClock(e) ? `On now · till ${endClock(e)}` : 'On now' };
    const key = W().resolveKey(e);
    const clock = clockOf(e);
    const day = !key ? '' : key === W().todayKey() ? 'Tonight' : key === W().keyPlus(1) ? 'Tomorrow' : `${dow(key)} ${dom(key)}`;
    return { now: false, text: [day, clock].filter(Boolean).join(' · ') || 'Ongoing' };
  };

  const poster = (e, opts = {}) => {
    const { src, logo } = art(e);
    const b = badgeFor(e);
    const m = walk(e);
    const line1 = [latin(e.venue), areaOf(e)].filter(Boolean).join(' · ');
    const line2 = [m != null ? `<span class="wa-poster__walk">${I('walk')}${esc(walkLabel(m))} walk</span>` : '', price(e) ? `<strong>${esc(price(e))}</strong>` : '', whyTag(e)]
      .filter(Boolean).map(x => (x.startsWith('<') ? x : esc(x))).join(' · ');
    return `<div class="wa-poster${isOff(e) ? ' wa-poster--off' : ''}"><a class="wa-poster__link" href="detail.html?id=${esc(encodeURIComponent(e.id))}" data-row="${esc(e.id)}">
      <span class="wa-poster__art${logo ? ' is-logo' : ''}">
        ${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`
              : `<span class="wa-poster__type">${window.WA.Picto.kind(e.kind)}</span>`}
        <span class="wa-poster__badge${b.now ? ' wa-poster__badge--now' : ''}">${esc(opts.compact && b.now ? 'On now' : b.text)}</span>
        ${flagTag(e, ' wa-poster__flag')}
      </span>
      <span class="wa-poster__title">${esc(e.title || '')}</span>
      ${opts.compact && b.now && endClock(e) ? `<span class="wa-poster__meta">Until ${esc(endClock(e))}</span>` : ''}
      ${line1 ? `<span class="wa-poster__meta">${esc(line1)}</span>` : ''}
      ${line2 ? `<span class="wa-poster__meta">${line2}</span>` : ''}
    </a>${opts.noHeart ? '' : heart(e.id, e.title)}</div>`;
  };

  /* A shelf: a heading, arrow keys on desktop, and a row of cards. */
  let shelfN = 0;
  const shelf = (head, cards) => {
    const id = `shelf-${++shelfN}`;
    return `<section class="wa-sect">
      <div class="wa-sect__head">
        <h2 class="wa-sect__title">${esc(head.title)}</h2>
        ${head.n != null ? `<span class="wa-sect__count">${esc(String(head.n))}</span>` : ''}
        ${head.href ? `<a class="wa-sect__more" href="${esc(head.href)}" aria-label="${esc(`${head.more || 'All'}: ${head.title}`)}">${I('arrow')}</a>` : '<span style="margin-left:auto"></span>'}
        <span class="wa-shelfnav"><button class="wa-iconbtn" type="button" data-shelf="${id}" data-dir="-1" aria-label="Previous">${I('back')}</button><button class="wa-iconbtn" type="button" data-shelf="${id}" data-dir="1" aria-label="Next">${I('chevron')}</button></span>
      </div>
      ${head.sub ? `<p class="wa-sect__sub">${esc(head.sub)}</p>` : ''}
      <div class="wa-shelf${head.compact ? ' wa-shelf--compact' : ''}" id="${id}">${cards}</div>
    </section>`;
  };

  const skelCards = (n = 4) => `<div class="wa-shelf" aria-hidden="true">${Array.from({ length: n }, () =>
    '<div><span class="wa-skel wa-skel--card"></span><span class="wa-skel wa-skel--title"></span><span class="wa-skel wa-skel--meta"></span></div>').join('')}</div>`;

  /* Hearts save from anywhere a card is shown, with the undo toast. */
  document.addEventListener('click', (ev) => {
    const h = ev.target.closest && ev.target.closest('[data-heart]');
    if (h) {
      ev.preventDefault(); ev.stopPropagation();
      const id = h.dataset.heart;
      const on = !saved(id);
      window.WA.Bookmarks.set(id, on);
      document.querySelectorAll(`[data-heart="${CSS.escape(id)}"]`).forEach(x => {
        x.setAttribute('aria-pressed', String(on));
        x.classList.remove('is-popped'); void x.offsetWidth; if (on) x.classList.add('is-popped');
      });
      if (window.WA.Toast) window.WA.Toast.show(on ? 'Saved' : 'Removed from saved', 'Undo', () => {
        window.WA.Bookmarks.set(id, !on);
        document.querySelectorAll(`[data-heart="${CSS.escape(id)}"]`).forEach(x => x.setAttribute('aria-pressed', String(!on)));
      });
      return;
    }
    const nav = ev.target.closest && ev.target.closest('[data-shelf]');
    if (nav) {
      const el = document.getElementById(nav.dataset.shelf);
      if (el) el.scrollBy({ left: Number(nav.dataset.dir) * el.clientWidth * .9, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }, true);

  /* ── Section head ────────────────────────────────────────── */
  const sect = ({ title, n, href, more, sub, id }) => `
    <div class="wa-sect__head"${id ? ` id="${esc(id)}"` : ''}>
      <h2 class="wa-sect__title">${esc(title)}</h2>
      ${n != null ? `<span class="wa-sect__count">${esc(String(n))}</span>` : ''}
      ${href ? `<a class="wa-sect__more" href="${esc(href)}">${esc(more || 'All')}${I('arrow', 'wa-ic--sm')}</a>` : ''}
    </div>
    ${sub ? `<p class="wa-sect__sub">${esc(sub)}</p>` : ''}`;

  /* A day heading for grouped lists. */
  const dayHead = (key, n) => `<div class="wa-day" role="heading" aria-level="2">
      <span class="wa-day__name">${esc(dayName(key))}</span>
      <span class="wa-day__date">${esc(dateShort(key))}</span>
      ${n != null ? `<span class="wa-day__n">${esc(String(n))}</span>` : ''}
    </div>`;

  /* Group a sorted list by day key. A run that began earlier and is still on
     (an exhibition, a festival pass) is its own group, "Running", right after
     today's, so a day's heading counts only what starts on that day.
     Undated items land in "Ongoing". */
  const isRun = (e) => !!runningSpan(e);
  const byDay = (list) => {
    const groups = new Map();
    for (const e of list) {
      const k = isRun(e) ? 'running' : (W().resolveKey(e) || 'ongoing');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    const today = W().todayKey();
    const rank = (k) => (k === 'ongoing' ? 3 : k === 'running' ? 1 : k <= today ? 0 : 2);
    return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  };

  /* opts.limit: at most this many rows from the days (Running and Ongoing
     aside); opts.runningLimit: at most this many Running rows, with a key
     for the rest. Headings always count the whole group. */
  const grouped = (list, opts = {}) => {
    let budget = opts.limit == null ? Infinity : opts.limit;
    const out = [];
    for (const [k, all] of byDay(list)) {
      let items = all, more = '';
      if (k === 'running' || k === 'ongoing') {
        if (k === 'running' && opts.runningLimit != null && all.length > opts.runningLimit) {
          items = all.slice(0, opts.runningLimit);
          more = `<button class="wa-linkbtn wa-day__all" type="button" data-act="more-running">Show all ${all.length} running</button>`;
        }
      } else if (budget !== Infinity) {
        if (budget <= 0) break;
        items = all.slice(0, budget); budget -= items.length;
      }
      const head = k === 'ongoing'
        ? `<div class="wa-day" role="heading" aria-level="2"><span class="wa-day__name">Ongoing</span><span class="wa-day__date">No date filed</span><span class="wa-day__n">${all.length}</span></div>`
        : k === 'running'
          ? `<div class="wa-day" role="heading" aria-level="2"><span class="wa-day__name">Running</span><span class="wa-day__date">Started earlier, still on</span><span class="wa-day__n">${all.length}</span></div>`
          : dayHead(k, all.length);
      out.push(`${head}<ul class="wa-rows">${items.map(e => row(e, opts)).join('')}</ul>${more}`);
    }
    return out.join('');
  };

  /* ── Skeletons match the real row exactly ───────────────── */
  const skelRows = (n = 5) => `<ul class="wa-rows" aria-hidden="true">${Array.from({ length: n }, () => `
    <li><span class="wa-row">
      <span class="wa-row__rail"><span class="wa-skel wa-skel--time"></span><span class="wa-skel wa-skel--walk"></span></span>
      <span class="wa-row__body"><span class="wa-skel wa-skel--kicker"></span><span class="wa-skel wa-skel--title"></span><span class="wa-skel wa-skel--title2"></span><span class="wa-skel wa-skel--meta"></span></span>
      <span class="wa-skel wa-skel--thumb"></span>
    </span></li>`).join('')}</ul>`;

  /* ── Empty state: names what emptied it, offers a real next step ── */
  const PICTO_FOR = { offline: 'nearby', calendar: 'all', search: 'place', filter: 'all', save: 'place', clock: 'all', store: 'market', programme: 'all' };
  const empty = ({ icon, title, body, actions }) => `<div class="wa-empty">
      ${icon ? `<span class="wa-empty__art">${window.WA.Picto(PICTO_FOR[icon] || icon)}</span>` : ''}
      <p class="wa-empty__title">${esc(title)}</p>
      ${body ? `<p class="wa-empty__body">${esc(body)}</p>` : ''}
      ${actions && actions.length ? `<div class="wa-empty__actions">${actions.map((a, i) => a.href
        ? `<a class="wa-btn${i === 0 ? ' wa-btn--ink' : ''}" href="${esc(a.href)}">${esc(a.label)}</a>`
        : `<button class="wa-btn${i === 0 ? ' wa-btn--ink' : ''}" type="button" data-act="${esc(a.act)}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;

  const cityName = () => {
    const c = (window.WA.CITIES || []).find(x => x.id === window.WA.CITY);
    return c ? c.label.charAt(0) + c.label.slice(1).toLowerCase() : 'Tallinn';
  };

  /* ── Location, asked for only on a tap ──────────────────────
     A page never prompts on load; when permission was granted before,
     walking times fill in on their own. */
  const locateIfGranted = () => {
    try {
      navigator.permissions.query({ name: 'geolocation' })
        .then((p) => { if (p.state === 'granted') G().userLoc(); })
        .catch(() => {});
    } catch (_) { /* no Permissions API: wait for a tap */ }
  };
  const locPrompt = (text) => (G().currentLoc() ? '' :
    `<button class="wa-since" type="button" data-locate>${I('walk')}<span>${esc(text || 'Show walking times from where I am')}</span>${I('arrow')}</button>`);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-locate]');
    if (!b) return;
    b.disabled = true;
    G().userLoc().then((loc) => {
      if (loc) return;
      b.disabled = false;
      b.querySelector('span').textContent = 'Location is off in this browser, so rows show the area instead';
    });
  });

  /* Marks the page's account key when signed in. */
  document.addEventListener('wa:signed-in', () => {
    const a = document.getElementById('account');
    if (a) a.setAttribute('aria-label', 'You, signed in');
  });

  /* A hotlinked picture that no longer loads leaves a blank tile. Swap the
     dead image for the row's own pictogram (no inline handler: `error`
     does not bubble, so listen in the capture phase). */
  const ART = '.wa-place__glyph, .vcard__art, .wa-row__thumb, .wa-poster__art, .map-preview__art, .wa-listcard__tile';
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    const box = img.closest(ART);
    if (!box) return;
    const host = img.closest('[data-place], [data-row], [data-card]');
    const id = host && (host.dataset.place || host.dataset.row || host.dataset.card);
    const found = id && [...(window.WA._catalogAll || []), ...(window.WA._venuesAll || [])].find(p => p.id === id);
    box.classList.remove('is-logo');
    img.outerHTML = box.matches('.wa-poster__art')
      ? `<span class="wa-poster__type">${window.WA.Picto.kind(found && found.kind)}</span>`
      : window.WA.Picto.kind(found && found.kind);
  }, true);

  window.WA.R = {
    esc, url, real, latin, fold, area, areaOf, AREA_SUB, AREA_LIST, kindLabel, whyTag, isFree, price,
    DOW, dow, dom, dateShort, dayName, clockOf, endClock, isLive, live, places,
    art, walk, walkLabel, matches, isFollowed, interests, visit, previousVisit, isNewSince,
    openState, openBadge, row, placeRow, poster, flagLabel, flagTag, isOff, shelf, skelCards, heart, badgeFor, sect, dayHead, byDay, grouped, isRun,
    skelRows, empty, cityName, locateIfGranted, locPrompt,
  };
})();
