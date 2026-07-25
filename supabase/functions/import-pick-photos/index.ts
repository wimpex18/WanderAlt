// Retired one-shot migration (Jul 2026). Copied the surviving Google Places
// photos into the `pick-images` storage bucket and repointed picks.image_url
// at the stable public URLs; that migration is complete and catalog.js has
// been regenerated against it.
//
// It was deployed with verify_jwt:false while holding the service key and a
// write path (POST {"dry_run": false} uploaded to storage and PATCHed picks),
// so it is now a JWT-gated stub. The full loader body is in git history if a
// future photo-host migration needs the same shape.
Deno.serve(() => new Response('gone — one-shot photo migration retired', { status: 410 }));
