// What a venue's logo looks like, measured once, so a page can draw it well on light and dark
// paper without guessing. The ground is what lies at the logo's edge: transparent ("clear"),
// white ("light"), black ("dark") or a colour; the ink is the rest: its lightness, and whether it
// is one neutral colour ("mono") or colourful. The page reads the tone (wa.css, .tone-*): in the
// dark theme a black logo on a clear or white ground is turned light, a dark colourful one is
// brightened, one on its own dark or coloured ground is shown as it is; in the light theme a white
// logo gets a dark tile. Nothing about the logo is stored but this word.
import { spawnSync } from 'node:child_process';
import type { Place } from './places.ts';

export type LogoTone = 'clear-dark-mono' | 'clear-dark-colour' | 'clear-light' | 'clear-mid'
  | 'light-mono' | 'light-colour' | 'dark' | 'colour';

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const sat = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };

/** The tone of a decoded RGBA image. Exported for tests. */
export function toneOf(data: Uint8Array | Buffer, width: number, height: number): LogoTone | null {
  const at = (x: number, y: number) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3] / 255] as const; };
  let edgeAlpha = 0, edgeN = 0, edgeL = 0, edgeS = 0, edgeOpaque = 0, seeThrough = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a] = at(x, y);
    if (a < .5) seeThrough++;
    if (x > 1 && y > 1 && x < width - 2 && y < height - 2) continue;
    edgeAlpha += a; edgeN++;
    if (a > .5) { edgeL += lum(r, g, b); edgeS += sat(r, g, b); edgeOpaque++; }
  }
  if (!edgeN) return null;
  /* A logo with a fifth of itself see-through is drawn on nothing, even when its shape touches the edge. */
  const clear = edgeAlpha / edgeN < .4 || seeThrough / (width * height) > .2;
  const groundL = edgeOpaque ? edgeL / edgeOpaque : 1, groundS = edgeOpaque ? edgeS / edgeOpaque : 0;
  let inkL = 0, inkS = 0, n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a] = at(x, y);
    if (a < .5) continue;
    const l = lum(r, g, b);
    if (!clear && Math.abs(l - groundL) < .15) continue;
    inkL += l; inkS += sat(r, g, b); n++;
  }
  const ink = n ? inkL / n : null, mono = n ? inkS / n < .25 : true;
  if (clear) {
    if (ink == null) return null;
    if (ink > .75) return 'clear-light';
    if (ink < .45) return mono ? 'clear-dark-mono' : 'clear-dark-colour';
    return 'clear-mid';
  }
  if (groundL > .85 && groundS < .15) return mono ? 'light-mono' : 'light-colour';
  if (groundL < .25) return 'dark';
  return 'colour';
}

const fetchBytes = async (url: string): Promise<Buffer | null> => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; WanderAlt)' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
  } catch { /* some hosts refuse Node's TLS handshake; curl below */ }
  const c = spawnSync('curl', ['-sS', '-L', '--fail', '--max-time', '15', '-A', 'Mozilla/5.0 (compatible; WanderAlt)', url], { maxBuffer: 8 << 20 });
  return c.status === 0 && c.stdout.length ? c.stdout : null;
};

/* sharp is a dev dependency, loaded on first use: a run without it measures nothing and marks nothing. */
type Sharp = typeof import('sharp').default;
let loaded: Promise<Sharp | null> | null = null;
const loadSharp = () => (loaded ??= import('sharp').then(m => m.default, () => null));

/** The tone of the logo at a URL, or null when it cannot be read. */
export async function logoTone(url: string, deps: { bytes?: (u: string) => Promise<Buffer | null> } = {}): Promise<LogoTone | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  const bytes = await (deps.bytes ?? fetchBytes)(url);
  if (!bytes) return null;
  try {
    const { data, info } = await sharp(bytes, { density: 96 }).resize(64, 64, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return toneOf(data, info.width, info.height);
  } catch { return null; }
}

/** Places whose logo has not been measured, or has changed since. */
export const dueForTone = (places: Place[]) => places.filter(p => p.image_source === 'logo' && p.image_url && p.image_tone_url !== p.image_url && !p.merged_into);

/** Measure up to `limit` logos. Returns the places that changed. */
export async function fillLogoTones(places: Place[], limit = 40, deps: { bytes?: (u: string) => Promise<Buffer | null>; log?: (s: string) => void } = {}): Promise<Place[]> {
  const log = deps.log ?? console.log, changed: Place[] = [];
  if (!(await loadSharp())) { log('[logos] sharp is not installed; logo tones skipped'); return changed; }
  const due = dueForTone(places).sort((a, b) => Number(!!b.picked) - Number(!!a.picked) || a.id.localeCompare(b.id)).slice(0, limit);
  const tally: Record<string, number> = {};
  for (const p of due) {
    const tone = await logoTone(p.image_url!, deps);
    p.image_tone = tone; p.image_tone_url = p.image_url;
    tally[tone ?? 'unread'] = (tally[tone ?? 'unread'] ?? 0) + 1;
    changed.push(p);
  }
  if (due.length) log(`[logos] ${due.length} measured: ${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  return changed;
}
