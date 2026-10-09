# WanderAlt

What is worth walking to in Tallinn in the next few hours, and what to do around it: independent gigs, club nights, arthouse film, contemporary art and dance, talks, markets, and picked record shops, bookshops, galleries and bars. The unit is a short walk of places and, when something is on, a listing. Ticket sellers handle booking.

Tallinn only, not launched. The interface is English, Estonian, Russian and Ukrainian. Product outcomes and translations still need validation with readers.

## Current interface

Four tabs: **Now, Map, Saved, You**. Selecting Now from All events or the Guide returns to the main page, including a held tab gesture.

### Now (`index.html`)

- The state of the night with the starting point (Near), a rail of moods and one walk showing its stops, walking time, ticket cost and View walk, then Events/Places with a When key (Today, Tomorrow, Weekend, Pick dates) whose panel opens out of the key.
- Moods: one tap picks one mood; Filters holds several moods, subs and the ticket cap. The row is the same all day; a mood's hours shape only the suggested walk, which says when a chosen mood's walks begin ("Club nights from 20:00").
- Tonight's events read as a timeline: On now (what you can still walk into, latest start first: exhibitions, markets, festivals and club nights while they are on, gigs for 90 minutes, anything else for an hour, films, plays, talks and workshops for 15 minutes), Starting soon (two hours), Later tonight, Also today (no set time or a running series), Already under way (sessions you may no longer join), then cancelled or postponed. Other dates group by night.
- Once the controls scroll away they fold into one key showing dates, mood and any ticket cap. Empty results offer Clear filters (moods and price together, keeping dates) or Change dates.
- Rows are compact with a thumbnail and save. Show up to 25 matching items, then batches of 25 until exhausted; `shown` preserves expansion on refresh and Back. Changing view or filters resets it.
- All events opens the complete event catalogue; All places opens the picked Guide.
- From 1024 px the list sits beside a sticky side column (the walk, picked places open now and what is new since the last visit), and Events | Places with When stays pinned under the top bar. Every page shares one 1200 px width with the top bar; `/` opens search.

### Other pages

- **Search**: one header trigger opens a native dialog; phone/tablet uses the available viewport, desktop a bounded modal. Focus enters the input and returns to the trigger on close. Local previews separate event and place matches, soonest date first; past 45 minutes on foot a row gives the distance instead. Explicit submission opens full results. Search starts at All dates without Now's taste filters.
- **All events / Search results** (`discover.html`): query, dates, Refine and removable active filters, with Map these results; it belongs under Now. Now, Map and results share one compact date sheet with a native date input and optional range; Cancel keeps the current selection. Results starts at All dates, keeps its date state independent and can clear dates through its selected filter. Precise filters are revealed on demand; results page in batches of 30. Accepted sentence interpretations and manual overrides travel in the URL.
- **All places** (`places.html`): active, verified picked places; type, known Open now and a stated walking origin. Counts reflect current live listings. Named search and event details can also show other verified venues.
- **Map**: ordinary browsing shares Now's dates and taste, the same When key and the same mood row, drawn as glass pills over the map with Filters and Near me at its end. It opens on the bulk of what is shown (outlying venues are a pan away), and its list leads with tonight's timed listings, runs after them. `context=search` keeps independent results, framed whole, and a Back to results link. Missing coordinates are counted, never guessed.
- **Saved**: local saves and lists with account-scoped retryable sync. Lists are a row of chips (All, each list, New list). Saved shows group by night with the same hearted rows as Now (a heart unsaves in place, with Undo); two or more timed shows on one night also offer "Walk your saves" through the route page.
- **You**: one short settings list. Sign-in (Google or email link, through one Sign in key), then rows that name their value: Your taste (up to three moods plus In English; it leans walks, never filters), Start from, Language and Appearance (panels out of the row), Following, Recently opened, Add to Home screen and Data and privacy (sheets). Signed in, the account row, Inbox and Notifications join. Routes, details and sources are supporting destinations.

### Rules the interface keeps

