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

Groq first for every text-generation function, primary `meta-llama/llama-4-scout-17b-16e-instruct`, fallback `llama-3.3-70b-versatile`. OpenRouter `:free` is the live second lane (model pinned by the `OPENROUTER_MODEL` secret). Gemini is retired but not deleted: every call site gates on `pipeline_config.gemini_fallback_enabled`, so it's a one-row change to bring back — and Google Cloud billing is deleted, so don't assume the key still authenticates. No Search grounding anywhere. Embeddings are Cloudflare Workers AI `@cf/baai/bge-m3` at 1024 dimensions.

Pin models by exact id, and verify the id exists in the provider's console before changing it. Model names recalled from memory are how this repo ended up documenting a "gemini-3.5" that never existed.

## Design system

The July 2026 Dusk Glass reskin covers every public page (about.html stays paper by spec, admin stays desktop-light). Dusk is the default; Daybreak is the same DOM with `[data-theme="day"]` swapping tokens, driven pre-paint by `theme.js` off a precomputed per-city sun table, never an API.

- **Use the tokens. Never hand-roll a colour, blur, or rgba literal** — a hard-coded value looks right at night and breaks Daybreak completely.
- **Lime is signal only**: one CTA per screen, live dots, the TONIGHT tag, the selected pin. Never body text, borders, or icon colour. Petrol is the only accent, and by day the CTA goes petrol because lime fails on paper. There is no third colour.
- **One control size** (`--unit`, 48px) and one radius vocabulary. Control rows are single-line and never wrap; siblings share a width. Meta lines ellipsize; only card titles take two lines.
- **Active state is a tint plus a mark**, never colour alone.
- **Spacing comes from the `--s-*` scale**, and vertical gaps encode relationship: tighter within an item than between items, and a heading always gets more room below it than the gap between the things it introduces. A heading is never the tightest gap near it.
- **A pick among peers leads with its photo and title; the quote is a caption.** Quote-as-hero is scoped to single-item detail views where there's no peer to compare against. When there's no photo, use the kind glyph placeholder, never a grey box.
- **One implementation per pattern.** Reuse the `WA.UI` helpers rather than hand-copying a row, a thumb, or an empty state. Empty and error states speak in curator voice; "No results found" is banned copy.
- Tap targets floor at 44px on public pages, WCAG 2.2 AA is the floor, motion is the two existing tokens and nothing new.

Don't add CSS variables without asking. When you touch any pattern, check every other instance of it across pages rather than the one screen you have open — measure heights and gaps, don't eyeball. Screen-local fixes are the recurring failure mode here.

## Gates

Run `npm run verify` after any layout, CSS, or markup change, and `npm run e2e` after any behaviour change. `npm run visual` pixel-diffs against committed baselines; if a diff is intentional, re-baseline and commit the PNGs alongside the CSS change.

Every harness runs on Playwright — one engine, one API. `npm run audit` captures viewport-sized segments rather than fullPage, because fullPage put fixed chrome over mid-page content and caught lazy rows empty; keep new captures segment-based for the same reason. Real photos and duotone only render on the Cloudflare PR preview, not locally.

## Voice

Curator handles start with `@` and match the Telegram slug. Metadata reads `Neighborhood · type · day + time`. No em-dashes in headlines, no exclamation marks, never the word "discover" as a verb, no marketing register — it should read like the back page of a newsletter. No cookie banner, no analytics, no third-party scripts; `about.html` covers privacy and terms.

## Working rules

A visual change means that change only — don't refactor what's next to it. Open PRs ready for review, not drafts. Keep README.md current when scope changes.
