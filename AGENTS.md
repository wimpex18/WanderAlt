# WanderAlt

Tallinn culture, a walk at a time. Read [README.md](README.md) for the current product, commands, architecture and operations. Tallinn is the only city with data; the app is not launched, so large breaking changes are acceptable.

## Working here

- Read `git log -10` and the relevant code before changing an area. Node 24 (`.nvmrc`); `npm install` supplies development tools only.
- One branch and one PR per session, including follow-up requests. Use `codex/` for new branches. The owner merges.
- Run `npm test` and `npm run typecheck` before pushing. Rebuild generated translations or icons when their sources change.
- Check page changes at 390 and 1440 px in both themes, including keyboard focus and empty/error states. Check affected tablet breakpoints too. Clear an old service-worker registration if edits do not appear; bump the shell version for deployed asset changes.
- Keep current product/operational facts in README and agent rules here. Update these in the same change; do not add audit, research or improvement diaries. History belongs in Git/PRs, not documentation.
- Use code for schemas, model pins, budgets and asset definitions; use connectors to verify live deployment settings. Do not duplicate these inventories in Markdown.
- Linear is the durable backlog when explicitly requested: Development (DEV), project WanderAlt, titles start with `WA —`. Retain an originating issue ID in its branch or PR; do not create session-history tickets.

## Product and data

- The unit is a walk of picked places and, when something is on, a listing. Keep four tabs: Now, Map, Saved, You. All events and All places are destinations under Now, not extra tabs.
- The Guide uses `places.picked` with a one-line English `pick_note` grounded in the venue's own words or a checked fact. Search can also find other verified event venues.
- Never invent hours, prices, reviews, dates or times. A Free, In English or Open now filter requires a known fact. Missing prices can pass a cap with an explicit note; unlocated events remain in lists and are counted as omitted on Map.
- Never guess a venue/event photo from its name. Check identity and attribution; missing artwork uses its Label.
- Voice: handles start with `@`; no exclamation marks or marketing register; never “discover” as a verb.

## Security and services

- Treat every listing field as untrusted. Escape interpolated text and attributes with `WA.UI.esc()` and pass DB-sourced URLs through `WA.UI.safeUrl()`. The pipeline stores only http(s) URLs and never organiser contact details.
- No inline scripts, inline event handlers, third-party scripts or analytics. Keep Pages middleware and `_headers` CSP consistent.
- The anon key in `supabase.js` is public on purpose, protected by RLS. Service-role/model/social keys stay in git-ignored `.env`, repository secrets or private token storage; never put them in public assets or logs.
- Enable RLS on exposed tables. Own-row policies use `(select auth.uid())`. Revoke EXECUTE from `anon, authenticated, public` on every SECURITY DEFINER function in the same migration. Keep `pg_net` uninstalled.
- Retain SQL migration history. Run the relevant rollback-only database assertions after schema changes; `npm test` does not query Supabase.
- Deploy edge functions only through Supabase MCP `deploy_edge_function`, explicitly passing the function's current `verify_jwt`. A commit does not deploy functions or apply migrations.
- Free services/models only: Workers AI, then OpenRouter `:free`; no Gemini or paid plans. Verify live model catalogues before changing pins.
- Social publishing requires the owner's explicit authorization for the proposed post. Public discovery scopes do not establish provider approval; do not enable the disabled Instagram hashtag collector without that approval.
- Never add a bare-path-to-`.html` rule to `_redirects`; Pages pretty URLs would loop.
