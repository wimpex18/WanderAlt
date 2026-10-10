# WanderAlt

Tallinn culture, a walk at a time: a static PWA (no framework or build step) on Cloudflare Pages, a Node pipeline and Supabase. Tallinn is the only city with data and the app is not launched, so large breaking changes are acceptable. [README.md](README.md) holds the current product, architecture and operations; read the sections you touch.

## Commands

- Node 24 (`.nvmrc`); `npm install` supplies development tools and the Anthropic SDK the pipeline's Claude lane uses.
- `npm start`: http://localhost:5173, static files only (no Pages Functions or CSP; check those on a PR preview).
- `npm test` and `npm run typecheck`: run both before every push. `npm test` never queries Supabase.
- `npm run build:lang` after editing `lang/phrases.tsv` or `lang/patterns.tsv`; `npm run build:inline-icons` after icon sources change.

## Workflow

- Read `git log -10` and the relevant code before changing an area.
- One branch and one PR per session, follow-ups included; the owner merges. Prefix branches with your tool: `claude/` for Claude Code, `codex/` for Codex. Keep an originating Linear ID in the branch or PR.
- Every new interface string goes into `lang/phrases.tsv` with Estonian, Russian and Ukrainian, then rebuild.
- Bump `VERSION` in `sw.js` when a deployed asset changes. If local edits do not appear, clear the old service-worker registration.
- Check page changes at 390 and 1440 px and affected tablet widths, in both themes, including keyboard focus and empty/error states.
- Keep current product/operational facts in README and agent rules here, updated in the same change. No audit, research or improvement diaries; history belongs in Git and PRs.
- Schemas, model pins, budgets and asset definitions live in code; verify live deployment settings through connectors. Do not copy these inventories into Markdown.
- Linear, only when asked: team Development (DEV), project WanderAlt, titles start with `WA —`. No session-history tickets.

## Product and data

- The unit is a walk of picked places and, when something is on, a listing. Keep four tabs: Now, Map, Saved, You. All events and All places are destinations under Now, not extra tabs.
- The Guide uses `places.picked` with a one-line English `pick_note` grounded in the venue's own words or a checked fact. Search can also find other verified event venues.
- Never invent hours, prices, reviews, dates or times. A Free, In English or Open now filter requires a known fact. Missing prices can pass a cap with an explicit note; unlocated events stay in lists and are counted as omitted on Map.
- Never guess a venue or event photo from its name. Check identity and attribution; missing artwork uses its Label.
- Place locations and merges come from `pipeline/place-checks.ts` (two independent witnesses, logged in `place_checks`). Improve its evidence rather than editing places by hand; a manual fix is for reversing a wrong answer.
- Held listings are settled by `pipeline/review-decider.ts`, never by a person, and the same decider takes a second look at listings published on a fit score alone: every decision quotes the listing's own words, checked in code, and is a row in `review_decisions`. A status note starting `manual` is a person's decision from review.html; the pipeline never changes one, and never writes one. Change the decider's evidence or prompt rather than editing statuses by hand, and measure it (`npm run review:decide -- --eval`) before and after.
- Voice: handles start with `@`; no exclamation marks or marketing register; never "discover" as a verb.

## Security and services

- Treat every listing field as untrusted. Escape interpolated text and attributes with `WA.UI.esc()` and pass DB-sourced URLs through `WA.UI.safeUrl()`. The pipeline stores only http(s) URLs and never organiser contact details.
- No inline scripts, inline event handlers, third-party scripts or analytics. Keep Pages middleware and the `_headers` CSP consistent.
- The anon key in `supabase.js` is public on purpose, protected by RLS. Service-role, model and social keys stay in git-ignored `.env`, repository secrets or private token storage; never in public assets or logs.
- Enable RLS on exposed tables. Own-row policies use `(select auth.uid())`. Revoke EXECUTE from `anon, authenticated, public` on every SECURITY DEFINER function in the same migration. Keep `pg_net` uninstalled.
- Keep SQL migration history. After schema changes, run the relevant rollback-only database assertions (README lists them).
- A commit neither applies migrations nor deploys edge functions. Deploy functions only through Supabase MCP `deploy_edge_function`, passing the function's current `verify_jwt`.
- Models: Claude Haiku 5.5 on the owner's Anthropic key (prompts under 100,000 tokens, a dollar cap per run), then Workers AI, then OpenRouter `:free`. No Gemini and no other paid model or plan. Verify live model catalogues and prices before changing pins; call Claude through the official SDK.
- IMPORTANT: publish to social accounts only when the owner or the social lead (social@wanderalt.app, with the owner's standing authorization) asks for that post in chat, after the final text and image have been shown. No unattended or scheduled publishing unless the owner turns it on. Public discovery scopes are not provider approval; keep the Instagram hashtag collector disabled until approved.
- Never add a bare-path-to-`.html` rule to `_redirects`; Pages pretty URLs would loop.
