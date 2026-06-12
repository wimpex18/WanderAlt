# Design audit — Saved, Profile, About (+ a systemic contrast fix)

Brand-seeded pass via the `wanderalt-design` skill, audited at 390 and 1440.

## Per-page result

- **About** — clean, **no changes needed**. Exemplary: one `<h1>` + a full
  `<h2>` section outline (What this is / Curators / Venues / Privacy /
  Built in the open / Contact), body contrast 16:1, no overflow, all
  controls named.
- **Profile** — **redirects to `index.html` when signed out** (auth gate,
  by design), so its public state is the Today page (already audited in
  #44). Signed-in profile reuses already-fixed components (the digest
  `.profile-toggle` and `.auth-panel` buttons were brought to 44px in the
  earlier design-system pass). The redirect surfaced one new Today-page
  issue — see the digest input below.
- **Saved** — one `<h1>` ("Your reading list"), segmented control already
  44px; fixed the count contrast below.

## WCAG 2.1 AA fixes

`--c-faint` (#a1a1aa) was being used for several **readable** labels — it
only clears **2.56:1** on white (fails AA's 4.5 for < 18px text). Moved
them to `--c-ink-mute` (#5c5c66 → 6.6:1). It stays correct for placeholders
and the decorative search icon.

| Element | Page | Before | After |
|---|---|---|---|
| `.reading-head__count` ("0 active · 3 past") | Saved | 2.56 | **6.61** |
| `.seg-tab__count` (inactive tab number) | Saved | 2.56 | **6.61** (active state already overridden) |
| `.seg-note` ("you said you'd go · soonest first") | Saved | 2.56 | **6.61** |
| `.discover-lede__count` ("vouched by humans") | Discover | 2.56 | **6.61** |
| `#digest-optin-email` (no accessible name) | Today | placeholder only | **`aria-label` added** |

## Verification

`npm run verify` → 24/24. Contrast re-check confirms all the above at
6.61–19.78:1; the digest input now exposes "Email address for the weekly
digest". Token-based — no new variables/fonts/colours.

## Audit series — complete

Today (#44) · Discover (#45) · venue+place (#46) · saved/profile/about
(this). Net real catches: 2 missing `<h1>`s, a desktop FAB ordering bug,
an illegible hero badge, ~10 sub-44 tap targets, and 5 WCAG-AA contrast/
name fixes — all token-based, all guarded by `npm run verify` where the
selectors live on the param-less pages.
