/* ============================================================
   WanderAlt — send-digest edge function v9
   v9: gemini-3.5-flash for email intro generation.
   ============================================================ */

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_SRV  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND  = Deno.env.get('RESEND_API_KEY') ?? '';
const GEMINI  = Deno.env.get('GEMINI_API_KEY') ?? '';
const FROM    = Deno.env.get('DIGEST_FROM_EMAIL') ?? 'WanderAlt <onboarding@resend.dev>';
const BASE_URL = Deno.env.get('SITE_URL') ?? 'https://wanderalt.com';
const GEMINI_MODEL = 'gemini-3.5-flash';

const sbFetch = (path: string, opts: RequestInit = {}) =>
  fetch(`${SB_URL}${path}`, {
    ...opts,
    headers: {
      apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`,
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });

interface Pick {
  id: string; title: string; venue: string;
  neighborhood: string; kind: string;
  day: string|null; time: string|null;
  quote: string; handle: string;
  tonight: boolean;
}

interface Recipient {
  email: string;
  unsubUrl: string;
}

const fetchAuthRecipients = async (city: string): Promise<Recipient[]> => {
  const r = await sbFetch(`/rest/v1/profiles?digest_enabled=eq.true&city=eq.${encodeURIComponent(city)}&select=user_id`);
  if (!r.ok) return [];
  const profiles = await r.json() as { user_id: string }[];
  const out: Recipient[] = [];
  for (const p of profiles) {
    const ur = await sbFetch(`/auth/v1/admin/users/${p.user_id}`);
    if (!ur.ok) continue;
    const d = await ur.json();
    if (d.email) out.push({ email: d.email, unsubUrl: `${BASE_URL}/profile.html#digest` });
  }
  return out;
};

const fetchOptInRecipients = async (city: string): Promise<Recipient[]> => {
  const r = await sbFetch(`/rest/v1/digest_opt_ins?city=eq.${encodeURIComponent(city)}&select=id,email`);
  if (!r.ok) return [];
  const rows = await r.json() as { id: string; email: string }[];
  return rows.map(row => ({
    email: row.email,
    unsubUrl: `${SB_URL}/functions/v1/unsubscribe-digest?token=${row.id}`,
  }));
};

const fetchThisWeekPicks = async (city: string, limit = 5): Promise<Pick[]> => {
  const r = await sbFetch(
    `/rest/v1/picks?this_week=eq.true&archived_at=is.null&city=eq.${encodeURIComponent(city)}` +
    `&select=id,title,venue,neighborhood,kind,day,time,quote,handle,tonight` +
    `&order=tonight.desc,sort_order.asc,created_at.asc&limit=${limit}`
  );
  if (!r.ok) return [];
  return r.json();
};

const generateIntro = async (picks: Pick[], city: string): Promise<string> => {
  const fallback = `This week in ${city}: five picks from the humans who know it best.`;
  if (!GEMINI) return fallback;
  const manifest = picks.map(p => `- "${p.quote}" — ${p.handle} recommends ${p.venue} (${p.neighborhood})`).join('\n');
  const prompt = [
    `Write a 60-80 word editorial intro for WanderAlt's weekly briefing email.`,
    `City: ${city}.`,
    `This week's picks:`,
    manifest,
    ``,
    `Tone: a thoughtful local writing a back-page newsletter.`,
    `No em-dashes. No exclamation marks. No "discover". No marketing voice.`,
    `Reference one or two of the picks by name. End with a complete sentence.`,
    `Return only the intro text, no subject line, no sign-off.`,
  ].join('\n');
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 200 } }) }
    );
    if (!res.ok) return fallback;
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? fallback;
  } catch { return fallback; }
};

const buildMeta = (p: Pick) => {
  const parts = [p.neighborhood, p.kind];
  if (p.day && p.day !== 'Tonight') parts.push(`${p.day} ${p.time ?? ''}`.trim());
  else if (p.time) parts.push(p.time);
  return parts.filter(Boolean).join(' · ');
};

const renderPickRow = (p: Pick) => {
  const tonightBadge = p.tonight
    ? `<span style="display:inline-block;background:#c8f56a;color:#1a1a1a;font-family:'Courier New',monospace;font-size:10px;font-weight:600;letter-spacing:0.08em;padding:2px 7px;border-radius:3px;vertical-align:middle;margin-right:8px;text-transform:uppercase;">Tonight</span>`
    : '';
  return `<tr><td style="padding:14px 0;border-top:1px solid #e8e3da;">
    <p style="margin:0 0 5px;font-family:'Georgia',serif;font-size:16px;line-height:1.3;color:#1a1a1a;">
      ${tonightBadge}<a href="${BASE_URL}/venue.html?id=${p.id}" style="color:#1a1a1a;text-decoration:none;">${p.title}</a></p>
    <p style="margin:0 0 8px;font-family:'Courier New',monospace;font-size:11px;color:#888;letter-spacing:0.05em;">${buildMeta(p)}</p>
    <p style="margin:0;font-family:'Georgia',serif;font-size:15px;line-height:1.6;color:#444;font-style:italic;">
      &ldquo;${p.quote}&rdquo;
      <span style="font-style:normal;font-family:'Courier New',monospace;font-size:11px;color:#8a2a1a;white-space:nowrap;"> — ${p.handle}</span></p>
  </td></tr>`;
};

