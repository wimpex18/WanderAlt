// Diagnostic — lists which WanderAlt secrets are present WITHOUT exposing values.
Deno.serve((_req) => {
  const keys = [
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "UNSPLASH_ACCESS_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "DIGEST_FROM_EMAIL",
  ];
  const result: Record<string, boolean> = {};
  for (const k of keys) {
    const v = Deno.env.get(k);
    result[k] = !!(v && v.trim().length > 0);
  }
  return new Response(JSON.stringify(result, null, 2),
    { headers: { "Content-Type": "application/json" } });
});
