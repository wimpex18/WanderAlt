/* ============================================================
   WanderAlt — og-image  v11   (deployed via Supabase MCP; verify_jwt:false)
   ------------------------------------------------------------
   Generates a 1200×630 OG PNG for a pick or a source.

   GET /functions/v1/og-image?id=PICK_ID
   GET /functions/v1/og-image?venue=VENUE_NAME
   GET /functions/v1/og-image?handle=@feed        (legacy curator key)

   v11 (Aug 2026) brings the card up to the redesign, which had left it
   behind entirely: it drew a curator byline under an italic pull-quote,
   read `bio`/`tagline` off the `curators` table, and stamped every card
   "Tallinn" whatever city the pick was in. Now the loud line is WHEN,
   provenance sits quietly in the footer, the source card counts picks,
   and ?venue= works because that is how source.html is keyed.

   verify_jwt stays FALSE and must: social crawlers fetch og:image with
   no auth. Asked the question CLAUDE.md insists on — what can a stranger
   make this do? Render a PNG from RLS-public rows, cached 24h. It writes
   nothing and sends nothing, so there is no outward-facing action to
   gate on the service key.

   v11 also fixes an older and worse bug found while verifying the above:
   hrule() had no explicit `display`, which satori rejects, so every card
   built on shell() threw and the catch served the branded default. The
   pick card and the curator card had BOTH been silently unreachable —
   see the note by hrule. Verify this one by looking at the PNG, never by
   checking that it returned 200: the fallback is also a valid 1200×630.

   Still on the pre-redesign face and palette (Source Serif 4 /
   Instrument Serif, #f6f3ec) rather than Fraunces / Plus Jakarta Sans on
   #f2efe6. That is a deliberate hold, not an oversight: it is a visual
   change, and this pass was about the card telling the truth.

   Uses satori (JSX→SVG) + resvg_wasm (SVG→PNG), no native bindings.

   This is the FALLBACK card for the per-pick OG flow: the Pages middleware
   (functions/_middleware.js) prefers the real venue photo as og:image and
   only points here for photo-less picks and for source pages.

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

/* City is a lowercase slug in the DB ('tallinn', 'riga', …). */
const cityLabel = (c?: string | null) =>
  c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Tallinn';

/* 4a: "if the model can only paraphrase the title, print nothing and say
   so." Third copy of the same predicate — the browser has WA.UI, the
   Pages middleware has its own, and this runs on Deno. Keep them in
   step; the filler list is the same in all three. */
const FILLER = new Set(['the','and','with','for','from','out','you','your','its','are','was','this','that','into','all','new','one','two','live','event','events','show','shows','night','nights','music','party','concert','set','series','performs','presents','featuring','join','come','experience','enjoy','celebrate','discover','more','than','their','his','her']);

const contentWords = (s: string) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !FILLER.has(w));

const saysSomething = (text: string | null | undefined, title: string) => {
  const s = String(text == null ? '' : text).trim();
  if (!s) return '';
  if (s.length < 12 || /^(tba|tbc|n\/a|none|null|-|—)$/i.test(s)) return '';
  const t = new Set(contentWords(title));
  return contentWords(s.slice(0, 300)).some(w => !t.has(w)) ? s : '';
};

const div  = (style: Record<string, unknown>, children: unknown[]) => ({ type: 'div', props: { style, children } });
const span = (style: Record<string, unknown>, text: string)       => ({ type: 'span', props: { style, children: text } });

/* The masthead city was hard-coded to Tallinn, so a Helsinki pick shared
   to Slack announced itself as Tallinn. It takes the row's own city. */
const masthead = (city: string) => div(
  { display: 'flex', alignItems: 'baseline', gap: 14 },
  [
    span({ fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 26, color: C_INK, lineHeight: 1 }, 'WanderAlt'),
    span({ fontFamily: 'Source Serif 4', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: C_MUTE }, city),
  ]
);
/* satori refuses any <div> without an explicit display, and this rule had
   none. Because hrule() sits inside shell(), EVERY card except the
   default one threw — the pick card and the old curator card alike — and
   the catch below quietly served the branded default instead. A share
   preview that looks plausible is how a total failure goes unnoticed:
   the card rendered, it just never said which pick. Probed it rather
   than guessed (satori 0.10.13): masthead and spans render fine on their
   own, anything containing hrule throws. */
const hrule = () => div({ display: 'flex', width: '100%', height: 1, background: C_RULE, margin: '20px 0' }, []);
const shell = (city: string, children: unknown[]) => div(
  { display: 'flex', flexDirection: 'column', width: W, height: H, background: C_PAPER, padding: PAD, fontFamily: 'Source Serif 4', boxSizing: 'border-box' },
  [masthead(city), hrule(), ...children]
);
const footer = (text: string) => div(
  { display: 'flex', marginTop: 'auto', borderTop: `1px solid ${C_RULE}`, paddingTop: 16, fontFamily: 'Source Serif 4', fontSize: 12, letterSpacing: '0.06em', color: C_MUTE },
  [text]
);
/* The pick card, rebuilt for the Aug 2026 direction.
   It used to set the quote in italic display type with "— @handle"
   underneath in accent caps: a byline, on a product that no longer has
   one. The direction is "time and walking distance are the loudest
   things on every row" and "provenance instead of personality", so the
   loud line is now WHEN, the sentence is plain, and the handle is a
   quiet provenance token in the footer beside the venue.
   The sentence is only printed when it says something (4a) — a card
   repeating its own headline back is worse than a card without one. */
