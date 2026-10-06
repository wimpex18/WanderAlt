/* ============================================================
   /api/unsubscribe?t=<token> — stops the email alerts, one click.
   ------------------------------------------------------------
   The token is the secret in every mail's link and List-Unsubscribe
   header (digest_prefs.unsubscribe_token). GET only shows a button, so a
   mail scanner that opens the link does not unsubscribe anyone; the POST
   (the button, or a mail client's one-click) does it, by calling the
   `unsubscribe` Supabase function, which holds the service-role key; this
   Pages project needs no secret.
   ============================================================ */

const SUPABASE_URL = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const page = (body, status = 200) => new Response(
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Email alerts · WanderAlt</title><script defer src="/lang/et.js"></script><script defer src="/lang/ru.js"></script><script defer src="/lang/uk.js"></script><script defer src="/i18n.js"></script>` +
  `<body style="font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px"><h1 style="font-size:1.4rem">Email alerts</h1>${body}` +
  `<p><a href="/profile.html">WanderAlt</a></p></body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

const tokenOf = (request) => {
  const t = new URL(request.url).searchParams.get('t') || '';
  return TOKEN.test(t) ? t : '';
};

export const onRequestGet = async ({ request }) => {
  const t = tokenOf(request);
  if (!t) return page('<p>This link is not valid.</p>', 400);
  return page(`<p>Stop email and notifications?</p><form method="post" action="/api/unsubscribe?t=${t}"><button type="submit" style="font:inherit;padding:10px 18px">Stop alerts</button></form>`);
};

export const onRequestPost = async ({ request }) => {
  const t = tokenOf(request);
  if (!t) return page('<p>This link is not valid.</p>', 400);
  let ok = false;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/unsubscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ t }),
      signal: AbortSignal.timeout(10000),
    });
    ok = r.ok;
  } catch (_) { /* reported below */ }
  if (!ok) return page('<p>That did not work. Write to hello@wanderalt.app and we will stop it by hand.</p>', 502);
  return page('<p>Done. No more email or notifications from WanderAlt. You can switch alerts on again from You.</p>');
};
