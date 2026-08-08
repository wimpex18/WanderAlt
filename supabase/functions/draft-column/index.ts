import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// draft-column — RETIRED (Aug 2026)
//
// This function drafted a weekly editorial column attributed to a
// `curator_handle`. The Aug 2026 redesign removed curators, nothing
// public ever rendered the output, and `draft-column-weekly` was
// unscheduled at the same time.
//
// The directory was then deleted from the repo and that was recorded as
// "deleted" — which was wrong, and wrong in exactly the way the note
// beside classify-moods and match-pick warns about. **Deleting the
// source does not undeploy anything.** Probed 9 Aug 2026: an
// unauthenticated POST to this URL still returned 200. It was a live,
// world-reachable, LLM-calling endpoint spending free-tier quota to
// write copy for a feature that no longer exists — the precise failure
// the other three were tombstoned to avoid, made in the same session
// that documented it.
//
// So it becomes the fourth tombstone: 410, verify_jwt:true, costs
// nothing. To remove it for good, delete the function in the Supabase
// dashboard (the MCP tool set has deploy/get/list but no delete), then
// delete this directory. The real implementation is in git history.
// ============================================================

Deno.serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: 'gone',
      detail: 'draft-column was retired in Aug 2026 when the redesign removed curators.',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  )
);
