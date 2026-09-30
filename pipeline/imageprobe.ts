// How big is this picture? Read from the first bytes of the file, so a logo
// found on a page can be checked before it is stored: a 16 px favicon is not
// a logo, a 2000 px header photo is not one either.

import { UA } from './util.ts';

export interface ImageSize { width: number; height: number; vector?: boolean }

/** Width and height from the file's own header; null when the format is not
 *  one of PNG, JPEG, GIF, WebP, ICO or SVG, or the bytes stop too soon. */
export function imageSize(b: Uint8Array): ImageSize | null {
  const u16 = (i: number) => b[i] | (b[i + 1] << 8);
  const be16 = (i: number) => (b[i] << 8) | b[i + 1];
  const be32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === 'PNG') return { width: be32(16), height: be32(20) };
  if (b.length >= 10 && ascii(0, 3) === 'GIF') return { width: u16(6), height: u16(8) };
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4);
    if (kind === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (kind === 'VP8 ') return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff };
    if (kind === 'VP8L') { const v = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0; return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }; }
  }
  if (b.length >= 22 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    let width = 0, height = 0;
    for (let i = 0, n = Math.min(u16(4), 20); i < n && 6 + 16 * i + 2 <= b.length; i++) {
      width = Math.max(width, b[6 + 16 * i] || 256); height = Math.max(height, b[7 + 16 * i] || 256);
    }
    return width ? { width, height } : null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: be16(i + 5), width: be16(i + 7) };
      i += 2 + be16(i + 2);
    }
    return null;
  }
  if (/^\s*(<\?xml|<svg)/i.test(ascii(0, Math.min(b.length, 200)))) return { width: 0, height: 0, vector: true };
  return null;
}

/** Fetch the start of an image and read its size. Null on any failure. */
export async function probeImage(url: string, fetcher: typeof fetch = fetch): Promise<ImageSize | null> {
  try {
    const r = await fetcher(url, { headers: { 'user-agent': UA, accept: 'image/*' }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok || !r.body) return null;
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (type && !/^image\//.test(type) && type !== 'application/octet-stream') return null;
    const reader = r.body.getReader();
    const parts: Uint8Array[] = []; let n = 0;
    try {
      while (n < 65_536) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; }
    } finally { await reader.cancel().catch(() => {}); }
    return imageSize(Buffer.concat(parts));
  } catch { return null; }
}

/** A mark worth showing: a vector, or a raster at least `min` px on its short
 *  side and not a strip (longer than `ratio` times its height). */
export const usableSize = (s: ImageSize | null, min: number, ratio = 8): boolean =>
  !!s && (s.vector === true || (Math.min(s.width, s.height) >= min && Math.max(s.width, s.height) <= ratio * Math.min(s.width, s.height)));
