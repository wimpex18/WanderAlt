// Tells readers what changed. The main channel is the in-app inbox (the
// notifications table): a row when a saved or going event is cancelled or
// postponed, and one a week for what is on at places, sources and searches a
// reader follows. Web push and email are opt-in extras on top. Runs daily on
// GitHub Actions (.github/workflows/digest.yml). Nothing is written when there
// is nothing to say; email carries a one-click unsubscribe and goes out only
// when RESEND_API_KEY is set.
//
//   node pipeline/digest.ts [--dry-run] [--weekly]
//
// Push (Web Push, pipeline/webpush.ts) needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
// (and optionally VAPID_SUBJECT); without them push is skipped.
// --dry-run prints what would be sent and writes nothing. --weekly sends the
// weekly digest on any weekday (it otherwise goes out Thursday to Saturday).
// Needs SUPABASE_SERVICE_ROLE_KEY and, to send, RESEND_API_KEY. The sender
// address is DIGEST_FROM (default "WanderAlt <digest@wanderalt.app>"), and
// DIGEST_DAILY_CAP (default 90) keeps a day under Resend's free 100.

import { Db, SUPABASE_URL, chunks } from './db.ts';
import { composeChanges, composeWeekly, inboxChanges, inboxWeek, type InboxItem, pushChanges, pushTonight, tonightEvents, unsubscribeUrl, weeklyEvents, type EventRow, type Mail, type PushMessage } from './digest-core.ts';
import { sendPush, type PushSubscription, type Vapid } from './webpush.ts';
import { tallinnToIso } from './time.ts';

const args = new Set(process.argv.slice(2));
const dry = args.has('--dry-run');
const FROM = process.env.DIGEST_FROM?.trim() || 'WanderAlt <digest@wanderalt.app>';
const CAP = Math.max(1, Number(process.env.DIGEST_DAILY_CAP) || 90);
const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Tallinn', weekday: 'short' }).format(new Date());
const weeklyDay = args.has('--weekly') || ['Thu', 'Fri', 'Sat'].includes(WEEKDAY);

interface Prefs {
  user_id: string; weekly: boolean; changes: boolean; push: boolean; tonight: boolean;
  unsubscribe_token: string; last_weekly_at: string | null; last_tonight_on: string | null;
}
const PREFS = 'user_id,weekly,changes,push,tonight,unsubscribe_token,last_weekly_at,last_tonight_on';

const vapid: Vapid | null = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  ? { publicKey: process.env.VAPID_PUBLIC_KEY.trim(), privateKey: process.env.VAPID_PRIVATE_KEY.trim(), subject: process.env.VAPID_SUBJECT?.trim() || 'mailto:hello@wanderalt.app' }
  : null;

/** Pushes to every device a reader has allowed; dead subscriptions are deleted. True when one arrived. */
async function pushTo(userId: string, m: PushMessage): Promise<boolean> {
  if (!vapid) return false;
  const subs = await db.select<PushSubscription>(`push_subscriptions?user_id=eq.${userId}&select=endpoint,p256dh,auth`);
  let delivered = false;
  for (const sub of subs) {
    if (dry) { console.log(`[dry-run] push to a device of ${userId.slice(0, 8)}: ${m.title} / ${m.body}`); delivered = true; continue; }
    const r = await sendPush(sub, m, vapid).catch(() => 'failed' as const);
    if (r === 'ok') delivered = true;
    else if (r === 'gone') await db.req('DELETE', `push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(sub.endpoint)}`, undefined, 'return=minimal');
  }
  return delivered;
}

const COLS = 'id,title,venue,venue_id,handle,starts_at,time,flag,kind,is_free,price_min,event_languages';
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

/** Writes inbox rows; a row already there for the same (reader, dedupe) is left alone. */
async function toInbox(userId: string, items: InboxItem[]) {
  if (!items.length) return;
  if (dry) { for (const i of items) console.log(`[dry-run] inbox of ${userId.slice(0, 8)}: ${i.title}`); return; }
  await db.req('POST', 'notifications?on_conflict=user_id,dedupe', items.map(i => ({ user_id: userId, ...i })), 'resolution=ignore-duplicates,return=minimal');
}

