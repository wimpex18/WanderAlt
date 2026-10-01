// Sends the email alerts: a weekly digest of what is coming up at the venues
// and sources a reader follows, and a note when a saved or going event is
// cancelled or postponed. Runs daily on GitHub Actions (.github/workflows/
// digest.yml). Only readers who switched an alert on are mailed; an empty
// mail is never sent; every mail carries a one-click unsubscribe.
//
//   node pipeline/digest.ts [--dry-run] [--weekly]
//
// --dry-run prints what would be sent and writes nothing. --weekly sends the
// weekly digest on any weekday (it otherwise goes out Thursday to Saturday).
// Needs SUPABASE_SERVICE_ROLE_KEY and, to send, RESEND_API_KEY. The sender
// address is DIGEST_FROM (default "WanderAlt <digest@wanderalt.app>"), and
// DIGEST_DAILY_CAP (default 90) keeps a day under Resend's free 100.

import { Db, SUPABASE_URL } from './db.ts';
import { composeChanges, composeWeekly, unsubscribeUrl, weeklyEvents, type EventRow, type Mail } from './digest-core.ts';

const args = new Set(process.argv.slice(2));
const dry = args.has('--dry-run');
const FROM = process.env.DIGEST_FROM?.trim() || 'WanderAlt <digest@wanderalt.app>';
const CAP = Math.max(1, Number(process.env.DIGEST_DAILY_CAP) || 90);
const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Tallinn', weekday: 'short' }).format(new Date());
const weeklyDay = args.has('--weekly') || ['Thu', 'Fri', 'Sat'].includes(WEEKDAY);

interface Prefs { user_id: string; weekly: boolean; changes: boolean; unsubscribe_token: string; last_weekly_at: string | null }

const COLS = 'id,title,venue,venue_id,handle,starts_at,time,flag';
const db = new Db();
const now = new Date();
let sent = 0;

async function emailOf(userId: string): Promise<string | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) return null;
  const u = await r.json() as { email?: string };
  return u.email || null;
}

async function send(to: string, mail: Mail, token: string): Promise<boolean> {
  if (dry) { console.log(`[dry-run] to ${to.replace(/^(.).*(@.*)$/, '$1***$2')}: ${mail.subject}\n${mail.text}\n`); return true; }
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error('RESEND_API_KEY is not set (use --dry-run to preview)');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [to], subject: mail.subject, text: mail.text, html: mail.html,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl(token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) { console.error(`send failed: ${r.status} ${(await r.text()).slice(0, 200)}`); return false; }
  return true;
}

const inList = (ids: string[]) => `in.(${ids.map(i => `"${i}"`).join(',')})`;

async function changes() {
  const prefs = await db.select<Prefs>('digest_prefs?changes=eq.true&select=user_id,weekly,changes,unsubscribe_token,last_weekly_at');
  if (!prefs.length) return;
  const changed = await db.all<EventRow>(`picks?flag=in.(cancelled,postponed)&archived_at=is.null&starts_at=gte.${now.toISOString()}&select=${COLS}&order=starts_at.asc`);
  if (!changed.length) return;
  const byId = new Map(changed.map(e => [e.id, e]));
  for (const p of prefs) {
    if (sent >= CAP) return;
    const [saved, going, told] = await Promise.all([
      db.select<{ pick_id: string }>(`bookmarks?user_id=eq.${p.user_id}&select=pick_id`),
      db.select<{ pick_id: string }>(`going?user_id=eq.${p.user_id}&select=pick_id`),
      db.select<{ pick_id: string; flag: string }>(`change_notices?user_id=eq.${p.user_id}&select=pick_id,flag`),
    ]);
    const done = new Set(told.map(t => `${t.pick_id}|${t.flag}`));
    const mine = [...new Set([...saved, ...going].map(r => r.pick_id))].map(id => byId.get(id))
      .filter((e): e is EventRow => !!e && !done.has(`${e.id}|${e.flag}`));
    const mail = composeChanges(mine, p.unsubscribe_token);
    if (!mail) continue;
    const to = await emailOf(p.user_id);
    if (!to || !await send(to, mail, p.unsubscribe_token)) continue;
    sent++;
    if (!dry) await db.insert('change_notices', mine.map(e => ({ user_id: p.user_id, pick_id: e.id, flag: e.flag })));
  }
}

async function weekly() {
  if (!weeklyDay) return;
  const due = new Date(now.getTime() - 6 * 86_400_000).toISOString();
  const prefs = (await db.select<Prefs>('digest_prefs?weekly=eq.true&select=user_id,weekly,changes,unsubscribe_token,last_weekly_at'))
    .filter(p => !p.last_weekly_at || p.last_weekly_at < due);
  if (!prefs.length) return;
  const events = await db.all<EventRow>(`picks?archived_at=is.null&starts_at=gte.${now.toISOString()}&starts_at=lt.${new Date(now.getTime() + 8 * 86_400_000).toISOString()}&select=${COLS}&order=starts_at.asc`);
  const rows = await db.select<{ user_id: string; follow_id: string }>(`follows?user_id=${inList(prefs.map(p => p.user_id))}&select=user_id,follow_id&limit=5000`);
  for (const p of prefs) {
    if (sent >= CAP) return;
    const follows = new Set(rows.filter(r => r.user_id === p.user_id).map(r => r.follow_id));
    const mail = composeWeekly(weeklyEvents(follows, events, now), p.unsubscribe_token);
    if (!mail) continue;
    const to = await emailOf(p.user_id);
    if (!to || !await send(to, mail, p.unsubscribe_token)) continue;
    sent++;
    if (!dry) await db.req('PATCH', `digest_prefs?user_id=eq.${p.user_id}`, { last_weekly_at: now.toISOString() }, 'return=minimal');
  }
}

await changes();
await weekly();
console.log(`${dry ? 'would send' : 'sent'} ${sent} mail${sent === 1 ? '' : 's'} (cap ${CAP}${weeklyDay ? '' : ', not a weekly day'})`);
