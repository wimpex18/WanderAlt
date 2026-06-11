// ============================================================
// WanderAlt — archive-stale  (v8)
// v8 (May 2026): cap archived_titles at MAX_TITLES so detail JSONB
//                stays bounded if a long quiet period leaves
//                hundreds of picks to expire in one run.
// v7: closes the log row using the existing `inserted` column
//     instead of a non-existent `archived` column (root cause of
//     the long-standing "running, never finishes" bug).
//
// Runs nightly. Two jobs:
//   1. PICKS: archive picks whose valid_until has passed; clear
//      tonight on any pick older than 36 h.
//   2. VENUES: flag venues not seen by OSM for > 21 days as
//      possibly_closed; archive auto-generated picks for them.
//
// All operations are idempotent.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Defensive cap on the titles array we stash in ingest_log.detail.
// The detail field is JSONB; a few hundred long titles would still
// be fine, but keep the row small so log browsing stays cheap.
const MAX_TITLES = 50;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default {
  async fetch(_req: Request): Promise<Response> {
    const sb  = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = new Date().toISOString();

    let logId: number | null = null;
    try {
      const { data: logRow, error: logErr } = await sb.from("ingest_log")
        .insert({ fn: "archive-stale" }).select("id").single();
      if (logErr) console.error("log insert error", logErr);
      logId = logRow?.id ?? null;
    } catch (e) {
      console.error("log insert threw", e);
    }

    const detail: Record<string, unknown> = {};
    const errors: string[] = [];
    let archivedCount = 0;
    let closedCount   = 0;
    let picksClosed   = 0;

    // ── 1a. Archive picks whose valid_until has passed ──────────
    try {
      const { data: expired, error } = await sb
        .from("picks")
        .update({ archived_at: now, tonight: false, this_week: false })
        .lt("valid_until", now)
        .is("archived_at", null)
        .select("id, title, valid_until");
      if (error) throw error;
      archivedCount = expired?.length ?? 0;
      detail.picks_archived_expired = archivedCount;
      const titles = (expired ?? []).map(
        (p: { id: string; title: string }) => p.title,
      );
      detail.archived_titles = titles.slice(0, MAX_TITLES);
      if (titles.length > MAX_TITLES) {
        detail.archived_titles_truncated = titles.length - MAX_TITLES;
      }
    } catch (e) {
      errors.push(`1a: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── 1b. Reset tonight on stale tonight picks ────────────────
    try {
      const { error } = await sb.from("picks")
        .update({ tonight: false })
        .eq("tonight", true)
        .lt("created_at", new Date(Date.now() - 36 * 3600_000).toISOString())
        .is("archived_at", null);
      if (error) throw error;
    } catch (e) {
      errors.push(`1b: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── 2a. Flag venues not seen by OSM for > 21 days ───────────
    let stalledIds: string[] = [];
    try {
      const staleDate = new Date(Date.now() - 21 * 86400_000).toISOString();
      const { data: stalledVenues, error } = await sb
        .from("venues")
        .update({ status: "possibly_closed" })
        .eq("status", "active")
        .lt("last_seen_at", staleDate)
        .select("id");
      if (error) throw error;
      stalledIds  = (stalledVenues ?? []).map((v: { id: string }) => v.id);
      closedCount = stalledIds.length;
      detail.venues_possibly_closed = closedCount;
    } catch (e) {
      errors.push(`2a: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── 2b. Archive auto-generated picks for possibly_closed venues
    //    Chunked .in() so the URL stays under the PostgREST limit when
    //    hundreds of venues go stale.
    try {
      if (stalledIds.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < stalledIds.length; i += CHUNK) {
          const slice = stalledIds.slice(i, i + CHUNK);
          const { data: closedPicks, error } = await sb
            .from("picks")
            .update({ archived_at: now, tonight: false, this_week: false })
            .in("venue_id", slice)
            .eq("auto_generated", true)
            .is("archived_at", null)
            .select("id");
          if (error) throw error;
          picksClosed += closedPicks?.length ?? 0;
        }
        detail.picks_archived_closed_venue = picksClosed;
      }
    } catch (e) {
      errors.push(`2b: ${e instanceof Error ? e.message : String(e)}`);
    }

    const status = errors.length ? "error" : "ok";
    const archivedTotal = archivedCount + picksClosed;
    if (logId !== null) {
      const { error: closeErr } = await sb.from("ingest_log").update({
        finished_at: new Date().toISOString(),
        status,
        inserted:    archivedTotal,
        detail,
        error: errors.length ? errors.join("; ") : null,
      }).eq("id", logId);
      if (closeErr) console.error("log close error", closeErr);
    }

    return json({
      ok:       errors.length === 0,
      archived: archivedTotal,
      ...detail,
      errors:   errors.length ? errors : undefined,
    }, errors.length === 0 ? 200 : 500);
  }
};
