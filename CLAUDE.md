# WanderAlt

Static site for underground culture in European cities. Tallinn, Helsinki and Riga are live; Vilnius is unlocked for internal testing. Every pick carries a named human curator's voice — that's the product, not a ranked feed.

Plain HTML/CSS/vanilla JS at the repo root, Supabase behind it, Cloudflare Pages in front. Read the code for structure; what follows is only what the code won't tell you.

## Things that will bite you

**No build step, ever.** No framework, no bundler, no runtime dependencies, no inline `<script>` (the CSP is strict). devDependencies for test tooling are fine.

**Hosting is Cloudflare Pages, not Vercel**, on the single domain `wanderalt.app`. Never add a bare→`.html` redirect to `_redirects` — it loops infinitely.

**The Supabase anon key in `supabase.js` is public on purpose** (RLS is SELECT-only, with INSERT allowed on `bookmarks` and `digest_opt_ins`). The service-role key is never committed; cloud sessions read it from `SUPABASE_SERVICE_ROLE_KEY`.

**Deploy edge functions through the Supabase MCP `deploy_edge_function` tool only** — there is no `supabase` CLI here — and preserve each function's existing `verify_jwt` setting. A cron that calls a `verify_jwt:true` function through raw `net.http_post` gets a 401; healthy crons go through `public.invoke_wa_fn(fn)`.

**Never poll the pipeline.** Fire a function or cron, say "draining, check back in ~10 minutes", end the turn. Health checks are one-shot SQL against `staging_messages` status counts, `picks WHERE archived_at IS NULL`, and the tail of `ingest_log`.

**Staging upserts must carry `?on_conflict=channel,message_id`.** Without it repeat listings 409 instead of being ignored, `bumpSeen()` never runs, and ingestion silently under-processes. This bug has shipped twice — check it in any new or edited ingest function.

**Any new city needs a `CITY_CONTEXT` entry in `process-staging`**, or it silently degrades to the Tallinn context and the messages are lost.

**Ingest and LLM crons are deliberately disabled** (owner decision, pre-release, no users). The zero-cost lifecycle crons run. Every frozen function still works when invoked by hand. Don't re-enable anything without being asked — README covers how.

## LLM policy

Groq first for every text-generation function, model `llama-3.3-70b-versatile`. The previous primary `meta-llama/llama-4-scout-17b-16e-instruct` was **decommissioned at Groq** (absent from `/v1/models`, 404 on completion — probed Jul 2026). It was pinned in six functions; `translate-picks` had no fallback and was silently dead, and `match-pick` paid a wasted 404 per query before falling through. This is the failure mode the pinning rule below exists to catch — re-probe `/v1/models` before assuming any id still resolves. OpenRouter `:free` is the live second lane (model pinned by the `OPENROUTER_MODEL` secret). Gemini is retired but not deleted: every call site gates on `pipeline_config.gemini_fallback_enabled`, so it's a one-row change to bring back — and Google Cloud billing is deleted, so don't assume the key still authenticates. No Search grounding anywhere. Embeddings are Cloudflare Workers AI `@cf/baai/bge-m3` at 1024 dimensions.

Pin models by exact id, and verify the id exists in the provider's console before changing it. Model names recalled from memory are how this repo ended up documenting a "gemini-3.5" that never existed.

## Design system

The July 2026 Dusk Glass reskin covers every public page (about.html stays paper by spec, admin stays desktop-light). Dusk is the default; Daybreak is the same DOM with `[data-theme="day"]` swapping tokens, driven pre-paint by `theme.js` off a precomputed per-city sun table, never an API.

