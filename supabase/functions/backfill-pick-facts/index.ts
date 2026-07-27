import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ============================================================
// backfill-pick-facts  v1  (Jul 2026)
// ------------------------------------------------------------
// Fills description / starts_at / ends_at / ticket_url / price /
// entities on picks that predate the staging payload contract.
//
// It does NOT re-run any per-source scraper. Instead it fetches the
// pick's own source_url and reads schema.org JSON-LD, which nearly
// every ticketing and venue page emits for SEO — Fienta, Resident
// Advisor, Eventbrite, most WordPress venue sites. One extractor
// covers every source we have and every source we add, and it reads
// exactly the fields the publisher chose to state about themselves.
//
// Nothing here is inferred. A page with no JSON-LD Event yields
// nothing and the pick is stamped so it is not refetched.
//
// No LLM. No API keys. One HTTP GET per pick.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UA = 'WanderAlt/1.0 (https://wanderalt.app; hello@wanderalt.app)';
const BATCH = 20;
const TIME_CAP_MS = 50_000;
const RATE_MS = 400;

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey:         SERVICE_KEY,
      Authorization:  `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const safeUrl = (u: unknown): string | null => {
  if (typeof u !== 'string') return null;
  try {
    const p = new URL(u.trim());
    return (p.protocol === 'http:' || p.protocol === 'https:') ? p.toString() : null;
  } catch (_) { return null; }
};

const iso = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/* Strip tags and collapse whitespace — JSON-LD descriptions often carry
   escaped HTML. The result is stored as text and escaped again at render. */
const plain = (s: unknown, max = 4000): string | null => {
  if (typeof s !== 'string') return null;
  const t = s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
             .replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/* Pull every JSON-LD block out of a page and flatten @graph containers. */
function jsonLdNodes(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown;
    try { parsed = JSON.parse(m[1].trim()); } catch (_) { continue; }
    const push = (n: unknown) => {
      if (!n || typeof n !== 'object') return;
      const node = n as Record<string, unknown>;
      if (Array.isArray(node['@graph'])) (node['@graph'] as unknown[]).forEach(push);
      else out.push(node);
    };
    if (Array.isArray(parsed)) parsed.forEach(push); else push(parsed);
  }
  return out;
}

const isEvent = (n: any) => {
  const t = n?.['@type'];
  const types = Array.isArray(t) ? t : [t];
  return types.some(x => typeof x === 'string' && /Event/i.test(x));
};

type Facts = Record<string, unknown>;

function extract(html: string): Facts {
  const node = jsonLdNodes(html).find(isEvent);
  if (!node) return {};
  const f: Facts = {};

  const desc = plain(node.description);
  if (desc) f.description = desc;

  const s = iso(node.startDate); if (s) f.starts_at = s;
  const e = iso(node.endDate);   if (e) f.ends_at   = e;

  /* offers may be one object or a list; take the cheapest stated price
     as the floor and the dearest as the ceiling. */
  const offers = Array.isArray(node.offers) ? node.offers : (node.offers ? [node.offers] : []);
  const prices = offers
    .map((o: any) => Number(o?.price))
    .filter((n: number) => Number.isFinite(n));
  if (prices.length) {
    f.price_min = Math.min(...prices);
    if (Math.max(...prices) !== Math.min(...prices)) f.price_max = Math.max(...prices);
    f.is_free = Math.min(...prices) === 0;
    const cur = offers.map((o: any) => o?.priceCurrency).find((c: unknown) => typeof c === 'string');
    if (cur) f.currency = String(cur).slice(0, 3).toUpperCase();
  }
  const offerUrl = safeUrl(offers.map((o: any) => o?.url).find(Boolean)) || safeUrl(node.url);
  if (offerUrl) f.ticket_url = offerUrl;

  /* performer -> the artist names resolve-links looks up. */
  const perf = Array.isArray(node.performer) ? node.performer : (node.performer ? [node.performer] : []);
  const names = perf
    .map((p: any) => (typeof p === 'string' ? p : p?.name))
    .filter((n: unknown): n is string => typeof n === 'string' && !!n.trim())
    .slice(0, 8);
  if (names.length) f.entities = names.map(name => ({ name: name.trim(), role: 'artist' }));

  return f;
}

type Row = { id: string; source_url: string | null };

export default {
  async fetch(_req: Request): Promise<Response> {
    const started = Date.now();

    /* Only picks that have somewhere to look and nothing to show yet. */
    const res = await rest(
      'picks?archived_at=is.null&source_url=not.is.null&description=is.null' +
      `&select=id,source_url&limit=${BATCH}`);
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: `picks ${res.status}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const rows = (await res.json()) as Row[];

    let filled = 0;
    const results: { id: string; fields: string[] }[] = [];

    for (const r of rows) {
      if (Date.now() - started > TIME_CAP_MS) break;
      const url = safeUrl(r.source_url);
      if (!url) { results.push({ id: r.id, fields: [] }); continue; }

      await sleep(RATE_MS);
      let facts: Facts = {};
      try {
        const page = await fetch(url, { headers: { 'User-Agent': UA } });
        if (page.ok) facts = extract(await page.text());
      } catch (e) {
        console.error(`fetch ${r.id}:`, e instanceof Error ? e.message : String(e));
      }

      const fields = Object.keys(facts);
      if (fields.length) {
        const patch = await rest(`picks?id=eq.${encodeURIComponent(r.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(facts),
        });
        if (patch.ok) filled++;
        else console.error(`patch ${r.id}: ${patch.status}`);
      }
      results.push({ id: r.id, fields });
    }

    await rest('ingest_log', {
      method: 'POST',
      body: JSON.stringify({
        fn: 'backfill-pick-facts',
        finished_at: new Date().toISOString(),
        status: 'ok',
        inserted: filled,
        detail: { examined: results.length, filled, results },
      }),
    });

    return new Response(JSON.stringify({ ok: true, examined: results.length, filled, results }),
      { headers: { 'Content-Type': 'application/json' } });
  },
};
