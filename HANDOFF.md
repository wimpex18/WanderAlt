# WanderAlt — Engineering Reference

This is the engineering reference for WanderAlt. It documents design tokens, component contracts, page-by-page specs, interactive states, and responsive behaviour. Read `README.md` first for product context and aesthetic philosophy — nothing here repeats that.

The codebase is plain HTML + CSS + vanilla JS with no build step. All measurements live in `styles.css`. All content comes from `catalog.js` (static fallback) and Supabase (live data). Screenshots go stale; the running site is always the source of truth.

---

## Design tokens

All custom properties live in `:root` in `styles.css` lines 8–64. Changing a value here affects every component that references it.

### Color

| Token | Value | Used for |
|---|---|---|
| `--c-paper` | `#ffffff` | Body background, sheet backgrounds, active nav item text |
| `--c-paper-deep` | `#fafaf9` | Recessed surfaces: search box, seg-tabs container, tonight quote bg |
| `--c-ink` | `#0a0a0c` | Body text, primary headings, active nav fill |
| `--c-ink-soft` | `#1f1f23` | Secondary headings, slightly softer body |
| `--c-ink-mute` | `#5c5c66` | Meta text, eyebrows, counts, placeholder (darkened from #71717a to clear AA 4.36:1 contrast fail) |
| `--c-rule` | `#e7e5e4` | Horizontal rules, borders on cards and inputs |
| `--c-rule-strong` | `#d4d4d4` | Stronger rules where needed (currently spare) |
| `--c-accent` | `oklch(0.42 0.07 195)` | Deep petrol — handles, hover states, focus rings, logo mark bg |
| `--c-accent-soft` | `oklch(0.96 0.015 195)` | Tinted backgrounds on accent elements |
| `--c-lime` | `oklch(0.86 0.16 113)` | Signal lime — Tonight badge, active tab count, map sheet num, city dot |
| `--c-faint` | `#a1a1aa` | Input placeholder, very muted glyphs |

**Single-accent rule:** `--c-accent` (petrol) is the only interactive accent. `--c-lime` is reserved for live/active state indicators only (Tonight, active segment count). Never use lime for hover states or links.

### Typography

| Token | Value | Role |
|---|---|---|
| `--ff-display` | `'Fraunces', 'DM Serif Display', Georgia, serif` | Page titles, Tonight + curator quotes, venue hero |
| `--ff-body` | `'Inter', -apple-system, system-ui, sans-serif` | All running text, headings, nav labels |
| `--ff-mono` | `'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace` | Eyebrows, meta strings, handles, counts |

Fonts are **self-hosted** (woff2, Latin subset) in `/fonts`, declared via `@font-face` at the top of `styles.css` (`font-display: swap`). Was Google Fonts via `<link>` — self-hosting removed the `fonts.gstatic.com` third-party origin (honours the about.html "no third-party" promise + drops a render-blocking connection). Weights: Fraunces 600, Inter 400/500/600/700, Geist Mono 400/500. To add a weight: download the Latin woff2, add a `@font-face`.

### Type scale

| Token | Value | Semantic role | Leading |
|---|---|---|---|
| `--fs-eyebrow` | `11px` | Section labels (TONIGHT, CURATORS, BY KIND) | — |
| `--fs-meta` | `12px` | Neighborhood · type · time strings | `--lh-body` (1.5) |
| `--fs-body` | `16px` | Default body text | `--lh-body` (1.5) |
| `--fs-pick` | `18px` | Pick card titles in Briefing This Week | `--lh-snug` (1.22) |
| `--fs-venue` | `17px` | Venue name in detail view | `--lh-snug` (1.22) |
| `--fs-transition` | `11px` | "THEY MEAN →" transition label | — |
| `--fs-quote` | `32px` | Tonight hero quote (mobile); scales at breakpoints | `--lh-tight` (1.04) |

Leading tokens: `--lh-tight: 1.04` / `--lh-snug: 1.22` / `--lh-body: 1.5`

### Space scale

4px base. `--s-1` through `--s-10`: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72`

### Layout

| Token | Value | Purpose |
|---|---|---|
| `--gutter` | `20px` | Left/right page padding |
| `--reading-max` | ladder: `1100`≥768 · `1200`≥1100 · `1280`≥1440 · `1440`≥1680 · `1600`≥1920 | Max content column width — one shared token on every page so edges align (June 2026 widened from the single 1024) |
| `--radius` | `8px` | Default border-radius (inputs, focus rings) |
| `--radius-card` | `12px` | Cards (search box, tonight card) |
| `--radius-thumb` | `8px` | Thumbnail images |
| `--rule-w` | `1px` | All horizontal/border rules |
| `--nav-h` | `68px` | Bottom nav height; used in body padding-bottom |

### Motion

| Token | Value | Used for |
|---|---|---|
| `--t-fast` | `120ms ease` | Color / border / background swaps (hover, focus, chip on-state). ~30+ rules. |
| `--t-mid` | `280ms cubic-bezier(.2,.8,.2,1)` | Entrances, state changes, hover micro-lifts. Out-cubic, no overshoot. |

Five surfaces share one `@starting-style` entrance (fade-up 8px) via the `--t-mid` token: `.pick`, `.tonight`, `.match-card`, `.profile-section`, `.about-section`. Works for both server-rendered and JS-appended elements. Cross-document View Transitions enabled globally; `.topbar` and `.nav` carry `view-transition-name` so chrome morphs rather than cross-fading. Full spec in `CLAUDE.md § Motion conventions`.

---

## Layout system

`.page` (on `<main>`) sets `max-width: var(--reading-max); margin: 0 auto; padding: 0 var(--gutter)`. This is the editorial column — everything inside it is constrained to 1024px on large screens. The `.topbar__inner` shares the same cap so the brand mark + nav stay aligned with content edges. The same value applies on every page, so jumping between Briefing / Discover / Saved / Profile feels visually continuous.

**Full-bleed escape.** When an element must break out of the column (map canvas, full-width tab strip), use:

```css
margin-left:  calc(-1 * var(--gutter));
margin-right: calc(-1 * var(--gutter));
```

Used by `.map-bleed` and `.seg-tabs`. Set `width: calc(100% + 2 * var(--gutter))` if explicit width is needed.

---

## Component inventory

| Component | Selector | `styles.css` approx line | Variants | States |
|---|---|---|---|---|
| Top bar | `.topbar` | 155 | — | sticky mobile; static desktop |
| Logo mark | `.logo-mark` + `.logo-mark__diamond` | 164 | — | petrol square + rotated diamond |
| City selector | `.city-selector` | 208 | — | hover → accent |
| City dot | `.city-dot` | 221 | — | lime 6px circle |
| Skip link | `.skip-link` | 124 | — | off-screen until `:focus` |
| Page column | `.page` | 275 | — | max-width `--reading-max`, centered |
| Rule | `.rule` | 281 | — | 1px `--c-rule` |
| Eyebrow | `.eyebrow` | 287 | — | mono, uppercase, 11px, muted |
| Meta string | `.meta` | 296 | `.meta__time` | mono 12px; `__time` non-breaking |
| Tonight badge | `.tonight__badge` | (redesign block) | — | lime pill + ink dot, "Tonight · TIME" |
| Kind chip | `.tonight__kind` | (redesign block) | — | mono uppercase chip + petrol ring dot |
| Thumbnail | `.thumb` | 421 | `.thumb--lg`, `.thumb--has-img` | halftone fallback or CSS `background-image` |
| Bookmark toggle | `.bookmark` + `.bookmark__check` | 547 | — | `:checked` → `fill: currentColor` on SVG path |
| Tonight hero | `.tonight` + `.tonight__*` | (redesign block) | — | flat hero (no card); display-italic quote with lime rule is the loudest element |
| Primary button | `.btn-primary` | (685) | — | dark bg on hover |
| Secondary button | `.btn-secondary` | (693) | — | outlined; fills on hover |
| Bottom/top nav | `.nav` + `.nav__inner` | 1833 | — | fixed bottom mobile; sticky top desktop |
| Search box | `.search-box` | (870) | — | bordered `--radius-card` container; used in Discover |
| Discover pill | `.discover-pill` | — | `.discover-pill--on`, `.discover-pill--more` | filter shortcuts above results |
| Sheet chip | `.sheet-chip` | — | `.sheet-chip--on` | category / nhood chips inside filter sheet |
| Curator row | `.curator-row` | 974 | — | 3-col grid; hover → handle accent |
| Browse row | `.browse-row` | (1000) | — | 2-col grid; hover → label accent |
| Seg tabs | `.seg-tabs` + `.seg-tab` | 1112 | — | CSS-only via radio siblings; active → white + lime count |
| List row | `.list-row` | (1169) | `--going`, `--reading`, `--past`, `--bookmarkable`, `--active` | `--active` → petrol left bar + tinted bg |
| Map sheet | `.map-sheet` | — | — | mobile peek detail; hidden ≥768px (replaced by `.map-detail`) |
| Map detail | `.map-detail` | — | — | desktop side-panel detail; hidden <768px |
| Auth panel | `.auth-panel` | (1220) | — | modal overlay |
| Colophon | `.colophon` | (1360) | — | mono, muted, bottom of page |

---

## Nav wiring contract

The active bottom-nav item is driven entirely in CSS — no per-page JS.

**Four-item nav** (as of Phase 2): Briefing · Discover · Saved · Profile.

**Three-part contract:**

1. `<body data-page="discover">` — on the `<body>` in each HTML file. Values: `briefing`, `discover`, `saved`, `profile`. (Venue and curator pages use `data-page="venue"` / `data-page="curator"` — they don't highlight any nav item.)
2. `<a class="nav__item" data-nav="discover">` — `data-nav` on each item; value matches the `data-page` it corresponds to.
3. `aria-current="page"` — set on the matching nav item for accessibility. The visual active state comes from CSS selectors, not this attribute.

**CSS selector chain** (nav section of `styles.css`):

```css
body[data-page="discover"] .nav__item[data-nav="discover"] {
  background: var(--c-ink);
  color: var(--c-paper);
  flex: 0 0 auto;
  padding: 0 16px;
  flex-direction: row;
  gap: 6px;
}
body[data-page="discover"] .nav__item[data-nav="discover"] .nav__label {
  display: block;
}
```

Active item expands to show its text label; all inactive items hide the label (`display: none` on `.nav__label` by default). One such block exists for each of the four nav pages.

**Adding a new nav page:** create the HTML file with `<body data-page="newpage">`, add a nav item with `data-nav="newpage"` to every existing HTML file's `<nav>`, add the two CSS blocks above for `newpage`.

---

## Per-page specs

### Briefing (`index.html`)

**Tonight hero** (`#tonight.tonight`): rendered by `briefing.js:renderTonight()`. A flat editorial hero (no surface card) — the curator quote is the loudest element. Structure:

```
section#tonight.tonight
  span.tonight__badge                ← lime pill + ink dot, "Tonight · TIME"
  .tonight__kindline
    span.tonight__kind               ← mono uppercase chip + petrol ring dot (kind)
    span.tonight__where              ← "Neighborhood · Venue" (mono, muted)
  a.tonight__title                   ← 23px body-font venue link
  blockquote.tonight__quote          ← display italic, lime left rule; 25px mobile → 30px ≥768
  p.tonight__attr                    ← "— @handle" (mono, muted; handle is petrol)
  .tonight__actions
    a.btn-going "I'm going →"        ← ink fill
    label.btn-save.bookmark "Save"   ← outlined; wraps the .bookmark__check toggle
```

The hero quote overrides `--fs-quote` (scoped to `body[data-page="briefing"] .tonight__quote`) — no surface thumbnail, so the voice dominates. The `.bookmark__check` checkbox inside `.btn-save` keeps the standard bookmark wiring (fills petrol when saved).

**This Week list** (`.picks`): `briefing.js:renderThisWeek()`. Each `<li class="pick">` uses a `.pick__link` div grid — not a single `<a>` — to avoid nested anchor ejection. Contains: thumb link + title link + meta + via handle + bookmark checkbox.

**Curator's Column** (`.column`): injected above `.thisweek` by `briefing.js:renderColumn()` (async Supabase fetch). Absent if no published column exists. Minimal Markdown rendered to `<p>/<strong>/<em>`.

**Mood chips**: `mood-chips.js` populates `.mood-chips`; fires `wa:mood-changed`. Briefing re-filters This Week on that event; Tonight is not re-filtered.

**Surprise me** (`#surprise-btn`): cycles Tonight through catalog; respects `prefers-reduced-motion`.

### Discover (`discover.html`)

Unified search + filter + map surface. Replaced the old `map.html` and `search.html` pages. Those files are now 5-line redirect stubs that forward legacy URLs via `discover-redirect.js`.

**Scope switch:** a compact inline `.discover-scope` segmented control (Events | Places, ink-fill active) sets `state.type`. Events = curated picks; Places = permanent venues. Filters narrow within the active scope; Places hides the mood strip + AI link (both pick-only) and shows a row of venue-kind quick-pills.

**URL schema:** `?type=events|places&q=&view=list|map&time=tonight|thisweek|all&cat=music,drink&nhood=Kalamaja&within=5|15|30&sort=…&id=<pick-id>&ai=<prompt>&mode=match`
- **Sort** is mode-aware: Events → `relevance` (default) / `newest` ("Soonest"); Places → `featured` (default) / `nearest` (geolocation). A→Z and by-curator were dropped.
- **Distance** (`within`): a walking-radius filter (Any / 5 / 15 / 30 min). One geolocation request (`ensureLocation`), then a shared haversine (`~80 m/min`) filters the list **and** the map pins (`setFilters({within,userLoc})` for Events; the pre-filtered set for Places). Desktop applies live; mobile commits on Apply. Declined location → unfiltered + an inline note.
- `?id=` is the active pin — written on pin tap, persists across filter changes, restored on popstate.
- `#mood=…` is owned by `mood-chips.js` (hash, not search param) — do not unify with search params.

**Layout — mobile (< 1024px):** one pane at a time. Default: list. A floating "Map" FAB (`.discover-view-fab`) bottom-right toggles `data-view` on `#discover-panes` between `list` and `map`.

**Layout — desktop (≥ 1024px):** CSS grid split view always on, `minmax(0,1fr) minmax(0,1.18fr)` (list breathes, sticky map stays prominent). FAB is hidden. `?view=` param is ignored.

**Filter pill row** (`.discover-pills`, wrapping): Events shows Tonight · This week · Free; Places shows venue-kind quick-pills (Record stores · Bookshops · Galleries · Clubs · Flea & thrift · Arts centres · Cinemas · Community). Pills toggle `state.time` or `state.cats`. "+ Filters" opens the sheet (mobile only).

**Filter rail / sheet** (`.discover-sheet`): mobile = a fixed bottom sheet opened by "+ Filters" (Apply commits, Clear resets). Desktop ≥1024px = a persistent static left-rail atop the list column with mono eyebrow legends + hairline rules; changes apply live (no Apply button). Category chips, neighborhood chips, and a Sort **radio list** (not a `<select>`).

**AI concierge mode** (`body.discover-ai-mode`, Events only): toggling the ✦ button turns `.discover-search` into an immersive solid-petrol panel (lime accents, "WanderAlt concierge" eyebrow) and collapses the pills, mood strip, filter rail, browse sections, results and map so the matched curator quote owns the screen. Pure CSS keyed on the body class `discover.js` already sets — no JS change.

**List pane states:**

| Condition | What's shown |
|---|---|
| No filters, no query | Browse sections (Curators / Neighborhoods / By kind) |
| Any filter or query active | `#discover-results-section` with count + `.list-rows` |
| No results | `#discover-empty` with contextual copy |
| AI mode loading | `.match-loading` in `#discover-match-result` |
| AI mode result | Hero `.match-card` + secondary `.list-rows` |

**Map pane** (`.discover-pane--map`): MapLibre GL basemap (`#map-canvas`) overlaid with absolute-positioned `#map-pins`, `#map-empty-hint`, and `#map-detail`. `map-tiles.js` owns the basemap (`window.WA.MapTiles`); `map.js` owns the pin layer (`window.WA.MapView`); `discover.js` drives both via filter state. Pin positions come from `picks.lat/lng` projected through `WA.MapTiles.project(lng, lat)`.

**Map engine internals** — the `WA.MapView` / `WA.MapTiles` API surface, the `wa:*` custom-event bus (`wa:map-pin-changed`, `wa:mood-changed`, `wa:catalog-ready`), and the pin-clustering algorithm — live in `docs/backend-and-pipeline.md` → "Discover internals" (the single-source version). `discover.js` drives the map through that API off filter state.

**Adding a map pin:** set `picks.lat` and `picks.lng` (real WGS84 coordinates) on the row. The `geocode-picks` cron does this automatically every 20 min (Nominatim only, free); admins can also drag the marker in the pick modal's MapLibre mini-map. `map.js:renderPins()` projects coords via `WA.MapTiles.project()` — no HTML change needed.

### Saved (`saved.html`)

**Tab mechanism:** three visually-hidden `<input type="radio">` elements (`#seg-going`, `#seg-reading`, `#seg-past`) precede `.seg-tabs` in the DOM. CSS sibling selectors (`#seg-going:checked ~ …`) show/hide the corresponding list and seg-note. Zero JS for tab switching.

**Row variants:**

| Variant | Class | Layout | Left col |
|---|---|---|---|
| Going | `.list-row--going` | 2-col grid (52px + 1fr) | TONIGHT / MON / FRI (mono 10px) |
| Reading | `.list-row--bookmarkable` | 2-col grid (1fr + auto) | — |
| Past | `.list-row--past` | compact single-line | — (date on right) |

**Seg notes** (`.seg-note--going/reading/past`): short copy lines below the tabs; visibility driven by the same radio-sibling selectors.

**Count arithmetic:** active count = Going + Reading rows. Past count = Past rows only. Both shown in `.reading-head__count`.

---

## State matrix

| Element | hover | focus-visible | active / checked |
|---|---|---|---|
| `.nav__item` | `color: --c-accent` | 2px accent ring | ink-filled pill + label visible |
| `.bookmark__check` | — | 2px accent ring | `::after` fills bookmark icon |
| `.curator-row` | handle → accent | 2px accent ring | — |
| `.browse-row` | label → accent | 2px accent ring | — |
| `.map-pin` | scale up | 2px accent ring | accent fill (`aria-pressed="true"`) |
| `.seg-tab` label | label → `--c-ink` | ring on preceding radio | ink-fill segment; paper label; lime count badge |
| `.btn-primary` | opacity 0.88 | 2px accent ring | — |
| `.city-selector` | `color: --c-accent` | 2px accent ring | — |

Global focus-visible rule (`styles.css:112`): `outline: 2px solid var(--c-accent); outline-offset: 3px; border-radius: var(--radius)`.

---

## Responsive behavior

Mobile-first. Two breakpoints.

**≥ 768px** (`styles.css:1905`)
- `--gutter`: 20px → 32px (`--reading-max` is now a single 1024 across all viewports — no breakpoint override)
- `--fs-quote`: 32px → 44px; `--fs-pick`: 18px → 20px; `--fs-venue`: 17px → 18px
- Body switches to `display: flex; flex-direction: column; min-height: 100vh`; bottom padding removed
- `.topbar`: `position: sticky` → `static`, `order: 1`
- `.nav`: fixed bottom → `position: sticky; top: 0; order: 2` (masthead below wordmark, above main)
- Discover split view activates at ≥1024px: CSS grid `480px 1fr`; `.discover-pane--map` fills remaining width
- `.thumb--lg`: 72px → 88px; `.thumb`: 48px → 64px
- Briefing `.tonight__quote`: 25px → 30px (flat hero; title stays 23px)

**≥ 1100px** (`styles.css:2027`)
- `--fs-quote`: 44px → 52px (the full-scale venue/match hero quote; the briefing hero quote stays 30px)

Safe-area insets: `body` bottom padding and `.nav` use `env(safe-area-inset-bottom, 0px)`.

`prefers-reduced-motion`: Surprise me fade skipped; drag-expand transition suppressed. Global `animation: none !important` in the reduced-motion block covers `wa-pulse` and all other animations including `::before`/`::after` pseudo-elements.

---

## Pulse animation

`@keyframes wa-pulse` drives the live-dot ring (e.g. `.map-sheet__tonight-dot::after`) and the map locate-FAB "locating" state (`.map-locate-fab--locating`):

```css
@keyframes wa-pulse {
  0%   { opacity: 0.5; transform: scale(1); }
  100% { opacity: 0; transform: scale(2.5); }
}
```

The `::after` pseudo-element: `position: absolute; inset: -3px; border-radius: 50%; border: 1.5px solid var(--c-ink)`. Duration 1.8s, ease-out, infinite.

---

## Edge cases & content rules

**Handles.** All curator handles start with `@` and match the Telegram channel slug exactly: `@sigmundtells` (`t.me/sigmundtells`), `@notboring_riga`, `@kaisa.writes`, etc. The May 2026 normalisation migration retired the bare-handle exception; `curator.js` keeps back-compat for old `?handle=sigmundtells` URLs by auto-prefixing `@` on lookup miss. Styled via `.handle`.

**Meta string format.** `Neighborhood · type · day time`. Day omitted for tonight picks. Use `.meta__time` span around ` · TIME` to prevent wrapping mid-separator.

**Long titles.** No line clamp — titles wrap naturally. On the map sheet, very long titles push content below the peek fold. Acceptable for the skeleton.

**Tonight fallback.** `briefing.js` uses `catalog.find(e => e.tonight) || catalog[0]`. If no entry has the `tonight` flag, the first catalog entry becomes the hero. This prevents a blank Briefing page after a fresh DB import.

**Empty city (no picks).** When the active city's catalog is empty (e.g. a newly-unlocked city without a curator, like Vilnius in internal testing), `briefing.js:renderTonightEmpty()` replaces the Tonight skeleton with a "curators are warming up — browse places →" line (so it never reads as perpetual loading), This Week shows the city-plate empty card, and the Surprise-me button is hidden.

**Multi-city (May 2026).** Tallinn (primary), Helsinki and Riga are live; Vilnius is **unlocked for internal testing** (`status: 'live'`, no curator/picks yet — Places only). City selector is fully implemented — keyboard-accessible listbox in `city.js`. Switching city saves to `localStorage ('wa:city')` and reloads. Supabase data layer and all ingest pipelines are city-aware.

**Vilnius scaffold (May 2026).** City plate SVG ready (`assets/vilnius-overview.svg` — Gediminas Tower, Cathedral + belfry, St. Anne's Church, Three Crosses). Entry in `city.js` CITIES array as `status: 'coming'` — shows "Coming soon" in the dropdown, not selectable. Static venue seed in `catalog.js` (7 verified venues, offline fallback). **Backend pipeline is now live (May 2026):** `ingest-osm` v11 seeded ~410 Vilnius venues; two `sources` rows wired (`@afishavilnius` telegram aggregator + `@ra_vilnius` Resident Advisor GraphQL via the new `ingest-ra` fn, 24 events validated). The UI is now `status: 'live'` — **unlocked for internal testing**, not a public launch. Vilnius has no curator voice or curated picks yet, so Events/Today show graceful empty states (Places is populated by the venue layer). No single-voice underground Telegram channel exists for Vilnius yet (scene is on Instagram: @smala.art, @discotag); RA's recurring cron is intentionally NOT scheduled pending the RA-ToS call. Full state + remaining steps in CLAUDE.md's Vilnius section.

---

## Accessibility checklist

- **Landmarks:** `<header role="banner">`, `<main id="…">`, `<nav aria-label="Primary">` on every page.
- **Skip link:** `.skip-link` on every page, targets the main `id`.
- **Focus-visible:** global rule at `styles.css:112`. All interactive elements keyboard-reachable.
- **Contrast:** `--c-ink` on `--c-paper` → >21:1. `--c-ink-mute` (#71717a) on white → ~4.6:1 (passes AA at 12px+). `--c-accent` petrol on white passes AA for large/bold text only.
- **Bookmark inputs:** `aria-label="Save this pick"` or `aria-label="Bookmark: {title}"` on every checkbox.
- **Active nav:** `aria-current="page"` on the matching item. Visual active state is not color-only — also changes shape and adds a label.
- **Map pins:** `aria-label="Pin N: {title}"` and `aria-pressed="true/false"` on each button.
- **Reduced motion:** Surprise me transition gated. `wa-pulse` covered by global `animation: none !important` in reduced-motion block (May 2026).
- **Touch targets:** nav pill items 52px tall. Bookmark checkboxes use `<label>` wrapper for larger hit area.

---

## Known limitations

- **Map sheet drag — momentum/fast-swipe**: basic snap to peek/60vh works; momentum-scroll and very fast flicks are not handled.
- **Venue/curator pages**: rendered client-side from `catalog.js` via URL params. Deep links require JS to be enabled.
- **No `alt` on real images**: `image_url` thumbnails apply as CSS `background-image`; `aria-label` on the wrapper `.thumb` span is the accessible substitute. Worth revisiting if the approach moves to `<img>` elements.
- **Pin/label collisions**: at certain aspect ratios, pin teardrops can visually overlap the SVG neighborhood labels. Cosmetic only; labels are `aria-hidden`.
- **Standalone venue page**: a venue's info now lives in the Discover map detail panel (`venueDetailHTML` — name/kind/neighborhood/social). There is no dedicated venue page with "events here" nested (the RA/Maps pattern) yet — a follow-up.
- **Venue social coverage is sparse**: `website` ~57% of alt venues, `facebook`/`instagram` only where OSM tagged them (~20/~12 live). Icons degrade gracefully. Grows on the weekly `ingest-osm` cron.

## Tooling (local audits)

Reproduction + the audit harness live in `CLAUDE.md` → Commands (`npm run verify`/`e2e`/`smoke`/`lighthouse`) and `docs/screenshots/README.md` (V-1…V-14 suite + baselines). The June-2026 Lighthouse results (Today 95 · Discover 96 · About 99; a11y/BP/SEO 100) and the CLS / lazy-MapLibre history are in `ROADMAP.md` → "Frontend & UI/UX visual audit". Residual: CLS ~0.11 on Today/About (banner + font arrival, sub-threshold); JS/CSS minification is left to Cloudflare Pages auto-minify (no-build philosophy).

---

## How to extend

### Adding a new page

1. Create `newpage.html` with `<body data-page="newpage">`.
2. Add `<a class="nav__item" data-nav="newpage" href="./newpage.html">` (icon + label) to every existing HTML file's `<nav>`.
3. Add `aria-current="page"` to that item on `newpage.html` only.
4. Add the two CSS selector blocks (active fill + label show) to `styles.css` nav section.

### Adding a new map pin

Set `picks.lat` and `picks.lng` (real WGS84 coords) on the row. Easiest path: the `geocode-picks` cron resolves them from `picks.venue` nightly — set `coords_locked = true` if you've hand-placed and want to skip auto-overwrites. Admins can also drag the marker in the pick modal's MapLibre mini-map (writes lat/lng + `coords_source = 'manual'`). `map.js:renderPins()` projects through `WA.MapTiles.project()` automatically.

### Adding a new neighborhood

Populated dynamically from the live catalog (Discover's Neighborhoods browse section reads distinct `picks.neighborhood` values) — no manual entry needed.

### Adding a new kind/type

No manual entry needed. The "By kind" browse section in Discover is built dynamically from the live catalog by `discover.js:populateBrowse()`. To add it to the category filter chips, add an entry to `WA.MAP_CATEGORIES` in `map-venues.js`.

### Changing the accent color

Edit `--c-accent` in `:root`. Update `--c-accent-soft` to a matching tint. Focus rings, hover states, handles, and logo mark background all update automatically.
