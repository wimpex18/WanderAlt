// ============================================================
// WanderAlt — ingest-telegram
// ------------------------------------------------------------
// For every enabled row in `sources` where kind='telegram',
// fetch https://t.me/s/<channel> (public web preview, no API
// key required), parse messages out of the server-rendered
// HTML, and upsert them into `staging_messages`.
//
// Triggered by pg_cron (see migrations) on a daily schedule.
// Auth: standard Supabase service-role JWT.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Match every <div class="tgme_widget_message_wrap"> … </div> block.
 *  Non-greedy match between class anchors. */
const MSG_BLOCK = /<div\s+class="tgme_widget_message_wrap[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;

/** Pull the post id ("channel/12345") from a message's data-post attr. */
const RE_POST_ID  = /data-post="([^"]+)"/;
/** Pull the rendered text content of the message body. */
const RE_MSG_TEXT = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/;
/** Pull the ISO datetime from the <time datetime="…"> tag. */
const RE_TIME     = /<time[^>]+datetime="([^"]+)"/;

const stripHtml = (s: string) =>
  s.replace(/<br\s*\/?>/gi, "\n")
   .replace(/<[^>]+>/g, "")
   .replace(/&nbsp;/g, " ")
   .replace(/&amp;/g, "&")
   .replace(/&lt;/g, "<")
   .replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"')
   .replace(/&#39;/g, "'")
   .trim();

type ParsedMsg = {
  channel:    string;
  message_id: number;
  text:       string;
  posted_at:  string | null;
  permalink:  string;
};

const parseChannelHtml = (channel: string, html: string): ParsedMsg[] => {
  const blocks = html.match(MSG_BLOCK) ?? [];
  const out: ParsedMsg[] = [];
  for (const block of blocks) {
    const idMatch = RE_POST_ID.exec(block);
    if (!idMatch) continue;
    const post = idMatch[1];                       // e.g. "sigmundtells/42"
    const [, idStr] = post.split("/");
    const message_id = Number(idStr);
    if (!Number.isFinite(message_id)) continue;

    const txtMatch = RE_MSG_TEXT.exec(block);
    const text     = txtMatch ? stripHtml(txtMatch[1]) : "";
    if (!text) continue;                            // skip media-only posts

    const tMatch = RE_TIME.exec(block);
    out.push({
      channel,
      message_id,
      text,
      posted_at: tMatch ? tMatch[1] : null,
      permalink: `https://t.me/${post}`,
    });
  }
  return out;
};

const fetchChannel = async (channel: string): Promise<ParsedMsg[]> => {
  const url = `https://t.me/s/${encodeURIComponent(channel)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "WanderAltBot/1.0 (+https://wanderalt.example)" },
  });
  if (!res.ok) throw new Error(`telegram ${channel}: HTTP ${res.status}`);
  const html = await res.text();
  return parseChannelHtml(channel, html);
};

Deno.serve(async (_req: Request) => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // open log row
  const { data: log } = await sb
    .from("ingest_log").insert({ fn: "ingest-telegram" }).select("id").single();
  const log_id = log?.id;

  let inserted = 0, errors: { channel: string; error: string }[] = [];

  const { data: sources, error: srcErr } = await sb
    .from("sources")
    .select("id, channel, last_message_id")
    .eq("kind", "telegram")
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
    try {
      const msgs = await fetchChannel(src.channel);
      const fresh = src.last_message_id
        ? msgs.filter(m => m.message_id > src.last_message_id!)
        : msgs;
      if (fresh.length === 0) continue;

      const { error: insErr } = await sb
        .from("staging_messages")
        .upsert(
          fresh.map(m => ({
            source_id:  src.id,
            channel:    m.channel,
            message_id: m.message_id,
            text:       m.text,
            posted_at:  m.posted_at,
            permalink:  m.permalink,
            status:     "new",
          })),
          { onConflict: "channel,message_id", ignoreDuplicates: true },
        );
      if (insErr) throw insErr;
      inserted += fresh.length;

      const maxId = Math.max(...fresh.map(m => m.message_id));
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
