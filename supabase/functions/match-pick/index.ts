import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// match-pick  v5  —  hybrid AI search
//
// 4-stage pipeline:
//   1. Cache check (match_cache, SWR semantics)
//   2. Intent classifier (regex fast-path | hybrid)
//   3. Hybrid retrieval (search_picks_hybrid RPC: BM25 + cosine RRF)
//   4. LLM rerank (Groq Llama 4 Scout → Llama 3.3-70B fallback)
//
// POST body:
//   { city: 'tallinn'|'helsinki'|'riga',
//     prompt: string,
//     mode?: 'find_many' (default, top 5) | 'find_one',
//     bypass_cache?: boolean }
//
// Response (backward-compatible — `pick` is the top hit):
//   { ok: true,
//     hits: [{ pick, why }, ...],
//     pick: { ..., why } | null,    // first hit, for v4 callers
//     classifier: 'sql' | 'hybrid' | 'bm25_only',
//     suggested_more: boolean,       // hint to call discover-venues
//     cached: boolean,
//     latency_ms: number }
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GROQ_KEY     = Deno.env.get('GROQ_API_KEY') ?? '';
const GEMINI_KEY   = Deno.env.get('GEMINI_API_KEY') ?? '';

const EMBED_MODEL  = 'gemini-embedding-001';
const GROQ_MODELS  = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
];

const ALLOWED_CITIES = new Set(['tallinn', 'helsinki', 'riga']);

// SWR: 1 h fresh, 24 h max-age
const STALE_AFTER_MS  =  60 * 60 * 1000;
const EXPIRE_AFTER_MS = 24 * 60 * 60 * 1000;

// ----- helpers --------------------------------------------------------------

const sbHeaders = (extra: Record<string, string> = {}) => ({
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type':'application/json',
  ...extra,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':'application/json',
      'Access-Control-Allow-Origin':'*',
    },
  });

const normalizePrompt = (p: string): string =>
  p.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[!?.;]+$/, '');

// Normalize a taste object into a stable string so {energy:'loud',company:'solo'}
// and {company:'solo',energy:'loud'} produce the same cache key.
function normalizeTaste(t: Record<string, string> | undefined): string {
  if (!t || typeof t !== 'object') return '';
  return Object.keys(t).sort().map(k => `${k}:${t[k]}`).join(',');
}

async function queryHash(
  city: string, prompt: string, mode: string,
  taste: Record<string, string> | undefined, curatedOnly: boolean,
): Promise<string> {
  const key  = `${city}|${mode}|${normalizePrompt(prompt)}|${normalizeTaste(taste)}|${curatedOnly ? '1' : '0'}`;
  const data = new TextEncoder().encode(key);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ----- intent classifier ----------------------------------------------------
// Recognises three "fast path" shapes:
//   single curator handle      → exact-match SQL
//   single known neighborhood  → prefix-match SQL
//   single day word            → exact-match SQL
// Anything else → hybrid retrieval.
type Intent =
  | { kind: 'sql'; handle?: string; neighborhood?: string; day?: string }
  | { kind: 'hybrid' };

const KNOWN_NEIGHBORHOODS = new Set([
  'kalamaja','telliskivi','vanalinn','kadriorg','pohja-tallinn','põhja-tallinn',
  'noblessner','rotermann','mustamäe','lasnamäe',
]);

const DAY_WORDS: Record<string, string> = {
  tonight:'Tonight', today:'Tonight',
  monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu',
  friday:'Fri', saturday:'Sat', sunday:'Sun',
  mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun',
};

function classifyIntent(prompt: string): Intent {
  const q = prompt.toLowerCase().trim();
  const words = q.split(/\s+/);

  // @handle exact match (1-2 words including @)
  if (words.length <= 2) {
    const h = q.match(/^@[\w._-]+$/);
    if (h) return { kind: 'sql', handle: h[0] };
  }

  if (words.length === 1) {
    if (KNOWN_NEIGHBORHOODS.has(words[0])) return { kind: 'sql', neighborhood: words[0] };
    if (DAY_WORDS[words[0]])               return { kind: 'sql', day: DAY_WORDS[words[0]] };
  }

  return { kind: 'hybrid' };
}

// ----- cache helpers --------------------------------------------------------
interface Cached { response: unknown; stale: boolean; }

async function getCached(hash: string): Promise<Cached | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/match_cache?query_hash=eq.${hash}` +
    `&select=response,stale_after,expire_after&limit=1`,
    { headers: sbHeaders() }
  );
  if (!r.ok) return null;
  const rows = await r.json() as Array<{ response: unknown; stale_after: string; expire_after: string }>;
  if (!rows.length) return null;
  const row = rows[0];
  const now = Date.now();
  if (new Date(row.expire_after).getTime() < now) return null;
  return { response: row.response, stale: new Date(row.stale_after).getTime() < now };
}

async function setCached(hash: string, normalized: string, city: string, response: unknown): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/match_cache`, {
    method:  'POST',
    headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body:    JSON.stringify({
      query_hash:       hash,
      query_normalized: normalized,
      city,
      response,
      created_at:       new Date().toISOString(),
      stale_after:      new Date(Date.now() + STALE_AFTER_MS).toISOString(),
      expire_after:     new Date(Date.now() + EXPIRE_AFTER_MS).toISOString(),
    }),
  }).catch(() => {});
}