async function changes() {
  const changed = await db.all<EventRow>(`picks?flag=in.(cancelled,postponed)&archived_at=is.null&starts_at=gte.${now.toISOString()}&select=${COLS}&order=starts_at.asc`);
  if (!changed.length) return;
  const byId = new Map(changed.map(e => [e.id, e]));
  /* Who saved or marked going a changed event. */
  const mineBy = new Map<string, Set<string>>();
  for (const table of ['bookmarks', 'going']) {
    for (const ids of chunks([...byId.keys()], 100)) {
      const rows = await db.all<{ user_id: string; pick_id: string }>(`${table}?pick_id=${inList(ids)}&select=user_id,pick_id&order=user_id.asc,pick_id.asc`);
      for (const r of rows) mineBy.set(r.user_id, (mineBy.get(r.user_id) ?? new Set()).add(r.pick_id));
    }
  }
  if (!mineBy.size) return;
  const prefs = new Map((await db.all<Prefs>(`digest_prefs?select=${PREFS}&order=user_id.asc`)).map(p => [p.user_id, p]));
  for (const [userId, pickIds] of mineBy) {
    const events = [...pickIds].map(id => byId.get(id)!);
    await toInbox(userId, inboxChanges(events));
    const p = prefs.get(userId);
    if (!p || !(p.changes || p.push)) continue;
    const told = await db.select<{ pick_id: string; flag: string }>(`change_notices?user_id=eq.${userId}&select=pick_id,flag`);
    const done = new Set(told.map(t => `${t.pick_id}|${t.flag}`));
    const mine = events.filter(e => !done.has(`${e.id}|${e.flag}`));
    if (!mine.length) continue;
    let told_ = false;
    const note = p.push ? pushChanges(mine) : null;
    if (note && await pushTo(userId, note)) told_ = true;
    const mail = p.changes && sent < CAP && process.env.RESEND_API_KEY ? composeChanges(mine, p.unsubscribe_token) : null;
    if (mail) {
      const to = await emailOf(userId);
      if (to && await send(to, mail, p.unsubscribe_token)) { sent++; told_ = true; }
    }
    if (told_ && !dry) await db.insert('change_notices', mine.map(e => ({ user_id: userId, pick_id: e.id, flag: e.flag })));
  }
}

/** Once a week: what is on in the next seven days at followed places, sources and searches. */
async function inboxWeekly() {
  if (!weeklyDay) return;
  const events = await weekEvents();
  if (!events.length) return;
  const rows = await db.all<{ user_id: string; follow_id: string }>('follows?select=user_id,follow_id&order=user_id.asc,follow_id.asc');
  const byUser = new Map<string, Set<string>>();
  for (const r of rows) byUser.set(r.user_id, (byUser.get(r.user_id) ?? new Set()).add(r.follow_id));
  for (const [userId, follows] of byUser) {
    const item = inboxWeek(weeklyEvents(follows, events, now), now);
    if (item) await toInbox(userId, [item]);
  }
}

/** Clears rows older than 30 days. */
async function tidy() {
  if (dry) return;
  await db.req('DELETE', `notifications?created_at=lt.${new Date(now.getTime() - 30 * 86_400_000).toISOString()}`, undefined, 'return=minimal');
}

let weekCache: EventRow[] | null = null;
async function weekEvents() {
  return weekCache ??= await db.all<EventRow>(`picks?archived_at=is.null&starts_at=gte.${now.toISOString()}&starts_at=lt.${new Date(now.getTime() + 8 * 86_400_000).toISOString()}&select=${COLS}&order=starts_at.asc`);
}

/** One notification at about 16:00 Tallinn time: what starts today at followed places, sources and searches. */
async function tonight() {
  if (!vapid) return;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(now);
  const prefs = (await db.select<Prefs>(`digest_prefs?tonight=eq.true&push=eq.true&select=${PREFS}`)).filter(p => p.last_tonight_on !== today);
  if (!prefs.length) return;
  const endOfDay = new Date(tallinnToIso(`${today} 23:59:59`)!);
  const events = await db.all<EventRow>(`picks?archived_at=is.null&starts_at=gte.${now.toISOString()}&starts_at=lte.${endOfDay.toISOString()}&select=${COLS}&order=starts_at.asc`);
  if (!events.length) return;
  const rows = await db.select<{ user_id: string; follow_id: string }>(`follows?user_id=${inList(prefs.map(p => p.user_id))}&select=user_id,follow_id&limit=5000`);
  for (const p of prefs) {
    const follows = new Set(rows.filter(r => r.user_id === p.user_id).map(r => r.follow_id));
    const note = pushTonight(tonightEvents(follows, events, now, endOfDay));
    if (note && await pushTo(p.user_id, note) && !dry) {
      await db.req('PATCH', `digest_prefs?user_id=eq.${p.user_id}`, { last_tonight_on: today }, 'return=minimal');
    }
  }
}

async function weekly() {
  if (!weeklyDay) return;
  const due = new Date(now.getTime() - 6 * 86_400_000).toISOString();
  const prefs = (await db.select<Prefs>(`digest_prefs?weekly=eq.true&select=${PREFS}`))
    .filter(p => !p.last_weekly_at || p.last_weekly_at < due);
  if (!prefs.length) return;
  const events = await weekEvents();
  const rows = await db.select<{ user_id: string; follow_id: string }>(`follows?user_id=${inList(prefs.map(p => p.user_id))}&select=user_id,follow_id&limit=5000`);
  for (const p of prefs) {
    if (sent >= CAP) return;
    const follows = new Set(rows.filter(r => r.user_id === p.user_id).map(r => r.follow_id));
    const mail = process.env.RESEND_API_KEY || dry ? composeWeekly(weeklyEvents(follows, events, now), p.unsubscribe_token) : null;
    if (!mail) continue;
    const to = await emailOf(p.user_id);
    if (!to || !await send(to, mail, p.unsubscribe_token)) continue;
    sent++;
    if (!dry) await db.req('PATCH', `digest_prefs?user_id=eq.${p.user_id}`, { last_weekly_at: now.toISOString() }, 'return=minimal');
  }
}

await changes();
await inboxWeekly();
await tonight();
await weekly();
await tidy();
console.log(`${dry ? 'would send' : 'sent'} ${sent} mail${sent === 1 ? '' : 's'} (cap ${CAP}${weeklyDay ? '' : ', not a weekly day'})`);
