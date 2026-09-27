// Sources that only publish prose: Telegram channels, RSS feeds and venue
// event pages. Collection keeps the text; a model reads it later
// (llm.ts, extractEvents).

import type { RawItem, Source } from '../types.ts';
import { get, htmlToText, decodeEntities, httpUrl, clip } from '../util.ts';

/** Posts on a public channel's web preview, t.me/s/<channel>. No API key. */
export function parseTelegram(html: string, channelUrl: string): RawItem[] {
  const out: RawItem[] = [];
  const blocks = html.split('<div class="tgme_widget_message_wrap').slice(1);
  for (const b of blocks) {
    const post = /data-post="([^"]+)"/.exec(b)?.[1];
    const date = /<time[^>]*datetime="([^"]+)"/.exec(b)?.[1];
    const body = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(b)?.[1];
    if (!post || !date || !body) continue;
    const photos = [...b.matchAll(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/g)]
      .map(m => httpUrl(m[1])).filter((u): u is string => !!u).slice(0, 2);
    out.push({
      external_id: post,
      url: `https://t.me/${post}`,
      payload: { text: clip(htmlToText(body), 6000), posted_at: date, photos, channel: channelUrl },
    });
  }
  return out;
}

export async function collectTelegram(source: Source, now = new Date()): Promise<RawItem[]> {
  const maxAge = Number(source.config.max_age_days ?? 10) * 86_400_000;
  const html = await (await get(source.url, { accept: 'text/html' })).text();
  return parseTelegram(html, source.url)
    .filter(i => now.getTime() - Date.parse(String(i.payload.posted_at)) < maxAge);
}

/** A venue's programme page as one item: the text changes, it is read again. */
export async function collectPage(source: Source): Promise<RawItem[]> {
  const pages = [source.url, ...((source.config.extra_urls as string[] | undefined) ?? [])];
  const out: RawItem[] = [];
  for (const page of pages) {
    const html = await (await get(page, { accept: 'text/html' })).text();
    const main = /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
    out.push({ external_id: page, url: page, payload: { text: clip(htmlToText(main), 24_000), page } });
  }
  return out;
}

export function parseRss(xml: string): RawItem[] {
  const tag = (s: string, t: string) =>
    decodeEntities((new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i').exec(s)?.[1] ?? '')
      .replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim();
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([item]) => {
    const link = httpUrl(tag(item, 'link'));
    const body = tag(item, 'content:encoded') || tag(item, 'description');
    return {
      external_id: tag(item, 'guid') || link || tag(item, 'title'),
      url: link,
      payload: { title: tag(item, 'title'), text: clip(htmlToText(body), 12_000), posted_at: tag(item, 'pubDate') },
    };
  }).filter(i => i.external_id);
}

export async function collectRss(source: Source, now = new Date()): Promise<RawItem[]> {
  const maxAge = Number(source.config.max_age_days ?? 21) * 86_400_000;
  const xml = await (await get(source.url, { accept: 'application/rss+xml, application/xml' })).text();
  return parseRss(xml).filter(i => {
    const t = Date.parse(String(i.payload.posted_at));
    return !t || now.getTime() - t < maxAge;
  });
}