const pickCard = (
  title: string, venue: string, neighborhood: string, kind: string,
  said: string, handle: string, when: string, city: string,
) =>
  shell(city, [
    span({ fontFamily: 'Source Serif 4', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C_MUTE, marginBottom: 14 }, [neighborhood, kind].filter(Boolean).join(' · ')),
    span({ fontFamily: 'Source Serif 4', fontSize: 40, fontWeight: 400, lineHeight: 1.1, color: C_INK, marginBottom: 18, maxWidth: W - PAD * 2 - 40 }, trunc(title, 55)),
    ...(when ? [span({ fontFamily: 'Source Serif 4', fontSize: 22, letterSpacing: '0.04em', color: C_ACCENT, marginBottom: said ? 14 : 0 }, trunc(when, 60))] : []),
    ...(said ? [span({ fontFamily: 'Source Serif 4', fontSize: 19, lineHeight: 1.4, color: C_MUTE, maxWidth: 760 }, trunc(said, 150))] : []),
    footer([trunc(venue || '', 60), handle ? `via ${handle}` : ''].filter(Boolean).join('  ·  ')),
  ]);

/* Was curatorCard, reading bio and tagline off the `curators` table —
   a table the redesign stopped using. 3b: the subject is a venue or a
   feed, not a person, so the card counts what the page will show. */
const sourceCard = (name: string, area: string, pickCount: number, city: string) =>
  shell(city, [
    span({ fontFamily: 'Source Serif 4', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: C_MUTE, marginBottom: 14 }, [area, 'programme feed'].filter(Boolean).join(' · ')),
    span({ fontFamily: 'Source Serif 4', fontSize: 40, fontWeight: 400, lineHeight: 1.1, color: C_INK, marginBottom: 18, maxWidth: W - PAD * 2 - 40 }, trunc(name, 55)),
    span({ fontFamily: 'Source Serif 4', fontSize: 22, letterSpacing: '0.04em', color: C_ACCENT },
      pickCount ? `${pickCount} listed right now` : 'Nothing listed right now'),
    footer('Everything we read from this source · WanderAlt'),
  ]);
const defaultCard = () => div(
  { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: W, height: H, background: C_PAPER, padding: PAD, fontFamily: 'Source Serif 4', boxSizing: 'border-box' },
  [
    span({ fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 64, color: C_INK, lineHeight: 1 }, 'WanderAlt'),
    /* Three live cities, not one. Vilnius stays off this card on purpose
       — it is unlocked for internal testing and does not claim parity. */
    span({ fontFamily: 'Source Serif 4', fontSize: 15, letterSpacing: '0.1em', textTransform: 'uppercase', color: C_MUTE, marginTop: 16 }, 'Alternative culture · Tallinn · Helsinki · Riga'),
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
  /* source.html is venue-keyed; ?handle= is the legacy curator.html key. */
  const venue  = url.searchParams.get('venue');
  const pngHeaders = {
    'Content-Type':  'image/png',
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
  };
  let element: object;
  try {
    if (pickId) {
      type PickRow = { title: string; venue: string; neighborhood: string; kind: string; description?: string; quote?: string; handle: string; time?: string; day?: string; city?: string };
      const rows = await sbGet<PickRow>('picks', `id=eq.${encodeURIComponent(pickId)}&select=title,venue,neighborhood,kind,description,quote,handle,time,day,city&limit=1`);
      const p = rows[0];
      if (p) {
        const said = saysSomething(p.description, p.title) || saysSomething(p.quote, p.title);
        const when = [p.day, p.time].map(v => (v == null ? '' : String(v).trim())).filter(Boolean).join(' · ');
        element = pickCard(p.title, p.venue, p.neighborhood, p.kind, said, p.handle, when, cityLabel(p.city));
      } else {
        element = defaultCard();
      }
    } else if (venue || handle) {
      type SrcRow = { venue?: string; neighborhood?: string; city?: string };
      /* ilike, not eq: the catalogue holds "Von Krahli Teater" AND "Von
         Krahli teater", and source.js groups case-insensitively. An eq
         match counted 2 where the page lists 13 — a card must never
         disagree with the page it is advertising. No wildcards, so this
         is still an exact match; % and _ are escaped so a venue name
         carrying one cannot widen it. */
      const esc = (v: string) => encodeURIComponent(v.replace(/[%_]/g, '\\$&'));
      const picks = await sbGet<SrcRow>('picks', venue
        ? `venue=ilike.${esc(venue)}&archived_at=is.null&select=venue,neighborhood,city`
        : `handle=ilike.${esc(handle!)}&archived_at=is.null&select=venue,neighborhood,city`);
      const name = picks[0]?.venue || venue || handle!;
      const area = picks.find(p => p.neighborhood)?.neighborhood || '';
      element = sourceCard(name, area, picks.length, cityLabel(picks[0]?.city));
    } else {
      element = defaultCard();
    }
    return new Response(await renderPng(element), { headers: pngHeaders });
  } catch (err) {
    console.error('og-image error:', err);
    /* ?debug=1 returns the reason instead of the plausible-looking
       fallback. Kept deliberately: the hrule bug above survived because
       a failure and a success are indistinguishable from the outside.
       Message only, never the stack. */
    if (url.searchParams.get('debug') === '1') {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    try { return new Response(await renderPng(defaultCard()), { headers: pngHeaders }); }
    catch (_) { return new Response(String(err), { status: 500 }); }
  }
});
