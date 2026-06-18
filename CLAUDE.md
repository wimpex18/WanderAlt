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
- **Vertical rhythm is a hierarchy, not a number** (research-backed — space encodes relationship; closer = more related): on every screen the vertical gaps must step **within-item (4–8) < between sibling items (12–16) < heading→its content (20–24) < between groups/sections (32–40+)**. A **heading is never the tightest gap near it** (the "Sign in" title must have *more* space below it than the gap between the fields it introduces). Sibling items in a list/form share **one** gap value; a larger gap is only used to signal a real group break. Apply the *same* rhythm to the same pattern on every page.
- **Tap targets 44px floor** on public/touch pages (chips ~32px Material-exempt; inline text links WCAG-exempt; admin desktop-exempt).
- **Components — one impl per pattern, reuse never fork:** `.page-head` (the one page-title block on EVERY page — eyebrow + Fraunces title + mono meta; `--profile` adds the avatar row; a pick *with a photo* uses the `.detail-hero` scrim hero instead), `.list-row--card` (photo · body · bookmark, initials fallback), `.seg-tab` segmented control, `.tonight__hero`/`.detail-hero` scrim hero, `.chip`/`.mood-chip` (active = leading "✓", never color-only), `.picks-empty` empty states. Text over photos = white on a bottom-anchored black scrim, never `text-shadow`. Reuse `WA.UI` render helpers — never hand-copy.
- **Tokens live in `:root` (styles.css). Do NOT add CSS variables, npm packages, or deps without asking.** Liquid Glass on only 3 chrome surfaces (topbar, **full-width docked bottom bar** — not a floating pill, since June 2026 — and mobile sheets). Radius vocabulary **4 (tags `--radius-tag`) · 8 (controls `--radius`) · 12 (plates `--radius-card`)**; the 999px pill is retired. Left-aligned, 1px-rule dividers, no centered blocks (desktop masthead nav excepted).
- **Plate & Rule (June 2026 reskin):** every surface is a **plate** (12px, 1px hairline) or a **rule** (1px hairline on the open page); controls are one **`.btn` family** (`--primary/--secondary/--quiet/--petrol`, 52px) + `.tag` (4px) / chip / `.wa-seg` / `.field` atoms; banner is a framed plate; Discover groups its controls in one `.deck` plate. Full system + the original boards in `docs/redesign-jun26/` (CSS ported onto the production tokens — Fraunces/Inter and the `--reading-max` ladder, NOT the boards' DM Serif/Geist/1240px).
- **Icon system (link-in-bio, July 2026):** secondary/external actions are **icon-only buttons** — borderless, **44px tap target around a ~22px monochrome glyph**, ink-soft default → petrol on hover (`.social-icon` web/social via `WA.UI.socialButtons`; `.action-icon` for Add-to-calendar / Share). Glyphs are standard marks (Simple Icons / Bootstrap / Tabler), **monochrome only** (no brand colours); social/nav glyphs swap **filled on mobile, outline on desktop**. **Primary** actions keep a label (`.action-btn`/`.btn`, petrol). **Active state = soft petrol-tint highlight** (`--c-accent-soft`, radius 8) behind the chosen nav tab + segmented control — replaces the old underline; still petrol-only, no 999px pill. Topbar About/Sign-in are icon+label on desktop, **icon-only on mobile**. Keep sizes/alignment unified across these. **Inline form submits** (digest signup, search) use a **composite field** — the input with a petrol icon-button docked inside the end (`.digest-field`), never a separate chunky button (2026 Substack/Ghost pattern). Don't take minimalism so far it drops labels on *primary conversion* CTAs (Sign in / Create account / I'm going stay labelled — icon-only is for secondary actions).
- **Control sizing (one system, enforce it):** exactly **two control heights** — **52px** = form tier (all text inputs/composite fields + the buttons that sit with them or act as the page's main CTA: Sign in, Create account, Cancel, Apply, Google, digest submit, Today's "I'm going") and **44px** = compact tier (icon-only buttons, pills, `.wa-seg`/segmented tabs, nav, inline toolbars like the venue action row). **Never mix the two heights inside one row/form** — every control in a given row shares one height and one radius (8). **Primary button = petrol** (`--c-accent`, white text, hover `--c-accent-deep`) everywhere — never ink/black; **secondary = quiet outline** (`--c-rule-strong`, ink text). In a form's action row the primary + secondary are **equal width** (`flex:1`) and span the same width as the inputs above them — don't leave a content-width submit next to a full-width input. Inputs are one unified `.auth-panel__input`/`.field` look (52px, 1.5px `--c-rule-strong`, radius 8, petrol focus); password inputs use the composite `.field-pw` with an embedded eye toggle.
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
- **Consistency is checked per-pattern across ALL pages, never per-screen.** When you touch any element (button, input, heading, row, gap), verify every other instance of that pattern app-wide still matches the system above (sizing tier, rhythm, alignment, colour) — a fix that only looks right on the screen you opened is the recurring failure mode. Measure, don't eyeball: dump heights/widths/gaps across pages before declaring consistency.
- **Open PRs READY for review** (`draft: false`). End each session with 2–3 short "next step" suggestions.
- `.claude/settings.local.json` is gitignored (machine-local; see `docs/hybrid-cloud-local.md` for the cloud↔local-model handoff). Cloud sessions need secrets as env vars, not in code.
