#!/usr/bin/env node
/* Regenerate catalog.js from the live Supabase DB.
   This is the static fallback used when the network is unreachable.
   Run: node .scripts/regen-catalog.js                                */
const fs = require('fs');
const path = require('path');

const BASE = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(table, qs) {
  const r = await fetch(`${BASE}/rest/v1/${table}?${qs}`, { headers });
  if (!r.ok) throw new Error(`${table} ${r.status}: ${await r.text()}`);
  return r.json();
}

function js(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(js).join(', ') + ']';
  return JSON.stringify(v);
}

function pickEntry(r) {
  const thumb = r.thumb_initials || (r.venue ? r.venue.slice(0, 2).toUpperCase() : '??');
  const fields = [
    `id:            ${js(r.id)}`,
    `city:          ${js(r.city)}`,
    `title:         ${js(r.title)}`,
    `venue:         ${js(r.venue)}`,
    `neighborhood:  ${js(r.neighborhood)}`,
    `kind:          ${js(r.kind)}`,
    `day:           ${js(r.day)}`,
    `time:          ${js(r.time)}`,
    `quote:         ${js(r.quote)}`,
    `handle:        ${js(r.handle)}`,
    `thumbInitials: ${js(thumb)}`,
    `tonight:       ${js(!!r.tonight)}`,
    `thisWeek:      ${js(!!r.this_week)}`,
    `moodTags:      ${js(r.mood_tags || [])}`,
    r.image_url  ? `imageUrl:      ${js(r.image_url)}`  : null,
    r.lat != null ? `lat:           ${js(r.lat)}` : null,
    r.lng != null ? `lng:           ${js(r.lng)}` : null,
    r.address     ? `address:       ${js(r.address)}` : null,
    `pin:           null`,
  ].filter(Boolean);
  return '  {\n    ' + fields.join(',\n    ') + '\n  }';
}

function curatorEntry(c) {
  return '  {\n' +
    `    handle:  ${js(c.handle)},\n` +
    `    name:    ${js(c.name)},\n` +
    `    city:    ${js(c.city)},\n` +
    `    tagline: ${js(c.tagline)},\n` +
    `    bio:     ${js(c.bio || '')}\n` +
    '  }';
}

function pastEntry(p) {
  return `  { id: ${js(p.id)}, title: ${js(p.title)}, date: ${js(p.date)} }`;
}

(async () => {
  const [picks, curators, past] = await Promise.all([
    get('picks',
      `archived_at=is.null&handle=neq.@discovery` +
      `&select=id,city,title,venue,neighborhood,kind,day,time,quote,handle,` +
              `thumb_initials,image_url,tonight,this_week,mood_tags,` +
              `lat,lng,address&order=city.asc,sort_order.asc,created_at.asc`),
    get('curators',
      `select=handle,name,city,tagline,bio&order=city.asc,handle.asc`),
    get('past',
      `select=id,title,date&order=created_at.asc`),
  ]);

  console.log(`picks: ${picks.length}, curators: ${curators.length}, past: ${past.length}`);

  /* The Places (venues) seed is HAND-CURATED (README: ≤12 per city, real
     venues only) — it does not come from the DB's 2,500-row OSM venues
     table. Carry the existing block over verbatim so a regen never
     clobbers curation. */
  const catalogPath = path.join(__dirname, '..', 'catalog.js');
  const existing = fs.readFileSync(catalogPath, 'utf8');
  const venuesStart = existing.indexOf('/* Static Places (venues) seed');
  const venuesBlock = venuesStart !== -1
    ? existing.slice(venuesStart).trimEnd() + '\n'
    : null;
  if (!venuesBlock) throw new Error('catalog.js venues block not found — refusing to drop the curated Places seed');

  const out = `/* ============================================================
   WanderAlt — content catalog (static fallback)
   ------------------------------------------------------------
   Auto-generated snapshot from live DB. Regenerate with:
     node .scripts/regen-catalog.js
   This is loaded first; supabase.js then replaces it with live
   data when the network is reachable.

   The raw multi-city list is exposed as \`window.WA._catalogAll\`;
   \`window.WA.catalog\` is the slice for the currently selected
   city (read from localStorage 'wa:city' since city.js loads
   after this file). Same for curators. Without this filter, an
   offline visitor on the Riga or Helsinki city setting would
   see Tallinn picks bleed through.
   ============================================================ */
window.WA = window.WA || {};

const _waCity = (() => {
  try { return localStorage.getItem('wa:city') || 'tallinn'; }
  catch { return 'tallinn'; }
})();

window.WA._catalogAll = [
${picks.map(pickEntry).join(',\n')}
];

/* Filter the all-cities list to the active city. supabase.js will
   replace this with live data once the network responds, but the
   filter ensures the offline fallback respects the city setting. */
window.WA.catalog = window.WA._catalogAll.filter(e => e.city === _waCity);

window.WA._curatorsAll = [
${curators.map(curatorEntry).join(',\n')}
];

window.WA.curators = window.WA._curatorsAll.filter(c => c.city === _waCity);

window.WA.past = [
${past.map(pastEntry).join(',\n')}
];

${venuesBlock}`;

  fs.writeFileSync(catalogPath, out);
  console.log('Wrote catalog.js (modern _catalogAll format, curated venues preserved)');
})().catch(e => { console.error(e); process.exit(1); });
