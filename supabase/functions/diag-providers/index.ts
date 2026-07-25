// Retired one-shot probe (3 Jul 2026). Used once to confirm the OpenRouter
// and Cloudflare Workers AI keys worked after the owner created them.
Deno.serve(() => new Response('gone — one-shot probe retired after use', { status: 410 }));
