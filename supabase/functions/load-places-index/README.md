# load-places-index — retired one-shot loader

Used once (2 Jul 2026) to bulk-load the Overture Maps venue extract into
`places_index` (1,895 rows, 4 cities) without routing the data through an
interactive session. Deployed as a 410 stub since.

## Re-running a load (e.g. a newer Overture release)

1. Extract + filter per city (bboxes in `docs/provider-strategy-jul26.md`):
   `pip install overturemaps && overturemaps download --bbox=<minx,miny,maxx,maxy> -f geojson --type=place -o city.geojson`
   Filter to the `CATEGORY_TO_KIND` map (see the strategy doc), confidence ≥ 0.55,
   dedupe by (city, lower(name)) keeping highest confidence.
2. Temporarily deploy this function with an insert handler: accept a JSON array
   (≤500 rows) guarded by a fresh random `x-load-token` header, and POST it to
   `/rest/v1/places_index?on_conflict=id` with the service key +
   `Prefer: resolution=ignore-duplicates`.
3. POST the chunks, verify counts, then redeploy this 410 stub.

Never leave the live loader deployed — it is unauthenticated except for the
one-time token.
