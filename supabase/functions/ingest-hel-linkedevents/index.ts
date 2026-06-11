// ============================================================
// WanderAlt — ingest-hel-linkedevents (v5)
// ------------------------------------------------------------
// v5 (Jun 2026): bumpSeen() marks each still-listed pick's last_seen_at
//   for wa_reconcile_absent_picks (silent-cancellation detection).
// Pulls events from the official City of Helsinki Linked Events API.
// v4 (May 2026): municipal-noise tightening (SKIP_VENUE_PATTERNS +
//   expanded SKIP_PATTERNS). v3: cyrb53 hash of string id -> bigint.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CHANNEL     = "hel-linkedevents";
const SOURCE_CITY = "helsinki";
const WINDOW_DAYS = 30;

const SKIP_PATTERNS = [
  "lapsille", "perheelle", "perheen", "perheille", "vauvoille", "taaperoille",
  "children", "kids", "family time", "family event", "for families",
  "toddler", "kindergarten", "päiväkoti",
  "satutuokio", "satuhetki", "lukutuokio", "reading time", "story time",
  "koululaisille", "oppilaiden",
  "sote-ilta", "ikäihmisten",
  "kuntoutus", "hallituksen kokous", "kaupunginvaltuusto",
  "vauvatuokio", "vauva-aamu", "vauvaperhe", "vesijumppa", "yhteislaulu",
  "legopaja", "roskakävely", "reading dog", "lukukoira", "laiteopastus",
  "muistiryhmä", "kirjastoauto", "kuntosali",
];

const SKIP_VENUE_PATTERNS = [
  "senior centre", "senior center", "service centre", "service center",
  "service home", "palvelukeskus", "palvelutalo",
  "playground", "leikkipuisto",
  "sports park", "liikuntapuisto",
];

function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey:         SERVICE_KEY,
      Authorization:  `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

// Best-effort: mark the matching pick as still-listed so wa_reconcile_absent_picks
// won't flag it as silently cancelled. Keyed on the single-event pick id
// (channel-message_id, matching process-staging). Never throws.
async function bumpSeen(messageId: number) {
  try {
    const pid = `${CHANNEL}-${messageId}`.toLowerCase();
    await rest(`picks?id=eq.${encodeURIComponent(pid)}&archived_at=is.null`, {
      method:  "PATCH",
      headers: { Prefer: "return=minimal" },
      body:    JSON.stringify({ last_seen_at: new Date().toISOString() }),
    });
  } catch (_) { /* best-effort */ }
}

type Localized = Record<string, string>;

interface LinkedEvent {
  id: string;
  name?:  Localized;
  short_description?: Localized | null;
  description?: Localized | null;
  start_time?: string | null;
  end_time?:   string | null;
  event_status?: string;
  type_id?: string;
  offers?: { is_free?: boolean }[];
  info_url?: Localized | null;
  location?: {
    id?: string;
    name?: Localized;
    street_address?: Localized;
    position?: { coordinates?: [number, number] };
    divisions?: { type?: string; name?: Localized }[];
  };
}

function pickLocalized(o?: Localized | null): string {
  if (!o) return "";
  return (o.en || o.fi || o.sv || "").trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function shouldSkip(e: LinkedEvent): string | null {
  const st = e.event_status;
  if (st && st !== "EventScheduled" && st !== "EventRescheduled") {
    return `status:${st}`;
  }
  if (e.type_id && e.type_id !== "General") {
    return `type:${e.type_id}`;
  }
  if (!pickLocalized(e.name)) return "no-name";

  const venueName = (e.location ? pickLocalized(e.location.name) : "").toLowerCase();
  for (const v of SKIP_VENUE_PATTERNS) {
    if (venueName.includes(v)) return `venue:${v}`;
  }

  const haystack = [
    pickLocalized(e.name),
    pickLocalized(e.short_description),
    pickLocalized(e.description),
  ].join(" ").toLowerCase();
  for (const pat of SKIP_PATTERNS) {
    if (haystack.includes(pat)) return `pattern:${pat}`;
  }
  return null;
}

function composeText(e: LinkedEvent): string {
  const title = pickLocalized(e.name);
  const desc  = stripTags(pickLocalized(e.short_description) || pickLocalized(e.description) || "");
  const when  = e.start_time ?? "";
  const venue = e.location ? pickLocalized(e.location.name) : "";
  const street = e.location ? pickLocalized(e.location.street_address) : "";
  const nhood = e.location?.divisions?.find(d => d.type === "neighborhood");
  const nhoodName = nhood ? pickLocalized(nhood.name) : "";
  const freeBit = e.offers?.some(o => o.is_free) ? "Free admission." : "";

  return [
    title,
    when ? `When: ${when}` : "",
    venue ? `Venue: ${venue}${street ? `, ${street}` : ""}${nhoodName ? ` (${nhoodName})` : ""}` : "",
    desc.slice(0, 800),
    freeBit,
  ].filter(Boolean).join("\n");
}

async function getSourceId(): Promise<number | null> {
  const res = await rest(`sources?channel=eq.${CHANNEL}&city=eq.${SOURCE_CITY}&select=id`);
  if (!res.ok) return null;
  const rows = await res.json() as { id: number }[];
  return rows[0]?.id ?? null;
}

async function upsertEvent(
  sourceId: number,
  e: LinkedEvent,
): Promise<"inserted" | "skipped" | "error"> {
  const mid = cyrb53(e.id);
  const row = {
    source_id:  sourceId,
    channel:    CHANNEL,
    message_id: mid,
    text:       composeText(e),
    posted_at:  e.start_time ?? new Date().toISOString(),
    permalink:  `https://tapahtumat.hel.fi/en/${e.id}`,
    status:     "new",
  };
  const res = await rest("staging_messages", {
    method:  "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body:    JSON.stringify(row),
  });
  if (!res.ok) {
    console.error(`staging insert failed ${e.id}: ${res.status} ${await res.text().catch(()=>'')}`);
    return "error";
  }
  const body = await res.json().catch(() => []);
  await bumpSeen(mid);
  return Array.isArray(body) && body.length ? "inserted" : "skipped";
}

