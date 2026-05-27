// ============================================================
// WanderAlt — ingest-osm  (v11)
// v11 (May 2026): add Vilnius to the CITIES map (bbox covers the
//                 core cultural districts — Senamiestis, Naujamiestis,
//                 Užupis, Žvėrynas, Antakalnis, Valakampiai). No other
//                 change — existing cities + per-city try/catch intact.
// v10 (May 2026): capture contact:facebook / contact:instagram from
//                 OSM tags (normalised to full URLs) so Places cards
//                 can show social links. Website capture unchanged.
// v9: per-city try/catch so an Overpass 504 on one city doesn't abort
//     the others. v8: multi-city (was Tallinn-only).
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OVERPASS_URL  = "https://overpass-api.de/api/interpreter";

const CITIES: Record<string, { bbox: string }> = {
  tallinn:  { bbox: "59.36,24.55,59.51,24.92" },
  riga:     { bbox: "56.86,23.93,57.07,24.31" },
  helsinki: { bbox: "60.13,24.78,60.30,25.20" },
  vilnius:  { bbox: "54.63,25.17,54.74,25.38" },
};

const buildQuery = (bbox: string) => `[out:json][timeout:60];
(
  node["amenity"~"bar|nightclub|pub|theatre|cinema|arts_centre|library|community_centre"](${bbox});
  way ["amenity"~"bar|nightclub|pub|theatre|cinema|arts_centre|library|community_centre"](${bbox});
  node["shop"~"books|music|second_hand"](${bbox});
  way ["shop"~"books|music|second_hand"](${bbox});
  node["tourism"~"gallery|museum"](${bbox});
  way ["tourism"~"gallery|museum"](${bbox});
);
out center tags;`;

const slugify = (s: string) =>
  s.toLowerCase()
   .normalize("NFKD").replace(/[̀-ͯ]/g, "")
   .replace(/[^a-z0-9]+/g, "-")
   .replace(/^-+|-+$/g, "")
   .slice(0, 80);

// OSM social tags are sometimes full URLs, sometimes bare handles
// ("@store" or "store"). Normalise to a clickable https URL.
const normSocial = (val: string | undefined, base: string): string | null => {
  if (!val) return null;
  const v = val.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return base + v.replace(/^@/, "").replace(/^\//, "");
};

const tagToKind = (t: Record<string, string>) => {
  if (t.amenity === "nightclub")                  return "club";
  if (t.amenity === "bar" || t.amenity === "pub") return "bar";
  if (t.amenity === "theatre")                    return "theatre";
  if (t.amenity === "cinema")                     return "cinema";
  if (t.amenity === "arts_centre")                return "arts centre";
  if (t.amenity === "library")                    return "library";
  if (t.amenity === "community_centre")           return "community";
  if (t.shop    === "books")                      return "bookshop";
  if (t.shop    === "music")                      return "record store";
  if (t.shop    === "second_hand")                return "thrift";
  if (t.tourism === "gallery")                    return "gallery";
  if (t.tourism === "museum")                     return "museum";
  return null;
};

async function ingestCity(
  sb: ReturnType<typeof createClient>,
  city: string,
  bbox: string,
  now: string,
): Promise<{ upserted: number; total: number }> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8",
               "User-Agent":   "WanderAltBot/1.0" },
    body: buildQuery(bbox),
  });
  if (!res.ok) throw new Error(`overpass HTTP ${res.status} for ${city}`);

  const osm      = await res.json();
  const elements = (osm.elements ?? []) as Array<{
    type: "node"|"way"; id: number;
    lat?: number; lon?: number;
    center?: { lat: number; lon: number };
    tags: Record<string, string>;
  }>;

  const rows: Record<string, unknown>[] = [];

  for (const el of elements) {
    const t    = el.tags ?? {};
    const name = t["name:en"] || t.name;
    if (!name) continue;
    const kind = tagToKind(t);
    if (!kind) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;

    rows.push({
      id:           slugify(name) + "-" + el.id,
      city,
      name,
      neighborhood: t["addr:suburb"] || t["addr:city_district"] || null,
      kind, lat, lng,
      osm_id:       el.id,
      website:      t.website || t["contact:website"] || null,
      facebook:     normSocial(t["contact:facebook"]  || t.facebook,  "https://facebook.com/"),
      instagram:    normSocial(t["contact:instagram"] || t.instagram, "https://instagram.com/"),
      status:       "active",
      last_seen_at: now,
      updated_at:   now,
    });
  }

  let upserted = 0;
  const CHUNK  = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from("venues")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) throw error;
    upserted += Math.min(CHUNK, rows.length - i);
  }

  return { upserted, total: elements.length };
}

export default {
  async fetch(req: Request): Promise<Response> {
    const sb  = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = new Date().toISOString();

    let onlyCity: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.city === "string") onlyCity = body.city.toLowerCase();
    } catch { /* no body / not JSON, ignore */ }

    const cities = onlyCity
      ? (CITIES[onlyCity] ? [[onlyCity, CITIES[onlyCity].bbox] as const] : [])
      : Object.entries(CITIES).map(([c, v]) => [c, v.bbox] as const);

    if (cities.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: `unknown city: ${onlyCity}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: log } = await sb
      .from("ingest_log").insert({ fn: "ingest-osm" }).select("id").single();
    const logId = log?.id;

    const perCity: Record<string, { upserted?: number; total?: number; error?: string }> = {};
    let totalUpserted = 0;
    const errors: string[] = [];

    for (const [city, bbox] of cities) {
      try {
        const out = await ingestCity(sb, city, bbox, now);
        perCity[city]  = { upserted: out.upserted, total: out.total };
        totalUpserted += out.upserted;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        perCity[city] = { error: msg };
        errors.push(`${city}: ${msg}`);
      }
    }

    const anySucceeded = Object.values(perCity).some(c => typeof c.upserted === "number");
    const status       = anySucceeded ? "ok" : "error";

    await sb.from("ingest_log").update({
      finished_at: now,
      status,
      inserted:    totalUpserted,
      error:       errors.length ? errors.join("; ") : null,
      detail:      { cities: perCity, upserted: totalUpserted },
    }).eq("id", logId);

    return new Response(
      JSON.stringify({
        ok:       anySucceeded,
        upserted: totalUpserted,
        cities:   perCity,
      }),
      {
        status:  anySucceeded ? 200 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
