// Posts and checks for Threads, Instagram and Facebook, run by hand:
//   node pipeline/social.ts check                      tokens and Threads search, nothing posted
//   node pipeline/social.ts tonight                    print the "tonight" post, nothing posted
//   node pipeline/social.ts tonight --publish threads  post it to Threads
//   node pipeline/social.ts tonight --publish facebook post it to our Facebook Page
//   node pipeline/social.ts instagram --image URL.jpg --caption "…" --publish
//   node pipeline/social.ts post FILE.json             preview one picture post for all three platforms
//   node pipeline/social.ts post FILE.json --to instagram,facebook --publish [--no-location]
// Nothing is posted without --publish. See README.md.

import { readFile } from 'node:fs/promises';
import { Db } from './db.ts';
import { instagramConfig, lookupProfile, recentPosts, hashtagPosts } from './instagram.ts';
import * as threads from './social/threads.ts';
import * as instagram from './social/instagram.ts';
import * as facebook from './social/facebook.ts';
import { PLATFORMS, loadPost, checkImage, type Platform } from './social/post.ts';
import { socialCoverage } from './social-coverage.ts';

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
  if (cmd === 'coverage') { console.log(JSON.stringify(await socialCoverage(new Db()), null, 2)); return; }
  if (cmd === 'search-instagram') {
    const cfg = instagramConfig(), tag = opt('--hashtag');
    if (!cfg || !tag || !flag('--experimental')) throw new Error('search-instagram needs Instagram secrets, --hashtag and --experimental; general city aggregation is not an approved use case');
    const posts = await hashtagPosts(tag, cfg);
    for (const p of posts) console.log(JSON.stringify({ date: p.timestamp, url: p.permalink, caption: p.caption }));
    log(`${posts.length} recent hashtag posts read; nothing stored or published`);
    return;
  }
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
    try {
      const info = await threads.tokenInfo(token);
      log(`Threads token valid: ${info.valid}; granted scopes: ${info.scopes.join(', ')}`);
      const missing = ['threads_keyword_search', 'threads_profile_discovery'].filter(s => !info.scopes.includes(s));
      if (missing.length) log(`Threads token is missing ${missing.join(', ')}: dashboard permissions do not update an existing token; reauthorize before testing these endpoints. Public access also requires App Review.`);
    } catch { log('Threads token scope diagnostic unavailable; endpoint probes follow'); }
    const hits = await threads.keywordSearch(token, 'Tallinn').catch(e => { log(`Threads keyword search: ${(e as Error).message}`); return null; });
    if (hits) log(`Threads keyword search "Tallinn": ${hits.length} posts, ${hits.filter(h => h.username && h.username !== who.username).length} from other accounts; a successful or empty response does not establish public access (App Review required)`);
    for (const line of await threads.probe(token, who.username)) log(`Threads probe, ${line}`);
    const lookup = await threads.profileLookup(token, 'instagram');
    log(`Threads profile lookup @instagram: ${lookup ? 'works' : 'refused'}; ${await threads.profileLookup(token, 'laine.bar') ? 'a venue profile was found' : 'a venue profile is not available yet'}`);
    return;
  }
  if (cmd === 'tonight') {
    if (publishTo && !['threads', 'facebook'].includes(publishTo)) throw new Error('--publish must be threads or facebook');
    const db = new Db();
    const now = new Date(Date.now()).toISOString();
    const rows = await db.select<{ title: string; venue: string | null; starts_at: string; has_time: boolean }>(
      `picks?tonight=is.true&starts_at=gte.${now}&order=starts_at.asc&limit=12&select=title,venue,starts_at,has_time`);
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
  if (cmd === 'post') {
    const file = args[1];
    if (!file || file.startsWith('--')) throw new Error('post needs a post file, for example brand/social/teaser/1-soon.json');
    const post = loadPost(JSON.parse(await readFile(file, 'utf8')));
    const to = (opt('--to') ?? PLATFORMS.join(',')).split(',').map(s => s.trim()).filter(Boolean);
    for (const p of to) {
      if (!(PLATFORMS as readonly string[]).includes(p)) throw new Error(`--to takes ${PLATFORMS.join(', ')}`);
      if (!post[p as Platform]) throw new Error(`the post file has no ${p} text`);
    }
    await checkImage(post.image);
    const noLocation = flag('--no-location');
    console.log(`\n${post.image}${post.alt ? `\nalt: ${post.alt}` : ''}`);
    for (const p of to as Platform[]) {
      const where = noLocation ? null : p === 'threads' ? post.threadsLocation : post.location;
      console.log(`\n--- ${p}${where ? ` (location ${where})` : ''} ---\n${post[p]}`);
    }
    if (!flag('--publish')) { log('preview only; add --publish to post'); return; }
    let failed = false;
    for (const p of to as Platform[]) {
      try {
        const text = post[p]!;
        if (p === 'facebook') {
          const cfg = instagramConfig();
          if (!cfg) throw new Error('Facebook needs Instagram secrets');
          const page = await facebook.ownPage(cfg, process.env.FACEBOOK_PAGE_ID ?? '');
          log(`posted to Facebook Page ${page.name}: ${await facebook.publishPhoto(page, { imageUrl: post.image, caption: text, placeId: noLocation ? undefined : post.location })}`);
        } else if (p === 'instagram') {
          const cfg = instagramConfig();
          if (!cfg) throw new Error('Instagram needs its secrets');
          log(`posted to Instagram: ${await instagram.publishImage(cfg, { imageUrl: post.image, caption: text, altText: post.alt, locationId: noLocation ? undefined : post.location })}`);
        } else {
          const token = await threadsToken(new Db());
          if (!token) throw new Error('no Threads token');
          const who = await threads.me(token);
          log(`posted to Threads as @${who.username}: ${await threads.publish(token, who.id, { text, imageUrl: post.image, locationId: noLocation ? undefined : post.threadsLocation })}`);
        }
      } catch (e) {
        failed = true;
        log(`${p}: not posted (${(e as Error).message}). Check the platform before trying again.`);
      }
    }
    if (failed) process.exitCode = 1;
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
  log('usage: node pipeline/social.ts check | search-instagram --hashtag tallinn | tonight [--publish threads|facebook] | instagram --image URL.jpg --caption "…" [--publish] | post FILE.json [--to facebook,instagram,threads] [--no-location] [--publish]');
}

if (import.meta.main) main().catch(e => { console.error('[social]', (e as Error).message); process.exitCode = 1; });
