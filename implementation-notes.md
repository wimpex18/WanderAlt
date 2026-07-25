# Implementation notes — project refine, Jul 2026

Temporary log. Delete before or at merge.

## Plan

1. Delete dead files and folders (docs/ experiments, orphan harnesses, generated artefacts).
2. Collapse the two browser engines to one (Playwright), drop `puppeteer`.
3. Drop `lighthouse` from devDependencies; keep the capability via `npx`.
4. Repair references that the doc deletion (previous turn) left dangling.
5. Keep CLAUDE.md and README.md in step with all of the above.

## Deviations from the plan

**Regenerated `catalog.js`, which was not in the original plan.** The static
offline fallback carried 39 Google place-photo URLs that all return 403 —
they expired when Google Places was retired, and the live DB was migrated to
the `pick-images` storage bucket without the fallback ever being regenerated.
So the offline path had been rendering every card photo-less, and the `today`
and `discover-week` pixel baselines had been failing on `main` for the same
reason. `npm run catalog` fixed it: 0 dead URLs, 14 working storage URLs, and
the fallback now carries 49 picks instead of a near-empty Tallinn set.

**Re-baselined 6 visual snapshots** as a consequence of the above (today and
discover-week × 390/768/1440). The other 18 were byte-identical after
`visual:update`, so the diff is exactly the pages whose data changed. This is
the documented flow for an intentional change, but it is a data-driven
re-baseline rather than a design one — worth a second look in review.

**Deleted `smoke.js` and `scroll.js` rather than porting them.** Both were
Puppeteer capture scripts superseded by `audit.js` (segment captures) and
`visual.spec.js` (pixel diff), and `scroll.js` was doing exactly the fullPage
capture that `audit.js` exists to avoid. Console-error coverage moved to
`verify`, which already asserts it. The one capability genuinely lost is
smoke's signed-in screenshots (dummy JWT) and its per-city map-framing probe;
say the word and either can come back as a small Playwright script.

**Mirrored two deployed edge functions into the repo** (`diag-providers`,
`import-pick-photos`). Not planned, but the repo claims to mirror every
deployed function and these two were missing.

## Deliberate non-deletions

- **`brand/` masters, iOS/Android/social sets.** Unreferenced by the app, but
  they are design source, not build output: the SVG masters are what
  `npm run build:icons` rasterises from, and the platform sets are for future
  native shells. Deleting them would destroy originals, not clean up.
- **`sharp` + `png-to-ico`.** 26 MB, used only by the icon rasteriser, but
  there is no `npx`-able equivalent, so dropping them would delete the
  capability rather than defer it. Kept.
- **`.scripts/regen-catalog.js`.** Had no npm script and read as orphaned, but
  it is the documented way to rebuild the fallback catalog. Kept and wired up
  as `npm run catalog` — which is what fixed the dead photos above.
- **Retired edge-function sources** (`load-places-index`, `enrich-pick-images`,
  `translate-picks`, `verify-venues`, `check-secrets`). Deleting a source does
  not undeploy anything, and the repo mirror is what makes a redeploy possible.
  Kept; see the PR notes on the two that should be undeployed.

## Open findings, not fixed here

- **`import-pick-photos` and `check-secrets` are deployed with
  `verify_jwt: false`** — both publicly callable. `check-secrets` reports which
  secrets exist (names only, no values); `import-pick-photos` writes to storage
  and PATCHes `picks` with the service key when passed `{"dry_run": false}`.
  Both are finished one-shots. Recommend deleting both deployments; that is a
  production change and the owner's call, so nothing was touched.
- **The pixel suite depends on live image URLs.** Now that photos come from our
  own storage bucket it is stable, but any future URL rotation re-breaks the
  same 6 shots. Blocking image hosts in `visual.spec.js` and baselining on the
  glyph placeholder would make it self-contained.
- **MapLibre loads from `unpkg.com`** — the only third-party script origin left
  in the CSP, on a site that otherwise self-hosts everything (fonts were moved
  in-house for exactly this reason). Vendoring it would close that gap.
- **LLM-written copy is drifting from the voice rules.** The regenerated
  catalog contains "Discover the vibrant works of Finnish street artist EGS…",
  and "discover" as a verb is banned copy. The prompt in `generate-context`
  is where that would be fixed.
