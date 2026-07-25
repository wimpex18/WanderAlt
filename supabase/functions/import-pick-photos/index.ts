import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// import-pick-photos v1  (one-shot migration, Jul 2026)
//
// Copies the still-alive Google Places CDN photos referenced by
// picks.image_url into the Supabase `pick-images` storage bucket and
// repoints image_url at the stable public URL. Google's resolved
// place-photos URIs expire (measured 22/32 already 403), so the ~10 that
// still resolve are salvaged onto our own storage before they decay too.
//
// - Reads active picks whose image_url is a googleusercontent.com URL.
// - Dedupes by URL (many picks share one venue photo -> one object).
// - Content-addressed object name = sha256(url)[:16].<ext>, x-upsert.
// - Repoints only rows STILL on a googleusercontent URL (idempotent).
//
// SAFETY: dry_run defaults TRUE - an empty/accidental POST does nothing.
// Pass {"dry_run": false} to actually write. Invoked manually once; not a
// cron (zero-spend posture). Safe to delete after the migration.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'pick-images';

const sb = (extra: Record<string, string> = {}) => ({
  apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra,
});
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), {
  status: s, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
});

async function sha16(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    }});
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  let body: { dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body -> dry run */ }
  const dryRun = body.dry_run !== false;

  const listUrl = `${SUPABASE_URL}/rest/v1/picks` +
    `?archived_at=is.null&image_url=like.*googleusercontent.com*&select=id,image_url&order=id.asc`;
  const res = await fetch(listUrl, { headers: sb() });
  if (!res.ok) return json({ ok: false, stage: 'list', status: res.status, error: await res.text() }, 500);
  const picks = await res.json() as Array<{ id: string; image_url: string }>;

  const byUrl = new Map<string, string[]>();
  for (const p of picks) {
    const ids = byUrl.get(p.image_url) ?? [];
    ids.push(p.id);
    byUrl.set(p.image_url, ids);
  }

  const results: Array<Record<string, unknown>> = [];
  let uploaded = 0, repointed = 0, failed = 0;

  for (const [url, ids] of byUrl) {
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) { failed++; results.push({ url: url.slice(0, 60), ids, status: `fetch_${imgRes.status}` }); continue; }
      const ct  = imgRes.headers.get('content-type') ?? 'image/jpeg';
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      const name = `${await sha16(url)}.${ext}`;
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`;

      if (dryRun) { results.push({ url: url.slice(0, 60), ids, bytes: bytes.length, would_store: name, dry_run: true }); continue; }

      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
        method: 'POST', headers: sb({ 'Content-Type': ct, 'x-upsert': 'true' }), body: bytes,
      });
      if (!upRes.ok) { failed++; results.push({ url: url.slice(0, 60), ids, status: `upload_${upRes.status}`, error: (await upRes.text()).slice(0, 150) }); continue; }
      uploaded++;

      const idList = ids.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/picks?id=in.(${idList})&image_url=like.*googleusercontent.com*`,
        { method: 'PATCH', headers: sb({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({ image_url: publicUrl }) },
      );
      if (!patchRes.ok) { failed++; results.push({ url: url.slice(0, 60), ids, status: `patch_${patchRes.status}`, error: (await patchRes.text()).slice(0, 150) }); continue; }
      repointed += ids.length;
      results.push({ url: url.slice(0, 60), ids, status: 'ok', stored: name, picks: ids.length });
    } catch (e) {
      failed++; results.push({ url: url.slice(0, 60), ids, status: 'exception', error: String(e).slice(0, 150) });
    }
  }

  return json({ ok: true, dry_run: dryRun, distinct_urls: byUrl.size, uploaded, repointed, failed, results });
});