// ----- query embedding ------------------------------------------------------
async function embedQuery(text: string): Promise<number[] | null> {
  if (!GEMINI_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      }),
    });
    if (!res.ok) {
      console.error(`embedQuery failed ${res.status}: ${(await res.text()).slice(0,120)}`);
      return null;
    }
    const j   = await res.json();
    const vec = j?.embedding?.values;
    return Array.isArray(vec) && vec.length === 768 ? vec : null;
  } catch (e) {
    console.error('embedQuery exception', e);
    return null;
  }
}

// ----- hybrid retrieval RPC -------------------------------------------------
async function hybridSearch(text: string, embedding: number[], city: string, limit = 20): Promise<string[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_picks_hybrid`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({
      query_text:      text,
      query_embedding: `[${embedding.join(',')}]`,
      target_city:     city,
      result_limit:    limit,
      include_pending: false,
    }),
  });
  if (!r.ok) return [];
  const rows = await r.json() as Array<{ pick_id: string }>;
  return rows.map(r => r.pick_id);
}

// ----- fetch full pick rows -------------------------------------------------
const PICK_COLS = [
  'id','title','venue','neighborhood','kind','quote','handle',
  'day','time','mood_tags','thumb_initials',
  'image_url','image_attr',
  'pin_num','pin_left','pin_top','pin_eyebrow','world_x','world_y',
  'tonight','this_week','pending_review','discovery_source',
].join(',');

interface PickRow {
  id: string; title: string; venue: string; neighborhood: string;
  kind: string; quote: string; handle: string;
  day: string|null; time: string|null;
  mood_tags: string[]|null; thumb_initials: string|null;
  image_url: string|null; image_attr: string|null;
  pin_num: number|null; pin_left: number|null; pin_top: number|null;
  pin_eyebrow: string|null; world_x: number|null; world_y: number|null;
  tonight: boolean; this_week: boolean;
  pending_review: boolean; discovery_source: string|null;
}

async function fetchPicks(ids: string[]): Promise<PickRow[]> {
  if (!ids.length) return [];
  const idList = ids.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/picks?id=in.(${idList})&select=${PICK_COLS}`,
    { headers: sbHeaders() }
  );
  if (!r.ok) return [];
  const rows = await r.json() as PickRow[];
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(id => byId.get(id)).filter((x): x is PickRow => !!x);
}

