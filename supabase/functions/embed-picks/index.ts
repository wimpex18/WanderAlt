import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ---------------------------------------------------------------------------
// embed-picks  v4 — Cloudflare Workers AI bge-m3 (Jul 2026)
// Generates 1024-dim embeddings via @cf/baai/bge-m3 (free 10k neurons/day;
// the owner revoked the Google key, closing the last Google dependency),
// upserts into pick_embeddings. Used by the hybrid-search retriever.
// v3 fixed the anti-join outage; v4 swaps the provider + batches requests.
//
// POST body:
//   { city?: string, force?: boolean, limit?: number, pick_id?: string }
//
// - default: embed picks in `city` (default tallinn) that have no embedding yet
// - force: re-embed all picks even if they have one
// - pick_id: embed a single pick (used by triggers)
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CF_ACCOUNT   = Deno.env.get('CF_ACCOUNT_ID')!;
const CF_TOKEN     = Deno.env.get('CF_AI_TOKEN')!;

const EMBED_MODEL = '@cf/baai/bge-m3';
const EMBED_DIM   = 1024;
const BATCH       = 25;   // texts per Workers AI request

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const sbHeaders = (extra: Record<string, string> = {}) => ({
  apikey:         SERVICE_KEY,
  Authorization:  `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

interface Pick {
  id:           string;
  title:        string;
  venue:        string;
  neighborhood: string;
  kind:         string;
  quote:        string;
  mood_tags:    string[] | null;
}

// Compose the document text that gets embedded.
// Order intentional: factual identity first, voice last so cosine matches
// both "where" and "feel" queries.
const buildEmbeddingText = (p: Pick): string =>
  [
    p.title,
    p.venue,
    p.neighborhood,
    p.kind,
    p.quote,
    (p.mood_tags || []).join(' '),
  ].filter(Boolean).join(' · ');

// Embed a batch of texts in one Workers AI call. Returns vectors in input
// order, or null on failure (the whole batch is retried next run — the
// anti-join makes every run incremental).
async function cfEmbedBatch(texts: string[]): Promise<number[][] | null> {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${EMBED_MODEL}`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: texts }),
      },
    );
    if (!res.ok) {
      console.error(`workers-ai embed failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const j    = await res.json();
    const data = j?.result?.data;
    if (!Array.isArray(data) || data.length !== texts.length ||
        data.some((v: unknown) => !Array.isArray(v) || (v as number[]).length !== EMBED_DIM)) {
      console.error(`workers-ai bad shape: ${Array.isArray(data) ? data.length : typeof data}`);
      return null;
    }
    return data as number[][];
  } catch (e) {
    console.error('workers-ai embed exception', e);
    return null;
  }
}

// pgvector accepts the literal form "[0.1,0.2,...]" via REST.
const vecLiteral = (v: number[]): string => `[${v.join(',')}]`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  let body: { city?: string; force?: boolean; limit?: number; pick_id?: string } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const city  = (body.city || 'tallinn').toLowerCase();
  const force = body.force === true;
  const limit = Math.min(body.limit ?? 100, 200);

  // Fetch the picks to embed. The not-yet-embedded set comes from a DB-side
  // anti-join RPC — the old client-side diff passed every embedded id back
  // as one giant id=not.in.(...) URL filter, which blew the HTTP/2 header
  // limit past ~500 embeddings and 500'd every run (Jun–Jul 2026 outage).
  let picksRes: Response;
  if (body.pick_id) {
    picksRes = await fetch(
      `${SUPABASE_URL}/rest/v1/picks?city=eq.${encodeURIComponent(city)}&archived_at=is.null` +
      `&select=id,title,venue,neighborhood,kind,quote,mood_tags&id=eq.${encodeURIComponent(body.pick_id)}&limit=${limit}`,
      { headers: sbHeaders() });
  } else if (force) {
    picksRes = await fetch(
      `${SUPABASE_URL}/rest/v1/picks?city=eq.${encodeURIComponent(city)}&archived_at=is.null` +
      `&select=id,title,venue,neighborhood,kind,quote,mood_tags&limit=${limit}`,
      { headers: sbHeaders() });
  } else {
    picksRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wa_picks_missing_embeddings`, {
      method:  'POST',
      headers: sbHeaders(),
      body:    JSON.stringify({ p_city: city, p_limit: limit }),
    });
  }
  if (!picksRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: `picks query failed: ${picksRes.status}` }), { status: 500 });
  }
  const picks = await picksRes.json() as Pick[];

  if (!Array.isArray(picks) || picks.length === 0) {
    return new Response(JSON.stringify({ ok: true, embedded: 0, message: 'nothing to do' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let embedded = 0;
  const errors: string[] = [];

  for (let i = 0; i < picks.length; i += BATCH) {
    const chunk = picks.slice(i, i + BATCH);
    const vecs  = await cfEmbedBatch(chunk.map(buildEmbeddingText));
    if (!vecs) {
      errors.push(`batch ${i / BATCH}: workers-ai failed (${chunk.length} picks deferred)`);
      continue;
    }
    for (let k = 0; k < chunk.length; k++) {
      const p = chunk[k];
      const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/pick_embeddings`, {
        method:  'POST',
        headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({
          pick_id:       p.id,
          embedding:     vecLiteral(vecs[k]),
          embedded_text: buildEmbeddingText(p),
          model:         EMBED_MODEL,
          updated_at:    new Date().toISOString(),
        }),
      });
      if (upsertRes.ok) embedded++;
      else {
        const errBody = await upsertRes.text().catch(() => '');
        errors.push(`${p.id}: ${upsertRes.status} ${errBody.slice(0, 100)}`);
      }
    }
    await sleep(150);
  }

  // Log the run (best-effort)
  await fetch(`${SUPABASE_URL}/rest/v1/ingest_log`, {
    method:  'POST',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      fn:          'embed-picks',
      status:      errors.length ? 'partial' : 'ok',
      inserted:    embedded,
      rejected:    errors.length,
      error:       errors.length ? errors.slice(0, 3).join(' | ') : null,
      finished_at: new Date().toISOString(),
    }),
  }).catch(() => {});

  return new Response(JSON.stringify({
    ok:        true,
    embedded,
    errors:    errors.length,
    total:     picks.length,
    model:     EMBED_MODEL,
    samples:   errors.slice(0, 3),
  }), { headers: { 'Content-Type': 'application/json' } });
});
