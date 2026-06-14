# WanderAlt — Claude Code instructions

Static site for underground/alternative culture in European cities (Tallinn live; Helsinki, Riga; Vilnius internal-testing). **Curated by humans, not algorithms — curator voice is the loudest thing on every screen.**

**This file is baseline contracts only.** Depth on demand (do NOT auto-import — they bloat context):
`README.md` product/deploy · `HANDOFF.md` engineering reference + per-page specs · `ROADMAP.md` audit + frontend findings · `docs/backend-and-pipeline.md` Supabase pipeline, source matrix, Discover internals, file map, edge-fn LLM status · `brand/BRAND.md` logo/palette/type · `docs/reconcile-enforce-runbook.md`.

## Stack contract (never break)
- **Static HTML + CSS + vanilla JS. No build step, no framework, no bundler, no runtime npm deps.** Plain `.html`; scripts `defer`; CSP-strict (no inline `<script>`).
- **Backend:** Supabase (REST + Edge Functions + pg_cron), project `aqnsmmbrspkbfcvougeh` (eu-central-1). Anon key in `supabase.js` is public on purpose (RLS: SELECT-only; INSERT only on `bookmarks`/`digest_opt_ins`). **Service-role key never committed** (env `SUPABASE_SERVICE_ROLE_KEY`).
- **Hosting:** Cloudflare Pages (not Vercel). Single domain `wanderalt.app`; config in `_headers`/`_redirects` — never add bare→`.html` redirects (infinite loop).
- Deploy edge functions via the Supabase MCP `deploy_edge_function` tool only (no `supabase` CLI); **preserve each function's existing `verify_jwt`**.

## Commands
```
npm start        # dev server :5173
npm run admin    # admin panel :8080
npm run verify   # structural sweep: overflow / console errors / 44px taps × public pages × 390·768·1440 (non-zero on fail)
npm run e2e      # behavioural sweep: photo cards, taste cue, view-transition tag, bookmark persistence
npm run smoke    # screenshot regression (server running) · npm run lighthouse = perf
```
**Run `npm run verify` after ANY layout/CSS/markup change; `npm run e2e` for behaviour.** Real photos/duotone only render on the Cloudflare PR preview — `npm run preview -- <branch-preview-url>`.

## Layout & design contracts (must never regress)
- **Viewport** 390×844 canonical; desktop breakpoint **768px** (bottom-nav → masthead). One shared width token **`--reading-max`** on every page so edges align; ladder **1100**≥768 · **1200**≥1100 · **1280**≥1440 · **1440**≥1680 · **1600**≥1920 (mobile = full-width − 20px gutter; desktop gutter 32px). Long text keeps per-block `ch` measures (56–64ch).
- **Two-tone brand:** petrol `--c-accent #055959` is the only accent; lime `--c-lime #d2dc50` is **signal-only** (live/active state) and **forbidden as text/icon**. **No third color.** White `--c-paper` background. WCAG 2.2 AA floor — do not lighten `--c-ink-mute #5c5c66`.
- **Type:** Fraunces (`--ff-display`, titles + curator quote), Inter (`--ff-body`), Geist Mono (`--ff-mono`, uppercase labels). Self-hosted woff2, no Google CDN. **Curator quote is the largest element on every screen.**
- **Spacing grid is law:** `--s-*` only (4/8/12/16/20/24/32/40/56/72). No off-grid literals (only chip paddings + 1–2px optical fits are exempt).
- **Tap targets 44px floor** on public/touch pages (chips ~32px Material-exempt; inline text links WCAG-exempt; admin desktop-exempt).
- **Components — one impl per pattern, reuse never fork:** `.list-row--card` (photo · body · bookmark, initials fallback), `.seg-tab` segmented control, `.tonight__hero`/`.detail-hero` scrim hero, `.chip`/`.mood-chip` (active = leading "✓", never color-only), `.picks-empty` empty states. Text over photos = white on a bottom-anchored black scrim, never `text-shadow`. Reuse `WA.UI` render helpers — never hand-copy.
- **Tokens live in `:root` (styles.css). Do NOT add CSS variables, npm packages, or deps without asking.** Liquid Glass on only 3 chrome surfaces (topbar, bottom-nav, mobile sheets). Radius `--radius` 8 / `--radius-card` 12 only. Left-aligned, 1px-rule dividers, no centered blocks (desktop masthead nav excepted).
- **Motion: two tokens only** — `--t-fast 120ms ease`, `--t-mid 280ms cubic-bezier(.2,.8,.2,1)`. No new keyframes, parallax, or bounce. Reuse the shared `@starting-style` entrance + card→hero View Transition; all cancelled under `prefers-reduced-motion`.
- **Photos** via `image_url` only, full-colour (no duotone). Real venues only — no fake places.

## Content & voice
- Curator **handles** start `@`, match the Telegram slug (`@sigmundtells`). Metadata format `Neighborhood · type · day + time`.
- **Voice:** no em-dashes in headlines, no exclamation marks, never the word "discover", no marketing voice. Back-page-of-a-newsletter.
- No cookie banner / analytics / third-party scripts (strictly-necessary localStorage only). No separate Terms/Privacy pages — `about.html` covers it.

## Supabase pipeline (CRITICAL — constrained plan)
- **Never poll.** Fire a cron/function once, say "draining, check back ~10 min", end the turn. Health checks are one-shot SQL (`staging_messages` status counts · `picks WHERE archived_at IS NULL` · `ingest_log ORDER BY id DESC LIMIT 5`).
- **Crons own the schedule** — only touch if asked. App reads `picks WHERE archived_at IS NULL`. Pick id = `channel-message_id`; staging upserts MUST use `?on_conflict=channel,message_id`. Any new city MUST get a `process-staging` `CITY_CONTEXT` entry. Flow, source matrix, lifecycle → `docs/backend-and-pipeline.md`.

## LLM model policy (do not deviate)
- **Groq first, Gemini only as a gated fallback.** Primary `meta-llama/llama-4-scout-17b-16e-instruct` (fallback `llama-3.3-70b-versatile`) for match-pick / process-staging / generate-context / draft-column.
- **Gemini** = `gemini-2.5-flash` / `-2.5-flash-lite` only; **never** `gemini-3.5-flash` / `-pro` / `2.0-flash` (don't exist / 404). **No Search grounding anywhere.** Embeddings stay `gemini-embedding-001`. Per-function versions → `docs/backend-and-pipeline.md`.

## Working rules
- Visual change = make **only** that change; don't refactor adjacent code. Don't add CSS vars / deps without asking. Keep `README.md` current on scope changes.
- **Open PRs READY for review** (`draft: false`). End each session with 2–3 short "next step" suggestions.
- `.claude/settings.local.json` is gitignored (machine-local; see `docs/hybrid-cloud-local.md` for the cloud↔local-model handoff). Cloud sessions need secrets as env vars, not in code.
