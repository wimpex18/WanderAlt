/* Account-scoped local saves and a persistent outbox. A successful pull
   replaces acknowledged data; pending edits, including removals, always win.
   Guest records move to the first account they sign into, once. */
window.WA = window.WA || {};
window.WA.SaveStore = (key, event, pull, push) => {
  const prefix = key + ':sync:';
  const owner = () => window.WA.Auth?.session?.user_id || 'guest';
  const read = (who) => {
    try { return JSON.parse(localStorage.getItem(prefix + who) || 'null') || { data: {}, pending: {} }; }
    catch { return { data: {}, pending: {} }; }
  };
  const save = (who, state) => { try { localStorage.setItem(prefix + who, JSON.stringify(state)); } catch {} };
  const notify = () => document.dispatchEvent(new CustomEvent(event));
  const scope = () => {
    const who = owner();
    /* Legacy records have no owner. Keep raw ids for reversible redirects. */
    const guest = read('guest');
    try {
      const legacy = JSON.parse(localStorage.getItem(key) || 'null');
      if (legacy) {
        Object.assign(guest.data, legacy);
        Object.entries(legacy).forEach(([id, value]) => { guest.pending[id] = value; });
        save('guest', guest); localStorage.removeItem(key);
      }
    } catch {}
    if (who !== 'guest' && Object.keys(guest.data).length) {
      const state = read(who);
      Object.assign(state.data, guest.data); Object.assign(state.pending, guest.data);
      save(who, state); save('guest', { data: {}, pending: {} });
    }
    return who;
  };
  const get = () => read(scope()).data;
  const flights = new Map();
  const request = async (who, path, options = {}) => {
    if (owner() !== who) throw new Error('Account changed');
    const headers = window.WA.Auth.getAuthHeaders();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${window.WA.BASE_URL || ''}/rest/v1/${path}`, {
        ...options, headers: { ...headers, 'Content-Type': 'application/json', ...options.headers }, signal: controller.signal,
      });
      if (!res.ok) throw new Error('Save sync failed');
      return res;
    } finally { clearTimeout(timer); }
  };
  const sync = () => {
    const who = scope();
    if (who === 'guest') return Promise.resolve();
    if (flights.has(who)) return flights.get(who);
    const flight = (async () => {
      try {
        /* Snapshot each edit; a tap during the request must not be acknowledged
           by the response to an earlier tap. Reading storage keeps tabs coherent. */
        while (owner() === who) {
          const state = read(who), edits = Object.entries(state.pending);
          if (!edits.length) break;
          for (const [id, value] of edits) {
            if (owner() !== who) return;
            await push(id, value, (path, opts) => request(who, path, opts), who);
            const latest = read(who);
            if (JSON.stringify(latest.pending[id]) === JSON.stringify(value)) delete latest.pending[id];
            save(who, latest);
          }
        }
        const data = await pull((path, opts) => request(who, path, opts), who);
        if (owner() !== who) return;
        const latest = read(who);
        Object.entries(latest.pending).forEach(([id, value]) => {
          if (value === null) delete data[id]; else data[id] = value;
        });
        latest.data = data; latest.confirmed = true; save(who, latest); notify();
        if (Object.keys(latest.pending).length) Promise.resolve().then(() => { flights.delete(who); sync(); });
      } catch { if (owner() === who) notify(); /* Keep edits until a later retry. */ }
    })().finally(() => { flights.delete(who); });
    flights.set(who, flight);
    return flight;
  };
  const set = (id, value) => {
    const who = scope(), state = read(who);
    if (value === null) delete state.data[id]; else state.data[id] = value;
    state.pending[id] = value; save(who, state); notify();
    /* Defer so several mutations in one action are one ordered sync. */
    Promise.resolve().then(sync);
  };
  document.addEventListener('wa:signed-in', () => { scope(); notify(); sync(); });
  document.addEventListener('wa:signed-out', notify);
  window.addEventListener('online', sync);
  window.addEventListener('storage', (e) => {
    if (e.key === prefix + owner()) { notify(); sync(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  /* Restored sessions may be announced before this deferred script loads. */
  Promise.resolve().then(sync);
  return { get, set, sync, confirmed: () => !!read(scope()).confirmed, pending: () => Object.keys(read(scope()).pending).length };
};
