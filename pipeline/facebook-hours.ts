// Opening hours from a venue's Facebook Page, through the Graph API's `hours` field. Meta
// returns it for Pages our app administers and, for other businesses' Pages, only with Page
// Public Metadata Access (an app review). Without that the call answers with a permission
// error, which stops this source for the run; with it, the same code starts returning hours.
import { UA } from './util.ts';
import { writeHours } from './site-hours.ts';
import type { InstagramConfig } from './instagram.ts';

const API = 'https://graph.facebook.com/v26.0';
const DAYS: [string, string][] = [['mon', 'Mo'], ['tue', 'Tu'], ['wed', 'We'], ['thu', 'Th'], ['fri', 'Fr'], ['sat', 'Sa'], ['sun', 'Su']];

/** The Page name or id in a facebook.com link, or null for anything that is not a Page. */
export function facebookPage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    if (u.pathname === '/profile.php') return /^\d+$/.test(u.searchParams.get('id') ?? '') ? u.searchParams.get('id') : null;
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0] === 'pages' && /^\d+$/.test(seg[seg.length - 1] ?? '')) return seg[seg.length - 1];
    if (seg.length < 1 || /^(sharer|share|events|groups|watch|photo|photos|people|login|dialog|plugins|tr|p|reel|hashtag)$/i.test(seg[0])) return null;
    return /^[A-Za-z0-9.\-]{2,}$/.test(seg[0]) ? seg[0] : null;
  } catch { return null; }
}

/** Graph `hours` ({ mon_1_open: "10:00", mon_1_close: "18:00", ... }) → OpenStreetMap syntax. */
export function hoursFromGraph(h: Record<string, string> | undefined | null): string | null {
  if (!h) return null;
  const byDay = new Map<string, string[]>();
  for (const [key, code] of DAYS) {
    for (const n of [1, 2]) {
      const open = h[`${key}_${n}_open`], close = h[`${key}_${n}_close`];
      if (!open || !close || open === close) continue;
      byDay.set(code, [...(byDay.get(code) ?? []), `${open}-${close === '00:00' ? '24:00' : close}`]);
    }
  }
  return byDay.size ? writeHours(byDay) : null;
}

export type FbHours =
  | { kind: 'found'; hours: string }
  | { kind: 'none'; reason: string }
  | { kind: 'stop'; reason: string };

export async function lookupFacebookHours(page: string, cfg: InstagramConfig, fetcher: typeof fetch = fetch): Promise<FbHours> {
  const url = `${API}/${encodeURIComponent(page)}?` + new URLSearchParams({ fields: 'hours', access_token: cfg.token });
  try {
    const r = await fetcher(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
    const body = await r.json() as { hours?: Record<string, string>; error?: { code?: number; message?: string } };
    if (body.error) {
      // 10 and 200: a permission the app lacks (Page Public Metadata Access); 190: token; the rest are rate limits.
      return [190, 10, 200, 4, 17, 32, 613].includes(Number(body.error.code))
        ? { kind: 'stop', reason: `Meta refused (code ${body.error.code}): ${String(body.error.message).slice(0, 120)}` }
        : { kind: 'none', reason: `code ${body.error.code}` };
    }
    const hours = hoursFromGraph(body.hours);
    return hours ? { kind: 'found', hours } : { kind: 'none', reason: 'no hours on the page' };
  } catch (e) { return { kind: 'stop', reason: `request failed: ${(e as Error).message}` }; }
}
