// ============================================================
// WanderAlt — process-staging
// Claims staging_messages, copies facts from the payload, and asks the LLM
// for an English title, one sentence worth reading and the kind. Upserts
// picks. LLM lanes, tried in order, each skipped while its key is unset:
// Groq, NVIDIA, Mistral, OpenRouter :free. All free tiers.
//
//   • A city with no CITY_CONTEXT entry FAILS LOUDLY (message marked
//     error) — adding a city hard-requires the context entry.
//   • saysSomething() drops a quote that only restates the title.
//   • Any title/quote still containing Cyrillic gets one batch translation
//     call before upsert; the source title is kept in picks.title_original.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_KEY      = Deno.env.get("GROQ_API_KEY");
// Groq retired llama-3.3-70b-versatile on its free tier (Aug 2026); this is
// its documented replacement.
const GROQ_MODEL    = "openai/gpt-oss-120b";

/* Model ids are pinned and checked against each provider's catalogue.
   The OpenRouter model must stay :free-suffixed so that lane cannot bill. */
type Lane = { name: string; url: string; key?: string; model: string; jsonMode: boolean; headers?: Record<string, string> };
const LANES: Lane[] = [
  { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions",
    key: GROQ_KEY, model: GROQ_MODEL, jsonMode: true },
  { name: "nvidia", url: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: Deno.env.get("NVIDIA_API_KEY"), model: "nvidia/nemotron-3-super-120b-a12b", jsonMode: false },
  { name: "mistral", url: "https://api.mistral.ai/v1/chat/completions",
    key: Deno.env.get("MISTRAL_API_KEY"), model: "mistral-small-2603", jsonMode: true },
  { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions",
    key: Deno.env.get("OPENROUTER_API_KEY"),
    model: Deno.env.get("OPENROUTER_MODEL") || "nvidia/nemotron-3-super-120b-a12b:free", jsonMode: true,
    headers: { "HTTP-Referer": "https://wanderalt.app", "X-Title": "WanderAlt pipeline" } },
];
const BATCH_SIZE    = 10;   // max messages per invocation
const TIME_CAP_MS   = 100_000; // 100 s hard stop

const KINDS = "gig|talk|exhibition|club|place|bookshop|record store|gallery|thrift|lecture|noise|theatre|cinema|library|bar|museum|arts centre";

