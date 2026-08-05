# WanderAlt

Static site for underground culture in European cities. Tallinn, Helsinki and Riga are live; Vilnius is unlocked for internal testing.

The product is a decision, not a publication: **a time and a walking distance on every row**, and provenance instead of personality. The Aug 2026 redesign removed curators — there is no named human voice on a pick any more, and `source.html` names the venue or feed a listing came from instead. Dropping curators also removed the documented blocker on the Vilnius public launch.

Plain HTML/CSS/vanilla JS at the repo root, Supabase behind it, Cloudflare Pages in front. Read the code for structure; what follows is only what the code won't tell you.

## Things that will bite you

**No build step, ever.** No framework, no bundler, no runtime dependencies, no inline `<script>` (the CSP is strict). devDependencies for test tooling are fine.

**Hosting is Cloudflare Pages, not Vercel**, on the single domain `wanderalt.app`. Never add a bare→`.html` redirect to `_redirects` — it loops infinitely.

**The Supabase anon key in `supabase.js` is public on purpose** (RLS is SELECT-only, with INSERT allowed on `bookmarks` and `digest_opt_ins`). The service-role key is never committed; cloud sessions read it from `SUPABASE_SERVICE_ROLE_KEY`.

**Deploy edge functions through the Supabase MCP `deploy_edge_function` tool only** — there is no `supabase` CLI here. The tool defaults `verify_jwt` to **true**, so omitting it silently flips a function and breaks its caller: a cron calling a `verify_jwt:true` function through raw `net.http_post` with no `Authorization` header gets a 401. Healthy crons go through `public.invoke_wa_fn(fn)`, which supplies the anon key.

**But "preserve the existing setting" is a rule about not breaking callers, not a judgement that the setting is correct.** `verify_jwt:false` means *anyone on the internet* can invoke that function, and preserving it preserves that. Aug 2026: `send-digest` was `verify_jwt:false` and read the recipient straight from the request body, so an unauthenticated `POST {"email":"…"}` sent real mail from the WanderAlt domain to any address — an open relay, found only by asking what the flag actually did. Before deploying, ask what an unauthenticated stranger could make the function *do*, and gate anything outward-facing on the **service role key** in code. `verify_jwt` alone is not that gate: the anon key is public by design (it ships in `supabase.js`), so the platform check only raises the bar from "anyone" to "anyone who reads one JS file".

**Never poll the pipeline.** Fire a function or cron, say "draining, check back in ~10 minutes", end the turn. Health checks are one-shot SQL against `staging_messages` status counts, `picks WHERE archived_at IS NULL`, and the tail of `ingest_log`.

**`cron.job_run_details` does not tell you whether a cron worked.** It records that the *SQL statement* ran, and `net.http_post` returns a request id immediately — so a job reads `succeeded` forever while every HTTP call 401s or times out. The real status is `net._http_response` (`status_code`, `timed_out`, `error_msg`), joined by the request id the job returned. Worth knowing: pg_net gives up at 60s but the edge function keeps running and finishes — `ingest-hel-linkedevents` times out nightly and still inserts ~1,650 rows, so a timeout there is a lost *response*, not lost work.

**Staging upserts must carry `?on_conflict=channel,message_id`.** Without it repeat listings 409 instead of being ignored, `bumpSeen()` never runs, and ingestion silently under-processes. This bug has shipped twice — check it in any new or edited ingest function.

**Any new city needs a `CITY_CONTEXT` entry in `process-staging`**, or it silently degrades to the Tallinn context and the messages are lost.

**The pipeline crons run again** (owner decision, Aug 2026 — they had been frozen pre-release). 30 of 31 jobs are active: every ingest, `wa-process-staging` hourly, the enrichment set, the lifecycle housekeeping, and the Saturday digest. Freezing them is what produced the empty Tonight list — nothing reached `picks` between 2 Jul and 4 Aug while 49 staging rows sat unprocessed. Cost surface: ingests are HTTP only; the LLM lane is Groq free tier then OpenRouter `:free`, with Gemini still gated off by `pipeline_config.gemini_fallback_enabled`; embeddings are Cloudflare's free tier; Nominatim calls are staggered so no two run at once.

One job stays off and it is not an oversight: **`draft-column-weekly`**, until its function is deployed (still pinned to the decommissioned `llama-4-scout`, so every run 404s through to a hard failure). `send-digest-saturday` was enabled 5 Aug 2026 once `send-digest` reached v16.

**A cron whose function is `verify_jwt:true` must send an `Authorization` header.** `invoke_wa_fn` does; a raw `net.http_post` carrying only `Content-Type` or only `apikey` does not, and 401s silently. `send-digest-saturday` was in exactly that state and had to be repointed through `invoke_wa_fn` before it could be turned on.

