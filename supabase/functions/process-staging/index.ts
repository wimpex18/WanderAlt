// ============================================================
// WanderAlt — process-staging  (v39)
// v39 changes vs v38 (ROADMAP P1):
//   • A city with no CITY_CONTEXT entry now FAILS LOUDLY (message
//     marked error with an actionable rejection) instead of silently
//     classifying against the Tallinn context — that silent degrade
//     bit twice (Vilnius, then Helsinki: ~1,900 misrejected messages).
//     Adding a city now hard-requires the context entry.
// v38 changes vs v37 (English-only app):
//   • LANGUAGE HANDLING hardened: 42 active picks had verbatim
//     Cyrillic titles despite the v34+ "output English" rule —
//     llama-4-scout copies source titles. The prompt now states the
//     hard requirement first, explains that event titles are
//     DESCRIPTIONS (not proper nouns) with concrete RU/ET examples,
//     and adds Polish/Ukrainian to the input list.
//   • Code-level compliance guard: after parsing, any pick whose
//     title/quote still contains Cyrillic gets ONE targeted batch
//     translation call (Groq) before upsert — picks are saved to
//     Supabase already in English. Fail-open: if the fix call fails,
//     the original text is kept (translate-picks backfills later).
//   • title_original: when the guard rewrites a title, the source
//     title is preserved in picks.title_original.
// v37 changes vs v36 (cost policy):
//   • Gemini fallback is now gated behind the pipeline_config flag
//     `gemini_fallback_enabled` (default true). Flip it to false in
//     one SQL statement to stop ALL Gemini spend fleet-wide without a
//     redeploy — rate-limited messages then just wait for the next
//     Groq window instead of billing Gemini. Insurance against a
//     runaway bill (the €12/May incident was the old grounded
//     generate-context, but this guards process-staging too).
//   • GEMINI_MODEL corrected to gemini-2.5-flash (we standardised on
//     2.5; 3.5 was never actually deployed here). 2.5-flash classifies
//     accurately without thinkingConfig.
//   In practice Groq (free) handles 100% of normal volume — over the
//   last 14 days process-staging made 0 Gemini calls — so this flag is
//   a safety valve, not a routine path.
// v36: CITY_CONTEXT gained `helsinki`. v35: gained `vilnius`.
// v34: Groq llama-4-scout primary, Gemini fallback.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY    = Deno.env.get("GEMINI_API_KEY");
const GROQ_KEY      = Deno.env.get("GROQ_API_KEY");
const GEMINI_MODEL  = "gemini-2.5-flash";
const GROQ_MODEL    = "meta-llama/llama-4-scout-17b-16e-instruct";
const BATCH_SIZE    = 10;   // max messages per invocation
const TIME_CAP_MS   = 100_000; // 100 s hard stop

const KINDS = "gig|talk|exhibition|club|place|bookshop|record store|gallery|thrift|lecture|noise|theatre|cinema|library|bar|museum|arts centre";

/* Mood vocabulary — must match mood-chips.js on the frontend. */
const VALID_MOOD_TAGS = new Set([
  "quiet", "loud", "indoors", "outdoors",
  "solo", "social", "drinks", "sober",
  "walk-up", "ticketed",
]);

const CITY_CONTEXT: Record<string, { name: string; neighborhoods: string }> = {
  tallinn: {
    name: "Tallinn",
    neighborhoods: "Kalamaja|Telliskivi|Vanalinn|Kadriorg|Pohja-Tallinn|other",
  },
  riga: {
    name: "Riga",
    neighborhoods: "Centrs|Quiet Centre|Āgenskalns|Mežaparks|Pārdaugava|Vecriga|other",
  },
  vilnius: {
    name: "Vilnius",
    neighborhoods: "Senamiestis|Naujamiestis|Užupis|Šnipiškės|Žvėrynas|Antakalnis|other",
  },
  helsinki: {
    name: "Helsinki",
    neighborhoods: "Kallio|Töölö|Punavuori|Kruununhaka|Sörnäinen|Kamppi|Ruoholahti|Otaniemi|Espoo|other",
  },
};

type PipelineConfig = {
  venueWhitelist: string[];
  skipKeywords: string[];
  keepSignals: string[];
  geminiFallbackEnabled: boolean;
};

