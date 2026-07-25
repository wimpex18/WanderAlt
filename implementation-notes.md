# Implementation notes — project refine, Jul 2026

Temporary log. Delete before or at merge.

## What this PR did

1. Deleted dead files and folders (docs/ experiments, orphan harnesses, generated artefacts).
2. Regenerated `catalog.js`; its photo URLs had all expired.
3. Self-hosted MapLibre, closing the last third-party script origin.
4. Removed the entire test suite and CI, per owner instruction.
5. Dropped every test dependency: `node_modules` 211 MB → 31 MB, 11 packages.

## Deviations from the plan

**Regenerated `catalog.js`, which was not in the original plan.** The static
offline fallback carried 39 Google place-photo URLs that all return 403 — they
expired when Google Places was retired, and the live DB was migrated to the
`pick-images` bucket without the fallback ever being regenerated. So the
offline path had been rendering every card photo-less. `npm run catalog` fixed
it: 0 dead URLs, 14 working storage URLs, 49 picks instead of a near-empty set.

**The CSS prune was attempted and reverted.** 152 of 671 classes in
`styles.css` have no reference in any `.html` or `.js`, and an automated prune
removed 28 KB. It broke 12 of 24 pixel shots. Cause: modifier classes are
built by string concatenation (`ui-helpers.js` line 132 and friends build
`class="${cls}"`), so a literal grep cannot prove a class is dead. Only two
families were removed, both verified by reading `briefing.js`'s Dusk rewrite:
`.tonight-card*` and `.tonight-rail*`, the July 2026 "hero + rail" components
that the Dusk Glass pass replaced wholesale. That is 2.4 KB, and it was
confirmed pixel-identical before the suite came out.

The other ~150 candidates are listed by family in the PR body. They are worth
clearing, but family by family with eyes on the page — not by script.

**One self-inflicted detour worth recording.** Vendoring MapLibre broke 9
pixel shots, because `visual.spec.js` aborted `**/unpkg.com/**` to keep the
map canvas deterministic and the bundle now came from `./vendor/`. I initially
read those failures as prune damage and reverted a good prune. Fixed the route
first, re-established 24/24 green, and only then judged the prune — which is
the order it should have been done in.

**`check-secrets` and `import-pick-photos` were stubbed, not deleted.** The
Supabase MCP connector has no delete-function tool. Both are now JWT-gated 410
stubs, verified returning 401 unauthenticated. To actually remove them, delete
from the Supabase dashboard. Their original bodies are in git history.

## Deliberate non-deletions

- **`brand/` masters, iOS/Android/social sets.** Design source, not build
  output: the SVG masters are what `npm run build:icons` rasterises from.
- **`sharp` + `png-to-ico`.** The only remaining devDependencies, and the only
  way to regenerate icons. 31 MB total.
- **`.scripts/regen-catalog.js`.** Read as orphaned (no npm script), but it is
  the documented way to rebuild the fallback. Wired up as `npm run catalog`,
  which is what fixed the dead photos.
- **Retired edge-function sources.** Deleting a source does not undeploy
  anything, and the repo mirror is what makes a redeploy possible.
- **`workers/wikimedia-proxy`.** Referenced by `supabase.js`; live.

## Third pass — branches, CSP, and a second sweep

**Branches pruned.** 16 local and 4 remote deleted; `main` and
`claude/project-refine-jul26` are all that remain in both places. Every deleted
tip was already contained in `origin/main` except one commit on
`claude/design-critique-fixes-jul16` ("CI visual: per-environment baselines"),
which touched only `.github/workflows/verify.yml` and `playwright.config.js` —
both files this PR deletes, so it was obsolete rather than lost work. Only one
PR was open (#118, this one), so nothing was closed by the pruning.

**CSP tightened again.** `connect-src` was granting `*.supabase.in`,
`overpass-api.de` and `nominatim.openstreetmap.org`. All three are called only
from edge functions — server-side Deno, where a browser CSP has no effect — so
they were dead grants. Now `'self' https://*.supabase.co
https://tiles.openfreemap.org` only.

**Checked and found clean:** all 9 font files are referenced, all 4 city plate
SVGs are referenced, the sitemap lists exactly the right five indexable pages
(param and stub pages correctly excluded), `_redirects` entries all resolve to
live targets, no empty directories, and the repo now mirrors all 34 deployed
edge functions.

**`workers/wikimedia-proxy` is live** — confirmed deployed in the Cloudflare
account since 24 May 2026, so it is real infrastructure, not dead code. Its
`wanderalt.app/img/wm/*` route could not be probed from here because
`wanderalt.app` does not resolve in this environment; worth confirming from a
normal network before launch.

## Open findings, not fixed here

- **Comments still cite `ROADMAP P0/P1/F-9`** in ten app files (`supabase.js`,
  `discover.js`, `curator.js`, `saved.js`, `briefing.js`, `venue.js`,
  `map-tiles.js`, `map-venues.js`, `ui-helpers.js`, `process-staging`). The
  document is gone, so those are dangling citations, but each comment still
  explains itself without it. Left alone deliberately: 13 comment-only edits
  across the core app files is churn a cleanup PR shouldn't carry.
- **`admin.html` loads `./local-secrets.js`, which is gitignored**, so the
  deployed admin page 404s that script on every load. Harmless and deliberate
  (it is the local-only key convenience), but it is a permanent console error
  in production.
- **`img-src` is still `'self' data: https:`** — any HTTPS host. It could be
  narrowed to the Supabase storage bucket and the proxy origin, but a wrong
  guess silently blanks venue photos and there is no suite to catch it. Do it
  when the new tests exist.
- **`check-secrets` and `import-pick-photos` are stubs, not deleted.** The
  Supabase MCP connector exposes only deploy/get/list for edge functions —
  there is no delete. Removing them outright is a dashboard action.

- **~150 unreferenced CSS classes** remain (see above for why they weren't
  swept). `styles.css` is still 319 KB.
- **`.claude/output-styles/designer.md` was deleted** along with the skills.
  If you used that output style, it is in git history.
- **LLM copy drift is fixed at the prompt, not in the data.** `process-staging`
  now bans "discover", em-dashes, exclamation marks and marketing register in
  quotes — `generate-context` already did. Rows written before this change
  still carry the old copy ("Discover the vibrant works of…" is live in the
  catalog right now). Regenerating them means re-running the pipeline.
- **No tests, no CI.** Deliberate. Nothing enforces overflow, tap-target or
  console-error regressions until the new suite exists.
