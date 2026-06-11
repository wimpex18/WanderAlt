// verify-venues v2 — OSM staleness check for Tallinn venues
// Uses a bbox query (reliable) instead of area lookup (can time out).
// Tallinn bbox: 59.35,24.55,59.55,24.95
//
// GET /verify-venues           → dry run (shows what would be closed)
// GET /verify-venues?dry_run=false → apply changes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// Tallinn bounding box (generous, covers the city + suburbs)
const BBOX = '59.35,24.55,59.55,24.95';

// Two separate queries to avoid alternation regex across Overpass implementations.
const QUERY_DISUSED = `[out:json][timeout:25][bbox:${BBOX}];
(
  node[~"^disused:"~"."]["name"];
  way[~"^disused:"~"."]["name"];
  node[~"^disused:"~"."]['disused:name'];
  way[~"^disused:"~"."]['disused:name'];
);
out tags;`;

const QUERY_ABANDONED = `[out:json][timeout:25][bbox:${BBOX}];
(
  node[~"^abandoned:"~"."]["name"];
  way[~"^abandoned:"~"."]["name"];
);
out tags;`;

type OsmElement = { id: number; tags: Record<string, string> };

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchOverpass(query: string): Promise<OsmElement[]> {
  const res = await fetch(OVERPASS, {
    method:  'POST',
    body:    'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.elements ?? [];
}

Deno.serve(async (req) => {
  const dryRun = new URL(req.url).searchParams.get('dry_run') !== 'false';

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const started = Date.now();
  const { data: logRow } = await sb
    .from('ingest_log')
    .insert({ fn: 'verify-venues', status: 'running', inserted: 0, rejected: 0 })
    .select('id').single();
  const logId = logRow?.id;

  const finish = async (status: string, rejected: number, detail: unknown, error?: string) => {
    await sb.from('ingest_log').update({
      status, rejected, detail, error: error ?? null, finished_at: new Date().toISOString(),
    }).eq('id', logId);
  };

  try {
    // 1. Load all active venues.
    const { data: venues, error: ve } = await sb
      .from('venues')
      .select('id, name, osm_id')
      .is('closed_at', null)
      .neq('status', 'closed');
    if (ve) throw ve;
    if (!venues?.length) {
      await finish('ok', 0, { message: 'no active venues' });
      return Response.json({ ok: true, message: 'No active venues' });
    }

    // Build lookup maps.
    const byOsmId    = new Map<number, typeof venues[0]>();
    const byNormName = new Map<string, typeof venues[0]>();
    for (const v of venues) {
      if (v.osm_id) byOsmId.set(v.osm_id, v);
      byNormName.set(normalizeName(v.name), v);
    }

    // 2. Query Overpass (both disused and abandoned, in parallel).
    const [disusedEls, abandonedEls] = await Promise.all([
      fetchOverpass(QUERY_DISUSED).catch(() => [] as OsmElement[]),
      fetchOverpass(QUERY_ABANDONED).catch(() => [] as OsmElement[]),
    ]);
    const elements = [...disusedEls, ...abandonedEls];

    // 3. Match against our venues.
    const toClose = new Map<string, { name: string; osm_id?: number; reason: string }>();

    for (const el of elements) {
      const tags    = el.tags ?? {};
      const osmName = tags.name ?? tags['disused:name'] ?? tags['abandoned:name'] ?? '';

      // Primary: osm_id match.
      const byId = byOsmId.get(el.id);
      if (byId && !toClose.has(byId.id)) {
        const keys = Object.keys(tags)
          .filter(k => k.startsWith('disused:') || k.startsWith('abandoned:'))
          .slice(0, 3).join(', ');
        toClose.set(byId.id, { name: byId.name, osm_id: el.id, reason: `OSM tags: ${keys}` });
        continue;
      }
      // Fallback: name match.
      if (osmName) {
        const byName = byNormName.get(normalizeName(osmName));
        if (byName && !toClose.has(byName.id)) {
          toClose.set(byName.id, { name: byName.name, reason: `OSM name match "${osmName}"` });
        }
      }
    }

    const confirmedClosed = [...toClose.values()];
    let closedVenueCount  = 0;
    let archivedPickCount = 0;

    // 4. Apply changes if not a dry run.
    if (!dryRun && confirmedClosed.length > 0) {
      const ids = [...toClose.keys()];
      const now = new Date().toISOString();
      const { error: ce } = await sb.from('venues')
        .update({ closed_at: now, status: 'closed' }).in('id', ids);
      if (!ce) closedVenueCount = ids.length;

      const { data: ap } = await sb.from('picks')
        .update({ archived_at: now })
        .in('venue_id', ids).is('archived_at', null).select('id');
      archivedPickCount = ap?.length ?? 0;
    }

    const elapsed = Math.round((Date.now() - started) / 1000);
    await finish('ok', dryRun ? 0 : closedVenueCount, {
      venues_checked: venues.length,
      osm_elements:   elements.length,
      confirmed_closed: confirmedClosed,
      dry_run: dryRun,
    });

    return Response.json({
      ok:                  true,
      dry_run:             dryRun,
      venues_checked:      venues.length,
      osm_elements_found:  elements.length,
      confirmed_closed:    confirmedClosed,
      closed_venue_count:  closedVenueCount,
      archived_pick_count: archivedPickCount,
      elapsed_s:           elapsed,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finish('error', 0, null, msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