const validUntil = (day: string | null): string => {
  const ms = day === "Tonight" ? 129_600_000 : day !== null ? 691_200_000 : 7_776_000_000;
  return new Date(Date.now() + ms).toISOString();
};

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

const nullStr = (v: unknown): string | null =>
  (!v || v === "null") ? null : String(v);

const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch (_) { return String(e); }
};

const systemPrompt = (tagline: string, city: string, keepSignals: string[]): string => {
  const ctx = CITY_CONTEXT[city] ?? CITY_CONTEXT.tallinn;
  const keepHint = keepSignals.length
    ? `\nBIAS TOWARD KEEPING a borderline pick when these terms appear in the text: ${keepSignals.join(", ")}.`
    : "";
  return `You are an editor for WanderAlt, an ENGLISH-LANGUAGE guide to ${ctx.name}'s underground and alternative culture.
Curator voice: "${tagline}"

Your task: extract ALL specific events and places from this post that fit WanderAlt.
A single post can contain MANY picks - weekly newsletters often list 5-20 events.
Do not summarize the post; extract individual picks.

WanderAlt COVERS: live music (experimental, noise, jazz, electronic, classical-modern),
art openings and exhibitions, independent cinemas, cultural talks and lectures,
underground clubs, late bars with character, independent bookshops, record stores,
thrift/vintage, community art spaces, fringe theatre, film clubs, book launches,
philosophy/literature evenings, sound performances.

WanderAlt REJECTS: fitness/gyms, beauty/spa, mainstream chains and franchises,
standard shopping, real estate, job ads, generic lifestyle tips, tourist sightseeing
without a cultural angle, networking events, business conferences.${keepHint}

LANGUAGE (HARD REQUIREMENT — the app is English-only):
  - Input may be English, Estonian, Latvian, Lithuanian, Polish, Finnish, Ukrainian, or Russian, sometimes mixed.
  - EVERY output field (title, quote) MUST be natural English. NEVER copy a non-English title verbatim.
  - Event titles are DESCRIPTIONS, not proper nouns — always translate them:
      "Дворовый концерт в Копли" → "Courtyard concert in Kopli"
      "Kirjandusõhtu raamatupoes" → "Literary evening at the bookshop"
      "Винный вечер в Veino" → "Wine evening at Veino"
  - PRESERVE proper nouns inside the English title: venue names, artist and band names,
    named festivals and series. For films/plays use the international English title when one
    exists. Transliterate personal names to Latin script.
  - Quotes are punchy English curator voice, 1-2 sentences.

FIELD RULES:
  - venue: REQUIRED. Use the specific venue name. If unknown, use "Various venues".
  - neighborhood: REQUIRED. Use the closest known ${ctx.name} neighborhood or "other".
  - kind: REQUIRED. Must be one of the allowed values.
  - day: Use Tonight/Mon/Tue/Wed/Thu/Fri/Sat/Sun or null (not the string "null").
  - time: Use HH:MM format or null (not the string "null").
  - mood_tags: Choose 1-4 tags from this fixed list that honestly describe the feel:
      quiet (understated, focused), loud (amplified, crowd energy),
      indoors (inside a building), outdoors (open-air, walkabout),
      solo (ideal alone: lectures, exhibitions), social (better with others: clubs, bars),
      drinks (bar/drinking is central), sober (no alcohol emphasis, daytime/academic),
      walk-up (no ticket needed), ticketed (requires booking)

Return STRICT JSON:
{"picks":[{"title":"natural ENGLISH title, max 70 chars","venue":"venue name, never null","neighborhood":"${ctx.neighborhoods}","kind":"${KINDS}","day":"Tonight|Mon|Tue|Wed|Thu|Fri|Sat|Sun or null","time":"HH:MM or null","quote":"curator voice English 1-2 sentences","thumb_initials":"XX","mood_tags":["tag1","tag2"]}]}

If no picks: {"picks":[],"reason":"brief phrase"}
Return ONLY the JSON object.`;
};

const parseJson = (s: string) => {
  const tryParse = (t: string) => {
    try { const o = JSON.parse(t); return (o && Array.isArray(o.picks)) ? o : null; } catch (_) { return null; }
  };
  return tryParse(s)
    || tryParse((s.match(/```(?:json)?\s*([\s\S]+?)```/) || [])[1] || "")
    || tryParse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
};

