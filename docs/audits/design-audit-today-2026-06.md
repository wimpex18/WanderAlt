# Design audit — Today / main page (`index.html`)

Brand-seeded pass via the `wanderalt-design` skill: design critique, WCAG
2.1 AA audit, design-system check, and the dev-handoff for the fixes
shipped in this PR. Measured with Puppeteer at 390 / 768 / 1440.

## Design critique (against the brand)

Strong / on-brand (no change): Fraunces titles + the curator quote leading,
Inter body, Geist Mono eyebrows, petrol/lime discipline, left-aligned
editorial voice, the photo-scrim Tonight hero, the photo-forward This Week
cards, and the staggered entrance. Type/colour/spacing all token-compliant.

Issues found → fixed (below): missing document `<h1>`; three interactive
controls under the 44px floor; the Tonight **kind badge** illegible over
the hero photo.

## WCAG 2.1 AA audit

| Check | Result |
|---|---|
| `html[lang]` | ✅ `en` |
| Text contrast (standfirst / meta / eyebrow / section-sub / intro) | ✅ 6.61:1 on white (> 4.5 AA) |
| Image alt text | ✅ thumbs are `role="img"`+`aria-label`; city banner is `alt=""` (decorative) |
| Accessible names on controls | ✅ none missing |
| **Document has one `<h1>`** | ❌ → ✅ **fixed** (was: only an `<h2>`) |
| **Tap targets ≥ 44px** (2.5.5) | ⚠️ → ✅ topbar brand 26→44, "Surprise me" 32→44, taste chips 28→32 (chip exception) |
| **Contrast of the Tonight kind badge over the photo** | ❌ → ✅ **fixed** (dark text/petrol dot over a dark scrim) |

Correct exceptions left as-is: inline text links (`.handle`) — WCAG inline
exemption; the hidden bookmark `<input>` (the 44px `<label>` is the target);
the focus-only skip link.

## Dev-handoff (exact changes)

- **`index.html`** — the standfirst becomes the page `<h1>` (same
  `.standfirst` class/visual; supplies the missing top-level heading for
  screen-reader nav + SEO). `This week` stays `<h2>`.
- **`styles.css`**
  - `.topbar__brand` → `min-height: 44px` (home-link tap target).
  - `.surprise-btn` → `inline-flex; align-items:center; min-height:44px`.
  - `.taste-chip` → `inline-flex; align-items:center; min-height:32px`
    (Material chip height; chips are the documented 32px exception).
  - `.tonight__kindline--onphoto .tonight__kind` → white text + hairline
    white border; its `.dot` → `--c-lime` (lime = the live "Tonight"
    signal, legible on dark). Makes the kind badge readable over any hero
    photo and the no-photo `--c-ink` fallback.
- **`.screenshots/verify.js`** — added `.topbar__brand` + `.surprise-btn`
  to the 44px tap-target sweep so these don't regress.

All token-based; no new CSS variables, fonts, or colours introduced.

## Verification

`npm run verify` → 24 page/width checks pass (overflow, console errors,
44px targets). Re-audit confirms exactly one `<h1>`, and brand/surprise at
44 / chips at 32. Photo fidelity (full-colour hero + kind badge over a real
image) is best confirmed on the Cloudflare preview.
