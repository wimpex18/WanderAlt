import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// delete-account — deletes the signed-in reader's account.
// POST with the reader's own access token in Authorization  →  204,
// or 401 (no valid session) / 502 (the delete failed).
//
// Everything the reader owns (bookmarks, lists, going, follows, digest
// prefs, push subscriptions, inbox) references auth.users with ON DELETE
// CASCADE, so removing the user removes it all; problem_reports keep their
// text with user_id set null.
//
// verify_jwt is FALSE on purpose: a browser's CORS preflight carries no
// token and the gateway would refuse it. The function checks the token
// itself against Supabase Auth and only ever deletes the user it belongs
// to; there is no id in the request to forge.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGIN = /^(https:\/\/wanderalt\.app|https:\/\/[a-z0-9-]+\.wanderalt\.pages\.dev|http:\/\/localhost:5173)$/;

const cors = (req: Request): Record<string, string> => {
  const o = req.headers.get('origin') || '';
  return ORIGIN.test(o)
    ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin' }
    : {};
};

const serviceHeaders = () => ({
  apikey: SERVICE_KEY,
  ...(SERVICE_KEY.startsWith('eyJ') ? { authorization: `Bearer ${SERVICE_KEY}` } : {}),
});

Deno.serve(async (req: Request) => {
  const h = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: h });

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return new Response('sign in first', { status: 401, headers: h });

  // Who does this token belong to? Auth answers 401 for anon, expired or revoked tokens.
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${token}` } });
  const user = who.ok ? await who.json().catch(() => null) as { id?: string } | null : null;
  if (!user?.id) return new Response('sign in first', { status: 401, headers: h });

  const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: serviceHeaders() });
  return new Response(null, { status: del.ok ? 204 : 502, headers: h });
});
