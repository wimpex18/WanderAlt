#!/usr/bin/env node
/* ============================================================
   design-spec.js — turn the Claude Design handoff into a checklist.
   ------------------------------------------------------------
   Why this exists: every section of the direction was signed off as
   "audited" and four separate things in it had never been looked at —
   Walks as the fourth scope tab, the scope tabs owning the desktop
   masthead, the 15px category marks in filter pills, and the saved
   strip. They were missed because auditing meant reading the rationale
   column and looking at the screen, which finds what you thought to
   look for and nothing else.

   The direction is a rendered document: every screen in it is real
   markup, so every label, count, chip and button that the designer drew
   is extractable. This pulls them out per section and writes
   design-spec.json — the ground truth list of what each screen SAYS.
   design-check.js then drives the app and reports which of those
   strings actually reach the DOM.

   It is deliberately dumb. It does not judge layout, colour or spacing;
   those still need measuring by hand. What it guarantees is that
   nothing DRAWN in the handoff can be silently absent from the build,
   which is the failure that kept happening.

   Usage:  node .scripts/design-spec.js [path-to-.dc.html]
   ============================================================ */

const fs = require('fs');
const path = require('path');

const DEFAULT_SRC = '/Users/sergey/Documents/Underground culture guides for Baltic cities/WanderAlt - Direction.dc.html';
const SRC = process.argv[2] || DEFAULT_SRC;
const OUT = path.join(__dirname, '..', 'design-spec.json');

if (!fs.existsSync(SRC)) {
  console.error(`design-spec: cannot read ${SRC}`);
  console.error('Pass the .dc.html path as the first argument.');
  process.exit(1);
}

const raw = fs.readFileSync(SRC, 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '');

/* Every section is <div id="5b" style="display:flex;gap:56px..."> with
   exactly two children: the SCREEN column (style="flex:none") and the
   rationale column. Only the screen column is a claim about what the
   product renders, so the boundary has to be structural — an earlier
   version of this script guessed it from prose and pulled 6f's text
   into 5b, which is the kind of noise that makes a checklist ignorable.

   Walks the tags counting depth rather than regexing, because these
   blocks nest ~8 divs deep. */
const blockAt = (start) => {
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 0, m;
  while ((m = tag.exec(raw))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return raw.slice(start, m.index + m[0].length);
  }
  return raw.slice(start);
};

/* Balance divs inside an arbitrary string, from a given offset. */
const balance = (html, from) => {
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = from;
  let depth = 0, m;
  while ((m = tag.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index + m[0].length);
  }
  return html.slice(from);
};

/* First child div of the section wrapper = the drawn screen column. */
const screenOf = (block) => {
  const open = /<div\b[^>]*>/g;
  open.exec(block);                       /* the section wrapper itself */
  const first = open.exec(block);
  return first ? balance(block, first.index) : block;
};

const toLines = (html) => html.replace(/<[^>]+>/g, '\n').split('\n');

const unescape = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&rarr;/g, '→').replace(/&nearr;/g, '↗').replace(/&rsaquo;/g, '›');

const sections = [];
const anchor = /<div\s+id="([1-6][a-g])"/g;
let a;
while ((a = anchor.exec(raw))) {
  const block  = blockAt(a.index);
  const screen = screenOf(block);
  let drawn    = toLines(screen).map(l => unescape(l).trim()).filter(Boolean);
  /* drawn[0] is the badge (the id itself), drawn[1] the title, and
     drawn[2] is usually the strapline carrying the drawn size —
     "1280 × 800 · scope tabs + one capsule". Capturing it matters:
     checking a desktop screen at 390 reports its masthead absent and
     the reverse reports the tab bar absent, and both are correct-but-
     useless answers that look like bugs. */
  const title = drawn[1] || '';
  const dim = (drawn[2] || '').match(/(\d{3,4})\s*[×x]\s*(\d{3,4})/);
  const viewport = dim ? { w: +dim[1], h: +dim[2] } : null;
  let layout = 'screen+why';

  /* Not every section is two-column. 5e is a spec page of wrong/right
     examples, 6d/6e are full-width. Their first child is a heading, not
     a screen, so the screen-column read comes back near-empty — and a
     near-empty section in a checklist is indistinguishable from a
     section with nothing to check, which is how things get skipped.
     Fall back to the whole block, flagged, so it is noisier rather than
     silent. */
  if (drawn.length < 8) {
    drawn = toLines(block).map(l => unescape(l).trim()).filter(Boolean);
    layout = 'full-width (includes rationale — expect noise)';
  }
  sections.push({ id: a[1], title, viewport, layout, drawn: drawn.slice(2) });
}

/* A drawn line is worth checking when it is a LABEL — short, not a
   sentence of rationale that slipped through, and not pure data from
   the designer's sample catalogue (venue names, prices, distances),
   which the real app will legitimately not contain. */
const SAMPLE_DATA = /^(\d+([.,]\d+)?\s?(km|m|€)|→?\d{1,2}:\d{2}|\d{1,2}€|NOW|TON|SAT|SUN|MON|TUE|WED|THU|FRI)$/i;
const isCheckableLabel = (l) =>
  l.length >= 2 && l.length <= 42 &&
  !/[.!?]$/.test(l) &&
  l.split(/\s+/).length <= 6 &&
  !SAMPLE_DATA.test(l);

const spec = sections
  .filter(s => /^[1-6][a-g]$/.test(s.id))
  .map(s => {
    const seen = new Set();
    const labels = s.drawn.filter(l => {
      if (!isCheckableLabel(l)) return false;
      const k = l.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { id: s.id, title: s.title, viewport: s.viewport, layout: s.layout, drawnCount: s.drawn.length, labels };
  });

/* Merge duplicate ids: the doc revisits some sections across turns, and
   the later drawing supersedes but does not replace the earlier one. */
const byId = {};
for (const s of spec) {
  if (!byId[s.id]) { byId[s.id] = s; continue; }
  const seen = new Set(byId[s.id].labels.map(l => l.toLowerCase()));
  for (const l of s.labels) if (!seen.has(l.toLowerCase())) byId[s.id].labels.push(l);
  byId[s.id].drawnCount += s.drawnCount;
}

const ordered = Object.keys(byId).sort().map(k => byId[k]);

fs.writeFileSync(OUT, JSON.stringify({
  source: path.basename(SRC),
  extracted: ordered.length,
  note: 'Labels are strings the handoff DRAWS. Absence from the build is a gap to explain, not automatically a bug — sample data and superseded rounds live here too.',
  sections: ordered,
}, null, 2) + '\n');

console.log(`design-spec: ${ordered.length} sections -> ${path.relative(process.cwd(), OUT)}`);
for (const s of ordered) {
  console.log(`  ${s.id}  ${String(s.labels.length).padStart(3)} labels  ${(s.viewport ? String(s.viewport.w).padStart(4) + "px" : "   —  ")}  ${s.title.slice(0, 44)}`);
}
