# WanderAlt — Launch checklist

The pre-launch sweep. Work top to bottom; the order is deliberate
(DNS first because everything depends on it; OG verification last
because the cache flush needs HTTPS to be live).

Domain: **wanderalt.app** (primary) · **wanderalt.com** (defensive 301)
Registrar: spaceship.com

---

## 0 · Note on the Cloudflare Developer Platform MCP

This repo is connected to the Cloudflare Developer Platform MCP, but
that connector exposes **Workers / D1 / KV / R2 / Hyperdrive** — the
compute and storage primitives. WanderAlt is a static site + Supabase,
so none of those are needed. The four operations below (DNS attach,
Pages project, Email Routing, Web Analytics) are **dashboard-only
flows** even with full API access — they're tied to OAuth-driven
account setup, not the API surface — so do them by hand in the
Cloudflare dashboard.

The MCP IS useful later if we want to:
- Add a Worker for SSR-rendered per-page OG images (currently
  documented as a follow-up in `brand/IMPLEMENTATION.md`)
- Add a KV namespace for ratelimiting the digest opt-in form
- Add R2 if we ever need to serve user-uploaded venue photos

None of those are blocking launch.

## 1 · DNS (do first, propagation takes hours)

**Cloudflare** as the DNS provider for both domains. Spaceship doesn't
do edge hosting or email routing, so all records move to Cloudflare.

- [ ] Sign up at cloudflare.com (free plan is enough).
- [ ] **Add `wanderalt.app`** — copy the two nameservers Cloudflare
  assigns. In Spaceship → Domains → wanderalt.app → Nameservers,
  paste them. **Repeat for `wanderalt.com`**.
- [ ] Wait for Cloudflare to confirm both zones are active (typically
  15–60 min, can be 24 h).
- [ ] Enable "Always Use HTTPS" and "Automatic HTTPS Rewrites" on
  both zones (Cloudflare → SSL/TLS → Edge Certificates).

## 2 · Hosting (Cloudflare Pages)

The repo is GitHub-connected. Cloudflare Pages auto-deploys on push to
`main` (same workflow as Vercel, with better static + edge defaults
for our shape of site).

- [ ] cloudflare.com → Pages → "Connect to Git" → select the WanderAlt
  GitHub repo.
