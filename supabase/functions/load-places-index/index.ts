import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Retired one-shot loader (provider-strategy P1, Jul 2026). The Overture
// places_index load completed 2 Jul 2026; this stub remains so the slug
// can't be re-registered with live code by accident. Reload procedure:
// README.md in this folder.

Deno.serve(() => new Response('gone — one-shot loader retired after the Jul 2026 load', { status: 410 }));