- **Use the tokens. Never hand-roll a colour, blur, or rgba literal** — a hard-coded value looks right at night and breaks Daybreak completely.
- **Lime is signal only**: one CTA per screen, live dots, the TONIGHT tag, the selected pin. Never body text, borders, or icon colour. Petrol is the only accent, and by day the CTA goes petrol because lime fails on paper. There is no third colour.
- **One control size** (`--unit`, 48px) and one radius vocabulary: 8 tags / 14 controls / 20 islands / 24 sheets. Control rows are single-line and never wrap; siblings share a width. Meta lines ellipsize; only card titles take two lines.
- **Fully-rounded (999px) is sanctioned for exactly two shapes** (owner ruling, Jul 2026, settling the earlier "pill retired" contradiction): floating glass chrome capsules — the dock island, floating toggles, switch tracks — and badges, dots and counts at 24px or under, where the capsule *is* the shape. Tags stay at 8, chips at 14, and button controls stay off 999 entirely.
- **Photo-text scrims use `--scrim-photo`**, which is deliberately theme-invariant dark: a photo needs a dark ramp under text in both themes. `--scrim-hero` and `--scrim-detail` are the scene scrims and do swap with the theme. Don't reach for the wrong one.
- **Active state is a tint plus a mark**, never colour alone.
- **Spacing comes from the `--s-*` scale**, and vertical gaps encode relationship: tighter within an item than between items, and a heading always gets more room below it than the gap between the things it introduces. A heading is never the tightest gap near it.
- **A pick among peers leads with its photo and title; the quote is a caption.** Quote-as-hero is scoped to single-item detail views where there's no peer to compare against. When there's no photo, use the kind glyph placeholder, never a grey box.
- **One implementation per pattern.** Reuse the `WA.UI` helpers rather than hand-copying a row, a thumb, or an empty state. Empty and error states speak in curator voice; "No results found" is banned copy.
- Tap targets floor at 44px on public pages, WCAG 2.2 AA is the floor, motion is the two existing tokens and nothing new.

Don't add CSS variables without asking. When you touch any pattern, check every other instance of it across pages rather than the one screen you have open — measure heights and gaps, don't eyeball. Screen-local fixes are the recurring failure mode here.

**Never decide a CSS class is unused by grepping for it.** `ui-helpers.js` and the page scripts compose class names at runtime (`class="${cls}"`, base + `--variant`), so a name that appears nowhere in the source can still be on a live element — which is exactly why PurgeCSS-style tools mis-fire on this repo. The only trustworthy signal is a DOM census: drive every page, width, skin and interaction state in a headless browser, collect every class that actually appears, and treat anything absent from both that census and the source as dead. Verify a deletion by diffing the rule set through the browser's own CSS parser, not by screenshots (font-load timing makes ~10% of shots differ run to run) and not by computed styles (those resolve to layout geometry, which is just as noisy).

## Checking your work

There are no automated tests and no CI. The old Puppeteer/Playwright suite was removed in July 2026 — it never caught the failures that actually happen here (alignment, overlap, control sizes, overlays) and it is being rebuilt from scratch, so don't patch it back in piecemeal or add a test framework without being asked.

That puts the burden on looking. Run `npm start` and open the pages you touched at 390, 768 and 1440. Measure heights and gaps rather than eyeballing them, and check every other instance of a pattern you changed, not just the screen in front of you — screen-local fixes are the recurring failure mode here.

Three things genuinely cannot be judged locally, so verify them on the Cloudflare PR preview rather than guessing a fix from a local render: real photos and the duotone treatment, the MapLibre vector basemap (it never rasterises in headless Chromium on this stack — tiles fetch and the WebGL context creates, but the canvas never paints, so markers are real and the basemap isn't), and `backdrop-filter` blur (it composites differently across GPUs, so glass-over-content can look sharp or overlapping in a capture while blurring correctly in a real browser).

Two things the deleted suite used to catch, worth checking by hand: no horizontal overflow at any width, and no console errors on load.

## Rendering untrusted content

Pick, venue and curator text is scraped from Telegram, RSS and venue pages, passed through an LLM, and interpolated into `innerHTML` via template literals. Treat every one of those fields as attacker-controlled: **wrap it in `WA.UI.esc()` at the interpolation site**, including inside `aria-label`, `title` and `data-*` attributes, and including values that arrive via `buildMeta()`. A stored-XSS probe in July 2026 found `venue.html` and `curator.html` executing injected `onerror` handlers because `title`, `quote`, `tagline` and `bio` were interpolated raw while neighbouring fields were escaped.

URLs need more than escaping — `esc()` escapes quotes, not schemes, so a `javascript:` value survives it. Any DB-sourced URL going into an `href` or `src` goes through **`WA.UI.safeUrl()`**, which passes only http(s) and relative paths. The CSP blocks inline handlers in production, but that is the second line of defence, not the first: the local dev server sends no CSP at all.

## Voice

Curator handles start with `@` and match the Telegram slug. Metadata reads `Neighborhood · type · day + time`. No em-dashes in headlines, no exclamation marks, never the word "discover" as a verb, no marketing register — it should read like the back page of a newsletter. No cookie banner, no analytics, no third-party scripts; `about.html` covers privacy and terms.

## Working rules

A visual change means that change only — don't refactor what's next to it. Open PRs ready for review, not drafts. Keep README.md current when scope changes.
