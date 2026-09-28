# WanderAlt

What's on tonight in Tallinn for travellers, expats and locals who want independent and alternative culture: gigs, club nights, arthouse film, contemporary art and dance, talks, markets. Every listing carries a time, a walking distance and the source it came from. Tallinn is the only city with data; other cities come later. Not yet launched: no users, so large breaking changes are fine.

Two halves:

- **Pipeline** (`pipeline/`): collects Tallinn sources into Supabase every six hours on GitHub Actions, reads prose with free models (Workers AI, then OpenRouter `:free`), classifies and deduplicates events. See `docs/data.md` and `docs/models.md`.
- **Site** (repo root): static HTML, CSS and vanilla JS on Cloudflare Pages at `wanderalt.app`, reading Supabase REST with the public anon key. See `docs/frontend.md` for the design system and `docs/design-brief.md` for the direction.

## Commands

Node 24 (`.nvmrc`). `npm install` brings dev tools only.

```bash
npm start                 # site on http://localhost:5173 (no CSP locally)
npm run pipeline:dry      # collect and read every source, print, write nothing
npm run pipeline          # full run; needs SUPABASE_SERVICE_ROLE_KEY
npm run pipeline:models   # probe each configured model lane
npm test                  # pipeline tests (node:test, fixtures, no network)
npm run typecheck
```

Local keys go in a git-ignored `.env`; in CI they are repository secrets (`docs/models.md`).

## Map

- `pipeline/run.ts` orchestrates; `sources/` has one collector per kind (`fienta.ts`, `jsonld.ts`, `wordpress.ts`, `text.ts`); `venues.ts` reads the OpenStreetMap venue catalogue and fills venue links and photos; `llm.ts` holds the model lanes and prompts; `places.ts` resolves and geocodes venues; `dedupe.ts` merges one show listed by two sources; `sources.tallinn.json` lists the sources.
- `supabase/migrations/` is the schema. `supabase/functions/` holds `og-image` and `calendar-feed`.
- Pages: `index.html` Tonight (`home.js`), `discover.html` Programme (`programme.js`), `map.html`, `places.html`, `detail.html`, `saved.html`, `profile.html` You, `source.html`, `about.html`, `404.html`. `wa.css` is the whole stylesheet. `render.js` holds every shared piece of markup, `icons.js` the icons and pictograms, `finder.js` the search sheet. `supabase.js` loads data; `ui-helpers.js` has `WA.UI.esc` and `WA.UI.safeUrl`.
- `functions/` are Cloudflare Pages Functions (OG tags, Wikimedia image proxy). `vendor/` is MapLibre GL 6.11.2, self-hosted; upgrade by swapping its four files from the npm package's `dist/`.

## Rules

- **Untrusted text.** Listings come from strangers. In pages, wrap every interpolated field in `WA.UI.esc()` (including attributes) and pass every DB-sourced URL through `WA.UI.safeUrl()`. The pipeline stores only http(s) URLs and never stores organiser contact details.
- **CSP.** No inline `<script>` or inline event handlers; no third-party scripts or analytics.
- **Secrets.** The anon key in `supabase.js` is public on purpose (RLS). The service-role key and model keys never enter the repo, a page, or a log line.
- **Supabase.** Revoke EXECUTE from `anon, authenticated, public` on any SECURITY DEFINER function in the same migration. Keep `pg_net` uninstalled. Own-row policies use `(select auth.uid())`.
- **Edge functions** deploy only through the Supabase MCP `deploy_edge_function`, passing the function's current `verify_jwt`. Committing does not deploy.
- **Free models only**: Workers AI and OpenRouter `:free`, no Gemini, no paid plans; free tiers for every other service too. Re-check model ids against live catalogues before pinning (`docs/models.md`).
- **Photos by identity.** Never guess a venue or event photo from a name; no photo is better than a wrong one.
- **`_redirects`:** never add a bare-path to `.html` redirect; Pages already serves pretty URLs and it would loop.
- **Voice:** handles start with `@`; no exclamation marks, no marketing register, never "discover" as a verb.

## Working here

- Read `git log -10` and the relevant doc before changing an area. Docs describe the current state only: update them in the same change, and delete what is no longer true.
- Keep this file short and tool-neutral; it is the one instruction file for every coding agent (`CLAUDE.md` only imports it). Detail belongs in `docs/`.
- Small PRs with a plain description; the owner merges. Run `npm test` and `npm run typecheck` before pushing. Check page changes in a browser at 390 and 1440 px in both themes; the service worker caches aggressively, so clear it when a change doesn't show.
