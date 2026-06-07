/* ============================================================
   WanderAlt — og-image  v10   (deployed via Supabase MCP; verify_jwt:false)
   ------------------------------------------------------------
   Generates a 1200×630 OG PNG for a venue or curator.

   GET /functions/v1/og-image?id=PICK_ID
   GET /functions/v1/og-image?handle=CURATOR_HANDLE

   Public (verify_jwt: false) — social crawlers fetch it without auth.
   Uses satori (JSX→SVG) + resvg_wasm (SVG→PNG), no native bindings.

   This is the FALLBACK card for the per-pick OG flow: the Pages middleware
   (functions/_middleware.js) prefers the real venue photo as og:image and
   only points here for photo-less picks + curators.

   v10 (June 2026): use the public anon key directly (env override kept) so
   lookups stop silently failing to the default card. v8 recoloured the
   accent oxblood → petrol (#055959) to match the current brand.
   ============================================================ */

// @ts-ignore — satori supports npm: in Deno
import satori from 'npm:satori@0.10.13';
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2';

/* Public, project-scoped values (same anon key shipped in supabase.js;
   RLS is SELECT-only). Env overrides win when present. */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://aqnsmmbrspkbfcvougeh.supabase.co';
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnNtbWJyc3BrYmZjdm91Z2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTQ0MTAsImV4cCI6MjA5Mjg5MDQxMH0.sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA';

const W = 1200, H = 630, PAD = 72;
const C_PAPER = '#f6f3ec', C_INK = '#1a1a1a', C_MUTE = '#6b6b6b';
const C_ACCENT = '#055959', C_RULE = '#d8d2c4';

let _wasmReady = false;
const ensureWasm = async () => {
  if (_wasmReady) return;
  const wasmRes = await fetch('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2/index_bg.wasm');
  await initWasm(wasmRes);
  _wasmReady = true;
};

let _fonts: Array<{ name: string; data: ArrayBuffer; weight: number; style: string }> | null = null;
const loadFonts = async () => {
  if (_fonts) return _fonts;
  const [ssData, isData] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/sourceserif4/v14/vEFy2_tTDB4M7-auWDN0ahZJW3IX2ih5nk3AucvUHf6OAVIJmeUDygwjihdqrhw.ttf').then(r => r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/instrumentserif/v5/jizHRFtNs2ka5fXjeivQ4LroWlx-6zATiw.ttf').then(r => r.arrayBuffer()),
  ]);
  _fonts = [
    { name: 'Source Serif 4',  data: ssData, weight: 400, style: 'normal' },
    { name: 'Instrument Serif', data: isData, weight: 400, style: 'italic' },
  ];
  return _fonts;
};

const sbGet = async <T>(table: string, qs: string): Promise<T[]> => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  return r.ok ? r.json() : [];
};

const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;

const div  = (style: Record<string, unknown>, children: unknown[]) => ({ type: 'div', props: { style, children } });
const span = (style: Record<string, unknown>, text: string)       => ({ type: 'span', props: { style, children: text } });

const masthead = () => div(
  { display: 'flex', alignItems: 'baseline', gap: 14 },
  [
    span({ fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 26, color: C_INK, lineHeight: 1 }, 'WanderAlt'),
    span({ fontFamily: 'Source Serif 4', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: C_MUTE }, 'Tallinn'),
  ]
);
const hrule = () => div({ width: '100%', height: 1, background: C_RULE, margin: '20px 0' }, []);
const shell = (children: unknown[]) => div(
  { display: 'flex', flexDirection: 'column', width: W, height: H, background: C_PAPER, padding: PAD, fontFamily: 'Source Serif 4', boxSizing: 'border-box' },
  [masthead(), hrule(), ...children]
);
const footer = (text: string) => div(
  { marginTop: 'auto', borderTop: `1px solid ${C_RULE}`, paddingTop: 16, fontFamily: 'Source Serif 4', fontSize: 12, letterSpacing: '0.06em', color: C_MUTE },
  [text]
);
const pickCard = (title: string, venue: string, neighborhood: string, kind: string, quote: string, handle: string) =>
  shell([
    span({ fontFamily: 'Source Serif 4', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C_MUTE, marginBottom: 14 }, `${neighborhood} · ${kind}`),
    span({ fontFamily: 'Source Serif 4', fontSize: 40, fontWeight: 400, lineHeight: 1.1, color: C_INK, marginBottom: 22, maxWidth: W - PAD * 2 - 40 }, trunc(title, 55)),
    span({ fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 20, lineHeight: 1.35, color: C_INK, maxWidth: 740, marginBottom: 18 }, `"${trunc(quote, 120)}"`),
    span({ fontFamily: 'Source Serif 4', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: C_ACCENT }, `— ${handle}`),
    footer(trunc(venue, 80)),
  ]);