const retryDelay = (body: string): number => {
  const m = body.match(/(\d+(?:\.\d+)?)s/);
  return ((m ? parseFloat(m[1]) : 14) + 2) * 1000;
};

type LLMResult =
  | { raw: string; provider: string }
  | { error: "rate_limited" | "overloaded" | "missing_key" | "all_failed" | "fallback_disabled"; detail?: string };

async function callGemini(text: string, tag: string, city: string, keepSignals: string[]): Promise<LLMResult> {
  if (!GEMINI_KEY) return { error: "missing_key" };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const bodyStr = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt(tag, city, keepSignals) }] },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  });
  const headers = { "Content-Type": "application/json" };
  let res = await fetch(url, { method: "POST", headers, body: bodyStr });
  if (res.status === 429) {
    const errText = await res.text();
    const wait = retryDelay(errText);
    await new Promise<void>((resolve) => { setTimeout(resolve, wait); });
    res = await fetch(url, { method: "POST", headers, body: bodyStr });
  }
  if (res.status === 429) return { error: "rate_limited" };
  if (res.status >= 500)  return { error: "overloaded", detail: `gemini ${res.status}` };
  if (!res.ok) return { error: "all_failed", detail: `gemini ${res.status}: ${await res.text()}` };
  const j = await res.json();
  return { raw: j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "", provider: GEMINI_MODEL };
}

async function callGroq(text: string, tag: string, city: string, keepSignals: string[]): Promise<LLMResult> {
  if (!GROQ_KEY) return { error: "missing_key" };
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "system", content: systemPrompt(tag, city, keepSignals) }, { role: "user", content: text }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) return { error: "rate_limited" };
  if (res.status >= 500)  return { error: "overloaded", detail: `groq ${res.status}` };
  if (!res.ok) return { error: "all_failed", detail: `groq ${res.status}: ${await res.text()}` };
  const j = await res.json();
  return { raw: j?.choices?.[0]?.message?.content ?? "", provider: GROQ_MODEL };
}

async function callLLM(text: string, tag: string, city: string, cfg: PipelineConfig): Promise<LLMResult> {
  // Groq is primary — free tier covers our volume.
  const r1 = await callGroq(text, tag, city, cfg.keepSignals);
  if ("raw" in r1) return r1;
  // Gemini fallback is gated: skip it entirely when the kill-switch is off
  // (rate-limited messages just wait for the next Groq window — no spend).
  if (!cfg.geminiFallbackEnabled) {
    return r1.error === "missing_key" ? { error: "fallback_disabled" } : r1;
  }
  if (r1.error === "missing_key") return callGemini(text, tag, city, cfg.keepSignals);
  // rate_limited or overloaded → try Gemini before giving up
  const r2 = await callGemini(text, tag, city, cfg.keepSignals);
  if ("raw" in r2) return r2;
  return r1;
}

// ── English-compliance guard (v38) ───────────────────────────
// The classifier occasionally copies non-Latin titles verbatim despite
// the prompt. Detect Cyrillic in title/quote and run ONE targeted batch
// translation (Groq) so picks are written to the DB already in English.
// Fail-open: on any error the original text is kept (the translate-picks
// backfill catches stragglers later).
const hasCyrillic = (s: unknown): boolean => /[Ѐ-ӿ]/.test(String(s ?? ""));

async function fixNonEnglish(picks: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const idx = picks
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => hasCyrillic(p.title) || hasCyrillic(p.quote));
  if (!idx.length || !GROQ_KEY) return picks;
  const items = idx.map(({ p, i }) => ({ i, title: String(p.title), quote: String(p.quote ?? "") }));
  const sys = `You translate event listings into natural English for an English-only city guide.
Keep proper nouns: venue names, artist and band names, named festivals/series. For films and
plays use the international English title when one exists. Transliterate personal names.
Return STRICT JSON: {"items":[{"i":0,"title":"English title, max 70 chars","quote":"English quote or empty string"}]}
Return one entry per input item, same "i". Return ONLY the JSON object.`;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: sys }, { role: "user", content: JSON.stringify({ items }) }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return picks;
    const j = await res.json();
    const out = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    if (!out || !Array.isArray(out.items)) return picks;
    for (const item of out.items) {
      const target = idx.find(({ i }) => i === item.i);
      if (!target || !item.title || hasCyrillic(item.title)) continue;
      const p = picks[target.i];
      p.title_original = String(p.title);   // preserve the source title
      p.title = String(item.title);
      if (item.quote && hasCyrillic(p.quote) && !hasCyrillic(item.quote)) p.quote = String(item.quote);
    }
  } catch (_) { /* fail-open */ }
  return picks;
}

