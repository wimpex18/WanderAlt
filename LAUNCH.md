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

### On Cloudflare

- [ ] Sign up at cloudflare.com (free plan is enough). Account
  `c702586f2a839266ee0773fda0e7d1b9` (pm.zinin@gmail.com) is the one
  the MCP connector verified — use it.
- [ ] Dashboard → **Add a site** → enter `wanderalt.app` → Free plan
  → **Continue**. Cloudflare scans existing DNS (Spaceship default
  parking records) and shows the two nameservers it assigns
  (something like `xx.ns.cloudflare.com` / `yy.ns.cloudflare.com`).
  Copy them — you'll need them in Spaceship next.
- [ ] **Repeat for `wanderalt.com`** so the 301 rule in `_redirects`
  has a zone to fire from.

### On Spaceship

- [ ] spaceship.com → **Domains** → `wanderalt.app` → **Nameservers**.
  Switch from "Spaceship default" to **"Custom DNS"** and paste the
  two Cloudflare nameservers. Save. Spaceship will warn you about
  email and existing records — that's fine, all email/DNS lives in
  Cloudflare now.
- [ ] **Repeat for `wanderalt.com`** in Spaceship with the **same**
  two Cloudflare nameservers (Cloudflare assigns the same pair
  per-account regardless of which zone you're adding).
- [ ] Cloudflare emails you when each zone is verified (usually
  15–60 min, occasionally 24 h). The zone status in the dashboard
  changes from "Pending Nameserver Update" → "Active".

### Cloudflare SSL settings (after both zones are Active)

- [ ] Per zone → SSL/TLS → Overview → **Encryption Mode: Full
  (Strict)** (the strictest setting that still works with Pages).
- [ ] SSL/TLS → Edge Certificates → enable **"Always Use HTTPS"**
  and **"Automatic HTTPS Rewrites"**.
- [ ] SSL/TLS → Edge Certificates → **"Minimum TLS Version: 1.2"**
  (1.3 if your audience runs modern browsers, which it does —
  TLS 1.2 catches the long tail).

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

### 2b · Deploy the wikimedia-proxy Worker

Solves the "Wikipedia sets a third-party cookie on every visitor"
issue documented under Known Issues below. Lives at
`workers/wikimedia-proxy/`.

- [ ] In the same Cloudflare account, `cd workers/wikimedia-proxy`
  on your machine and run `npx wrangler@latest login` (one-time
  OAuth), then `npx wrangler@latest deploy`. Wrangler reads
  `wrangler.toml` and uploads the Worker.
- [ ] After first deploy: Cloudflare dashboard → Workers & Pages →
  **wikimedia-proxy** → Settings → Triggers → Routes → Add route
  → `wanderalt.app/img/wm/*` → Save. (Or uncomment the `[[routes]]`
  block in `wrangler.toml` and re-deploy.)
- [ ] Verify: in a browser, hit
  `wanderalt.app/img/wm/https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2Fthumb%2F5%2F53%2F2019_December_Lindakivi_Cultural_Center%252C_New_year_concert.jpg%2F960px-2019_December_Lindakivi_Cultural_Center%252C_New_year_concert.jpg`
  — you should get the image back with no `Set-Cookie` header.

The client-side rewrite (`supabase.js` → `proxifyImage()`) detects
`location.hostname` and only routes through `/img/wm/*` in production.
On localhost the rewrite is a no-op so dev keeps working without
needing the Worker.

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

## 5 · Analytics — read this carefully

A correction to the previous version of this doc: **Cloudflare Web
Analytics injects a JS beacon snippet** (`beacon.min.js`), even on
Pages where the injection is "automatic". That contradicts the About
page promise of "no third-party scripts."

There are TWO Cloudflare analytics products with similar names:

1. **Cloudflare Web Analytics** — the JS beacon. *Skip this.*
2. **Edge / Zone Analytics** — passive, server-side, derived from
   the request logs flowing through the proxy. No JS. *Use this.*

Edge Analytics is automatic the moment the zone is proxied through
Cloudflare (the orange-cloud DNS state, which is on by default). You
view it at:

- [ ] Cloudflare → wanderalt.app zone → **Analytics & Logs** → tab
  **Traffic** for visitor / request totals; **Web Analytics** tab
  stays **off** (do not click "Enable Web Analytics" — it'll inject
  the beacon).

That gives you: requests/day, bandwidth, top paths, top countries,
top user agents, status code distribution. No PII. No cookies.

- [ ] (Optional) Add **GoatCounter** (goatcounter.com — open source,
  no cookies, EU-hosted) as a second source if you want path-level
  conversion data Cloudflare doesn't surface (e.g. how many people
  who land on About click into Discover). You'd need to add the
  GoatCounter snippet to the HTML AND update the About page's
  "we don't track you" paragraph to mention it. Skip until needed.

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

## Known issues to resolve before flipping wanderalt.app live

These came out of the Lighthouse pre-flight audit (reports at
`docs/lighthouse/*.json`). Tracked here, not in ROADMAP because they
specifically block "go live."

1. **Wikimedia image cookies.** ✅ **Code shipped, deploy pending.**
   The Worker at `workers/wikimedia-proxy/` strips `Set-Cookie` from
   Wikimedia thumbnail responses and serves them through the CF
   edge cache. `supabase.js`'s `proxifyImage()` rewrites the URLs
   client-side in production (no-op on localhost). Two deploy steps
   in §2b above (wrangler deploy + add the route).

2. **Lighthouse Performance in dev vs prod.** The smoke + audit in
   this sandbox runs with `--ignore-certificate-errors` on puppeteer,
   which forces every external fetch (MapLibre tiles, image CDNs,
   fonts) to bypass the cache and re-handshake every request. The
   Performance scores will be substantially higher on real Cloudflare
   Pages hosting once tiles and images cache at the CF edge. Don't
   chase the dev-sandbox numbers; re-audit from a clean browser after
   the first production deploy and use those as the baseline.

3. **CLS on Briefing first paint.** Currently ~0.198 (down from 0.668
   before the Tonight skeleton landed). Target is < 0.1. The
   remaining shift is the city banner image SVG settling. Could be
   fully eliminated by pre-decoding the SVG (`<img
   fetchpriority="high" decoding="async">`) once the banner becomes
   an `<img>` instead of a CSS background. Cosmetic; safe to launch
   at 0.198.

---

*See `CLAUDE.md` → "Domain + page architecture" for the rationale
behind single-domain + no-tracker.*
