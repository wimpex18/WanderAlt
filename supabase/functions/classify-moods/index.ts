// ============================================================
// WanderAlt — classify-moods  (v1)
// One-time backfill: reads all active picks with empty mood_tags
// and classifies them using Gemini Flash.
//
// Invocation: POST to /functions/v1/classify-moods (no body needed).
// Idempotent: only processes picks with mood_tags = '{}' or NULL.
// Processes up to 200 picks per call in batches of 20.
//
// Mood vocabulary (fixed — matches frontend mood-chips.js):
//   quiet · loud · indoors · outdoors · solo · social ·
//   drinks · sober · walk-up · ticketed
//
// Voice rules: No em-dashes in headlines. No exclamation marks.
// No 'discover'. No marketing voice. Read like a back-page newsletter.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY   = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.5-flash";
const BATCH_SIZE   = 20;   // picks per LLM call
const INTER_DELAY  = 1500; // ms between batches

const VALID_TAGS = new Set([
  "quiet", "loud", "indoors", "outdoors",
  "solo", "social", "drinks", "sober",
  "walk-up", "ticketed",
]);

// ── Prompt ────────────────────────────────────────────────────
const buildPrompt = (
  picks: Array<{ id: string; title: string; kind: string; quote: string; venue: string }>
): string => {
  const list = picks
    .map((p, i) =>
      `${i + 1}. id="${p.id}" title="${p.title}" venue="${p.venue}" kind="${p.kind}" quote="${p.quote}"`
    )
    .join("\n");

  return `You are classifying cultural picks for WanderAlt, an editorial guide to underground culture.

Classify each pick using these mood tags (choose 1-4 that honestly describe the feel):
  quiet     — focused, understated, listening or reading; the opposite of a crowded bar
  loud      — amplified sound, crowd energy, noise music
  indoors   — inside a building, controlled environment
  outdoors  — open-air, parks, architecture walks, street markets
  solo      — ideal to attend alone: lectures, exhibitions, record shopping
  social    — better with others: clubs, openings, group dinners, dance floors
  drinks    — a bar or event where drinking is central to the experience
  sober     — no alcohol emphasis: daytime, family, academic, focused cultural
  walk-up   — no advance ticket needed, just show up
  ticketed  — requires booking or a ticket purchase

Return ONLY a JSON array, one object per pick, in the same order:
[{"id":"...","tags":["tag1","tag2"]}, ...]

Do not include any explanation or text outside the JSON.

Picks:
${list}`;
};

// ── Gemini call with one retry on 429 ─────────────────────────
const callGemini = async (prompt: string): Promise<string> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  });
  const headers = { "Content-Type": "application/json" };

  let res = await fetch(url, { method: "POST", headers, body });
  if (res.status === 429) {
    await new Promise<void>((r) => setTimeout(r, 15_000));
    res = await fetch(url, { method: "POST", headers, body });
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
};

// ── JSON parse with fallback extraction ───────────────────────
const parseResults = (raw: string): Array<{ id: string; tags: string[] }> => {
  const tryParse = (s: string) => {
    try {
      const a = JSON.parse(s);
      return Array.isArray(a) ? a : null;
    } catch { return null; }
  };
  return (
    tryParse(raw) ??
    tryParse((raw.match(/```(?:json)?\s*([\s\S]+?)```/) || [])[1] || "") ??
    tryParse((raw.match(/(\[[\s\S]+\])/) || [])[1] || "") ??
    []
  );
};

// ── Main handler ──────────────────────────────────────────────
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default {
  async fetch(_req: Request): Promise<Response> {
    if (!GEMINI_KEY) return json({ ok: false, error: "GEMINI_API_KEY not set" }, 503);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Only process picks that haven't been tagged yet
    const { data: picks, error: fetchErr } = await sb
      .from("picks")
      .select("id, title, kind, quote, venue")
      .is("archived_at", null)
      .or("mood_tags.eq.{},mood_tags.is.null")
      .order("created_at", { ascending: true })
      .limit(200);

    if (fetchErr) return json({ ok: false, error: fetchErr.message }, 500);
    if (!picks?.length)
      return json({ ok: true, classified: 0, message: "All active picks already tagged" });

    let classified = 0;
    let failed     = 0;
    const errors: string[] = [];

    for (let i = 0; i < picks.length; i += BATCH_SIZE) {
      const batch = picks.slice(i, i + BATCH_SIZE);

      try {
        const raw     = await callGemini(buildPrompt(batch));
        const results = parseResults(raw);

        for (const r of results) {
          if (!r?.id || !Array.isArray(r.tags)) continue;
          const validTags = r.tags.filter((t: string) => VALID_TAGS.has(t));

          const { error: updateErr } = await sb
            .from("picks")
            .update({ mood_tags: validTags })
            .eq("id", r.id);

          if (updateErr) {
            errors.push(`update ${r.id}: ${updateErr.message}`);
          } else {
            classified++;
          }
        }

        // If Gemini returned fewer results than batch, mark unclassified ones failed
        if (results.length < batch.length) {
          failed += batch.length - results.length;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`batch ${i}: ${msg}`);
        failed += batch.length;
      }

      // Respect rate limits between batches
      if (i + BATCH_SIZE < picks.length) {
        await new Promise<void>((r) => setTimeout(r, INTER_DELAY));
      }
    }

    // Log summary to ingest_log
    await sb.from("ingest_log").insert({
      fn: "classify-moods",
      finished_at: new Date().toISOString(),
      status: failed === 0 ? "ok" : "partial",
      inserted: classified,
      rejected: failed,
      detail: { total: picks.length, classified, failed, errors: errors.slice(0, 20) },
    });

    return json({ ok: true, total: picks.length, classified, failed, errors: errors.slice(0, 5) });
  },
};
