/* ============================================================
   WanderAlt — draft-column  v13
   v13: drops Search grounding, switches to gemini-2.5-flash-lite.
   Grounding was the primary cost driver ($14/1K queries). The
   weekly column draft quality is unaffected — the model's baseline
   knowledge of these cities is sufficient for a 140-word editorial.
   POST /functions/v1/draft-column  (verify_jwt: false)
   Body: {} or { city: "tallinn" }
   ============================================================ */

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_KEY       = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_MODEL     = 'gemini-2.5-flash-lite';

const CITIES = ['tallinn', 'helsinki', 'riga'];

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

const sbGet = async (table: string, qs: string): Promise<unknown[]> => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) throw new Error(`GET ${table} failed: ${r.status}`);
  return r.json();
};

const sbInsert = async (table: string, row: Record<string, unknown>): Promise<void> => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) { const msg = await r.text(); throw new Error(`INSERT ${table} failed: ${r.status} ${msg}`); }
};

const weekOf = (): string => {
  const now = new Date();
  const diff = now.getUTCDay() === 0 ? -6 : 1 - now.getUTCDay();
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return mon.toISOString().slice(0, 10);
};

const callGemini = async (prompt: string, _cityLabel: string): Promise<string> => {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 600 },
      }),
    }
  );
  if (!r.ok) { const err = await r.text(); throw new Error(`Gemini ${r.status}: ${err.slice(0, 300)}`); }
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
};

const draftForCity = async (
  city: string, week: string
): Promise<{ status: 'drafted' | 'skipped' | 'error'; curator_handle?: string; detail?: string }> => {

  const existing = await sbGet('columns', `city=eq.${city}&week_of=eq.${week}&status=in.(draft,published)&limit=1`);
  if ((existing as unknown[]).length > 0) return { status: 'skipped', detail: 'already exists' };

  const weekPicks = await sbGet('picks', `city=eq.${city}&this_week=eq.true&archived_at=is.null&select=handle`) as Array<{ handle: string }>;
  let curatorHandle = '';
  if (weekPicks.length > 0) {
    const counts: Record<string, number> = {};
    for (const p of weekPicks) counts[p.handle] = (counts[p.handle] || 0) + 1;
    curatorHandle = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  } else {
    const allPicks = await sbGet('picks', `city=eq.${city}&archived_at=is.null&select=handle`) as Array<{ handle: string }>;
    if (!allPicks.length) return { status: 'error', detail: 'no picks' };
    const counts: Record<string, number> = {};
    for (const p of allPicks) counts[p.handle] = (counts[p.handle] || 0) + 1;
    curatorHandle = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  const curators = await sbGet('curators', `handle=eq.${encodeURIComponent(curatorHandle)}&select=bio,tagline&limit=1`) as Array<{ bio?: string; tagline?: string }>;
  const curator = curators[0] || {};

  const recentPicks = await sbGet('picks',
    `city=eq.${city}&handle=eq.${encodeURIComponent(curatorHandle)}&archived_at=is.null&order=created_at.desc&limit=5&select=title,venue,neighborhood,kind,quote`
  ) as Array<{ title: string; venue: string; neighborhood: string; kind: string; quote: string }>;

  const pickLines = recentPicks.map(p => `• ${p.title} (${p.venue}, ${p.neighborhood}) — "${p.quote}"`).join('\n');
  const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);

  const prompt =
    `You are ${curatorHandle}, a cultural curator for WanderAlt ${cityLabel}.\n` +
    (curator.tagline ? `Your curatorial voice: ${curator.tagline}\n` : '') +
    (curator.bio     ? `About you: ${curator.bio}\n` : '') +
    `\nYour recent picks:\n${pickLines || '(no picks listed)'}\n\n` +
    `Write a short weekly column for WanderAlt ${cityLabel}.\n\n` +
    `Rules (follow exactly):\n` +
    `- Exactly 3 paragraphs, ~140 words total\n` +
    `- First-person voice, present tense, editorial tone\n` +
    `- Wrap the first paragraph in *asterisks* (it will be italicised)\n` +
    `- No em dashes, no exclamation marks, no word "discover"\n` +
    `- Write from knowledge of ${cityLabel}'s cultural character; reference the season and the city's general atmosphere.\n` +
    `- Talk about the city mood this week, not event listings\n` +
    `- Plain text output only\n\n` +
    `Output the three paragraphs separated by a blank line.`;

  let bodyMd: string;
  try { bodyMd = (await callGemini(prompt, cityLabel)).trim(); }
  catch (err) { return { status: 'error', detail: String(err) }; }
  if (!bodyMd) return { status: 'error', detail: 'empty Gemini response' };

  try { await sbInsert('columns', { curator_handle: curatorHandle, city, body_md: bodyMd, status: 'draft', week_of: week }); }
  catch (err) { return { status: 'error', detail: String(err) }; }

  try { await sbInsert('ingest_log', { fn: 'draft-column', status: 'ok', inserted: 1, rejected: 0 }); }
  catch (_) { /* non-fatal */ }

  return { status: 'drafted', curator_handle: curatorHandle };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { headers: CORS });
  if (req.method !== 'POST')
    return json({ error: 'POST only' }, 405);

  let targetCities = CITIES;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.city && CITIES.includes(body.city)) targetCities = [body.city];
  } catch (_) {}

  const week = weekOf();
  const drafted: unknown[] = [], skipped: unknown[] = [], errors: unknown[] = [];

  for (const city of targetCities) {
    try {
      const result = await draftForCity(city, week);
      if (result.status === 'drafted')      drafted.push({ city, ...result });
      else if (result.status === 'skipped') skipped.push({ city, ...result });
      else                                  errors.push({ city, ...result });
    } catch (err) { errors.push({ city, detail: String(err) }); }
  }

  return json({ ok: true, week, drafted, skipped, errors });
});
