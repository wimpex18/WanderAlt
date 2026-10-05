// Posts and checks for Threads, Instagram and Facebook, run by hand:
//   node pipeline/social.ts check                      tokens and Threads search, nothing posted
//   node pipeline/social.ts tonight                    print the "tonight" post, nothing posted
//   node pipeline/social.ts tonight --publish threads  post it to Threads
//   node pipeline/social.ts tonight --publish facebook post it to our Facebook Page
//   node pipeline/social.ts instagram --image URL.jpg --caption "…" --publish
// Nothing is posted without --publish. See docs/social.md.

import { Db } from './db.ts';
import { instagramConfig, lookupProfile, recentPosts } from './instagram.ts';
import * as threads from './social/threads.ts';
import * as instagram from './social/instagram.ts';
import * as facebook from './social/facebook.ts';

const args = process.argv.slice(2);
const flag = (k: string) => args.includes(k);
const opt = (k: string) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const log = (s: string) => console.log(`[social] ${s}`);

/** The Threads token: the stored one (refreshed when under 30 days remain),
 *  else the THREADS_ACCESS_TOKEN secret, which is stored on first use. */
export async function threadsToken(db: Pick<Db, 'select' | 'upsert'> | null, env = process.env, fetcher: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  const stored = db ? (await db.select<{ token: string; expires_at: string | null }>('social_tokens?id=eq.threads&select=token,expires_at'))[0] : undefined;
  let current: threads.ThreadsToken | null = stored ? { token: stored.token, expiresAt: stored.expires_at }
    : env.THREADS_ACCESS_TOKEN?.trim() ? { token: env.THREADS_ACCESS_TOKEN.trim(), expiresAt: null } : null;
  if (!current) return null;
  const left = current.expiresAt ? Date.parse(current.expiresAt) - now : 0;
  if (!current.expiresAt || left < 30 * 86_400_000) {
    try { current = await threads.refreshToken(current.token, fetcher, now); log(`Threads token refreshed, valid until ${current.expiresAt?.slice(0, 10)}`); }
    catch (e) { log(`Threads token not refreshed: ${(e as Error).message}`); if (left <= 0 && stored) return null; }
    if (db) await db.upsert('social_tokens', [{ id: 'threads', token: current.token, expires_at: current.expiresAt, updated_at: new Date(now).toISOString() }], 'id');
  }
  return current.token;
}

