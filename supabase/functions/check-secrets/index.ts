// Retired diagnostic (Jul 2026). Listed which WanderAlt secrets were set —
// names only, never values — but was deployed with verify_jwt:false, so
// anyone could fingerprint the pipeline's provider set. The probe had done
// its job; it is now a JWT-gated stub. Original body: git history.
Deno.serve(() => new Response('gone — secret-presence diagnostic retired', { status: 410 }));