const curatorCard = (handle: string, tagline: string, bio: string, pickCount: number) =>
  shell([
    span({ fontFamily: 'Source Serif 4', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C_ACCENT, marginBottom: 14 }, handle),
    ...(tagline ? [span({ fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 36, lineHeight: 1.15, color: C_INK, maxWidth: 800, marginBottom: 20 }, trunc(tagline, 80))] : []),
    ...(bio     ? [span({ fontFamily: 'Source Serif 4', fontSize: 17, lineHeight: 1.5, color: C_MUTE, maxWidth: 740 }, trunc(bio, 160))] : []),
    footer(`${pickCount} pick${pickCount !== 1 ? 's' : ''} · WanderAlt`),
  ]);
const defaultCard = () => div(
  { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: W, height: H, background: C_PAPER, padding: PAD, fontFamily: 'Source Serif 4', boxSizing: 'border-box' },
  [
    span({ fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 64, color: C_INK, lineHeight: 1 }, 'WanderAlt'),
    span({ fontFamily: 'Source Serif 4', fontSize: 15, letterSpacing: '0.1em', textTransform: 'uppercase', color: C_MUTE, marginTop: 16 }, 'Alternative culture · Tallinn'),
  ]
);

const renderPng = async (element: object): Promise<Uint8Array> => {
  await ensureWasm();
  const fonts = await loadFonts();
  const svg = await satori(element, { width: W, height: H, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W } });
  return resvg.render().asPng();
};

Deno.serve(async (req) => {
  const url    = new URL(req.url);
  const pickId = url.searchParams.get('id');
  const handle = url.searchParams.get('handle');
  const pngHeaders = {
    'Content-Type':  'image/png',
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
  };
  let element: object;
  try {
    if (pickId) {
      type PickRow = { title: string; venue: string; neighborhood: string; kind: string; quote: string; handle: string };
      const rows = await sbGet<PickRow>('picks', `id=eq.${encodeURIComponent(pickId)}&select=title,venue,neighborhood,kind,quote,handle&limit=1`);
      const p = rows[0];
      element = p ? pickCard(p.title, p.venue, p.neighborhood, p.kind, p.quote, p.handle) : defaultCard();
    } else if (handle) {
      type CuratorRow = { bio?: string; tagline?: string };
      const [curators, picks] = await Promise.all([
        sbGet<CuratorRow>('curators', `handle=eq.${encodeURIComponent(handle)}&select=bio,tagline&limit=1`),
        sbGet<Record<string, never>>('picks', `handle=eq.${encodeURIComponent(handle)}&archived_at=is.null&select=id`),
      ]);
      const c = curators[0] || {};
      element = curatorCard(handle, c.tagline || '', c.bio || '', picks.length);
    } else {
      element = defaultCard();
    }
    return new Response(await renderPng(element), { headers: pngHeaders });
  } catch (err) {
    console.error('og-image error:', err);
    try { return new Response(await renderPng(defaultCard()), { headers: pngHeaders }); }
    catch (_) { return new Response(String(err), { status: 500 }); }
  }
});