**Deploying is a separate act from committing.** There is no CI and no `supabase` CLI, so an edge function only changes when somebody deploys it by hand — and nothing warns you when that is skipped. Three commits sat undeployed for a month and one of them caused the empty Tonight list. Change a function, deploy it in the same session, preserve its `verify_jwt`, and say so in the commit. `supabase/functions/DEPLOY-DRIFT.md` carries the drift check as a one-line shell loop.

## LLM policy

Groq first for every text-generation function, model `llama-3.3-70b-versatile`. The previous primary `meta-llama/llama-4-scout-17b-16e-instruct` was **decommissioned at Groq** (absent from `/v1/models`, 404 on completion — probed Jul 2026). It was pinned in six functions; `translate-picks` had no fallback and was silently dead, and `match-pick` paid a wasted 404 per query before falling through. This is the failure mode the pinning rule below exists to catch — re-probe `/v1/models` before assuming any id still resolves. OpenRouter `:free` is the live second lane (model pinned by the `OPENROUTER_MODEL` secret). Gemini is retired but not deleted: every call site gates on `pipeline_config.gemini_fallback_enabled`, so it's a one-row change to bring back — and Google Cloud billing is deleted, so don't assume the key still authenticates. No Search grounding anywhere. Embeddings are Cloudflare Workers AI `@cf/baai/bge-m3` at 1024 dimensions.

Pin models by exact id, and verify the id exists in the provider's console before changing it. Model names recalled from memory are how this repo ended up documenting a "gemini-3.5" that never existed.

## Design system

`wa.css` is the whole system: 48 tokens, 13 components, two themes, ~1,820 lines. It replaced `styles.css` (9,118 lines) outright in the Aug 2026 redesign — that file was not patchable, because its `[data-skin="dusk"] [data-page="…"]` override layers meant every screen-local fix fought three others, which is why the same overlap and alignment bugs kept coming back. If a screen needs something that isn't in the thirteen, the answer is almost always that one of them should grow a modifier, not that the screen should grow a rule. (The direction specified "roughly thirty tokens, twelve components"; those were targets, and the counts here are what actually shipped. Prefer counting to quoting.)

**The material is flat opaque paper.** Ink on cream by day, ink on near-black at night. There is no scene under glass any more. **Day is the default**, because most deciding happens in daylight and outdoors in daylight paper beats glass; `theme.js` still drives the swap pre-paint off a precomputed per-city sun table, never an API, and the DOM attribute is still `data-theme="day" | "dusk"`.

