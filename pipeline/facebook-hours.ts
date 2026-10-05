// What a venue's Facebook Page says about itself, through the Graph API: its `hours`, its
// `website`, its `about` line and whether it is `is_permanently_closed`. Meta returns these for
// Pages our app administers and, for other businesses' Pages, only once the app has Page Public
// Metadata Access (an App Review; docs/facebook.md says what to do). Without it the call answers
// with a permission error (code 10), which stops this source for the run; with it, the same code
// starts filling hours, a missing website and a missing description, and logs a closure.
// `facebookCheck` probes each step with the real token and says which one is missing.
import { UA, clip, httpUrl } from './util.ts';
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
  | { kind: 'found'; hours: string | null; website?: string | null; about?: string | null; closed?: boolean }
  | { kind: 'none'; reason: string }
  | { kind: 'stop'; reason: string };

/** A Page's "website" as one http(s) address of the venue's own site: never another social profile or a link page. */
export function pageWebsite(raw: unknown): string | null {
  for (const part of String(raw ?? '').split(/[\s,]+/)) {
    const u = httpUrl(/^https?:/i.test(part) ? part : part ? `https://${part}` : '');
    if (!u) continue;
    const parsed = new URL(u);
    if (parsed.username || parsed.password || !parsed.hostname.includes('.')) continue;
    if (/(^|\.)(facebook|instagram|tiktok|youtube|x|twitter|linktr|linkin|beacons|threads|fienta|piletilevi|piletitasku)\.(com|ee|net|bio|ai)$/i.test(parsed.hostname)
      || /(^|\.)(t\.me|wa\.me|wa\.link)$/.test(parsed.hostname)
      || /(^|\.)(goo\.gl|maps\.app\.goo\.gl|g\.page|bit\.ly|maps\.google\.[a-z.]+)$/.test(parsed.hostname)
      || /(^|\.)google\.[a-z.]+$/.test(parsed.hostname) && /^\/maps\b/.test(parsed.pathname)) continue;
    return u;
  }
  return null;
}

type Graph = { hours?: Record<string, string>; website?: string; about?: string; is_permanently_closed?: boolean; error?: { code?: number; message?: string } };
const STOP = [190, 10, 200, 4, 17, 32, 613];
const ask = async (page: string, fields: string, cfg: InstagramConfig, fetcher: typeof fetch): Promise<Graph> => {
  const r = await fetcher(`${API}/${encodeURIComponent(page)}?` + new URLSearchParams({ fields, access_token: cfg.token }),
    { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
  return await r.json() as Graph;
};

/** Hours, website, about and closure from a venue's Page. */
export async function lookupFacebookPage(page: string, cfg: InstagramConfig, fetcher: typeof fetch = fetch): Promise<FbHours> {
  try {
    let body = await ask(page, 'hours,website,about,is_permanently_closed', cfg, fetcher);
    // A field this Page type does not have (code 100) is no reason to lose the hours.
    if (body.error?.code === 100) body = await ask(page, 'hours', cfg, fetcher);
    if (body.error) {
      // 10 and 200: a permission the app lacks (Page Public Metadata Access); 190: token; the rest are rate limits.
      return STOP.includes(Number(body.error.code))
        ? { kind: 'stop', reason: `Meta refused (code ${body.error.code}): ${String(body.error.message).slice(0, 120)}` }
        : { kind: 'none', reason: `code ${body.error.code}` };
    }
    const hours = hoursFromGraph(body.hours), website = pageWebsite(body.website), about = body.about ? clip(body.about.trim(), 400) : null;
    if (!hours && !website && !about && !body.is_permanently_closed) return { kind: 'none', reason: 'nothing on the page' };
    return { kind: 'found', hours, website, about, closed: body.is_permanently_closed === true };
  } catch (e) { return { kind: 'stop', reason: `request failed: ${(e as Error).message}` }; }
}

/** Hours alone, for callers that want only them. */
export async function lookupFacebookHours(page: string, cfg: InstagramConfig, fetcher: typeof fetch = fetch): Promise<FbHours> {
  const r = await lookupFacebookPage(page, cfg, fetcher);
  return r.kind === 'found' && !r.hours ? { kind: 'none', reason: 'no hours on the page' } : r;
}

/** Each step Facebook needs, tried with the real token, one line each; nothing is written.
 *  Our own Page answers with the token alone; another venue's Page answers only after review. */
export async function facebookCheck(cfg: InstagramConfig, venues: string[], fetcher: typeof fetch = fetch): Promise<string[]> {
  const out: string[] = [];
  const get = async (path: string, params: Record<string, string>) => {
    try {
      const r = await fetcher(`${API}/${path}?` + new URLSearchParams({ ...params, access_token: cfg.token }), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
      return await r.json() as Record<string, unknown> & { error?: { code?: number; error_subcode?: number; message?: string } };
    } catch (e) { return { error: { message: (e as Error).message } }; }
  };
  const said = (b: { error?: { code?: number; error_subcode?: number; message?: string } }) =>
    `refused (code ${b.error?.code ?? '?'}${b.error?.error_subcode ? `/${b.error.error_subcode}` : ''}): ${String(b.error?.message ?? '').slice(0, 140)}`;
  const me = await get('me', { fields: 'id,name' });
  out.push(`token: ${me.error ? said(me) : `works, as ${String(me.name ?? me.id)}`}`);
  const perms = await get('me/permissions', {});
  const granted = Array.isArray(perms.data) ? (perms.data as { permission: string; status: string }[]).filter(p => p.status === 'granted').map(p => p.permission) : [];
  out.push(`permissions: ${perms.error ? said(perms) : granted.join(', ') || 'none listed'}`);
  const pages = await get('me/accounts', { fields: 'id,name' });
  const own = Array.isArray(pages.data) ? (pages.data as { id: string; name: string }[])[0] : undefined;
  if (own) {
    const h = await get(own.id, { fields: 'name,hours,website' });
    out.push(`our own Page ${own.name}: ${h.error ? said(h) : `readable${h.hours ? ', with hours' : ' (no hours set)'}`}`);
  } else out.push(`our own Page: ${pages.error ? said(pages) : 'none assigned to this token'}`);
  for (const v of venues) {
    const b = await get(v, { fields: 'name,hours,website,about,is_permanently_closed' });
    out.push(`venue Page ${v}: ${b.error ? said(b) : `readable as "${String(b.name)}"${b.hours ? ', hours ' + hoursFromGraph(b.hours as Record<string, string>) : ', no hours on the Page'}`}`);
  }
  const blocked = out.some(l => l.startsWith('venue Page') && /code 10\b|code 200\b/.test(l));
  out.push(blocked ? 'verdict: venue Pages need Page Public Metadata Access (docs/facebook.md, steps 1-6).' : 'verdict: venue Pages are readable; the pipeline fills hours, websites and descriptions from them.');
  return out;
}