- **Nights**: a night runs until 05:00. A stated start before 05:00 belongs to the evening before, so Today, Tomorrow and Weekend count nights on Now, Map and search; picked dates do too. Routes and day labels keep calendar days. A club night without a stated end is taken to run six hours, other timed listings three.
- **Unknown facts stay explicit**: Free requires known free entry, In English a stated performance language, Open now known hours. Unknown prices can pass a positive ticket cap with a note. Date-only entries say Time not listed. Closed or cancelled records keep their identity without claiming availability.
- **Images and notes**: photos require exact identity; picked notes require source-backed facts. Pictures are requested near their drawn size from hosts that resize (Fienta, Wikimedia Commons, WordPress.com), with the original as the fallback; a wordmark more than three times wider than tall shows the kind's Label in small tiles. A walk's stop note is in the reader's language, never a source blurb in another one.
- **Walks**: distinct picked stops; each place must still be open (or, unfiled, inside its kind's usual hours) five minutes before you would leave it. Sold-out events cannot anchor a walk. Stated end times are honoured; without an end, later stops use a two-hour planning allowance and are labelled flexible. Shared walks reject moved starts and overlapping later stops. Walking times follow the streets: straight-line distance times 1.33, the median measured on OpenStreetMap footways between Tallinn venues, at 80 m/min; a plain "how far" stays straight-line. Ticket totals cover events only; directions require coordinates for every stop. After this suggests places still open 25 minutes after arrival. Stops say how long a place stays open; missing hours read "hours not listed". Walks composed for one day avoid ending at the same place or kind of place.

## Development

Node 24 (`.nvmrc`). No framework or production build step. `npm install` brings development tools only.

```bash
npm start                 # http://localhost:5173; static files, no Pages Functions/CSP
npm test                  # offline pipeline fixtures and browser-script contracts
npm run typecheck
npm run pipeline:dry      # collect/read sources; write nothing
npm run pipeline          # collect, classify, enrich and write
npm run pipeline:models   # probe configured model lanes
npm run routes:dry        # preview feasible walks; routes writes them
npm run build:lang        # phrases/patterns -> interface translations
npm run build:inline-icons
```

- A full pipeline run needs `SUPABASE_SERVICE_ROLE_KEY`. Prose/model work uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Workers AI Read); `OPENROUTER_API_KEY` enables a free fallback.
- Store local keys in git-ignored `.env`, scheduled keys in GitHub repository secrets.
- Missing model capacity leaves prose/copy pending; trusted structured sources can still publish. Pins, overrides, retry behaviour and daily budgets are defined in `pipeline/llm.ts` and `pipeline/run.ts`, not duplicated here.

## Code map

| Area | Entry points |
|---|---|
| Pages and shared markup | Root HTML; `home.js`, `programme.js`, `places.js`, `map.js`, `render.js`; `wa.css` |
| Search and discovery | `search.js`, `search-data.js`, `ask.js`, `discovery-state.js`, `discovery-controls.js`, `moods.js` |
| Time, walking and routes | `when.js`, `hours.js`, `geo.js`, `start-from.js`, `route.js`, `route-page.js` |
| Data and personal state | `supabase.js`, `ui-helpers.js`, `auth.js`, `save-store.js`, `bookmark.js`, `lists.js`, `follow.js`, `inbox.js` |
| Collection and enrichment | `pipeline/run.ts`, `pipeline/sources.tallinn.json`, `pipeline/sources/`; `venues.ts`, `places.ts`, `dedupe.ts`, `hours-sources.ts`, `drift.ts` |
| Editorial and composed routes | `pipeline/llm.ts`, `english.ts`, `localize.ts`, `place-notes.ts`, `routes.ts` |
| Schema and private moderation | `supabase/migrations/`, `pipeline/test/*.sql`, unlinked/noindex `review.html` |
| Hosting/API and scheduled jobs | `functions/`, `supabase/functions/`, `.github/workflows/`; `pipeline/backup.ts`, `watch.ts`, `digest.ts`, `social.ts` |
| Interface/brand assets | `lang/phrases.tsv`, `lang/patterns.tsv`, `i18n.js`, `icons.js`, `brand/`, `.scripts/`, self-hosted `vendor/` |

- **Pipeline**: runs every six hours, reading configured Tallinn sources and verified venue identities, deduplicating shows and retaining provenance. The guide is alternative, independent and underground culture, contemporary art and social movements: wellness, hobby classes, self-help, mainstream series, dining, children's events and restaurant or hotel venues are held for review by rule, whether newly read or already published, and a person's manual decision stands. A Fienta listing takes the lower trusted bar only for an organiser its source names. Raw prose and poster readings await validation rather than manufacturing facts. Facts that appear to have changed enter a review queue. Localised copy is generated from the original source with English fallback; source, artist and venue names remain literal. A source item read again with a moved start updates its row rather than adding one. English titles drop the event's own date, time and venue; new places get a name without descriptions, floor notes or legal forms, and `npm run places:audit` lists the same tidy for stored names, which only `places:maintain` applies.
- **Assets**: Geologica and Geist Mono are self-hosted; retain licences and SVG/font masters. `build:brand`, `build:icons` and `build:map-styles` regenerate their assets. MapLibre GL is self-hosted with OpenFreeMap tiles.
- **Styles**: `wa.css` holds the Day and Dusk themes, reduced-motion/transparency fallbacks and keyboard focus. Layout follows viewport width; desktop navigation begins at 1024 px.

