// ============================================================
// WanderAlt — ingest-rss
// ------------------------------------------------------------
// For every enabled row in `sources` where kind='rss',
// fetch the RSS/Atom feed at `feed_url`, parse items, and
// upsert them into `staging_messages`.
//
// Currently wired to: giadafromgamma.substack.com/feed
// (English Tallinn events newsletter, 3×/week)
//
// message_id = Unix epoch seconds from pubDate/published.
// Dedup key: (channel, message_id) — same as Telegram.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, " ")
   .replace(/&nbsp;/g, " ")
   .replace(/&amp;/g, "&")
   .replace(/&lt;/g, "<")
   .replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"')
   .replace(/&#39;/g, "'")
   .replace(/\s+/g, " ")
   .trim();

/** Pull text content between the first matching open/close tag. */
const tagText = (xml: string, tag: string): string => {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i");
  const m = re.exec(xml);
  return m ? stripHtml(m[1]) : "";
};

/** Pull an attribute value from a self-closing tag. */
const tagAttr = (xml: string, tag: string, attr: string): string => {
  const re = new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`, "i");
  const m = re.exec(xml);
  return m ? m[1] : "";
};

type ParsedItem = {
  message_id: number;
  text:       string;
  posted_at:  string | null;
  permalink:  string;
};

const parseRss = (xml: string): ParsedItem[] => {
  const items: ParsedItem[] = [];

  // Support both RSS 2.0 (<item>) and Atom (<entry>)
  const blockRe = /<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(xml)) !== null) {
    const block = match[0];

    // Title
    const title = tagText(block, "title");

    // Body: try <content:encoded>, then <description>, then <content>
    const body =
      tagText(block, "content:encoded") ||
      tagText(block, "description") ||
      tagText(block, "content") ||
      "";

    const text = [title, body].filter(Boolean).join("\n\n").slice(0, 4000);
    if (!text.trim()) continue;

    // Date: pubDate (RSS) or published/updated (Atom)
    const dateStr =
      tagText(block, "pubDate") ||
      tagText(block, "published") ||
      tagText(block, "updated");
    const ts = dateStr ? new Date(dateStr).getTime() : Date.now();
    if (!Number.isFinite(ts)) continue;
    const message_id = Math.floor(ts / 1000); // epoch seconds — stable numeric id

    // Link: <link href="..."/> (Atom) or <link>...</link> (RSS)
    const permalink =
      tagAttr(block, "link", "href") ||
      tagText(block, "link") ||
      "";

    items.push({
      message_id,
      text,
      posted_at: dateStr ? new Date(dateStr).toISOString() : null,
      permalink,
    });
  }

  return items;
};

Deno.serve(async (_req: Request) => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: log } = await sb
    .from("ingest_log").insert({ fn: "ingest-rss" }).select("id").single();
  const log_id = log?.id;

  let inserted = 0, errors: { channel: string; error: string }[] = [];

  const { data: sources, error: srcErr } = await sb
    .from("sources")
    .select("id, channel, feed_url, last_message_id")
    .eq("kind", "rss")
    .eq("enabled", true);

  if (srcErr) {
    await sb.from("ingest_log").update({
      finished_at: new Date().toISOString(),
      status: "error", error: srcErr.message,
    }).eq("id", log_id);
    return new Response(JSON.stringify({ ok: false, error: srcErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }

  for (const src of sources ?? []) {
    if (!src.feed_url) continue;
    try {
      const res = await fetch(src.feed_url, {
        headers: { "User-Agent": "WanderAltBot/1.0 (+https://wanderalt.example)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();

      const items = parseRss(xml);
      const fresh = src.last_message_id
        ? items.filter(i => i.message_id > src.last_message_id!)
        : items;
      if (fresh.length === 0) continue;

      const { error: insErr } = await sb
        .from("staging_messages")
        .upsert(
          fresh.map(i => ({
            source_id:  src.id,
            channel:    src.channel,
            message_id: i.message_id,
            text:       i.text,
            posted_at:  i.posted_at,
            permalink:  i.permalink,
            status:     "new",
          })),
          { onConflict: "channel,message_id", ignoreDuplicates: true },
        );
      if (insErr) throw insErr;
      inserted += fresh.length;

      const maxId = Math.max(...fresh.map(i => i.message_id));
      await sb.from("sources").update({
        last_scraped_at: new Date().toISOString(),
        last_message_id: maxId,
      }).eq("id", src.id);
    } catch (e) {
      errors.push({ channel: src.channel, error: String(e?.message ?? e) });
    }
  }

  await sb.from("ingest_log").update({
    finished_at: new Date().toISOString(),
    status: errors.length ? "error" : "ok",
    inserted,
    detail: { errors, sources: (sources ?? []).length },
  }).eq("id", log_id);

  return new Response(JSON.stringify({ ok: true, inserted, errors }),
    { headers: { "Content-Type": "application/json" } });
});
