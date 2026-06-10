// ============================================================
// WanderAlt — translate-picks  (v2, June 2026)
// One-shot backfill + safety net for the English-only app rule.
// v2 vs v1: detection covers BOTH title and quote (v1 keyed on the
// title only, so picks with an English title but a Cyrillic quote
// were skipped — 11 such quotes survived the first drain), and
// quote-only updates no longer get blocked by the title-unchanged
// guard. Groq llama-4-scout only; ~25 items per call; hard time cap;
// ONE invocation drains what it can and reports `remaining`.
// NOT scheduled — process-staging v38 keeps new picks English.
//
//   POST {"limit": 700, "batch": 25, "dry_run": false}
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_KEY     = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL   = "meta-llama/llama-4-scout-17b-16e-instruct";
const TIME_CAP_MS  = 110_000;

const hasCyrillic = (s: unknown): boolean => /[Ѐ-ӿ]/.test(String(s ?? ""));

const SYS = `You review event listings for an ENGLISH-ONLY city guide covering the Baltics and Finland.
Input: JSON {"items":[{"id":"...","title":"...","quote":"..."}]}.
For EACH item check BOTH fields: is the title natural English? is the quote natural English?
Return ONLY the items where at least one field is NOT English:
{"items":[{"id":"...","lang":"ru|et|lv|lt|pl|fi|uk|mixed","title":"natural English title, max 70 chars","quote":"natural English quote"}]}
Rules:
- Always return BOTH fields for a returned item (translate the non-English one; copy the
  already-English one through unchanged).
- Event titles are descriptions — translate them. PRESERVE proper nouns: venue names,
  artist and band names, named festivals/series. For films and plays use the international
  English title when one exists. Transliterate personal names to Latin script.
- Do NOT rephrase fields that are already English.
- If everything is English: {"items":[]}
Return ONLY the JSON object.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default {
  async fetch(req: Request): Promise<Response> {
    if (!GROQ_KEY) return json({ ok: false, error: "GROQ_API_KEY not set" }, 503);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    let body: { limit?: number; batch?: number; dry_run?: boolean } = {};
    try { body = await req.json(); } catch (_) { /* defaults */ }
    const limit  = Math.min(Math.max(body.limit ?? 700, 1), 2000);
    const batch  = Math.min(Math.max(body.batch ?? 25, 5), 40);
    const dryRun = body.dry_run === true;

    const { data: picks, error } = await sb.from("picks")
      .select("id, title, quote, title_original")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json({ ok: false, error: error.message }, 500);

    const start = Date.now();
    let scanned = 0, translated = 0, rateLimited = false;
    const samples: Record<string, string>[] = [];
    const errors: string[] = [];

    for (let off = 0; off < (picks ?? []).length; off += batch) {
      if (Date.now() - start > TIME_CAP_MS) break;
      const chunk = (picks ?? []).slice(off, off + batch);
      const items = chunk.map(p => ({ id: p.id, title: p.title, quote: p.quote ?? "" }));

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: "system", content: SYS }, { role: "user", content: JSON.stringify({ items }) }],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429) { rateLimited = true; break; }
      if (!res.ok) { errors.push(`groq ${res.status}`); continue; }
      scanned += chunk.length;

      let out: { items?: { id: string; lang?: string; title?: string; quote?: string }[] };
      try { out = JSON.parse((await res.json())?.choices?.[0]?.message?.content ?? "{}"); }
      catch (_) { errors.push("unparseable batch"); continue; }

      for (const item of out.items ?? []) {
        const orig = chunk.find(p => p.id === item.id);
        if (!orig) continue;
        if (!item.lang || item.lang === "en") continue;

        const update: Record<string, unknown> = {};
        // Title: apply when changed, clean, and not already translated before.
        if (item.title && !hasCyrillic(item.title)
            && item.title.trim().toLowerCase() !== String(orig.title).trim().toLowerCase()) {
          update.title = item.title.trim().slice(0, 90);
          if (!orig.title_original) update.title_original = orig.title;
        }
        // Quote: only replace a quote that was visibly non-English (Cyrillic)
        // — quotes are LLM-generated English elsewhere and must not be restyled.
        if (item.quote && hasCyrillic(orig.quote) && !hasCyrillic(item.quote)) {
          update.quote = String(item.quote).trim();
        }
        if (!Object.keys(update).length) continue;

        if (!dryRun) {
          const { error: upErr } = await sb.from("picks").update(update).eq("id", item.id);
          if (upErr) { errors.push(`update ${item.id}: ${upErr.message}`); continue; }
        }
        translated++;
        if (samples.length < 8) samples.push({ id: item.id, from: String(orig.title), to: String(update.title ?? orig.title) });
      }
    }

    const remaining = (picks ?? []).length - scanned;
    await sb.from("ingest_log").insert({
      fn: "translate-picks",
      finished_at: new Date().toISOString(),
      status: errors.length ? "warn" : "ok",
      inserted: translated,
      rejected: 0,
      detail: { scanned, translated, remaining, rate_limited: rateLimited, dry_run: dryRun, samples, errors: errors.slice(0, 5) },
    });

    return json({ ok: true, scanned, translated, remaining, rate_limited: rateLimited, dry_run: dryRun, samples });
  },
};
