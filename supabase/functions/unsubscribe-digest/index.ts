/* ============================================================
   WanderAlt — unsubscribe-digest edge function
   ------------------------------------------------------------
   Handles unsubscribe links from digest emails sent to non-auth
   opt-in subscribers. The row UUID is the unsubscribe token —
   service-role DELETE removes the row.

   Public endpoint (verify_jwt: false). The UUID token itself is
   the auth — unguessable, scoped to one row.

   GET /functions/v1/unsubscribe-digest?token=<uuid>
   ============================================================ */

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_SRV  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://wanderalt.com';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>WanderAlt &middot; ${title}</title>
<style>
  body { margin:0; padding:48px 20px; background:#f6f3ec; font-family:Georgia,serif; color:#1a1a1a; }
  .wrap { max-width:480px; margin:0 auto; }
  h1 { font-size:24px; font-weight:400; margin:0 0 12px; }
  p  { font-size:16px; line-height:1.6; margin:0 0 16px; }
  a  { color:#8a2a1a; }
  .eyebrow { font-family:'Courier New',monospace; font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:#999; margin:0 0 4px; }
</style></head><body><div class="wrap">
<p class="eyebrow">WanderAlt</p>${body}
<p style="margin-top:32px;"><a href="${SITE_URL}">&larr; ${SITE_URL.replace(/^https?:\/\//, '')}</a></p>
</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';

  if (!UUID_RE.test(token)) {
    return page('Invalid link', '<h1>Invalid unsubscribe link</h1><p>This link is malformed or expired.</p>', 400);
  }

  const res = await fetch(
    `${SB_URL}/rest/v1/digest_opt_ins?id=eq.${token}`,
    {
      method: 'DELETE',
      headers: {
        apikey: SB_SRV,
        Authorization: `Bearer ${SB_SRV}`,
        Prefer: 'return=representation',
      },
    }
  );

  if (!res.ok) {
    return page('Error', '<h1>Something went wrong</h1><p>We couldn\'t process your unsubscribe right now. Please try again later.</p>', 500);
  }

  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    return page('Already unsubscribed', '<h1>You\'re already unsubscribed</h1><p>This email isn\'t on our digest list.</p>');
  }

  return page('Unsubscribed', '<h1>You\'ve been unsubscribed</h1><p>You won\'t receive any more weekly digests from WanderAlt.</p>');
});
