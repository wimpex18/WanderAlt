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

## Fourth pass — dead CSS, done properly

**The ~150 figure was wrong.** It came from grepping, which cannot see a class
this codebase composes at runtime. Measured properly, **19 classes are dead**,
and 31 rules were removed (-3.7 KB).

**Tool research.** PurgeCSS is the popular answer but its own docs warn against
dynamically concatenated class strings — precisely what `ui-helpers.js` does —
so it needs a safelist that would end up naming most of the file. UnCSS only
sees load-time state and would delete every open-sheet, AI-mode and dropdown
style. CDP `startRuleUsageTracking` is empirical but only credits states you
exercise, so it over-deletes. None is safe here alone.

**What was used instead — two independent signals, delete only what neither
claims:**
1. *Runtime DOM census.* A headless run over every page, 3 widths, both skins,
   signed-in and signed-out, Vilnius (empty city), the bad-id detail states, and
   the interaction states that only exist after a click (city dropdown, filter
   sheet, concierge mode, Saved's three tabs, scope switch, map pin). **489
   distinct classes observed.**
2. *Greedy static extraction* over all JS/HTML, including quoted fragments and
   BEM base names, so a class assembled as base + `--variant` counts as used.

Of 662 classes in `styles.css`: 377 seen in the DOM, 133 named verbatim in
source, 133 runtime-composable, **19 dead**. They are three retired
components (`wa-seg*`, `wa-chip*`, `wa-plate*` — an abandoned `wa-` prefixed
system), the previous-generation map layer (`map-pin`, `map-cat-chip`,
`map-user-puck*` — superseded by `map-pin-new*`, which is untouched), the
legacy `deprecation-banner`, and three orphan atoms (`arrow`, `dotsep`, plus
`tld`, which turned out to be a false entry parsed out of the comment
`user@domain.tld`).

**How the deletion was verified** — three instruments, two of which failed and
are worth recording:
- *Screenshots (rejected).* 60 shots before/after showed 5 diffs, but a control
  run with identical CSS showed 7 — font-load timing makes ~10% of shots
  unstable, so pixels cannot resolve a 4 KB CSS change here.
- *Computed-style diff (rejected).* Reported 98% of 40,820 element records as
  changed, because `getComputedStyle` resolves to layout geometry, which
  inherits the same timing noise.
- *Rule-set diff through the browser's own CSS parser (used).* 1658 rules →
  1627. Every removed selector belongs to the 19 verified-dead classes; the only
  other change is one multi-selector rule that lost `.deprecation-banner` from
  its list and kept its other 24 selectors. Nothing else moved.

The remaining ~110 classes that a grep would call unused are all either
runtime-composed or present in states the census reached. They stay.

## Fifth pass — merging origin/main (my error)

**The branch was cut from a stale base.** I branched from the local `main`,
which was **50 commits behind `origin/main`**, and never checked. GitHub's
conflict list looked like a `.screenshots` problem; it wasn't. The real risk was
that `origin/main` had moved `styles.css` by +499/−144 lines (Discover redesign
round 2, the filter-rail flush-edge fix, Today polish, liquid-glass chrome), and
a careless resolution would have reverted all of it.

**Resolution policy used:**
- Test infrastructure and docs: my deletion wins, including the tools `main`
  added after my base (`geometry-audit`, `a11y`, `visibility`, `contrast-ui`,
  `aria.spec` + 16 aria baselines, `playwright.aria.config.js`, `@axe-core`) —
  owner confirmed the clean-slate call after being shown what they do.
- `styles.css` and every app script: took **theirs**, so none of the round-2
  work is lost, then re-derived my two mechanical passes on top.
- `package.json`, `import-pick-photos`, `CLAUDE.md`, `README.md`: mine.
- `_headers`: mine (CSP tightening preserved; `main` had not touched it).

**Re-derived, not merged.** Both of my CSS passes were recomputed against the
newer stylesheet rather than merged line-by-line:
- Citation strip: 58 sites in `main`'s newer CSS comments, plus the 7 orphan
  colons the automated pass leaves behind, repaired by hand.
- Dead-CSS prune: the census was re-run from scratch (476 classes observed;
  671 defined) because round-2 changed the markup. It landed on the **same 19
  dead classes and 31 rules**, which is a good independent signal that the
  method is stable. Verified again through the browser's CSS parser: 1714 rules
  → 1683.

**Folded in from `main` so nothing non-derivable was lost:** the owner's Jul 2026
ruling that fully-rounded 999px is sanctioned for exactly two shapes (glass
chrome capsules; ≤24px badges/dots/counts) with tags at 8 and chips at 14, the
`--scrim-photo` vs `--scrim-hero`/`--scrim-detail` distinction, and `DESIGN.md`'s
headless-environment limits (the MapLibre basemap never rasterises;
`backdrop-filter` blur varies by GPU) — all now in CLAUDE.md.

**Pre-existing, not mine:** `styles.css` on `main` already has 676 `/*` against
677 `*/`. Identical before and after my pass, so I introduced nothing, but the
stray terminator is still in there somewhere.

## Sixth pass — security review of the render path

Ran a review of the highest-risk area rather than a general one: pick/venue/
curator text is scraped, LLM-processed, and interpolated into `innerHTML` via
template literals, so markup in a source post is a realistic input, not a
theoretical one.

**Method.** Static scanning was too noisy to trust (162 "unguarded"
interpolations, nearly all ternaries returning constants), so the question was
settled empirically: replace the catalog with records whose every text field is
an XSS payload, render every surface, and count what executed. Then a second
pass poisoning **one field at a time** to localise each vector.

**Result — stored XSS confirmed on two pages.** `venue.html` (`fired=5`) and
`curator.html` (`fired=6`) executed injected `onerror` handlers; `place.html`
and Discover's Places scope admitted `javascript:` hrefs. Vulnerable fields:
`title`, `venue`, `neighborhood`, `kind`, `quote`, `imageUrl`, curator
`tagline` and `bio`. The same files already used `esc()` on neighbouring
fields, so this was inconsistent application, not a missing helper.

Production CSP (`script-src 'self'`) would have blocked the execution — but the
local dev server sends no CSP, the injected elements still entered the DOM, and
defence-in-depth is not a fix.

**Fixed.** Every DB-derived interpolation on `venue.js`, `curator.js`,
`saved.js` and `briefing.js` now goes through `esc()`, including inside
`aria-label` and `data-*`, and the four `buildMeta()` call sites that lacked it
(three others already had it — the fix follows the existing majority pattern
rather than changing the helper's contract). Added `WA.UI.safeUrl()`, which
admits only http(s) and relative URLs, and routed `socialButtons`, the ticket
CTA and the hero image through it: `esc()` escapes quotes, not schemes, so a
`javascript:` value passed straight through before.

Two mistakes caught mid-fix and worth recording: `curator.js` never imported
`esc`, so the first version of the patch would have thrown at runtime; and the
`admin.html` 404 fix initially used an inline `onerror` handler, which the
strict CSP forbids and the repo's own rules ban.

**Verified.** Both probes clean (`no field injected`, no surface admits
markup), payloads now render as visible text, zero page errors, no
double-escaped entities on real data, all ten pages 200, every script parses.

**Also in this pass.** The CSS census was re-run as a regression check: the
only remaining "dead" names are four comment artifacts (`user@domain.tld`,
`.wa-chip`/`.wa-seg`/`.wa-seg__tab` mentioned in prose), so the prune is
complete — three of those comments referenced components the prune deleted and
were repaired. `admin.html`'s expected 404 on the gitignored `local-secrets.js`
is now documented in place instead of looking like a fault.

## Open findings, not fixed here

- ~~Comments still cite deleted docs~~ — **done.** All ~130 citations to
  `ROADMAP`, design-canvas boards, `F-nn`/`V-nn` finding ids and `BRAND.md`
  are gone from 20 files. Comment text only: verified by diffing the
  non-comment skeleton of every touched file against `HEAD`, plus
  `node --check` on each script, balanced CSS braces and comment markers, and
  a 10-page serve check. Where a citation carried the only meaning in a
  phrase it was rewritten rather than dropped ("F-11 guard" became
  "Duplicate-photo guard"), and 19 rough edges the automated pass left
  (orphan colons, a swallowed `run()`, lost `*/` spacing) were repaired by
  hand.
- ~~`admin.html`'s gitignored `local-secrets.js` 404~~ — documented in place;
  the 404 is expected behaviour, not a fault.
- **`img-src` is still `'self' data: https:`** — any HTTPS host. It could be
  narrowed to the Supabase storage bucket and the proxy origin, but a wrong
  guess silently blanks venue photos and there is no suite to catch it. Do it
  when the new tests exist.
- **`check-secrets` and `import-pick-photos` are stubs, not deleted.** The
  Supabase MCP connector exposes only deploy/get/list for edge functions —
  there is no delete. Removing them outright is a dashboard action.

- ~~~150 unreferenced CSS classes~~ — **resolved, and the estimate was wrong.**
  See "Fourth pass" below: only 19 classes are provably dead, not ~150.
- **`.claude/output-styles/designer.md` was deleted** along with the skills.
  If you used that output style, it is in git history.
- **LLM copy drift is fixed at the prompt, not in the data.** `process-staging`
  now bans "discover", em-dashes, exclamation marks and marketing register in
  quotes — `generate-context` already did. Rows written before this change
  still carry the old copy ("Discover the vibrant works of…" is live in the
  catalog right now). Regenerating them means re-running the pipeline.
- **No tests, no CI.** Deliberate. Nothing enforces overflow, tap-target or
  console-error regressions until the new suite exists.
