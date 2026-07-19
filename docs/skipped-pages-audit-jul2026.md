# Skipped-pages audit — venue/curator/place details + admin (Jul 2026)

**Why this pass.** The standing a11y/visibility/contrast sweeps only tested
**param-less** pages (`a11y.js` PAGES: today, discover, places, saved, profile,
about, 404). The **detail pages** — `venue.html`, `curator.html`, `place.html` —
need a real `?id=`/`?handle=` to render, so axe never reached them, even though
those are exactly where a user lands from a shared link. `admin.html` was excluded
from every gate by design ("admin stays desktop-light"). This pass closed both gaps.

Method: a probe (`.screenshots/_probe-skipped.js`, one-off) derived real ids from
the loaded catalog (same logic as `audit.js`/`e2e.js`), then ran axe
(`wcag2a/2aa/21aa`) + console-error + overflow on each detail page × both skins ×
390/1440, and on admin × 1440.

## Findings & fixes

| Page | Finding | Fix |
|------|---------|-----|
| **venue · day** | `.answer__k` (practical-info labels: NEIGHBORHOOD/TYPE/HOURS) used `--g-faint` (rgba .5) → **~3.3:1** on Daybreak paper (axe **serious**). Its own comment says the token is "placeholder/decor only" — but this is real content. | `--g-faint` → `--g-mute` ("AA floor for running text") → **~6.6:1**. Fixes day; brightens the same label on dusk (also correct). `styles.css`. venue is not in the visual baseline set, so no re-baseline. |
| **admin** | ~21 nodes failed contrast: `.admin-empty`, `.a-hint`, `.a-status`, `.a-mute`, `.admin-pick-row__noPin/__flags`, a placeholder `td`, and two inline-`opacity` `<em>`s. All were `class="meta …"` (already `--c-ink-mute`, 6.4:1) **muted a second time via `opacity`**, which blends toward the white bg and drops to ~2.4–3.4:1. | Dropped the opacity-muting; rely on `--c-ink-mute` (or set it explicitly on the two ink-based ems). `admin.css` + `admin.js`. Disabled-control opacities (`.tw-pager-btn[disabled]`, `.admin-modal-save:disabled`) left as-is — WCAG 1.4.3 exempts disabled. |
| **curator** | 55–60 axe "check-manually" (incomplete) contrast nodes — high volume. | **Verified benign:** pixel-sampled effective contrast against the nearest opaque ancestor = **11–17:1** for all 55. They're the known text-over-dusk-scene class axe can't compute, not failures. |
| **place** | 5–9 incomplete nodes, no violations. | Clean (same over-glass class). |
| **admin** | console 401/400 on load. | **Expected, not a bug** — the Supabase REST calls require an admin key a keyless localhost load doesn't have; the panel degrades correctly. |

## Durable change
`a11y.js` now **derives and includes the venue/curator/place detail pages** in the
gate (both skins × 390/768/1440), best-effort: if the catalog doesn't load, the
detail pages are skipped and the static pages remain the hard gate. This is why the
venue·day regression can't silently reopen.

## Result
All detail pages: **0 serious** across both skins. Admin: **0 serious**. Full gates
green — `a11y` 0 serious (now incl. detail pages), `verify` 24/24, `e2e` 70/70,
`visual` unchanged (no baseline page touched).

## Note on the opacity anti-pattern
The recurring admin bug — muting already-muted `.meta` text with `opacity` — is worth
remembering: **opacity muting on light backgrounds destroys contrast** (it blends the
text toward the paper). Use a solid muted token (`--c-ink-mute` on paper, `--g-mute`
on dusk), never a second opacity layer, for any text that must stay legible.
