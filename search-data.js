/* One query/context contract for search previews, full results and Map.
   Typing is local. Only enhance(), called after a submission, can ask a model. */
(() => {
  'use strict';
  const R = () => window.WA.R, A = () => window.WA.Ask, G = () => window.WA.Geo;
  const WHEN = { tonight:'Today', tomorrow:'Tomorrow', weekend:'This weekend', thisweek:'This week', all:'All dates' };
  const DOORS = { any:'Any time', now:'From now', '21:00':'After 21:00', '23:00':'After 23:00' };
  const defaults = () => ({ q:'', day:'', dayTo:'', when:'all', kinds:new Set(), area:'', areaExplicit:false,
    sort:'soonest', within:0, doors:'any', free:false, english:false, maxPrice:null, placeOpen:null,
    hideSeen:false, followed:false, fresh:false, taste:null, read:null, model:null, literal:false, overrides:new Set() });
  const FILTERS = { when:['when','day','dayTo'], kind:['kinds'], free:['free'], english:['english'], price:['maxPrice'] };
  const kindMatches = (e,kinds) => !kinds.size || kinds.has(String(e.kind || '').toLowerCase()) ||
    (kinds.has('comedy') && (e.tags || []).some(t => ['comedy','standup','stand-up','improv'].includes(String(t).toLowerCase())));
  const snapshot = s => ({ when:s.when, day:s.day, dayTo:s.dayTo, kinds:[...s.kinds], free:s.free, english:s.english, maxPrice:s.maxPrice });
  const fromParams = raw => {
    const s = defaults(), q = new URLSearchParams(raw);
    s.q = (q.get('q') || '').trim().slice(0,140);
    if (window.WA.Discovery.validDate(q.get('date'))) s.day = q.get('date');
    if (s.day && window.WA.Discovery.validDate(q.get('to')) && q.get('to') > s.day) s.dayTo = q.get('to');
    const when = q.get('time') || q.get('when');
    if (Object.hasOwn(WHEN,when)) s.when = when;
    s.kinds = new Set((q.get('cat') || '').split(',').map(k => k.toLowerCase()).filter(k => k && R().real(k)));
    if (q.has('area')) { s.area = q.get('area') === 'any' ? '' : q.get('area'); s.areaExplicit = true; }
    if (q.get('sort') === 'nearest') s.sort = 'nearest';
    s.within = G().parseWithin?.(q.get('within')) || 0;
    if (Object.hasOwn(DOORS,q.get('doors'))) s.doors = q.get('doors');
    for (const [param,key] of [['free','free'],['english','english'],['new','fresh'],['followed','followed']]) s[key] = q.get(param) === '1';
    s.hideSeen = q.get('seen') === 'hide';
    if (/^\d{1,3}$/.test(q.get('price') || '')) s.maxPrice = Number(q.get('price'));
    if (['0','1'].includes(q.get('open'))) s.placeOpen = q.get('open') === '1';
    if (q.has('moods') && window.WA.Moods) {
      const moods = q.get('moods').split(',').filter(id => window.WA.Moods.get(id));
      const valid = new Set(moods.flatMap(id => window.WA.Moods.get(id).subs.map(x => x.id)));
      if (moods.length) s.taste = { moods, subs:(q.get('subs') || '').split(',').filter(id => valid.has(id)), cap:null };
    }
    s.literal = q.get('literal') === '1';
    s.overrides = new Set((q.get('override') || '').split(',').filter(k => Object.hasOwn(FILTERS,k)));
    try {
      const value = JSON.parse(q.get('reading') || 'null');
      const words = list => Array.isArray(list) && list.length <= 8 && list.every(w => typeof w === 'string' && w.length <= 80);
      const types = new Set((R().placeGroups || []).flatMap(g => g.kinds));
      const b = value?.[4];
      const baseline = b && Object.hasOwn(WHEN,b.when) && (!b.day || window.WA.Discovery.validDate(b.day)) &&
        (!b.dayTo || window.WA.Discovery.validDate(b.dayTo)) && Array.isArray(b.kinds) && b.kinds.length <= 20 && b.kinds.every(k => typeof k === 'string' && k.length <= 80) && typeof b.free === 'boolean' && typeof b.english === 'boolean' &&
        (b.maxPrice == null || (Number.isInteger(b.maxPrice) && b.maxPrice >= 0 && b.maxPrice <= 999));
      if (Array.isArray(value) && value.length === 5 && words(value[0]) && words(value[1]) && words(value[2]) && baseline) {
        s.model = { must:value[0], any:value[1], placeKinds:value[2].filter(k => types.has(k)), only:value[3] === true,
          before:{ when:b.when, day:b.day || '', dayTo:b.dayTo || '', kinds:b.kinds.filter(k => R().real(k)), free:b.free, english:b.english, maxPrice:b.maxPrice ?? null },
          filters:snapshot(s) };
      }
    } catch (_) { /* Invalid external context is ignored. */ }
    return s;
  };
  const params = s => {
    const q = new URLSearchParams();
    if (s.q) q.set('q',s.q);
    if (s.day) { q.set('date',s.day); if (s.dayTo) q.set('to',s.dayTo); }
    else if (s.when !== 'all') q.set('time',s.when);
    if (s.kinds.size) q.set('cat',[...s.kinds].join(','));
    if (s.taste) { q.set('moods',s.taste.moods.join(',')); if (s.taste.subs.length) q.set('subs',s.taste.subs.join(',')); }
    if (s.area || s.areaExplicit) q.set('area',s.area || 'any');
    if (s.sort !== 'soonest') q.set('sort',s.sort);
    if (s.within) q.set('within',String(s.within));
    if (s.doors !== 'any') q.set('doors',s.doors);
    if (s.free) q.set('free','1');
    if (s.english) q.set('english','1');
    if (s.maxPrice != null) q.set('price',String(s.maxPrice));
    if (s.placeOpen != null) q.set('open',s.placeOpen ? '1' : '0');
    if (s.hideSeen) q.set('seen','hide');
    if (s.followed) q.set('followed','1');
    if (s.fresh) q.set('new','1');
    if (s.q && s.literal) q.set('literal','1');
    if (s.q && s.overrides.size) q.set('override',[...s.overrides].join(','));
    if (s.q && s.model && !s.literal) q.set('reading',JSON.stringify([s.model.must,s.model.any,s.model.placeKinds,s.model.only,s.model.before]));
    return q;
  };
  const origin = () => {
    const from = G().currentLoc();
    if (from) return { from, label:G().anchor?.()?.label || 'where you are' };
    const centre = (window.WA.CITIES || []).find(c => c.id === window.WA.CITY)?.centre;
    return { from:centre || null, label:centre?.label || 'the city centre' };
  };
  const create = (raw = '') => {
    const state = fromParams(raw);
    let before = null, hits = [], only = false, version = 0, asked = '';
    // The URL carries effective filters. Recover their pre-query values so
    // editing or clearing the words also clears automatic constraints.
    if (state.q && !state.literal) {
      if (state.model) {
        const effective = snapshot(state);
        Object.assign(state,state.model.before); state.kinds = new Set(state.model.before.kinds);
        for (const key of state.overrides) for (const field of FILTERS[key]) state[field] = field === 'kinds' ? new Set(effective.kinds) : effective[field];
      } else {
        const p = A().local(state.q);
        if (!state.overrides.has('when') && (p.day || p.when)) { state.day = state.dayTo = ''; state.when = 'all'; }
        if (!state.overrides.has('kind') && p.kinds.length) state.kinds.clear();
        if (!state.overrides.has('free') && p.free) state.free = false;
        if (!state.overrides.has('english') && p.english) state.english = false;
        if (!state.overrides.has('price') && p.maxPrice != null) state.maxPrice = null;
      }
    }
    const base = () => R().live();
    const cancel = () => { version++; };
    const unread = () => {
      if (before) { Object.assign(state,before); state.kinds = new Set(before.kinds); }
      state.read = null; before = null;
    };
    const override = key => {
      cancel();
      if (!Object.hasOwn(FILTERS,key)) return;
      state.overrides.add(key);
      if (before) for (const field of FILTERS[key]) before[field] = field === 'kinds' ? [...state.kinds] : state[field];
    };
    const adopt = (p, by) => {
      if (!before) before = snapshot(state);
      else { Object.assign(state,before); state.kinds = new Set(before.kinds); }
      if (!state.overrides.has('when')) {
        if (p.day) { state.day = p.day; state.dayTo = ''; state.when = 'all'; }
        else if (p.when) { state.when = p.when; state.day = state.dayTo = ''; }
      }
      if (p.kinds.length && !state.overrides.has('kind')) state.kinds = new Set(p.kinds);
      if (p.free && !state.overrides.has('free')) state.free = true;
      if (p.english && !state.overrides.has('english')) state.english = true;
      if (p.maxPrice != null && !state.overrides.has('price')) state.maxPrice = p.maxPrice;
      state.read = { must:p.must, any:p.any, note:'', by };
    };
    const doorsPass = e => {
      if (state.doors === 'any') return true;
      const m = G().startMinutes(e);
      if (m == null) return false;
      if (state.doors === 'now') return !window.WA.when.isTonight(e) || m >= window.WA.Hours.cityNow().minutes || R().isLive(e);
      const [h,mm] = state.doors.split(':').map(Number);
      return m >= h * 60 + mm;
    };
    const apply = (list,skip) => list.filter(e =>
      (skip === 'when' || (!state.day && state.when === 'all') || window.WA.Discovery.matchesDate(e,{ date:state.day,to:state.dayTo,when:state.when })) &&
      (skip === 'taste' || !state.taste || window.WA.Moods.wantsEvent(state.taste,e)) &&
      (skip === 'kind' || kindMatches(e,state.kinds)) &&
      (skip === 'area' || !state.area || R().areaOf(e) === state.area) &&
      (skip === 'free' || !state.free || R().isFree(e)) &&
      (skip === 'doors' || doorsPass(e)) &&
      (skip === 'within' || !state.within || G().withinFilter([e],state.within).length > 0) &&
      (skip === 'seen' || !state.hideSeen || window.WA.Seen.filter([e]).length > 0) &&
      (skip === 'followed' || !state.followed || R().isFollowed(e)) &&
      (skip === 'fresh' || !state.fresh || R().isNewSince(e,R().previousVisit())) &&
      (skip === 'english' || !state.english || (e.eventLanguages || []).includes('en')) &&
      (skip === 'price' || state.maxPrice == null || R().isFree(e) || e.priceMin == null || Number(e.priceMin) <= state.maxPrice) &&
      (skip === 'q' || !state.q || (state.read ? A().match(e,state.read) : R().matches(e,state.q))));
    const events = () => {
      if (only) return [];
      const list = apply(base());
      return state.sort === 'nearest' && G().currentLoc() ? list.sort((a,b) => (G().distanceTo(a) ?? Infinity) - (G().distanceTo(b) ?? Infinity))
        : list.sort(G().byDateThenSoonest());
    };
    const wantsOpen = () => state.placeOpen ?? A().places(state.q).openNow;
    const places = (skipArea = false) => {
      const from = origin().from, distance = v => G().distanceTo?.(v,from) ?? Infinity;
      return hits.filter(v => (!wantsOpen() || R().openState(v).open === true) &&
        (skipArea || !state.area || R().areaOf(v) === state.area) && (!state.within || G().onFoot(distance(v)) <= state.within))
        .sort((a,b) => Number(!!b.picked) - Number(!!a.picked) || distance(a) - distance(b) || String(a.name).localeCompare(String(b.name),'et'));
    };
    const findPlaces = (q,p) => {
      const f = p.openNow ? A().local(q).must.join(' ') : A().fold(q).trim();
      const named = v => f.length >= 2 && A().fold(v.name).includes(f);
      return (window.WA.venues || []).filter(v => !v.isClosed && v.isVerified !== false &&
        (named(v) || (p.only && p.openNow && !f) || (p.show && p.kinds.includes(String(v.kind || '').toLowerCase()))));
    };
    const query = raw => {
      cancel(); unread();
      const q = String(raw || '').trim().slice(0,140);
      if (q !== state.q) { state.placeOpen = null; state.literal = false; state.model = null; state.overrides.clear(); }
      state.q = q;
      const p = A().places(q);
      hits = q ? findPlaces(q,p) : [];
      only = !!(q && p.only);
      if (!state.areaExplicit) state.area = only ? (R().AREA_LIST || []).find(a => A().fold(q).includes(A().fold(a))) || '' : '';
      if (q && !only && !state.literal && !state.model && A().isQuestion(q)) {
        adopt(A().local(q),'page');
        if (!events().length && base().some(e => R().matches(e,q))) unread();
      }
      if (q && state.model && !state.literal) {
        adopt({ ...state.model.filters,must:state.model.must,any:state.model.any },'model');
        state.model.before = before;
        if (state.model.placeKinds.length) hits = findPlaces(q,{ kinds:state.model.placeKinds,show:true,only:false });
        only = only || state.model.only;
      }
      return state;
    };
    const enhance = async () => {
      const q = state.q, mine = A().local(q), token = version;
      if (!q || only || state.literal || state.model || !A().isQuestion(q) || events().length || !mine.must.length || asked === q) return false;
      asked = q;
      const p = await A().remote(q);
      if (!p || state.q !== q || version !== token) return false;
      const reading = { ...p, day:mine.day || (mine.when ? '' : p.day), when:mine.day ? '' : mine.when || p.when,
        kinds:mine.kinds.length ? mine.kinds : p.kinds, free:mine.free || p.free, english:mine.english || p.english,
        maxPrice:mine.maxPrice ?? p.maxPrice };
      unread(); adopt(reading,'model');
      if (!events().length) { unread(); adopt(mine,'page'); }
      if (p.placeKinds?.length || p.intent === 'places') {
        const found = findPlaces(q,{ kinds:p.placeKinds || [],show:true,only:false,openNow:p.openNow });
        if (found.length) { hits = found; only = p.intent === 'places' && !state.kinds.size; if (p.openNow) state.placeOpen = true; }
      }
      if (state.read?.by === 'model' || only) state.model = { must:state.read.must, any:state.read.any, placeKinds:p.placeKinds || [], only,
        before, filters:snapshot(state) };
      return true;
    };
    const undo = () => { cancel(); unread(); state.literal = true; state.model = null; query(state.q); };
    const reset = () => { cancel(); before = null; hits = []; only = false; Object.assign(state,defaults()); };
    return { state,query,enhance,cancel,override,undo,reset,apply,events,places,wantsOpen,
      get hits() { return hits; }, get placeOnly() { return only; }, params:() => params(state) };
  };
  window.WA.SearchData = { create,params,fromParams,origin,kindMatches,WHEN,DOORS };
})();
