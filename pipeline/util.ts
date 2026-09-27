import { createHash } from 'node:crypto';

export const UA = 'WanderAlt/0.9 (+https://wanderalt.app; events for Tallinn)';

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/** GET with a timeout and our user agent. Throws on a non-2xx status. */
export async function get(url: string, opts: { timeoutMs?: number; accept?: string } = {}): Promise<Response> {
  const r = await fetch(url, {
    headers: { 'user-agent': UA, accept: opts.accept ?? '*/*' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML to readable plain text: block tags become line breaks. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => `${inner} (${href})`)
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .split('\n')
    .map(l => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export const slug = (s: string): string =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Lowercased, accent-folded, punctuation-free: how names are compared. */
export const nameKey = (s: string): string =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/["'«»„“”’`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const clip = (s: string | null | undefined, n: number): string | null =>
  s == null ? null : (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Only http(s) URLs survive; anything else becomes null. */
export function httpUrl(u: unknown, base?: string): string | null {
  if (typeof u !== 'string' || !u.trim()) return null;
  try {
    const url = new URL(u.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