// ----- SQL fast path --------------------------------------------------------
async function sqlFastPath(
  intent: Extract<Intent, { kind: 'sql' }>, city: string, curatedOnly: boolean,
): Promise<PickRow[]> {
  const filters = [
    `city=eq.${encodeURIComponent(city)}`,
    'archived_at=is.null',
    'pending_review=eq.false',
  ];
  if (curatedOnly) {
    filters.push(`handle=neq.${encodeURIComponent('@discovery')}`);
  }
  if (intent.handle) {
    const cleaned = intent.handle.replace(/^@/, '');
    filters.push(`or=(handle.eq.@${encodeURIComponent(cleaned)},handle.eq.${encodeURIComponent(cleaned)})`);
  }
  if (intent.neighborhood) {
    filters.push(`neighborhood=ilike.${encodeURIComponent(intent.neighborhood)}%`);
  }
  if (intent.day) {
    filters.push(`day=eq.${encodeURIComponent(intent.day)}`);
  }
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/picks?${filters.join('&')}` +
    `&select=${PICK_COLS}&order=tonight.desc,sort_order.asc,created_at.asc&limit=20`,
    { headers: sbHeaders() }
  );
  if (!r.ok) return [];
  return r.json();
}

// ----- LLM rerank -----------------------------------------------------------
interface RerankHit { id: string; why: string; }

interface UserContext {
  taste?:        Record<string, string>;
  liked_ids?:    string[];
  disliked_ids?: string[];
  seen_ids?:     string[];
}

// Build the "User context" preamble for the rerank prompt. Empty string when
// the user has no taste profile and no feedback history.
function userContextBlock(ctx: UserContext, candidates: PickRow[]): string {
  const lines: string[] = [];
  if (ctx.taste && Object.keys(ctx.taste).length) {
    const labels = Object.entries(ctx.taste)
      .map(([axis, choice]) => `${axis}=${choice}`)
      .join(', ');
    lines.push(`Taste profile: ${labels}.`);
  }
  // Surface liked / disliked titles from the candidate pool (if any are present)
  const titleFor = new Map(candidates.map(p => [p.id, `${p.title} (${p.venue})`]));
  const likedHere    = (ctx.liked_ids    || []).filter(id => titleFor.has(id));
  const dislikedHere = (ctx.disliked_ids || []).filter(id => titleFor.has(id));
  if (likedHere.length) {
    lines.push(`User previously liked similar picks. Lean into what those share.`);
  }
  if (dislikedHere.length) {
    lines.push(`Avoid recommending these picks (user dismissed them): ${dislikedHere.map(id => titleFor.get(id)).join('; ')}.`);
  }
  if ((ctx.seen_ids || []).length) {
    lines.push(`Prefer fresh picks over ones the user has already seen recently.`);
  }
  return lines.length ? `\nUser context:\n${lines.join(' ')}\n` : '';
}

async function rerankGroq(
  prompt: string, candidates: PickRow[], topK: number, model: string, ctx: UserContext,
): Promise<RerankHit[] | null> {
  if (!GROQ_KEY) return null;
  const manifest = candidates.map((p, i) =>
    `${i + 1}. [${p.id}] ${p.title} · ${p.venue}, ${p.neighborhood} · ${p.kind}` +
    (p.day ? ` · ${p.day}${p.time ? ' ' + p.time : ''}` : '') +
    ` · "${(p.quote || '').slice(0, 100)}"` +
    (p.mood_tags?.length ? ` · [${p.mood_tags.join(', ')}]` : '')
  ).join('\n');

  const systemPrompt =
    `You are an editorial curator for WanderAlt — a guide to alternative culture.\n` +
    `Voice: a thoughtful local writing a back-page newsletter. Precise. Warm. Unhurried.\n\n` +
    `Pick up to ${topK} items from the candidate list that best match the user's wish.\n` +
    `Rank by resonance, not safety — the most fitting first.\n` +
    `Each item needs one sentence of 'why' in editorial voice. First person fine.\n` +
    `Rules: no marketing speak, no em-dashes, no exclamation marks, no "discover".\n` +
    `If fewer than ${topK} truly fit, return fewer — never pad.`;

  const userPrompt =
    `User wants: "${prompt}"` +
    userContextBlock(ctx, candidates) +
    `\nCandidates:\n${manifest}\n\n` +
    `Return JSON: {"hits":[{"id":"exact-id-from-list","why":"one sentence"}]}\n` +
    `IDs must be copied verbatim. Order = best fit first.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens:  1024,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      console.error(`rerank ${model} failed ${res.status}`);
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.hits)) return null;
    // Keep any hit with an ID; an empty `why` is acceptable (rank > prose)
    return parsed.hits
      .filter((h: { id?: string; why?: string }) => !!h.id)
      .map((h: { id: string; why?: string }) => ({ id: h.id, why: (h.why || '').trim() }))
      .slice(0, topK);
  } catch (e) {
    console.error(`rerank ${model} exception`, e);
    return null;
  }
}

async function rerankWithFallback(
  prompt: string, candidates: PickRow[], topK: number, ctx: UserContext,
): Promise<RerankHit[]> {
  for (const model of GROQ_MODELS) {
    const r = await rerankGroq(prompt, candidates, topK, model, ctx);
    if (r && r.length) return r;
  }
  return [];
}

// ----- response shaping -----------------------------------------------------
const toPick = (p: PickRow, why?: string) => ({
  id:               p.id,
  title:            p.title,
  venue:            p.venue,
  neighborhood:     p.neighborhood,
  kind:             p.kind,
  quote:            p.quote,
  handle:           p.handle,
  day:              p.day,
  time:             p.time,
  moodTags:         p.mood_tags || [],
  thumbInitials:    p.thumb_initials,
  imageUrl:         p.image_url,
  imageAttr:        p.image_attr,
  pin: p.pin_num != null
    ? { num: p.pin_num, left: p.pin_left, top: p.pin_top, eyebrow: p.pin_eyebrow }
    : null,
  world_x:          p.world_x,
  world_y:          p.world_y,
  tonight:          p.tonight,
  thisWeek:         p.this_week,
  pending:          p.pending_review,
  discoverySource:  p.discovery_source,
  ...(why ? { why } : {}),
});

// ============================================================
//  Main handler
// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      },
    });
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const t0 = Date.now();
  let body: {
    city?: string; prompt?: string; mode?: string; bypass_cache?: boolean;
    curated_only?: boolean;
    taste?: Record<string, string>;
    liked_ids?: string[]; disliked_ids?: string[]; seen_ids?: string[];
  } = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: 'invalid JSON' }, 400); }

  const city         = body.city && ALLOWED_CITIES.has(body.city) ? body.city : 'tallinn';
  const prompt       = (body.prompt || '').trim().slice(0, 400);
  const mode         = body.mode === 'find_one' ? 'find_one' : 'find_many';
  const topK         = mode === 'find_one' ? 1 : 5;
  const curatedOnly  = body.curated_only === true;
  const ctx: UserContext = {
    taste:        body.taste,
    liked_ids:    Array.isArray(body.liked_ids)    ? body.liked_ids.slice(0, 20)    : [],
    disliked_ids: Array.isArray(body.disliked_ids) ? body.disliked_ids.slice(0, 20) : [],
    seen_ids:     Array.isArray(body.seen_ids)     ? body.seen_ids.slice(0, 30)     : [],
  };

  if (!prompt) return json({ ok: false, error: 'prompt required' }, 400);

  const normalized = normalizePrompt(prompt);
  const hash       = await queryHash(city, prompt, mode, ctx.taste, curatedOnly);

  // ---- 1. Cache check ----
  if (!body.bypass_cache) {
    const cached = await getCached(hash);
    if (cached && !cached.stale) {
      let resp = cached.response as Record<string, unknown>;
      // Respect disliked_ids even on a cache hit: filter them out of hits.
      if (ctx.disliked_ids?.length && Array.isArray((resp as { hits?: unknown }).hits)) {
        const dislike = new Set(ctx.disliked_ids);
        const filtered = (resp.hits as Array<{ pick?: { id?: string } }>)
          .filter(h => !(h.pick?.id && dislike.has(h.pick.id)));
        resp = { ...resp, hits: filtered, pick: filtered[0]?.pick ?? null };
      }
      return json({ ...resp, cached: true, latency_ms: Date.now() - t0 });
    }
  }

  // ---- 2. Intent classification ----
  const intent = classifyIntent(prompt);

  let candidates: PickRow[] = [];
  let classifier: 'sql'|'hybrid'|'bm25_only' = 'hybrid';

  if (intent.kind === 'sql') {
    candidates = await sqlFastPath(intent, city, curatedOnly);
    classifier = 'sql';
  } else {
    // ---- 3. Hybrid retrieval ----
    const embedding = await embedQuery(prompt);
    if (embedding) {
      const ids = await hybridSearch(prompt, embedding, city, 20);
      candidates = await fetchPicks(ids);
    } else {
      // Embedding failure — fall back to BM25-only via PostgREST wfts
      classifier = 'bm25_only';
      const handleFilter = curatedOnly ? `&handle=neq.${encodeURIComponent('@discovery')}` : '';
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/picks?city=eq.${encodeURIComponent(city)}` +
        `&archived_at=is.null&pending_review=eq.false${handleFilter}` +
        `&search_vector=wfts.${encodeURIComponent(prompt)}` +
        `&select=${PICK_COLS}&limit=20`,
        { headers: sbHeaders() }
      );
      if (r.ok) candidates = await r.json();
    }
    // Post-filter for curated_only on the hybrid path (the RPC itself
    // doesn't know about it, so we strip @discovery hits here).
    if (curatedOnly) {
      candidates = candidates.filter(c => c.handle !== '@discovery');
    }
  }

  // Drop disliked picks before the rerank — saves tokens, respects the user.
  if (ctx.disliked_ids?.length) {
    const dislike = new Set(ctx.disliked_ids);
    candidates = candidates.filter(c => !dislike.has(c.id));
  }

  // ---- 4. LLM rerank ----
  let hits: Array<{ pick: ReturnType<typeof toPick>; why: string }> = [];

  if (candidates.length === 0) {
    const empty = {
      ok: true,
      hits: [],
      pick: null,
      classifier,
      suggested_more: true,
      empty: true,
    };
    await setCached(hash, normalized, city, empty);
    return json({ ...empty, cached: false, latency_ms: Date.now() - t0 });
  }

  if (intent.kind === 'sql' || candidates.length <= 2) {
    // SQL fast path or very small result set — skip the LLM
    hits = candidates.slice(0, topK).map(p => ({ pick: toPick(p), why: '' }));
  } else {
    const reranked = await rerankWithFallback(prompt, candidates, topK, ctx);
    const byId     = new Map(candidates.map(c => [c.id, c]));
    hits = reranked
      .map(r => {
        const c = byId.get(r.id);
        return c ? { pick: toPick(c, r.why), why: r.why } : null;
      })
      .filter((h): h is { pick: ReturnType<typeof toPick>; why: string } => !!h);

    // Rerank failure → fall back to the top-K from retrieval scoring
    if (hits.length === 0) {
      hits = candidates.slice(0, topK).map(p => ({ pick: toPick(p), why: '' }));
    }
  }

  const response = {
    ok: true,
    hits,
    // Backward-compat: surface the top hit on `pick` for v4 callers
    pick: hits[0] ? { ...hits[0].pick, why: hits[0].why } : null,
    classifier,
    suggested_more: hits.length < 3,
    empty: hits.length === 0,
    curated_only: curatedOnly,
  };

  await setCached(hash, normalized, city, response);
  return json({ ...response, cached: false, latency_ms: Date.now() - t0 });
});
