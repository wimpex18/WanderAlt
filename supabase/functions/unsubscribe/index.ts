import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// unsubscribe — switches every email and push alert off for one token.
// POST { "t": "<digest_prefs.unsubscribe_token>" }  →  204, or 400 / 502.
//
// Called by functions/api/unsubscribe.js (the page a mail links to), so the
// Cloudflare project never holds the service-role key; this function gets
// its own from the Supabase environment.
//
// verify_jwt stays FALSE: the caller is a mail link with no session. The
// token is the secret; it identifies one row and does nothing else. Opening
// a link never calls this, only the POST behind the button does.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const body = await req.json().catch(() => null) as { t?: unknown } | null;
  const t = typeof body?.t === 'string' ? body.t : '';
  if (!TOKEN.test(t)) return new Response('invalid token', { status: 400 });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/digest_prefs?unsubscribe_token=eq.${t}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      ...(SERVICE_KEY.startsWith('eyJ') ? { authorization: `Bearer ${SERVICE_KEY}` } : {}),
      'content-type': 'application/json', prefer: 'return=minimal',
    },
    body: JSON.stringify({ weekly: false, changes: false, push: false, tonight: false, updated_at: new Date().toISOString() }),
  });
  return new Response(null, { status: r.ok ? 204 : 502 });
});
