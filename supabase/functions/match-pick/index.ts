import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// match-pick — RETIRED (Aug 2026)
//
// This function ran hybrid vector + full-text retrieval with a Groq
// rerank behind the Concierge answer panel.
// The Aug 2026 redesign deleted the Concierge, and nothing in the
// product calls this any more: no page script, no cron job, no other
// function.
//
// It is a tombstone rather than a deletion because deleting the
// directory would NOT have undeployed it. The live function would have
// kept answering on the public URL at verify_jwt:false — an
// unauthenticated, LLM-calling endpoint spending free-tier quota for a
// feature that no longer exists. A 410 that costs nothing is the
// smallest honest thing to leave running.
//
// To remove it for good, delete the function in the Supabase dashboard
// (the MCP tool set has deploy/get/list but no delete). Then delete
// this directory. The real implementation is in git history if the
// feature ever comes back; it was pinned to Groq's decommissioned
// llama-4-scout, so it paid a wasted 404 on every query anyway.
// ============================================================

Deno.serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: 'gone',
      detail: 'match-pick was retired in the Aug 2026 redesign along with the Concierge.',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  )
);