- **Use the tokens. Never hand-roll a colour, blur, or rgba literal** — a hard-coded value looks right in one theme and breaks the other completely.
- **Glass is exactly two elements**: the sticky top bar and the bottom tab bar. Both are ≥92% opaque in the page's own ground, both are chrome, and **both reserve real layout height** — the old positioned floating island reserved nothing, and that was the entire overlap bug. Never nest glass, and never put the tab bar inside the top bar: `backdrop-filter` makes an element the containing block for its fixed-position descendants, which pinned the nav to the top of the page on phones. They are siblings for that reason.
- **Petrol is the only accent. Lime is not a colour, it is an alarm, and it has exactly one job: "now"** — the NOW pill on a row's time rail, and the selected/now map pin. Not body text, not borders, not an icon, and **not the CTA**: the primary key is petrol in both themes. There is no third colour.
- **Radii**: 999 pills (chips, badges, dots) / 12 controls / 14–16 cards / 18–20 sheets. `--tap-min` is 44px and is a hard floor on public pages.
- **Type**: Plus Jakarta Sans 600/700 for chrome — titles, buttons, nav; Fraunces 600 for catalogue voice — pick titles, page headlines, the email, **never under 17px**; Geist Mono for facts — times, distances, counts. Inter is retired from the token set but its woff2 files are still on disk as the interim face until the two Jakarta files land; `--ff-ui` names Jakarta first and falls through. Dropping the files in and uncommenting the two `@font-face` blocks changes the product's face with no code edit.
- **Time and walking distance are the loudest things on every row.** That is the product. A row leads with its rail (time, then distance), never with a photo.
- **Tonight's header is the seven-day density strip**, a bar and a count per day. It came from an early round, was traded out of Explore for not surviving a single-column layout, and was re-housed here on the designer's own recommendation. It exists to say the one thing a list cannot — *Monday is dead, wait for Friday* — so a reader who lands on a quiet night blames the night, not the product. Its counts come from the same filter chain as the rows, minus the time facet, so a bar can never disagree with the list under it. A genuinely empty day gets **no bar at all**; that absence is the signal, so never floor it to a stub.
- **Photos are optional and mostly absent** — about 6% of picks carry one. The phone row has no photo region at all, so nothing collapses when there isn't one; the wider desktop row gets an optional photo at the far right, and the third grid track is added by `:has(.wa-row__media)` so a photoless row runs full width instead of leaving a hole. When a card or a detail view has no photo, use the kind glyph on the 9% petrol tint, **never a grey box**.
- **Photo-text scrims use `--scrim-photo`**, which is deliberately theme-invariant dark: a photograph needs a dark ramp under text in both themes.
- **Active state is a tint plus a mark**, never colour alone.
- **Spacing comes from the `--s-*` scale**, and vertical gaps encode relationship: tighter within an item than between items, and a heading always gets more room below it than the gap between the things it introduces. A heading is never the tightest gap near it.
- **Titles wrap to two lines and are never truncated.** Meta lines may ellipsize.
- **A place's rail says when it SHUTS, not that it is open.** `→02` for a place open until two — 1a's own example, and the fact that decides whether it is worth walking there. `WA.Hours.rail()` returns `→HH` when open, `24H` for round-the-clock, `SHUT` when the hours are filed and it is closed, and empty when they are not filed, which is when the caller falls back to `OPEN`. `OPEN` means *ongoing and undated*, not *open right now* — printing it over a shop whose filed hours say closed is the same class of lie as inventing a time.
- **The rail never goes blank and never claims a time it does not have.** A row with no date prints `OPEN` — on Tonight, Saved and Source alike — and a row whose distance is unknown falls back to the neighbourhood so the second line survives and nothing reflows when location permission arrives later. A clock is printed **only when one actually parses**: `picks.time` carries prose (`open daily`, `Wed–Sun`, `ongoing`) as often as a clock, and formatting an unparsed value put `00:00` on a record store. Midnight counts as absent — `00:00`, and a timestamp landing exactly on midnight UTC, are both the pipeline's way of saying *a date, no time*.
- **One implementation per pattern.** `WA.UI` is down to four functions — `esc`, `safeUrl`, `priceLabel`, `passwordField` — so patterns live in `wa.css`, not in a render helper. Reuse the component rather than hand-copying a row, a card or an empty state.
- **Loading is a skeleton that matches the real grid exactly** — no spinner, and no layout jump when data lands. Measure it: a skeleton row and a real row should be the same height to the pixel.
- **One toast at a time**, above the tab bar, ~4s, and **always with the reverse action**. Never a toast for a navigation. `WA.Toast` is optional per page, so **guard the call** — an unguarded `WA.Toast.show` on a page that forgot the script throws and aborts the handler it sits in, which reads as an unrelated bug (the action half-completes and nothing says why).
- **Saves and lists are one store in two files.** `WA.Lists` is localStorage-first with cloud sync on sign-in, exactly like `bookmark.js`. Adding to a list also saves the pick; unsaving purges it from every list. Never let the two disagree about what is saved — that is what turns Saved into a liar. The add-to-list control lives on **detail**, not on a Saved row: 5f draws no per-row control, and adding one costs the title 44px and pushes long picks to a third line.
- **Zero-count filter options are disabled, never hidden** (2a). A kind that vanishes from the sheet cannot be reasoned about — the dimmed, dashed chip says *nothing tonight*, an absent one says *no such thing*.
- **A missing description gets a sentence, not blank space** (2b): "No description filed. Von Krahl's own listing is one line long." Say what we know and what we don't, in the same register. The metadata line closes with the provenance token — `via <handle>` — because provenance replaced personality when curators went.
- **The map is a mode, and a mode is never empty** (2a). It always carries three things: a way out, a way to re-query what you can see, and a **drawer with the picks in view**. Pins alone are a puzzle; the drawer is what makes tapping one optional.
- **Empty and error states name the filter that emptied the list and carry the next-best answer.** "No results found" is banned copy, "discover" is never a verb, no em-dashes in headlines, no exclamation marks.
- WCAG 2.2 AA is the floor; motion is the two existing tokens and nothing new.

Don't add CSS variables without asking. When you touch any pattern, check every other instance of it across pages rather than the one screen you have open — measure heights and gaps, don't eyeball. Screen-local fixes are the recurring failure mode here.

**Never decide a CSS class is unused by grepping for it.** The page scripts compose class names at runtime (`class="${cls}"`, base + `--variant`), so a name that appears nowhere in the source can still be on a live element — which is exactly why PurgeCSS-style tools mis-fire on this repo. The only trustworthy signal is a **DOM census**: drive every page, width, theme and interaction state in the browser, collect every class that actually appears, and treat anything absent from both that census and the source as dead. Diff it through the browser's own CSS parser — and note that a modern `CSSStyleRule` exposes an empty-but-truthy `cssRules`, so a naive recursive walker that checks `cssRules` before `selectorText` silently returns nothing.

