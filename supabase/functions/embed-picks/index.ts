import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ---------------------------------------------------------------------------
// embed-picks  v1
// Generates 768-dim embeddings for picks via Google text-embedding-005,
// upserts into pick_embeddings. Used by the hybrid-search retriever.
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
const GEMINI_KEY   = Deno.env.get('GEMINI_API_KEY')!;

// Embedding model — 2026 default, 768-dim, same Gemini key
// Try the newest first, fall back to older if not available
const EMBEDDING_MODELS = (Deno.env.get('GEMINI_EMBED_MODEL') || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const MODEL_CHAIN = EMBEDDING_MODELS.length
  ? EMBEDDING_MODELS
  : ['gemini-embedding-001', 'text-embedding-005', 'text-embedding-004'];
const EMBED_DIM = 768;

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

async function embedOne(text: string, model: string): Promise<{ ok: true; vec: number[]; model: string } | { ok: false; status: number; body: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${GEMINI_KEY}`;
  // gemini-embedding-001 supports outputDimensionality; older models ignore it
  const body: Record<string, unknown> = {
    content:  { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
  };
  if (model === 'gemini-embedding-001') {
    body.outputDimensionality = EMBED_DIM;
  }
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const respBody = await res.text().catch(() => '');
    return { ok: false, status: res.status, body: respBody.slice(0, 300) };
  }
  const j   = await res.json();
  const vec = j?.embedding?.values;
  if (!Array.isArray(vec) || vec.length !== EMBED_DIM) {
    return { ok: false, status: 0, body: `bad vector shape: ${Array.isArray(vec) ? vec.length : typeof vec}` };
  }
  return { ok: true, vec, model };
}

// Walk the model chain — return as soon as one works, accumulate errors otherwise
async function embedWithFallback(text: string): Promise<{ vec: number[]; model: string } | { errors: string[] }> {
  const errs: string[] = [];
  for (const model of MODEL_CHAIN) {
    const r = await embedOne(text, model);
    if (r.ok) return { vec: r.vec, model: r.model };
    errs.push(`${model}:${r.status}:${r.body.slice(0, 100)}`);
    // Bail out on auth errors — same key will fail on every model
    if (r.status === 401 || r.status === 403) break;
  }
  console.error(`embed chain exhausted: ${errs.join(' | ')}`);
  return { errors: errs };
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

  // Build the picks query
  let picksUrl =
    `${SUPABASE_URL}/rest/v1/picks?city=eq.${encodeURIComponent(city)}&archived_at=is.null` +
    `&select=id,title,venue,neighborhood,kind,quote,mood_tags`;

  if (body.pick_id) {
    picksUrl += `&id=eq.${encodeURIComponent(body.pick_id)}`;
  } else if (!force) {
    // Get already-embedded ids — diff client-side
    const existingRes  = await fetch(
      `${SUPABASE_URL}/rest/v1/pick_embeddings?select=pick_id&limit=1000`,
      { headers: sbHeaders() }
    );
    const existing = (await existingRes.json()) as { pick_id: string }[];
    const skipIds  = new Set(existing.map(r => r.pick_id));

    if (skipIds.size) {
      // PostgREST IN filter — escape ids that contain commas/quotes
      const ids = [...skipIds].map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
      picksUrl += `&id=not.in.(${ids})`;
    }
  }
  picksUrl += `&limit=${limit}`;

  const picksRes = await fetch(picksUrl, { headers: sbHeaders() });
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
  let usedModel = MODEL_CHAIN[0];

  for (const p of picks) {
    const text   = buildEmbeddingText(p);
    const result = await embedWithFallback(text);
    if ('errors' in result) {
      errors.push(`${p.id} → ${result.errors[0] || 'unknown'}`);
      continue;
    }
    usedModel = result.model;

    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/pick_embeddings`, {
      method:  'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        pick_id:       p.id,
        embedding:     vecLiteral(result.vec),
        embedded_text: text,
        model:         result.model,
        updated_at:    new Date().toISOString(),
      }),
    });
    if (upsertRes.ok) {
      embedded++;
    } else {
      const errBody = await upsertRes.text().catch(() => '');
      errors.push(`${p.id}: ${upsertRes.status} ${errBody.slice(0, 100)}`);
    }
    await sleep(50);
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
    model:     usedModel,
    samples:   errors.slice(0, 3),
  }), { headers: { 'Content-Type': 'application/json' } });
});