/** The "tonight" post: what is on, in the site's voice, within Threads' 500 characters. */
export function tonightText(events: { title: string; venue: string | null; starts_at: string; has_time?: boolean }[], date = new Date()): string {
  const day = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Tallinn' });
  const head = `Tonight in Tallinn, ${day}:`;
  const tail = '\n\nwanderalt.app';
  const lines: string[] = [];
  for (const e of events) {
    const t = e.has_time === false ? '' : new Date(e.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Tallinn' }) + ' ';
    const line = `${t}${e.title.trim()}${e.venue ? `, ${e.venue}` : ''}`;
    const next = [head, '', ...lines, line].join('\n') + tail;
    if (next.length > 500) break;
    lines.push(line);
  }
  return lines.length ? [head, '', ...lines].join('\n') + tail : '';
}

async function main() {
  const cmd = args[0];
  const publishTo = opt('--publish');
  if (cmd === 'check') {
    const cfg = instagramConfig();
    if (cfg && process.env.FACEBOOK_PAGE_ID) {
      try {
        const page = await facebook.ownPage(cfg, process.env.FACEBOOK_PAGE_ID);
        await facebook.checkPage(page);
        log(`Facebook Page ${page.name}: assigned for publishing, feed readable (nothing posted)`);
      } catch (e) { log(`Facebook: ${(e as Error).message}`); }
    } else log('Facebook publishing: FACEBOOK_PAGE_ID or Instagram secrets not set');
    log(cfg ? `Instagram lookup @laine.bar: ${(await lookupProfile('laine.bar', cfg)).kind}` : 'Instagram: secrets not set');
    if (cfg) {
      const posts = await recentPosts('laine.bar', cfg, 10);
      log(posts ? `Instagram posts of @laine.bar: ${posts.length} read, newest ${posts[0]?.timestamp?.slice(0, 10) ?? 'none'}, ${posts.filter(p => p.caption).length} with a caption` : 'Instagram posts of @laine.bar: not readable');
    }
    if (cfg) { try { const q = await instagram.publishingLimit(cfg); log(`Instagram publishing quota: ${q.used}/${q.total} used in 24 hours`); } catch (e) { log(`Instagram publishing: ${(e as Error).message}`); } }
    const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? new Db() : null;
    const token = await threadsToken(db);
    if (!token) { log('Threads: no token (THREADS_ACCESS_TOKEN secret or a stored token is needed)'); return; }
    const who = await threads.me(token);
    log(`Threads token belongs to @${who.username}`);
    const hits = await threads.keywordSearch(token, 'Tallinn').catch(e => { log(`Threads keyword search: ${(e as Error).message}`); return null; });
    if (hits) log(`Threads keyword search "Tallinn": ${hits.length} posts, ${hits.filter(h => h.username && h.username !== who.username).length} from other accounts${hits.length && !hits.some(h => h.username && h.username !== who.username) ? ' (own posts only: public search needs App Review)' : ''}`);
    for (const line of await threads.probe(token, who.username)) log(`Threads probe, ${line}`);
    const lookup = await threads.profileLookup(token, 'instagram');
    log(`Threads profile lookup @instagram: ${lookup ? 'works' : 'refused'}; ${await threads.profileLookup(token, 'laine.bar') ? 'a venue profile was found' : 'a venue profile is not available yet'}`);
    return;
  }
  if (cmd === 'tonight') {
    if (publishTo && !['threads', 'facebook'].includes(publishTo)) throw new Error('--publish must be threads or facebook');
    const db = new Db();
    const now = new Date(Date.now()).toISOString();
    const rows = await db.select<{ title: string; venue: string | null; starts_at: string }>(
      `picks?tonight=is.true&starts_at=gte.${now}&order=starts_at.asc&limit=12&select=title,venue,starts_at`);
    const text = tonightText(rows);
    if (!text) { log('nothing on tonight to post'); return; }
    console.log(`\n${text}\n\n(${text.length} characters)`);
    if (!publishTo) return;
    if (publishTo === 'facebook') {
      const cfg = instagramConfig();
      if (!cfg) throw new Error('Facebook needs Instagram secrets');
      const page = await facebook.ownPage(cfg, process.env.FACEBOOK_PAGE_ID ?? '');
      log(`posted to Facebook Page ${page.name}: ${await facebook.publishText(page, text)}`);
      return;
    }
    const token = await threadsToken(db);
    if (!token) throw new Error('no Threads token');
    const who = await threads.me(token);
    log(`posted to Threads as @${who.username}: ${await threads.publish(token, who.id, { text })}`);
    return;
  }
  if (cmd === 'instagram') {
    const cfg = instagramConfig(), image = opt('--image'), caption = opt('--caption');
    if (!cfg || !image || !caption) throw new Error('instagram needs the secrets, --image (a public .jpg address) and --caption');
    console.log(`\n${caption}\n${image}\n`);
    if (!flag('--publish')) { log('preview only; add --publish to post'); return; }
    log(`posted to Instagram: ${await instagram.publishImage(cfg, { imageUrl: image, caption, altText: opt('--alt') })}`);
    return;
  }
  log('usage: node pipeline/social.ts check | tonight [--publish threads|facebook] | instagram --image URL.jpg --caption "…" [--publish]');
}

if (import.meta.main) main().catch(e => { console.error('[social]', (e as Error).message); process.exitCode = 1; });
