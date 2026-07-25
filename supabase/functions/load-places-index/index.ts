import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Retired one-shot loader (Jul 2026). The Overture places_index load
// completed 2 Jul 2026; this stub remains so the slug can't be
// re-registered with live code by accident.
//
// Reloading from a newer Overture release: download the places theme per
// city bbox (`overturemaps download --bbox=… --type=place -f geojson`),
// filter to the WA kind vocabulary at confidence >= 0.55, dedupe on
// (city, lower(name)) keeping the highest confidence, then temporarily
// deploy this function with an insert handler — a JSON array of <=500 rows
// behind a fresh random `x-load-token` header, POSTed to
// /rest/v1/places_index?on_conflict=id with the service key and
// `Prefer: resolution=ignore-duplicates`. Redeploy this stub afterwards:
// the loader is unauthenticated apart from that one-time token, so it must
// never be left live.

Deno.serve(() => new Response('gone — one-shot loader retired after the Jul 2026 load', { status: 410 }));