const renderHtml = (intro: string, picks: Pick[], city: string, unsubUrl: string) => {
  const cityTitle = city.charAt(0).toUpperCase() + city.slice(1);
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>WanderAlt &middot; ${cityTitle}</title></head>
  <body style="margin:0;padding:0;background:#f6f3ec;font-family:'Georgia',serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="background:#f6f3ec;padding:32px 16px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;background:#f6f3ec;"><tr><td>
    <p style="margin:0 0 2px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#999;">WanderAlt</p>
    <h1 style="margin:0 0 4px;font-family:'Georgia',serif;font-size:28px;font-weight:400;color:#1a1a1a;">This week in ${cityTitle}</h1>
    <p style="margin:0 0 20px;font-family:'Courier New',monospace;font-size:11px;color:#aaa;letter-spacing:0.04em;border-bottom:1px solid #d8d3ca;padding-bottom:16px;">${dateStr}</p>
    <p style="margin:0 0 24px;font-family:'Georgia',serif;font-size:16px;line-height:1.7;color:#2a2a2a;">${intro}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">${picks.map(renderPickRow).join('')}<tr><td style="padding-top:4px;border-top:1px solid #e8e3da;"></td></tr></table>
    <p style="margin:28px 0 0;font-family:'Courier New',monospace;font-size:10px;color:#bbb;letter-spacing:0.06em;line-height:2;">
      WanderAlt &middot; Curated by humans, not algorithms.<br>
      <a href="${unsubUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> &nbsp;&middot;&nbsp; <a href="${BASE_URL}" style="color:#999;text-decoration:underline;">${BASE_URL.replace(/^https?:\/\//, '')}</a></p>
  </td></tr></table>
  </td></tr></table></body></html>`;
};

const renderText = (intro: string, picks: Pick[], city: string, unsubUrl: string) => [
  `WanderAlt · ${city.toUpperCase()} · This week`, '='.repeat(40), '', intro, '',
  '-'.repeat(40),
  ...picks.flatMap(p => [
    (p.tonight ? '[TONIGHT] ' : '') + p.title,
    buildMeta(p), `"${p.quote}" — ${p.handle}`,
    `${BASE_URL}/venue.html?id=${p.id}`, ''
  ]),
  '-'.repeat(40),
  `WanderAlt · Curated by humans, not algorithms.`,
  `Unsubscribe: ${unsubUrl}`,
].join('\n');

const sendEmail = async (to: string, subject: string, html: string, text: string): Promise<{ok:boolean;error?:string}> => {
  if (!RESEND) return { ok: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({})) as Record<string,unknown>;
  return { ok: false, error: (body.message as string) ?? `HTTP ${res.status}` };
};

const log = async (status: string, inserted: number, error?: string) => {
  await sbFetch('/rest/v1/ingest_log', {
    method: 'POST',
    body: JSON.stringify({ fn: 'send-digest', status, inserted, rejected: 0, error: error ?? null, finished_at: new Date().toISOString() }),
  }).catch(() => {});
};

Deno.serve(async (req: Request) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const dryRun     = body.dry_run === true;
  const targetMail = body.email as string|undefined;
  const city       = (body.city as string|undefined) ?? 'tallinn';

  let recipients: Recipient[];
  if (targetMail) {
    recipients = [{ email: targetMail, unsubUrl: `${BASE_URL}/profile.html#digest` }];
  } else {
    const [auth, optIn] = await Promise.all([
      fetchAuthRecipients(city),
      fetchOptInRecipients(city),
    ]);
    const authEmails = new Set(auth.map(r => r.email.toLowerCase()));
    const optInDeduped = optIn.filter(r => !authEmails.has(r.email.toLowerCase()));
    recipients = [...auth, ...optInDeduped];
  }

  if (!recipients.length) {
    await log('ok', 0);
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no subscribers' }), { headers: { 'Content-Type': 'application/json' } });
  }

  const picks = await fetchThisWeekPicks(city, 5);
  if (!picks.length) {
    await log('ok', 0);
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no picks this week' }), { headers: { 'Content-Type': 'application/json' } });
  }

  const tonight = picks.find(p => p.tonight);
  const intro = await generateIntro(picks, city);
  const cityTitle = city.charAt(0).toUpperCase() + city.slice(1);
  const subject = tonight
    ? `WanderAlt · ${cityTitle} · Tonight: ${tonight.title}`
    : `WanderAlt · ${cityTitle} · This week`;

  let sent = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    const html = renderHtml(intro, picks, city, r.unsubUrl);
    const text = renderText(intro, picks, city, r.unsubUrl);
    if (dryRun) { sent++; continue; }
    const { ok, error } = await sendEmail(r.email, subject, html, text);
    if (ok) sent++; else errors.push(`${r.email}: ${error}`);
  }

  const status = errors.length === 0 ? 'ok' : 'partial';
  await log(status, sent, errors.length ? errors.join('; ') : undefined);
  return new Response(JSON.stringify({ ok: true, sent, total: recipients.length, errors: errors.length ? errors : undefined }), { headers: { 'Content-Type': 'application/json' } });
});
