// A Wikidata item for a place that has no link at all (no website, Instagram or Facebook) and no
// item yet, found by where it is and what it is called: items within 300 m of its point whose
// label or alias names it (sameName, the rule Overture matching uses) and that carry a website,
// an Instagram or a Facebook account, so a painting or a street with the same word is never
// taken. Exactly one such item is identity; two are none. The item then fills the place's links
// through the usual enrichment (venues.ts fromWikidata), and the hours step reads its site.
// KUMU's point sits 239 m from its Wikidata item, which is why the radius is not smaller.
import type { Place } from './places.ts';
import { UA, sleep } from './util.ts';
import { sameName } from './overture.ts';

const RADIUS_KM = 0.3;

interface Row { item: { value: string }; label: { value: string } }

/** Items near a point with a website or a social account, each with its labels and aliases. */
async function near(lat: number, lng: number, fetcher: typeof fetch): Promise<Map<string, string[]>> {
  const query = `SELECT ?item ?label WHERE {
    SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${lng.toFixed(6)} ${lat.toFixed(6)})"^^geo:wktLiteral .
      bd:serviceParam wikibase:radius "${RADIUS_KM}" . }
    FILTER EXISTS { ?item wdt:P856|wdt:P2003|wdt:P2013 ?link }
    { ?item rdfs:label ?label } UNION { ?item skos:altLabel ?label }
    FILTER(lang(?label) IN ("et", "en", "ru", "de", "fi"))
  }`;
  const r = await fetcher('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'user-agent': UA, accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query, format: 'json' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`wikidata ${r.status}`);
  const out = new Map<string, string[]>();
  for (const b of ((await r.json()) as { results: { bindings: Row[] } }).results.bindings) {
    const qid = /Q\d+$/.exec(b.item.value)?.[0];
    if (qid) out.set(qid, [...(out.get(qid) ?? []), b.label.value]);
  }
  return out;
}

/** The one item near this place that names it, or null. */
export function pickItem(p: Pick<Place, 'name' | 'aliases'>, items: Map<string, string[]>): string | null {
  const ours = [p.name, ...(p.aliases ?? [])];
  const hits = [...items].filter(([, labels]) => labels.some(l => sameName(ours, l))).map(([q]) => q);
  return hits.length === 1 ? hits[0] : null;
}

/** Places with no link, no item and a point: the ones this step can help. */
export const dueForNear = (places: Place[]): Place[] => places.filter(p => (p.status ?? 'active') === 'active' && !p.merged_into
  && !p.wikidata_id && !p.website && !p.instagram && !p.facebook && p.lat != null && p.lng != null);

/** Look up to `limit` places (picked first, then a fresh order each run). Returns those matched. */
export async function wikidataNear(places: Place[], limit = 12, fetcher: typeof fetch = fetch, gapMs = 1000): Promise<Place[]> {
  const due = dueForNear(places).map(p => ({ p, r: Math.random() }))
    .sort((a, b) => Number(!!b.p.picked) - Number(!!a.p.picked) || a.r - b.r).slice(0, limit).map(x => x.p);
  const matched: Place[] = [];
  for (const p of due) {
    const qid = pickItem(p, await near(p.lat!, p.lng!, fetcher));
    if (qid) { p.wikidata_id = qid; p.enriched_at = null; matched.push(p); }
    if (gapMs) await sleep(gapMs);
  }
  return matched;
}
