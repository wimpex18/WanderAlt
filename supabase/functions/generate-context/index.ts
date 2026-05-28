/* generate-context v10 — gemini-2.5-flash-lite, no Search grounding

   v10: drops Search grounding and downgrades from gemini-3.5-flash to
   gemini-2.5-flash-lite. Grounding was the primary cost driver ($14/1K
   queries, each request triggered multiple internal searches). Ungrounded
   Flash-Lite ($0.10/$0.40 per 1M tokens) produces equivalent 2-paragraph
   context blurbs for this use case at ~22× lower output cost. */

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_SRV  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI  = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
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
  `You are writing the "Why this matters" section for WanderAlt, an editorial guide to alternative culture in Tallinn.`,
  ``,
  `Write exactly 2 short paragraphs (3-4 sentences each) about why someone should go to this pick.`,
  `Write in the voice of the curator who recommended it — knowledgeable, personal, not promotional.`,
  `Draw on what you know about ${pick.venue} and this kind of ${pick.kind} space; ground the prose in real detail, never invented facts.`,
  `No em-dashes. No exclamation marks. No "discover". No marketing language. Do not quote or paraphrase venue marketing copy.`,
  `Read like a back-page newsletter, not a travel blog.`,
  ``,
  `Pick: ${pick.title}`,
  `Venue: ${pick.venue} (${pick.neighborhood}, ${pick.kind})`,
  `Curator quote: "${pick.quote}"`,
  pick.bio ? `Curator ${pick.handle}: ${pick.bio}` : `Curator: ${pick.handle}`,
  ``,
  `Output only the two paragraphs, no heading, no intro, no sign-off.`,
].join('\n');

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
    return new Response(JSON.stringify({ ok: true, processed: 0, skipped: 0, errors: [] }), { headers: { 'Content-Type': 'application/json' } });
  }

  let processed = 0, skipped = 0;
  const errors: string[] = [];

  for (const pick of picks) {
    const text = await callGemini(buildPrompt(pick));
    if (!text) { skipped++; errors.push(`${pick.id}: Gemini returned nothing`); }
    else {
      const saved = await saveContext(pick.id, text);
      if (saved) processed++; else errors.push(`${pick.id}: DB write failed`);
    }
    if (picks.indexOf(pick) < picks.length - 1)
      await new Promise(r => setTimeout(r, INTER_PICK_DELAY_MS));
  }

  return new Response(JSON.stringify({ ok: true, processed, skipped, errors }), { headers: { 'Content-Type': 'application/json' } });
});