async function markSource(sourceId: number) {
  await rest(`sources?id=eq.${sourceId}`, {
    method: "PATCH",
    body:   JSON.stringify({ last_scraped_at: new Date().toISOString() }),
  });
}

async function logRun(stats: {
  inserted: number; skipped: number; rejected: number; errors: number;
  reasons: Record<string, number>; error: string | null;
}) {
  await rest("ingest_log", {
    method: "POST",
    body:   JSON.stringify({
      fn:          "ingest-hel-linkedevents",
      status:      stats.error ? "error" : "ok",
      inserted:    stats.inserted,
      rejected:    stats.rejected,
      error:       stats.error,
      finished_at: new Date().toISOString(),
      detail:      { skipped_existing: stats.skipped, upsert_errors: stats.errors, reasons: stats.reasons },
    }),
  }).catch(() => {});
}

async function fetchPage(start: string, end: string, page: number): Promise<{
  data: LinkedEvent[]; nextUrl: string | null;
}> {
  const url = `https://api.hel.fi/linkedevents/v1/event/` +
    `?start=${start}&end=${end}` +
    `&page=${page}&page_size=100` +
    `&include=location&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "WanderAlt-Ingest/1.0 (https://wanderalt.app)" },
  });
  if (!res.ok) throw new Error(`linkedevents HTTP ${res.status}`);
  const body = await res.json() as { data: LinkedEvent[]; meta?: { next?: string | null } };
  return { data: body.data ?? [], nextUrl: body.meta?.next ?? null };
}

Deno.serve(async () => {
  const t0 = Date.now();
  let inserted = 0, skipped = 0, rejected = 0, errors = 0;
  const reasons: Record<string, number> = {};
  let runError: string | null = null;

  try {
    const sourceId = await getSourceId();
    if (!sourceId) throw new Error("hel-linkedevents source row not found in sources table");

    const startISO = new Date().toISOString().slice(0, 10);
    const endDate  = new Date(Date.now() + WINDOW_DAYS * 86400_000);
    const endISO   = endDate.toISOString().slice(0, 10);

    let page = 1;
    const MAX_PAGES = 30;
    while (page <= MAX_PAGES) {
      const { data, nextUrl } = await fetchPage(startISO, endISO, page);
      if (data.length === 0) break;
      for (const e of data) {
        const reason = shouldSkip(e);
        if (reason) {
          rejected++;
          const key = reason.split(":")[0] + ":" + (reason.split(":")[1] ?? "");
          reasons[key] = (reasons[key] ?? 0) + 1;
          continue;
        }
        const r = await upsertEvent(sourceId, e);
        if (r === "inserted") inserted++;
        else if (r === "skipped") skipped++;
        else errors++;
      }
      if (!nextUrl) break;
      page++;
    }

    await markSource(sourceId);
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    console.error("[hel-linkedevents]", runError);
  }

  await logRun({ inserted, skipped, rejected, errors, reasons, error: runError });

  return new Response(JSON.stringify({
    ok:         !runError,
    inserted, skipped, rejected, errors,
    reasons,
    error:      runError,
    latency_ms: Date.now() - t0,
  }), {
    headers: { "Content-Type": "application/json" },
    status:  runError ? 500 : 200,
  });
});
