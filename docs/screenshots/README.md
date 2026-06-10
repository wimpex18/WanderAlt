# Visual baseline (smoke screenshots)

Thirteen curated PNGs from `npm run smoke` — committed so future Claude
sessions (or you) can compare against a known-good visual state. The
baseline doubles as the screenshot half of the E2E UI/UX validation
suite in `ROADMAP.md` § "Frontend & UI/UX execution roadmap" (scenarios
V-5…V-9 diff against these files until Phase 4 encodes them as code
assertions).

## How to use

After making CSS or HTML changes, re-run the smoke harness:

```
npm start                     # in one terminal
npm run smoke                 # in another
```

Then diff a sample manually, e.g.:

```
# Visual diff with eye-on-screen — quickest
open .screenshots/smoke-desktop-briefing.png \
     docs/screenshots/baseline/smoke-desktop-briefing.png

# Pixel diff via ImageMagick if installed
compare -metric AE \
  .screenshots/smoke-desktop-briefing.png \
  docs/screenshots/baseline/smoke-desktop-briefing.png \
  /tmp/diff.png  ; open /tmp/diff.png
```

If something looks visually wrong, that's a regression. If the new
state is **intentionally different and correct**, replace the file in
`docs/screenshots/baseline/` so the next diff is clean.

## Coverage

The baseline ships thirteen screenshots chosen for highest signal:

- Mobile + desktop **briefing** — Tonight + This Week chrome.
- Mobile + desktop **discover-list** — filter pills, browse sections,
  map pane.
- Desktop **discover-tonight** — Tonight pill active + 1-result state +
  Tallinn map with real pin.
- Desktop **curator-sigmund** — curator profile, full bio, picks list.
- Desktop **venue-detail** — venue card with image + quote + back link.
- Desktop **about** — full editorial about page.
- Mobile **banner-dropdown** — city dropdown open over the page.
- Desktop **briefing-empty** — the `.picks-empty` card showing the
  city plate as a 480-px hero (per the v2 city-plates spec).
- Mobile **saved** / **profile** / **venue-detail** — added by the
  June 2026 visual audit; these surfaces carry the open findings
  (Saved empty-state canon F-4, Profile CTA rule F-5, venue hero
  scrim F-1 — see ROADMAP). They baseline the *current* state so each
  fix shows up as an intentional, reviewed diff.

Not baselined (all 42 screenshots are still in `.screenshots/` — just
not version-controlled):

- Riga / wide-viewport variants (Tallinn baseline is enough to catch
  most regressions).
- Mobile curator-legacy / about / discover-tonight / place-detail —
  all flows have a same-viewport-other-page or other-viewport-same-page
  baseline to diff against.

— Updated whenever the visual state of the app changes intentionally.
