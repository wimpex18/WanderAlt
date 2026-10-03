#!/usr/bin/env node
// The static pages carry their UI icons inline (the tab bar, the top bar, search keys) so they
// paint before any script runs. Each inline icon names itself with data-ic="<name>"; this
// rewrites its paths from icons.js, the one icon set, so the two never drift apart.
//   node .scripts/sync-icons.js          write
//   node .scripts/sync-icons.js --check  exit 1 when a page is out of date
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'icons.js'), 'utf8'), ctx);
const Icon = ctx.window.WA.Icon;
const inner = (name) => Icon(name).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const check = process.argv.includes('--check');
let stale = 0;
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  const full = path.join(root, file), was = fs.readFileSync(full, 'utf8');
  const now = was.replace(/(<svg\b[^>]*\bdata-ic="([a-z0-9]+)"[^>]*>)([\s\S]*?)<\/svg>/g, (m, open, name) => `${open}${inner(name)}</svg>`);
  if (now !== was) { stale++; if (check) console.error(`${file}: inline icons differ from icons.js`); else fs.writeFileSync(full, now); }
}
if (check && stale) process.exit(1);
if (!check) console.log(`icons: ${stale} page(s) updated`);
