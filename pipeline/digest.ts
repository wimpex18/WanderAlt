// Tonight in Tallinn, as one Telegram post: what starts between now and
// 04:00, soonest first, with time, venue, area and price, each linked to
// its WanderAlt page. Run daily by .github/workflows/digest.yml.
//
//   node pipeline/digest.ts            post (needs TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
//   node pipeline/digest.ts --dry-run  print the message, send nothing
//
// Reads the public `picks` view with the public anon key, so it can only
// ever post what the site already shows.

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';
const BASE = 'https://aqnsmmbrspkbfcvougeh.supabase.co';
const SITE = 'https://wanderalt.app';

export interface DigestRow {
  id: string; title: string; venue: string; neighborhood: string; kind: string;
  time: string | null; starts_at: string; is_free: boolean | null; price_min: number | null; currency: string | null;
}

/** Telegram's HTML mode needs only these three escaped. */
export const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const price = (r: DigestRow) =>
  r.is_free ? 'free' : r.price_min != null ? `from ${r.price_min % 1 ? r.price_min.toFixed(2) : r.price_min} ${r.currency === 'EUR' || !r.currency ? '€' : r.currency}` : '';

export function compose(rows: DigestRow[], date: Date, max = 15): string | null {
  if (!rows.length) return null;
  const day = date.toLocaleDateString('en-GB', { timeZone: 'Europe/Tallinn', weekday: 'long', day: 'numeric', month: 'long' });
  const lines = rows.slice(0, max).map(r => {
    const meta = [r.venue, r.neighborhood, price(r)].filter(Boolean).join(' · ');
    return `<b>${html(r.time ?? 'today')}</b> <a href="${SITE}/detail.html?id=${encodeURIComponent(r.id)}">${html(r.title)}</a>\n${html(meta)}`;
  });
  const more = rows.length > max ? `\n\n${rows.length - max} more on <a href="${SITE}/discover.html">Tonight</a>.` : '';
  return `<b>Tonight in Tallinn</b> · ${html(day)}\n\n${lines.join('\n\n')}${more}`;
}

async function main() {
  const now = new Date();
  const until = new Date(now.getTime() + 14 * 3600_000);      // 04:00 when sent at 14:00 UTC
  const url = `${BASE}/rest/v1/picks?city=eq.tallinn&archived_at=is.null` +
    `&starts_at=gte.${new Date(now.getTime() - 3600_000).toISOString()}&starts_at=lt.${until.toISOString()}` +
    `&time=not.is.null&select=id,title,venue,neighborhood,kind,time,starts_at,is_free,price_min,currency&order=starts_at.asc&limit=50`;
  const r = await fetch(url, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } });
  if (!r.ok) throw new Error(`picks ${r.status}`);
  const text = compose(await r.json() as DigestRow[], now);
  if (!text) { console.log('[digest] nothing tonight; no post'); return; }
  if (process.argv.includes('--dry-run')) { console.log(text); return; }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim(), chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) { console.log('[digest] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set; no post'); return; }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
  });
  if (!res.ok) throw new Error(`telegram ${res.status} ${(await res.text()).slice(0, 200)}`);
  console.log('[digest] posted');
}

if (import.meta.main) main().catch(e => { console.error('[digest] failed:', e.message); process.exit(1); });
