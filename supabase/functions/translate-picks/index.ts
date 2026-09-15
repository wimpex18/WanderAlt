// ============================================================
// WanderAlt — translate-picks
// Backfill + safety net for the English-only rule: reviews title, quote
// and description. Mistral then NVIDIA, ~25 items per call, hard time cap; ONE
// invocation drains what it can and reports `remaining`.
// NOT scheduled — process-staging keeps new picks English.
//
//   POST {"limit": 700, "batch": 25, "dry_run": false}
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LANES = [
  { name: "mistral", url: "https://api.mistral.ai/v1/chat/completions",
    key: Deno.env.get("MISTRAL_API_KEY"), model: "mistral-small-2603", jsonMode: true, body: {} as Record<string, unknown> },
  { name: "nvidia", url: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: Deno.env.get("NVIDIA_API_KEY"), model: "nvidia/nemotron-3.5-lightning-30b-a3b", jsonMode: false,
    body: { chat_template_kwargs: { enable_thinking: false } } as Record<string, unknown> },
];
const TIME_CAP_MS  = 110_000;

const hasCyrillic = (s: unknown): boolean => /[Ѐ-ӿ]/.test(String(s ?? ""));

const SYS = `You review event listings for an ENGLISH-ONLY city guide covering the Baltics and Finland.
Input: JSON {"items":[{"id":"...","title":"...","quote":"...","description":"..."}]}.
For EACH item check ALL THREE fields: is the title natural English? the quote? the description?
Return ONLY the items where at least one field is NOT English:
{"items":[{"id":"...","lang":"ru|et|lv|lt|pl|fi|uk|mixed","title":"natural English title, max 70 chars","quote":"natural English quote","description":"natural English description"}]}
Rules:
- Always return ALL THREE fields for a returned item (translate the non-English ones; copy the
  already-English ones through unchanged).
- description is the promoter's own listing copy. TRANSLATE it faithfully — do not summarise,
  do not add, do not adopt a marketing register. It is a record of what the source said.
  Return "" for description if the item has none.
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
    if (!LANES.some(l => l.key)) return json({ ok: false, error: "no LLM key set" }, 503);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    let body: { limit?: number; batch?: number; dry_run?: boolean } = {};
    try { body = await req.json(); } catch (_) { /* defaults */ }
    const limit  = Math.min(Math.max(body.limit ?? 700, 1), 2000);
    const batch  = Math.min(Math.max(body.batch ?? 25, 5), 40);
    const dryRun = body.dry_run === true;

    const { data: picks, error } = await sb.from("picks")
      .select("id, title, quote, title_original, description")
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
      /* description is the promoter blurb carried from the source, in the
         venue's language. Truncated into the prompt to protect the batch
         budget. */
      const items = chunk.map(p => ({
        id: p.id, title: p.title, quote: p.quote ?? "",
        description: String(p.description ?? "").slice(0, 1200),
      }));

      let raw: string | null = null;
      for (const lane of LANES) {
        if (!lane.key) continue;
        const res = await fetch(lane.url, {
          signal: AbortSignal.timeout(40_000),
          method: "POST",
          headers: { Authorization: `Bearer ${lane.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: lane.model,
            messages: [{ role: "system", content: SYS }, { role: "user", content: JSON.stringify({ items }) }],
            temperature: 0.2,
            ...(lane.jsonMode ? { response_format: { type: "json_object" } } : {}),
            ...lane.body,
          }),
        }).catch((e) => e as Error);
        if (res instanceof Error) { errors.push(`${lane.name} ${res.name}`); continue; }
        if (res.status === 429) { rateLimited = true; continue; }
        if (!res.ok) { errors.push(`${lane.name} ${res.status}`); continue; }
        raw = String((await res.json())?.choices?.[0]?.message?.content ?? "");
        break;
      }
      if (raw === null) { if (rateLimited) break; continue; }
      scanned += chunk.length;

      /* Reasoning models may wrap the JSON in thinking text. */
      const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
      const at = clean.lastIndexOf('{"items"');
      let out: { items?: { id: string; lang?: string; title?: string; quote?: string; description?: string }[] };
      try { out = JSON.parse(at >= 0 ? clean.slice(at, clean.lastIndexOf("}") + 1) : clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1)); }
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
        /* Description: replace only when the source actually had one and the
           model returned something different — copying an unchanged English
           blurb back would rewrite the source's own words for no reason. */
        if (item.description && orig.description
            && item.description.trim() !== String(orig.description).trim()) {
          update.description = item.description.trim().slice(0, 4000);
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