- [ ] Build settings:
  - Framework preset: **None**
  - Build command: *(empty)*
  - Build output: **`/`** (repo root — it's a static site)
- [ ] Add the custom domain `wanderalt.app` to the Pages project.
  Cloudflare auto-provisions a Let's Encrypt cert.
- [ ] Add `wanderalt.com` to the same project so the registrar-level
  redirect rules in `_redirects` can fire (`wanderalt.com/*` →
  `wanderalt.app/:splat` 301).
- [ ] Confirm `_headers` and `_redirects` are picked up (visit any
  page, view response headers, look for `Strict-Transport-Security`).

## 3 · Email (Cloudflare Email Routing — free)

- [ ] Cloudflare → wanderalt.app → Email → Email Routing → Enable.
- [ ] Add forwards:
  - `hello@wanderalt.app` → your Gmail
  - `support@wanderalt.app` → your Gmail (alias is fine to start)
  - `curators@wanderalt.app` → your Gmail
- [ ] Verify the destination address (Cloudflare emails a confirmation
  to your Gmail).
- [ ] **Sending from `hello@`** — Cloudflare Routing only forwards.
  To reply *from* `hello@wanderalt.app` in Gmail:
  - Gmail → Settings → Accounts → "Send mail as" → Add another
    email → enter `hello@wanderalt.app`
  - SMTP server: `smtp.gmail.com`, port 587, your Gmail address,
    an app password (Gmail → Security → App passwords)
  - Cloudflare will forward replies through their routing.
- [ ] Send a test email to `hello@wanderalt.app` from a phone (not
  the same Gmail) to confirm forwarding works.

## 4 · Supabase environment variables in Cloudflare Pages

The anon key is already in `supabase.js` (public on purpose — RLS is
SELECT-only). Service role keys never live in client code or env vars
on Pages; they live only in the Supabase Edge Function environment.

- [ ] Confirm `supabase.js` line 20 still has the live anon key
  (`...sWSo43m3u8S395pDb_GvCbkZgzb_1Nz9q3CpnT0PUwA`).
- [ ] In Supabase → Settings → API → check RLS is enabled on every
  user-data table (`bookmarks`, `digest_opt_ins`, `profiles`,
  `user_match_history`).
- [ ] Supabase → Edge Functions → confirm `SUPABASE_SERVICE_ROLE_KEY`,
  `GEMINI_KEY`, `GROQ_KEY`, `GOOGLE_PLACES_KEY` are still set in the
  function environment.

## 5 · Analytics (Cloudflare Web Analytics)

Honours the About page's "we don't track you" promise — server-side,
no JS tracker, no cookies, GDPR-clean.

- [ ] Cloudflare → Analytics & Logs → Web Analytics → Enable for
  `wanderalt.app`. **Pick the "Site" mode (server-side), not the
  JS-snippet mode.** This gives traffic stats without injecting any
  script into the site.
- [ ] (Optional) Add GoatCounter as a second source if you want
  page-level conversion data later. Skip for v1.

## 6 · Google Search Console

- [ ] search.google.com/search-console → Add property → wanderalt.app
  → verify via Cloudflare DNS (Cloudflare integration is one-click).
- [ ] Submit `https://wanderalt.app/sitemap.xml`.
- [ ] Submit individual URLs for instant indexing: `/`, `/discover.html`,
  `/about.html`.

## 7 · Social cards + OG verification

The site has three sets of OG cards ready: default + per-city
(Tallinn/Helsinki/Riga), all in `brand/social/`. After deploy:

- [ ] Twitter Card Validator (`cards-dev.twitter.com/validator`) →
  paste `https://wanderalt.app/` — confirm the `og-default.png`
  shows correctly.
- [ ] Facebook Sharing Debugger (`developers.facebook.com/tools/debug`)
  → paste the same URL, click "Scrape Again" to bust their cache.
- [ ] LinkedIn Post Inspector (`linkedin.com/post-inspector`) → same.
- [ ] Test a venue page (e.g. `wanderalt.app/venue.html?id=<live-id>`)
  to confirm per-venue OG title/description override fires.

## 8 · Social accounts

Reserve handles even if you don't post yet — squatters move fast.

- [ ] Instagram: @wanderalt
- [ ] Threads: @wanderalt
- [ ] Bluesky: @wanderalt.bsky.social (or @wanderalt.app via DNS verify)
- [ ] Mastodon: @wanderalt@mastodon.social (or self-host later)
- [ ] X / Twitter: @wanderalt (lower priority — culture audience is
  more on Threads/Bluesky in 2026, but reserve anyway)
- [ ] Telegram: t.me/wanderalt (matches the curator-channel convention)
- [ ] Each bio links to wanderalt.app

## 9 · Pre-launch QA

The smoke harness covers code, but human eyes catch what scripts can't.

- [ ] `npm run smoke` passes locally (39 screenshots, zero errors).
- [ ] Real browser: open every page at 390 × 844 and 1280 × 900;
  check the city banner, dropdown, bottom nav, focus rings.
- [ ] Real browser: click a Tonight pin on Tallinn discover, confirm
  the detail panel + Bookmark works.
- [ ] Real browser: click a cluster of 2 picks, confirm the new
  cluster-list popup appears.
- [ ] Lighthouse audit on `/` and `/discover.html`. Aim:
  - Performance ≥ 90
  - Accessibility ≥ 95
  - Best Practices ≥ 95
  - SEO ≥ 100

## 10 · Day-of-launch

- [ ] Push the last main-branch commit; confirm Pages deploys.
- [ ] Hit `wanderalt.com` from a fresh browser — should 301 to .app.
- [ ] Hit `wanderalt.app` — should serve the Briefing.
- [ ] Submit to Search Console (step 6) so indexing starts.
- [ ] Post launch on Threads + Bluesky + Telegram. Schedule via
  Typefully or post manually. (Buffer's 2024 free-tier cuts make it
  weaker; Typefully wins for solo creators in 2026.)
- [ ] Set up an UptimeRobot or BetterStack free-tier monitor on
  `wanderalt.app/` (5-min interval). Static + Cloudflare = 99.99% uptime
  expected; the monitor is for the unexpected.

---

## What's deliberately NOT in this checklist

- ❌ **Cookie banner.** We use only strictly-necessary localStorage
  (auth, bookmarks, prefs). The About page documents this. Adding a
  banner anyway would be theatre.
- ❌ **Make.com / n8n / Zapier.** All the data pipeline lives in
  Supabase crons; there's nothing to glue. Add a workflow tool when
  there's a concrete trigger, not in advance.
- ❌ **Sentry / Datadog.** Static site + Supabase = the failure
  surface is Supabase Edge Function errors, already logged in
  `ingest_log`. Wire client error reporting only if Lighthouse
  audits surface real JS errors at scale.
- ❌ **Buffer.** Cut by Buffer in 2024 (free tier capped at 3 channels
  with no scheduling beyond 10 posts). **Typefully** has the better
  free tier for editorial cadence in 2026. **Postiz** (open-source,
  self-hosted Buffer alternative) if you want full control.
- ❌ **Vercel Analytics.** Conflicts with our brand promise of no
  tracking. Cloudflare Web Analytics (server-side) is the match.

---

*See `CLAUDE.md` → "Domain + page architecture" for the rationale
behind single-domain + no-tracker.*