A census is also how you find the *opposite* bug. Aug 2026 turned up 23 unreached classes; five were genuinely dead, but `.wa-row__media` was a reserved-and-never-filled 96px column costing every desktop row 112px of dead space, and `.wa-skel--rail` was orphaned because the row skeleton the design specified had never been built. **An unused rule is as often an unfinished feature as it is dead weight** — read what it was for before deleting it.

## Checking your work

There are no automated tests and no CI. The old Puppeteer/Playwright suite was removed in July 2026 — it never caught the failures that actually happen here (alignment, overlap, control sizes, overlays) and it is being rebuilt from scratch, so don't patch it back in piecemeal or add a test framework without being asked.

That puts the burden on looking. Run `npm start` and open the pages you touched at 390, 768 and 1440. Measure heights and gaps rather than eyeballing them, and check every other instance of a pattern you changed, not just the screen in front of you — screen-local fixes are the recurring failure mode here.

**All of it can be judged locally now** — the paragraph that used to live here sent you to the Cloudflare preview for photos, the basemap and `backdrop-filter`, and all three of those claims were about the headless Chromium the deleted Puppeteer suite drove. The Claude Code browser pane is not that: it is a real Chrome (148 at time of writing, in Electron) on the hardware GPU — `ANGLE Metal Renderer: Apple M5`, not SwiftShader — at dpr 2. Re-verified Jul 2026 by probing it rather than trusting this file:

- **`backdrop-filter` composites and captures correctly.** A `blur(12px)` band over 3px stripes dissolves them to flat grey while an unfiltered control band beside it stays crisp. Glass-over-content is safe to judge from a local capture.
- **The MapLibre vector basemap does rasterise.** The real caveat is different and worth knowing: MapLibre's render loop is `requestAnimationFrame`-driven, and rAF is throttled while the pane's tab is not fronted — so a capture can show a *stale frame* (or an empty canvas) even though `isStyleLoaded()` and `areTilesLoaded()` are true. `map.loaded()` stuck at `false` is the tell. Front the tab before capturing anything map-related. Note the trade: unfronted, captures come back at exactly the CSS viewport you set; fronted, they follow the real pane geometry, so set the width again after fronting.
- **Photos load locally** from the Supabase bucket and Wikimedia at full resolution. There is no duotone to check — that overlay was retired in June 2026 (see the note by `.photo-credit`); photos are deliberately full-colour now, `filter: none`.

The Dusk basemap looks blank at a glance because it genuinely is near-black by design (`#0e1516` ground, `#0a1418` water, `#243132` roads). Before concluding it failed to paint, force a bright `background-color` through `WA.MapTiles.getMap().setPaintProperty()` and re-capture — if the canvas turns that colour, it was painting all along.

The PR preview is still the honest last check for anything CDN- or header-dependent, since the dev server sends no CSP.

Two things the deleted suite used to catch, worth checking by hand: no horizontal overflow at any width, and no console errors on load.

## Rendering untrusted content

Pick, venue and source text is scraped from Telegram, RSS and venue pages, passed through an LLM, and interpolated into `innerHTML` via template literals. Treat every one of those fields as attacker-controlled: **wrap it in `WA.UI.esc()` at the interpolation site**, including inside `aria-label`, `title` and `data-*` attributes, and including values that arrive via a meta-line builder. A stored-XSS probe in July 2026 found the then-`venue.html` and `curator.html` executing injected `onerror` handlers because `title`, `quote`, `tagline` and `bio` were interpolated raw while neighbouring fields were escaped. Those two pages are now `detail.html` and `source.html`; the lesson is the page-independent one, so check it in whatever renders scraped text next.

URLs need more than escaping — `esc()` escapes quotes, not schemes, so a `javascript:` value survives it. Any DB-sourced URL going into an `href` or `src` goes through **`WA.UI.safeUrl()`**, which passes only http(s) and relative paths. The CSP blocks inline handlers in production, but that is the second line of defence, not the first: the local dev server sends no CSP at all.

## Voice

Source handles start with `@` and match the Telegram slug — they name a feed now, not a person. Metadata reads `Neighborhood · type · day + time`. No em-dashes in headlines, no exclamation marks, never the word "discover" as a verb, no marketing register — it should read like the back page of a newsletter. No cookie banner, no analytics, no third-party scripts; `about.html` covers privacy and terms.

## Working rules

A visual change means that change only — don't refactor what's next to it. Open PRs ready for review, not drafts. Keep README.md current when scope changes.
