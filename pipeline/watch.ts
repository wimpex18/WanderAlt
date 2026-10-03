// A freshness and uptime check, run every three hours by GitHub Actions (.github/workflows/watch.yml).
// It exits non-zero, and the workflow opens or updates one issue, when:
//   - no pipeline run has finished OK for more than 14 hours (the pipeline runs every 6),
//   - the site, its edge-cached data, its sitemap or Supabase's REST API do not answer.
// /api/ask is not probed: its answer depends on the day's free AI allowance, not on the site being up.
import { Db } from './db.ts';

export const STALE_HOURS = 14;
export interface Problem { what: string; detail: string }

/** Is the newest finished OK run recent enough? `runs` are pipeline_runs rows. */
export function freshness(runs: { finished_at: string | null; ok: boolean | null }[], now = Date.now()): Problem | null {
  const last = runs.filter(r => r.ok && r.finished_at).map(r => Date.parse(r.finished_at!)).sort((a, b) => b - a)[0];
  if (!last) return { what: 'pipeline', detail: 'no successful run on record' };
  const hours = (now - last) / 3_600_000;
  return hours > STALE_HOURS ? { what: 'pipeline', detail: `last successful run finished ${hours.toFixed(1)} hours ago (limit ${STALE_HOURS})` } : null;
}

const SITE = process.env.WATCH_SITE?.trim() || 'https://wanderalt.app';
export async function probes(fetcher: typeof fetch = fetch, site = SITE): Promise<Problem[]> {
  const out: Problem[] = [];
  const get = async (what: string, url: string, ok: (r: Response, body: string) => string | null) => {
    try {
      const r = await fetcher(url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'WanderAlt watch' } });
      const bad = r.status === 200 ? ok(r, await r.text()) : `HTTP ${r.status}`;
      if (bad) out.push({ what, detail: `${url}: ${bad}` });
    } catch (e) { out.push({ what, detail: `${url}: ${(e as Error).message}` }); }
  };
  await get('site', `${site}/`, (_r, b) => (/<title>/i.test(b) ? null : 'no page'));
  await get('data', `${site}/api/rest/venues?select=id&limit=1`, (_r, b) => { try { return Array.isArray(JSON.parse(b)) && JSON.parse(b).length ? null : 'empty answer'; } catch { return 'not JSON'; } });
  await get('sitemap', `${site}/sitemap.xml`, (_r, b) => (b.includes('<urlset') ? null : 'not a sitemap'));
  return out;
}

if (import.meta.main) {
  const problems: Problem[] = [];
  try {
    const db = new Db();
    const p = freshness(await db.select<{ finished_at: string | null; ok: boolean | null }>('pipeline_runs?select=finished_at,ok&order=started_at.desc&limit=20'));
    if (p) problems.push(p);
  } catch (e) { problems.push({ what: 'supabase', detail: (e as Error).message }); }
  problems.push(...await probes());
  if (!problems.length) console.log('[watch] all good');
  for (const p of problems) console.log(`[watch] PROBLEM ${p.what}: ${p.detail}`);
  process.exitCode = problems.length ? 1 : 0;
}
