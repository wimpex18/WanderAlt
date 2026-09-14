/* ============================================================
   verify-images — an image URL is a claim, so check it
   ------------------------------------------------------------
   Walks stored images oldest-checked-first, fetches each one, and either
   stamps image_checked_at or removes it.

   A 404, 410, 403 or non-image content-type clears the URL (and
   image_source): a broken image renders as a torn frame, an absent one
   draws the category mark. A timeout, 5xx or 429 does NOT delete.

   POST { table?: 'venues'|'picks'|'both', limit?, dry_run? }
   ============================================================ */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AGENT   = 'WanderAlt/1.0 (+https://wanderalt.app)';
const BATCH   = 40;
const TIMEOUT = 8000;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE);

type Verdict = 'ok' | 'gone' | 'not_an_image' | 'transient';

/* HEAD first. Some CDNs refuse HEAD with 405 and answer GET, so that case
   falls through rather than being read as a dead link. */
async function probe(url: string, attemptNo = 1): Promise<{ verdict: Verdict; status?: number; type?: string; why?: string }> {
  const attempt = async (method: 'HEAD' | 'GET') => {
    const r = await fetch(url, {
      method,
      headers: { 'User-Agent': AGENT, Accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return r;
  };

  /* One retry on a transient answer, after a pause and a re-pace. */
  const again = async (v: { verdict: Verdict; status?: number; type?: string; why?: string }) => {
    if (v.verdict !== 'transient' || attemptNo > 1) return v;
    await new Promise(res => setTimeout(res, 2500));
    await pace(url);
    return probe(url, attemptNo + 1);
  };

  try {
    let r = await attempt('HEAD');
    if (r.status === 405 || r.status === 501) r = await attempt('GET');

    if (r.status === 404 || r.status === 410 || r.status === 403) {
      return { verdict: 'gone', status: r.status };
    }
    /* 429 is never a dead link: it means we asked too fast. Fresh Commons
       thumbnails 429 on first render. */
    if (!r.ok) return again({ verdict: 'transient', status: r.status, why: `http ${r.status}` });

    const type = r.headers.get('content-type') ?? '';
    /* An HTML body where an image should be is a soft-404 or a login
       wall — common on venue CMSes, and it renders as a broken frame. */
    if (!type.startsWith('image/')) return { verdict: 'not_an_image', status: r.status, type };

    return { verdict: 'ok', status: r.status, type };
  } catch (e) {
    /* Timeout, DNS, TLS — transient, with the reason recorded. */
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return again({ verdict: 'transient', why: msg.slice(0, 120) });
  }
}

/* One verdict per distinct URL per run, shared across both tables: picks
   borrow their venue's photo. A batch memo, not a cache. */
const seenThisRun = new Map<string, Awaited<ReturnType<typeof probe>>>();

/* Per-host pacing: serial, roughly one a second (Wikimedia's ask). The
   sweep is weekly, so wall clock is free and being throttled is not. */
const HOST_GAP_MS: Record<string, number> = { 'upload.wikimedia.org': 1100, 'commons.wikimedia.org': 1100 };
const DEFAULT_GAP_MS = 250;
const lastHit = new Map<string, number>();

async function pace(url: string) {
  let host = '';
  try { host = new URL(url).hostname; } catch { return; }
  const gap = HOST_GAP_MS[host] ?? DEFAULT_GAP_MS;
  const wait = gap - (Date.now() - (lastHit.get(host) ?? 0));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

async function probeOnce(url: string) {
  const hit = seenThisRun.get(url);
  if (hit) return hit;
  await pace(url);
  const r = await probe(url);
  seenThisRun.set(url, r);
  return r;
}

async function sweep(table: 'venues' | 'picks', limit: number, dryRun: boolean) {
  let q = db.from(table)
    .select('id, image_url')
    .not('image_url', 'is', null)
    .order('image_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (table === 'picks') q = q.is('archived_at', null);

  const { data: rows, error } = await q;
  if (error) return { table, ok: false, error: error.message };
  if (!rows?.length) return { table, ok: true, checked: 0 };

  const now = new Date().toISOString();
  const verified: string[] = [];
  const removed: Array<{ id: string; status?: number; why: Verdict }> = [];
  let transient = 0;

  const touched: string[] = [];
  const transientWhy: Record<string, number> = {};
  for (const row of rows as Array<{ id: string; image_url: string }>) {
    const r = await probeOnce(row.image_url);
    if (r.verdict === 'ok') { verified.push(row.id); continue; }
    if (r.verdict === 'transient') {
      const key = r.why ?? 'unknown';
      transientWhy[key] = (transientWhy[key] ?? 0) + 1;
      /* Stamped even though it failed: the queue is ordered by
         image_checked_at NULLS FIRST, so a URL that always times out would
         otherwise sit at its head and starve every row behind it. */
      transient++; touched.push(row.id); continue;
    }
    removed.push({ id: row.id, status: r.status, why: r.verdict });
  }

  if (!dryRun) {
    const stamp = [...verified, ...touched];
    if (stamp.length) {
      await db.from(table).update({ image_checked_at: now }).in('id', stamp);
    }
    if (removed.length) {
      /* Clear the provenance too. A row with an image_source and no
         image reads, in the audit view, as a mechanism that produced
         nothing — which is not what happened. */
      await db.from(table)
        .update({ image_url: null, image_attr: null, image_source: null, image_checked_at: now })
        .in('id', removed.map(r => r.id));
    }
  }

  console.log(`[verify-images] ${table} checked=${rows.length} ok=${verified.length} removed=${removed.length} transient=${transient}`);
  return {
    table, ok: true, dry_run: dryRun,
    checked: rows.length, verified: verified.length,
    removed: removed.length, transient, transientWhy,
    removedDetail: removed.slice(0, 20),
  };
}

/* Duplicates: one photograph standing in for several venues.
   enrich-venue-images refuses them on write; this sweep catches any that
   arrive by another route. The FIRST holder keeps it. Venues only — picks
   share their venue's photo by design. */
async function dedupe(dryRun: boolean) {
  const { data: rows } = await db
    .from('venues')
    .select('id, image_url')
    .not('image_url', 'is', null)
    .order('id', { ascending: true });

  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const r of (rows ?? []) as Array<{ id: string; image_url: string }>) {
    if (seen.has(r.image_url)) dupes.push(r.id);
    else seen.add(r.image_url);
  }
  if (dupes.length && !dryRun) {
    await db.from('venues')
      .update({ image_url: null, image_attr: null, image_source: null })
      .in('id', dupes);
  }
  return { duplicatesCleared: dupes.length };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  let table = 'both', limit = BATCH, dryRun = false;
  try {
    const b = await req.json().catch(() => ({}));
    if (b.table) table = String(b.table);
    if (b.limit) limit = Math.min(Number(b.limit), 200);
    if (b.dry_run === true) dryRun = true;
  } catch (_) { /**/ }

  seenThisRun.clear();
  lastHit.clear();
  const reports = [];
  if (table === 'venues' || table === 'both') reports.push(await sweep('venues', limit, dryRun));
  if (table === 'picks'  || table === 'both') reports.push(await sweep('picks',  limit, dryRun));
  const dd = await dedupe(dryRun);

  return new Response(JSON.stringify({ dry_run: dryRun, tables: reports, ...dd }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
