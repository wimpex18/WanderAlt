# Visual baseline (smoke screenshots)

Ten curated PNGs from `npm run smoke` — committed so future Claude
sessions (or you) can compare against a known-good visual state.

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

The baseline ships ten screenshots chosen for highest signal:

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

Not baselined (all 39 screenshots are still in `.screenshots/` — just
not version-controlled):

- Riga / wide-viewport variants (Tallinn baseline is enough to catch
  most regressions).
- Mobile profile / saved / curator-legacy / venue-detail / about — all
  flows have a same-viewport-other-page or other-viewport-same-page
  baseline to diff against.

— Updated whenever the visual state of the app changes intentionally.