## Deployment and data

### Hosting
- The static site at [wanderalt.app](https://wanderalt.app) deploys on pushes to `main` through Cloudflare Pages: output `/`, no build command. Pull requests get previews.
- Apex/www redirects and security headers also live in Pages middleware, because Functions bypass static redirect rules. Inspect Functions and CSP on a preview; `npm start` cannot validate them.
- The service worker caches assets aggressively; bump its shell version for asset changes.

### Supabase
- Project `aqnsmmbrspkbfcvougeh` holds the schema, catalogue and private account data.
- Public REST reads go through allowlisted edge caches in `functions/api/rest/`, with a direct anon-key fallback. RLS protects private records; signed-in requests bypass public caches.
- Failed or partial reads keep the last confirmed snapshot and its age; they never prove that records disappeared.
- Apply migrations separately from Git pushes and keep their history. After schema changes, run the relevant `pipeline/test/integrity.sql`, `place-verification.sql` and `picked-places.sql` through Supabase MCP; each rolls back.
- Edge functions: `og-image`, `calendar-feed`, `unsubscribe`, `delete-account`. Deploy separately with the current `verify_jwt`; the account-deletion function validates the caller's access token itself.

### Search inference
- Needs Pages `AI` and `ASK_KV` bindings in both Production and Preview; KV enforces the fresh-question daily cap. The zone's `/api/ask` rate-limit rule must also be configured and verified live.
- Typing stays local; only an explicit submission with unresolved intent can request a reading. Missing bindings, quota refusal or model failure leave local search usable.
- A model never supplies catalogue entries; Map reuses the accepted reading without another call.

### Privacy and saved state
- Precise device coordinates stay in short-lived tab session storage, never in shared URLs or account taste. Location and notification permissions require a reader action.
- Stable catalogue redirects preserve old saved IDs and list memberships. Failed saved lookups stay retryable instead of silently removing entries.

### Backups and monitoring
- Weekly backups go to the private Storage bucket `backups`, keeping the newest 12 files. They omit login accounts and secret social tokens.
- `npm run backup -- --list` lists files; `--restore <file> --table <table>` previews one table, with `--yes` to upsert, never delete.
- The watch workflow checks freshness, site and data every three hours; schedules can pause after repository inactivity.

### Notifications
- Push stays hidden until `push.js` has the VAPID public key and delivery has `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`.
- Email controls are not exposed; delivery needs `RESEND_API_KEY` and enabled preferences. `npm run digest:dry` previews without sending.
- Physical-device push, native pickers, text scaling and touch gestures still need validation.

## Social access

- **Accounts**: the WanderAlt Meta business portfolio holds the WanderAlt Facebook Page, linked Instagram Business `@wanderalt` and Threads `@wanderalt`; the Meta app is WanderAlt pipeline.
- **Venue identity**: read exact known venue accounts; never infer identity from a similar name. Instagram lookup needs `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_BUSINESS_ID`; Facebook publishing also needs the exact `FACEBOOK_PAGE_ID`. Scopes and asset assignments must match the operation.
- **Approvals**: other venues' Facebook metadata needs Page Public Metadata Access; public-data review and business verification remain unresolved. Public Threads discovery is not connected. Instagram hashtag aggregation is disabled in the source config pending approval; an experimental diagnostic or granted scope is not approval. Known-venue websites, open data and Instagram account lookup remain available.
- **Token check**: `npm run social -- check` verifies access and may refresh the private stored Threads token; it publishes nothing. It runs on the 1st and 15th of each month. Stored `social_tokens` takes precedence over `.env`; reauthorization must update that store and the local/repository bootstrap `THREADS_ACCESS_TOKEN` together.
- **Publishing**: `npm run social -- tonight` previews. `--publish threads` or `--publish facebook` sends only an explicitly authorized post. Instagram publishing also requires a public image URL and a checked caption. After a container timeout, inspect its status before retrying.
- **Profile**: reusable assets are in `brand/social/`; profile settings are maintained by hand. Contact is `hello@wanderalt.app` and the profile link is `https://wanderalt.app`.

## Documentation

- [AGENTS.md](AGENTS.md) is the one instruction file for coding agents. Claude Code and Codex both read it natively, so the repo has no CLAUDE.md; a CLAUDE.md or CLAUDE.local.md anywhere above the working directory would make Claude Code stop reading AGENTS.md.
- In Claude Code, `.claude/settings.json` runs `.claude/hooks/check-before-push.sh` before any `git push`: the push is blocked unless `npm test` and `npm run typecheck` pass. Codex follows the same rule from AGENTS.md.
- This README owns current product and operational context. Read code for implementation and connectors for live state; keep audit and research history in Git and PRs rather than extra Markdown files.