async function loadPipelineConfig(sb: ReturnType<typeof createClient>): Promise<PipelineConfig> {
  const { data } = await sb.from("pipeline_config").select("key, value");
  const map: Record<string, unknown> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return {
    venueWhitelist: (map.venue_whitelist as string[]) ?? [],
    skipKeywords: (map.skip_keywords as string[]) ?? [],
    keepSignals: (map.keep_signals as string[]) ?? [],
    // default ON when the row is absent, so behaviour is unchanged until
    // someone explicitly flips it to false.
    geminiFallbackEnabled: map.gemini_fallback_enabled !== false,
  };
}

// ---- process a single claimed message; returns a summary object ----
async function processOne(
  sb: ReturnType<typeof createClient>,
  tagMap: Record<string, string>,
  cfg: PipelineConfig,
): Promise<{ status: string; detail: Record<string, unknown> }> {
  const { data: claimed, error: claimErr } = await sb.rpc("claim_staging_message");
  if (claimErr) return { status: "claim_error", detail: { error: claimErr.message } };
  if (!claimed || claimed.length === 0) return { status: "empty", detail: {} };
  const m = claimed[0];

  const { data: src } = await sb.from("sources")
    .select("curator_handle, city").eq("id", m.source_id).maybeSingle();
  const handle  = src?.curator_handle ?? m.channel;
  const city    = src?.city ?? "tallinn";
  const tagline = tagMap[handle] ?? "underground cultural picks";

  // v39: never silently classify against the wrong city context.
  if (!CITY_CONTEXT[city]) {
    await sb.from("staging_messages")
      .update({ status: "error",
                rejection: `no CITY_CONTEXT entry for city "${city}" — add it to process-staging before ingesting this city`,
                processed_at: new Date().toISOString() })
      .eq("id", m.id);
    return { status: "error", detail: { error: `missing CITY_CONTEXT: ${city}`, id: m.id } };
  }

  const releaseToNew = async (reason: string) => {
    await sb.from("staging_messages").update({ status: "new" }).eq("id", m.id);
    return { status: "skipped", detail: { reason, id: m.id } };
  };
  const failMessage = async (msg: string) => {
    await sb.from("staging_messages")
      .update({ status: "error", rejection: msg, processed_at: new Date().toISOString() })
      .eq("id", m.id);
    return { status: "error", detail: { error: msg, id: m.id } };
  };

  // ── skip_keywords check — reject before calling LLM ──────────
  const textLower = m.text.toLowerCase();
  const skipHit = cfg.skipKeywords.find(kw => textLower.includes(kw.toLowerCase()));
  if (skipHit) {
    await sb.from("staging_messages")
      .update({ status: "rejected", rejection: `skip_keyword: ${skipHit}`, processed_at: new Date().toISOString() })
      .eq("id", m.id);
    return { status: "rejected", detail: { reason: `skip_keyword: ${skipHit}`, id: m.id } };
  }

  // ── venue_whitelist check — note for LLM ─────────────────────
  const isWhitelisted = cfg.venueWhitelist.some(v => textLower.includes(v.toLowerCase()));
  const llmText = isWhitelisted
    ? `[NOTE: This event is from a pre-approved venue on the WanderAlt whitelist. Accept it unless the content is completely off-topic.]\n\n${m.text}`
    : m.text;

  const llm = await callLLM(llmText, tagline, city, cfg);

  if ("error" in llm) {
    if (llm.error === "rate_limited" || llm.error === "overloaded" || llm.error === "missing_key" || llm.error === "fallback_disabled")
      return releaseToNew(llm.error);
    return failMessage(llm.detail ?? llm.error);
  }

  const result = parseJson(llm.raw);
  if (!result) return failMessage("unparseable: " + llm.raw.slice(0, 200));

  let validPicks = (result.picks as Record<string, unknown>[]).filter(
    (p) => p.title && p.venue && p.kind && p.neighborhood,
  );

  if (validPicks.length === 0) {
    const reason = result.reason ?? (result.picks.length > 0 ? "all picks missing required fields" : "no picks extracted");
    await sb.from("staging_messages")
      .update({ status: "rejected", rejection: reason, processed_at: new Date().toISOString() })
      .eq("id", m.id);
    return { status: "rejected", detail: { reason, id: m.id } };
  }

  // v38: guarantee English before anything is written.
  validPicks = await fixNonEnglish(validPicks);

  const inserted: { id: string; title: string }[] = [];
  for (const p of validPicks) {
    const title = String(p.title);
    const venue = String(p.venue);
    const pid = validPicks.length === 1
      ? `${m.channel}-${m.message_id}`.toLowerCase()
      : `${m.channel}-${m.message_id}-${slugify(title)}`.toLowerCase();
    const day  = nullStr(p.day);
    const time = nullStr(p.time);
    const initials = (String(p.thumb_initials || "") || venue.slice(0, 2)).toUpperCase().slice(0, 2) || "??";

    /* Extract and validate mood_tags from LLM output. */
    const rawMoodTags = Array.isArray(p.mood_tags) ? p.mood_tags : [];
    const moodTags = rawMoodTags
      .map((t: unknown) => String(t).toLowerCase().trim())
      .filter((t: string) => VALID_MOOD_TAGS.has(t));

    const { error: upsertErr } = await sb.from("picks").upsert({
      id: pid, city,
      title, venue,
      neighborhood: String(p.neighborhood),
      kind: String(p.kind),
      day, time,
      quote: String(p.quote ?? ""),
      handle, thumb_initials: initials,
      tonight: day === "Tonight",
      this_week: day !== null,
      mood_tags: moodTags,
      auto_generated: true,
      source_message_id: m.id,
      valid_until: validUntil(day),
      archived_at: null,
      ...(p.title_original ? { title_original: String(p.title_original) } : {}),
    }, { onConflict: "id" });
    if (upsertErr) throw new Error(`upsert ${pid}: ${upsertErr.message ?? JSON.stringify(upsertErr)}`);
    inserted.push({ id: pid, title });
  }

  await sb.from("staging_messages")
    .update({ status: "processed", pick_id: inserted[0].id, processed_at: new Date().toISOString() })
    .eq("id", m.id);
  return { status: "ok", detail: { inserted: inserted.length, provider: llm.provider, channel: m.channel } };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default {
  async fetch(_req: Request): Promise<Response> {
    if (!GEMINI_KEY && !GROQ_KEY) return json({ ok: false, error: "no LLM key set" }, 503);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Pre-fetch curator taglines and pipeline config once for the whole batch
    const [{ data: curators }, cfg] = await Promise.all([
      sb.from("curators").select("handle, tagline"),
      loadPipelineConfig(sb),
    ]);
    const tagMap: Record<string, string> = {};
    for (const c of curators ?? []) tagMap[c.handle] = c.tagline;

    const start   = Date.now();
    const results: Record<string, unknown>[] = [];
    let totalInserted = 0;
    let totalRejected = 0;
    let totalSkipped  = 0;

    for (let i = 0; i < BATCH_SIZE; i++) {
      if (Date.now() - start > TIME_CAP_MS) break; // safety time cap
      let r: { status: string; detail: Record<string, unknown> };
      try {
        r = await processOne(sb, tagMap, cfg);
      } catch (e) {
        r = { status: "exception", detail: { error: errMsg(e) } };
      }
      if (r.status === "empty") break; // queue drained
      results.push({ i, ...r });
      if (r.status === "ok")       totalInserted += (r.detail.inserted as number) ?? 0;
      if (r.status === "rejected") totalRejected++;
      if (r.status === "skipped")  totalSkipped++;
    }

    // Write one summary log row for the whole batch
    await sb.from("ingest_log").insert({
      fn: "process-staging",
      finished_at: new Date().toISOString(),
      status: "ok",
      inserted: totalInserted,
      rejected: totalRejected,
      detail: { processed: results.length, skipped: totalSkipped, results },
    });

    return json({
      ok: true,
      processed: results.length,
      inserted: totalInserted,
      rejected: totalRejected,
      skipped: totalSkipped,
    });
  },
};
