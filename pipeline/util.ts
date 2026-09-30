import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

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

/** A page's HTML and the address it was finally served from. Some hosts refuse
 *  Node's TLS handshake with a 403 and serve the same page to curl, with the
 *  same honest user agent; a page that gave a 403 is asked for once more with
 *  curl. Anything else is thrown as before. */
export async function getHtml(url: string, opts: { timeoutMs?: number } = {}): Promise<{ html: string; url: string }> {
  try {
    const r = await get(url, { accept: 'text/html', timeoutMs: opts.timeoutMs });
    return { html: await r.text(), url: r.url || url };
  } catch (e) {
    if (!/^403 /.test((e as Error).message)) throw e;
    const r = spawnSync('curl', ['-sS', '-L', '--fail', '--max-time', String(Math.ceil((opts.timeoutMs ?? 20_000) / 1000)),
      '--max-filesize', '3000000', '-A', UA, '-H', 'accept: text/html', '-w', '\n%{url_effective}', url], { encoding: 'utf8', maxBuffer: 4 << 20 });
    if (r.status !== 0 || !r.stdout) throw e;
    const cut = r.stdout.lastIndexOf('\n');
    return { html: r.stdout.slice(0, cut), url: r.stdout.slice(cut + 1).trim() || url };
  }
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

/** Contact details out of prose: listings may print an organiser's email
 *  or phone, and WanderAlt never stores them. Lines left empty go. */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[a-z]{2,}/giu;
const PHONE = /(?:\+372|\+358|\+371|\+7)[\s\d()-]{6,16}\d|\b(?:tel|telefon|phone|ph|mob)\.?:?\s*\+?\d[\s\d()-]{5,16}\d/giu;
export function scrubContacts(s: string | null | undefined): string | null {
  if (s == null) return null;
  return s.split('\n')
    .map(l => {
      const out = l.replace(/\(mailto:[^)]*\)/gi, '').replace(EMAIL, '').replace(PHONE, '').replace(/\s{2,}/g, ' ').trim();
      // "Tickets: x@y.ee" leaves a bare label behind; it goes too.
      return out !== l.trim() && /^([^:]{0,24}:)?[\s,;.–—-]*$/u.test(out) ? '' : out;
    })
    .filter(Boolean)
    .join('\n') || null;
}