const CITY_CONTEXT: Record<string, { name: string; neighborhoods: string }> = {
  tallinn: {
    name: "Tallinn",
    neighborhoods: "Kalamaja|Telliskivi|Vanalinn|Kadriorg|Põhja-Tallinn|other",
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

/* ── The paraphrase guard ────────────────────────────────────
   The prompt asks for an empty quote when there is nothing to add; a
   prompt is a request, not a constraint, so it is enforced here too.
   Content words added beyond the title: zero is a restatement and
   becomes "", one or more stands. The filler list must stay identical
   to WA.UI.descriptionOr, the Pages middleware and og-image. */
const FILLER = new Set(["the","and","with","for","from","out","you","your","its","are","was","this","that","into","all","new","one","two","live","event","events","show","shows","night","nights","music","party","concert","set","series","performs","presents","featuring","join","come","experience","enjoy","celebrate","discover","more","than","their","his","her"]);

const contentWords = (s: string): string[] =>
  String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length >= 3 && !FILLER.has(w));

const saysSomething = (text: unknown, title: string): string => {
  const s = String(text ?? "").trim();
  if (!s) return "";
  if (s.length < 12 || /^(tba|tbc|n\/a|none|null|-|—)$/i.test(s)) return "";
  const t = new Set(contentWords(title));
  return contentWords(s.slice(0, 300)).some((w) => !t.has(w)) ? s : "";
};

const systemPrompt = (city: string, keepSignals: string[]): string => {
  const ctx = CITY_CONTEXT[city] ?? CITY_CONTEXT.tallinn;
  const keepHint = keepSignals.length
    ? `\nBIAS TOWARD KEEPING a borderline pick when these terms appear in the text: ${keepSignals.join(", ")}.`
    : "";
  return `You are an editor for WanderAlt, an ENGLISH-LANGUAGE guide to ${ctx.name}'s underground and alternative culture.

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
    (An empty quote is always allowed — see THE QUOTE below. Empty beats a translated restatement.)
  - Event titles are DESCRIPTIONS, not proper nouns — always translate them:
      "Дворовый концерт в Копли" → "Courtyard concert in Kopli"
      "Kirjandusõhtu raamatupoes" → "Literary evening at the bookshop"
      "Винный вечер в Veino" → "Wine evening at Veino"
  - PRESERVE proper nouns inside the English title: venue names, artist and band names,
    named festivals and series. For films/plays use the international English title when one
    exists. Transliterate personal names to Latin script.
  - No em-dashes. No exclamation marks. No "discover". No marketing language
    ("must-visit", "vibrant", "hidden gem"). Do not paraphrase venue marketing
    copy — say what the thing is and why someone would go.

THE QUOTE — the one rule that matters most:
  The quote must say something a listings site WOULD NOT: the room, the
  crowd, the door policy, the catch, what the night is actually like.
  It is not a subtitle and not a summary of the title.

  If the source text gives you nothing beyond the title, return an EMPTY
  STRING for quote. That is a correct, expected answer — the app prints
  an honest "No description filed" line, which is strictly better than
  the title said twice. Do not pad. Do not invent a detail to fill it.

  Test it before you write it: remove the title and read the quote alone.
  If it still tells you something, keep it. If it is just the title
  rearranged, return "".

  BAD (all of these must be ""):
    "Disco party"                      for the title "Disco party"
    "Swedish House Mafia live"         for "Swedish House Mafia concert"
    "Party with Techno Tubbies"        for "Techno Tubbies Party"
    "Fashion show by Erki"             for "Erki Fashion Show"
    "Tour of medieval art"             for "Medieval Art Welcome Tour"
  GOOD:
    "Cash only, and the back room gets loud after midnight."
    "Free, but the 40 seats go in the first ten minutes."
    "Sound artists improvising against a 1970s planetarium projector."

FIELD RULES:
  - venue: REQUIRED. Use the specific venue name. If unknown, use "Various venues".
  - neighborhood: REQUIRED. Use the closest known ${ctx.name} neighborhood or "other".
  - kind: REQUIRED. Must be one of the allowed values.
  - day: Use Tonight/Mon/Tue/Wed/Thu/Fri/Sat/Sun or null (not the string "null").
  - time: Use HH:MM format or null (not the string "null").

Return STRICT JSON:
{"picks":[{"title":"natural ENGLISH title, max 70 chars","venue":"venue name, never null","neighborhood":"${ctx.neighborhoods}","kind":"${KINDS}","day":"Tonight|Mon|Tue|Wed|Thu|Fri|Sat|Sun or null","time":"HH:MM or null","quote":"1-2 English sentences that add something the title does not, or \\"\\" if you have nothing to add"}]}

If no picks: {"picks":[],"reason":"brief phrase"}
Return ONLY the JSON object.`;
};

const parseJson = (raw: string) => {
  /* Reasoning models may prepend a <think> block. */
  const s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const tryParse = (t: string) => {
    try { const o = JSON.parse(t); return (o && Array.isArray(o.picks)) ? o : null; } catch (_) { return null; }
  };
  return tryParse(s)
    || tryParse((s.match(/```(?:json)?\s*([\s\S]+?)```/) || [])[1] || "")
    || tryParse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
};

type LLMResult =
  | { raw: string; provider: string }
  | { error: "rate_limited" | "overloaded" | "missing_key" | "all_failed"; detail?: string };

async function callLane(lane: Lane, text: string, city: string, keepSignals: string[]): Promise<LLMResult> {
  if (!lane.key) return { error: "missing_key" };
  const res = await fetch(lane.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${lane.key}`, "Content-Type": "application/json", ...(lane.headers ?? {}) },
    body: JSON.stringify({
      model: lane.model,
      messages: [{ role: "system", content: systemPrompt(city, keepSignals) }, { role: "user", content: text }],
      temperature: 0.3,
      ...(lane.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (res.status === 429) return { error: "rate_limited" };
  if (res.status >= 500)  return { error: "overloaded", detail: `${lane.name} ${res.status}` };
  if (!res.ok) return { error: "all_failed", detail: `${lane.name} ${res.status}: ${await res.text()}` };
  const j = await res.json();
  return { raw: j?.choices?.[0]?.message?.content ?? "", provider: `${lane.name}/${lane.model}` };
}

/* First lane with an answer wins. If none answers, the first real error is
   returned, so a rate limit anywhere releases the message rather than
   failing it. */
async function callLLM(text: string, city: string, cfg: PipelineConfig): Promise<LLMResult> {
  let err: LLMResult = { error: "missing_key" };
  for (const lane of LANES) {
    const r = await callLane(lane, text, city, cfg.keepSignals);
    if ("raw" in r) return r;
    if ("error" in err && err.error === "missing_key") err = r;
  }
  return err;
}

// ── English-compliance guard ─────────────────────────────────
// The classifier occasionally copies non-Latin titles verbatim. Detect
// Cyrillic in title/quote and run ONE targeted batch translation (Groq).
// Fail-open: on any error the original text is kept.
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
  };
}

// ---- process a single claimed message; returns a summary object ----
async function processOne(
  sb: ReturnType<typeof createClient>,
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

  // Never silently classify against the wrong city context.
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

  const llm = await callLLM(llmText, city, cfg);

  if ("error" in llm) {
    if (llm.error === "rate_limited" || llm.error === "overloaded" || llm.error === "missing_key")
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

  // Guarantee English before anything is written.
  validPicks = await fixNonEnglish(validPicks);

  /* ── The staging payload contract ────────────────────────────────
     Ingest functions write staging_messages.payload alongside the prose
     they hand the model. Facts come from HERE, verbatim; the model is
     asked only for an English title, the one sentence worth reading and
     the kind.

     `description` is the SOURCE's own blurb and is stored verbatim, even
     when it echoes the title. The paraphrase guard applies to `quote`,
     which we write. The display layer decides (WA.UI.descriptionOr).

       source       string  the ingest that produced the row
       description  string  the blurb as the source wrote it
       starts_at    ISO     real instant, not the day/time display pair
       ends_at      ISO
       venue        string
       address      string
       ticket_url   string  where you actually buy or RSVP
       image_url    string  (documented, not read here)
       is_free      bool    only when the source states it
       price_min/max number  price_text string  currency string
       categories   string[]
       entities     [{name, role}]  artist | author | film | organiser

     Every field is optional. A missing field is never inferred here: a
     guessed price is worse than no price. */
  const pay = (m.payload ?? {}) as Record<string, unknown>;
  const payStr = (k: string): string | null => {
    const v = pay[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const payNum = (k: string): number | null => {
    const v = pay[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const payIso = (k: string): string | null => {
    const v = payStr(k);
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  const entities = Array.isArray(pay.entities)
    ? (pay.entities as Record<string, unknown>[])
        .filter(e => e && typeof e.name === "string" && (e.name as string).trim())
        .map(e => ({ name: String(e.name).trim(), role: String(e.role ?? "artist") }))
        .slice(0, 12)
    : null;

  const inserted: { id: string; title: string }[] = [];
  for (const p of validPicks) {
    const title = String(p.title);
    const venue = String(p.venue);
    const pid = validPicks.length === 1
      ? `${m.channel}-${m.message_id}`.toLowerCase()
      : `${m.channel}-${m.message_id}-${slugify(title)}`.toLowerCase();
    const day  = nullStr(p.day);
    const time = nullStr(p.time);

    const { error: upsertErr } = await sb.from("picks").upsert({
      id: pid, city,
      title, venue,
      neighborhood: String(p.neighborhood),
      kind: String(p.kind),
      day, time,
      /* 4a, enforced in code and not only asked for in the prompt. */
      quote: saysSomething(p.quote, title),
      handle,
      tonight: day === "Tonight",
      this_week: day !== null,
      auto_generated: true,
      source_message_id: m.id,
      /* Carry the source/ticket page from the staging row so the detail page
         can link out. Telegram posts aren't event/ticket pages, so only web
         permalinks are kept (matches the backfill). */
      source_url: (typeof m.permalink === "string"
        && /^https?:\/\//i.test(m.permalink)
        && !/(\/\/(www\.)?t\.me\/|telegram)/i.test(m.permalink)) ? m.permalink : null,

      /* Facts, straight from the source. Only written when the payload
         actually carried them — undefined keys are omitted from the upsert
         so a re-process never nulls a column another pass filled in. */
      ...(payStr("description") ? { description: payStr("description") } : {}),
      ...(payIso("starts_at")   ? { starts_at:   payIso("starts_at") }   : {}),
      ...(payIso("ends_at")     ? { ends_at:     payIso("ends_at") }     : {}),
      ...(payStr("ticket_url")  ? { ticket_url:  payStr("ticket_url") }  : {}),
      ...(typeof pay.is_free === "boolean" ? { is_free: pay.is_free }    : {}),
      ...(payNum("price_min") !== null ? { price_min: payNum("price_min") } : {}),
      ...(payNum("price_max") !== null ? { price_max: payNum("price_max") } : {}),
      ...(payStr("currency")   ? { currency: payStr("currency") }        : {}),
      ...(entities && entities.length ? { entities } : {}),

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
    if (!LANES.some(l => l.key)) return json({ ok: false, error: "no LLM key set" }, 503);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const cfg = await loadPipelineConfig(sb);

    const start   = Date.now();
    const results: Record<string, unknown>[] = [];
    let totalInserted = 0;
    let totalRejected = 0;
    let totalSkipped  = 0;

    for (let i = 0; i < BATCH_SIZE; i++) {
      if (Date.now() - start > TIME_CAP_MS) break; // safety time cap
      let r: { status: string; detail: Record<string, unknown> };
      try {
        r = await processOne(sb, cfg);
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
