/* generate-context v11 — Groq-primary, Gemini fallback

   v11 (cost policy): Groq llama-4-scout is now PRIMARY; Gemini
   gemini-2.5-flash-lite is the FALLBACK only when Groq is
   unavailable (missing key / 429 / 5xx). The “why this matters”
   blurb is plain editorial text generation that Groq handles well,
   and Groq's free tier means this function costs ~€0 in the normal
   case. Per CLAUDE.md: use the free model when possible, Gemini only
   when nothing else works.

   v10: dropped Search grounding + downgraded to gemini-2.5-flash-lite
   (grounding was the primary cost driver). Kept as the fallback model. */

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_SRV  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI  = Deno.env.get('GEMINI_API_KEY') ?? '';
const GROQ    = Deno.env.get('GROQ_API_KEY') ?? '';
// OpenRouter free lane — inert until OPENROUTER_API_KEY exists (Jul 2026 policy).
const OPENROUTER_KEY   = Deno.env.get('OPENROUTER_API_KEY');
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') || 'meta-llama/llama-3.3-70b-instruct:free';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GROQ_MODEL   = 'meta-llama/llama-4-scout-17b-16e-instruct';
const INTER_PICK_DELAY_MS = 800;

const sbFetch = (path: string, opts: RequestInit = {}) =>
  fetch(`${SB_URL}${path}`, {
    ...opts,
    headers: {
      apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`,
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string,string> ?? {}),
    },
  });

interface Pick {
  id: string; title: string; venue: string;
  neighborhood: string; kind: string;
  quote: string; handle: string; bio: string;
}

const enrichWithBio = async (rows: Omit<Pick,'bio'>[]): Promise<Pick[]> => {
  if (!rows.length) return [];
  const handles = [...new Set(rows.map((r: Omit<Pick,'bio'>) => r.handle))];
  const q = handles.map(h => `handle.eq.${encodeURIComponent(h)}`).join(',');
  const cr = await sbFetch(`/rest/v1/curators?or=(${q})&select=handle,bio,tagline`);
  const curators: Record<string, string> = {};
  if (cr.ok) {
    for (const c of await cr.json()) curators[c.handle] = [c.bio, c.tagline].filter(Boolean).join(' ');
  }
  return rows.map((r: Omit<Pick,'bio'>) => ({ ...r, bio: curators[r.handle] ?? '' }));
};

const fetchPicks = async (id: string|null, limit: number): Promise<Pick[]> => {
  if (id) {
    const r = await sbFetch(`/rest/v1/picks?id=eq.${encodeURIComponent(id)}&select=id,title,venue,neighborhood,kind,quote,handle&limit=1`);
    if (!r.ok) return [];
    return enrichWithBio(await r.json());
  }
  const r = await sbFetch(`/rest/v1/picks?context_md=is.null&archived_at=is.null&select=id,title,venue,neighborhood,kind,quote,handle&limit=${limit}&order=created_at.desc`);
  if (!r.ok) return [];
  return enrichWithBio(await r.json());
};

const buildPrompt = (pick: Pick): string => [
  `You are writing the \"Why this matters\" section for WanderAlt, an editorial guide to alternative culture in Tallinn.`,
  ``,
  `Write exactly 2 short paragraphs (3-4 sentences each) about why someone should go to this pick.`,
  `Write in the voice of the curator who recommended it — knowledgeable, personal, not promotional.`,
  `Draw on what you know about ${pick.venue} and this kind of ${pick.kind} space; ground the prose in real detail, never invented facts.`,
  `No em-dashes. No exclamation marks. No \"discover\". No marketing language. Do not quote or paraphrase venue marketing copy.`,
  `Read like a back-page newsletter, not a travel blog.`,
  ``,
  `Pick: ${pick.title}`,
  `Venue: ${pick.venue} (${pick.neighborhood}, ${pick.kind})`,
  `Curator quote: \"${pick.quote}\"`,
  pick.bio ? `Curator ${pick.handle}: ${pick.bio}` : `Curator: ${pick.handle}`,
  ``,
  `Output only the two paragraphs, no heading, no intro, no sign-off.`,
].join('\n');

/* Groq (primary) — returns text or null on any failure. */
const callGroq = async (prompt: string): Promise<string|null> => {
  if (!GROQ) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75,
        max_tokens: 400,
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.choices?.[0]?.message?.content?.trim() || null;
  } catch { return null; }
};

/* Gemini (fallback only). */
const callOpenRouter = async (prompt: string): Promise<string|null> => {
  if (!OPENROUTER_KEY) return null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://wanderalt.app',
        'X-Title': 'WanderAlt pipeline',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.choices?.[0]?.message?.content ?? null;
  } catch { return null; }
};

const callGemini = async (prompt: string): Promise<string|null> => {
  if (!GEMINI) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, maxOutputTokens: 400 },
        }),
      }
    );
    if (!res.ok) return null;
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch { return null; }
};

/* Groq first; then the OpenRouter :free lane (inert without its key); Gemini last. */
const generate = async (prompt: string): Promise<{ text: string|null; provider: string }> => {
  const g = await callGroq(prompt);
  if (g) return { text: g, provider: 'groq' };
  const o = await callOpenRouter(prompt);
  if (o) return { text: o, provider: 'openrouter' };
  const m = await callGemini(prompt);
  if (m) return { text: m, provider: 'gemini' };
  return { text: null, provider: 'none' };
};

const saveContext = async (id: string, context_md: string): Promise<boolean> => {
  const r = await sbFetch(`/rest/v1/picks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ context_md }) });
  return r.ok || r.status === 204;
};

Deno.serve(async (req: Request) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const specificId = body.id as string|undefined;
  const limit      = Math.min(Number(body.limit ?? 20), 50);

  const picks = await fetchPicks(specificId ?? null, limit);
  if (!picks.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0, skipped: 0, errors: [], gemini_calls: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  let processed = 0, skipped = 0, geminiCalls = 0;
  const errors: string[] = [];

  for (const pick of picks) {
    const { text, provider } = await generate(buildPrompt(pick));
    if (provider === 'gemini') geminiCalls++;
    if (!text) { skipped++; errors.push(`${pick.id}: no LLM output`); }
    else {
      const saved = await saveContext(pick.id, text);
      if (saved) processed++; else errors.push(`${pick.id}: DB write failed`);
    }
    if (picks.indexOf(pick) < picks.length - 1)
      await new Promise(r => setTimeout(r, INTER_PICK_DELAY_MS));
  }

  return new Response(JSON.stringify({ ok: true, processed, skipped, errors, gemini_calls: geminiCalls }), { headers: { 'Content-Type': 'application/json' } });
});
