/* npm run shots:compare -- <dirA> <dirB> [--diff <dir>]
   Compares two sets from npm run shots pixel by pixel: for each PNG, a size
   mismatch or the number of pixels that differ, and any file only one set has.
   --diff writes, for each differing file, the first set's picture faded with the
   differing pixels in red. Exits 1 on any difference, 0 when every file matches exactly. */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const diffAt = args.indexOf('--diff');
const diffDir = diffAt >= 0 ? args.splice(diffAt, 2)[1] : null;
const [a, b] = args;
if (!a || !b || diffAt >= 0 && !diffDir) {
  console.error('Usage: npm run shots:compare -- <dirA> <dirB> [--diff <dir>]');
  process.exit(2);
}
if (diffDir) fs.mkdirSync(diffDir, { recursive: true });
const pngs = (dir: string) => new Set(fs.readdirSync(dir).filter(f => f.endsWith('.png')));
const inA = pngs(a), inB = pngs(b);
const files = [...new Set([...inA, ...inB])].sort();

const decode = async (file: string) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

let differing = 0;
for (const f of files) {
  if (!inA.has(f) || !inB.has(f)) {
    console.log(`${f}: only in ${inA.has(f) ? a : b}`);
    differing++;
    continue;
  }
  const [x, y] = await Promise.all([decode(path.join(a, f)), decode(path.join(b, f))]);
  if (x.width !== y.width || x.height !== y.height) {
    console.log(`${f}: size ${x.width}×${x.height} vs ${y.width}×${y.height}`);
    differing++;
    continue;
  }
  let pixels = 0, top = -1, bottom = -1;
  const marked = diffDir ? Buffer.alloc(x.data.length) : null;
  for (let i = 0; i < x.data.length; i += 4) {
    const same = x.data[i] === y.data[i] && x.data[i + 1] === y.data[i + 1] && x.data[i + 2] === y.data[i + 2] && x.data[i + 3] === y.data[i + 3];
    if (!same) {
      pixels++;
      const row = Math.floor(i / 4 / x.width);
      if (top < 0) top = row;
      bottom = row;
    }
    if (marked) {
      if (same) for (let c = 0; c < 3; c++) marked[i + c] = 255 - Math.round((255 - x.data[i + c]) * 0.25);
      else { marked[i] = 255; marked[i + 1] = 0; marked[i + 2] = 0; }
      marked[i + 3] = 255;
    }
  }
  if (pixels) {
    console.log(`${f}: ${pixels} of ${x.width * x.height} pixels differ (rows ${top}–${bottom})`);
    differing++;
    if (marked) await sharp(marked, { raw: { width: x.width, height: x.height, channels: 4 } }).png().toFile(path.join(diffDir!, f));
  } else console.log(`${f}: identical`);
}
console.log(`${files.length} files, ${differing} differ.`);
process.exit(differing ? 1 : 0);
