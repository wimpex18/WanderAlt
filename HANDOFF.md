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
| `--c-ink-mute` | `#71717a` | Meta text, eyebrows, counts, placeholder |
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
| `--ff-display` | `'DM Serif Display', 'Source Serif 4', Georgia, serif` | Tonight quote, curator quotes, venue hero |
| `--ff-body` | `'Geist', -apple-system, system-ui, sans-serif` | All running text, headings, nav labels |
| `--ff-mono` | `'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace` | Eyebrows, meta strings, handles, counts |

Google Fonts load string: `family=DM+Serif+Display:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500`

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
| `--reading-max` | `680px` | Max content column width (editorial constraint) |
| `--radius` | `8px` | Default border-radius (inputs, focus rings) |
| `--radius-card` | `12px` | Cards (search box, tonight card) |
| `--radius-thumb` | `8px` | Thumbnail images |
| `--rule-w` | `1px` | All horizontal/border rules |
| `--nav-h` | `68px` | Bottom nav height; used in body padding-bottom |

### Motion

`--t-fast: 120ms ease` — used on all `transition` properties for hover/active states.

---

## Layout system

`.page` (on `<main>`) sets `max-width: var(--reading-max); margin: 0 auto; padding: 0 var(--gutter)`. This is the editorial column — everything inside it is constrained to 680px on large screens.

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
| Tonight badge | `.tonight-badge` | 2413 | — | lime pill, pulsing dot |
| Kind badge | `.kind-badge` | (venue area) | — | accent dot icon + mono label |
| Thumbnail | `.thumb` | 421 | `.thumb--lg`, `.thumb--has-img` | halftone fallback or CSS `background-image` |
| Bookmark toggle | `.bookmark` + `.bookmark__check` | 547 | — | `:checked` → `fill: currentColor` on SVG path |
| Tonight card | `.tonight-card` | 2373 | — | bordered surface; scoped quote size |
| Primary button | `.btn-primary` | (685) | — | dark bg on hover |
| Secondary button | `.btn-secondary` | (693) | — | outlined; fills on hover |
| Bottom/top nav | `.nav` + `.nav__inner` | 1833 | — | fixed bottom mobile; sticky top desktop |
| Search box | `.search-box` | (870) | — | bordered `--radius-card` container |
| Search sort | `.search-sort` | 934 | — | `:disabled` → opacity 0.35 |
| Curator row | `.curator-row` | 974 | — | 3-col grid; hover → handle accent |
| Browse row | `.browse-row` | (1000) | — | 2-col grid; hover → label accent |
| Seg tabs | `.seg-tabs` + `.seg-tab` | 1112 | — | CSS-only via radio siblings; active → white + lime count |
| List row | `.list-row` | (1169) | `--going`, `--reading`, `--past`, `--bookmarkable` | see Saved spec |
| Map sheet | `.map-sheet` | 701 | — | peek height; drag-expand to 60 vh |
| Auth panel | `.auth-panel` | (1220) | — | modal overlay |
| Colophon | `.colophon` | (1360) | — | mono, muted, bottom of page |

---

## Nav wiring contract

The active bottom-nav item is driven entirely in CSS — no per-page JS.

**Three-part contract:**

1. `<body data-page="search">` — on the `<body>` in each HTML file. Values: `briefing`, `map`, `search`, `saved`, `profile`.
2. `<a class="nav__item" data-nav="search">` — `data-nav` on each item; value matches the `data-page` it corresponds to.
3. `aria-current="page"` — set on the matching nav item for accessibility. The visual active state comes from CSS selectors, not this attribute.

**CSS selector chain** (nav section of `styles.css`):

```css
body[data-page="search"] .nav__item[data-nav="search"] {
  background: var(--c-ink);
  color: var(--c-paper);
  flex: 0 0 auto;
  padding: 0 16px;
  flex-direction: row;
  gap: 6px;
}
body[data-page="search"] .nav__item[data-nav="search"] .nav__label {
  display: block;
}
```

Active item expands to show its text label; all inactive items hide the label (`display: none` on `.nav__label` by default). One such block exists for each of the five pages.

**Adding a new page:** create the HTML file with `<body data-page="newpage">`, add a nav item with `data-nav="newpage"` to every existing HTML file's `<nav>`, add the two CSS blocks above for `newpage`.

---

## Per-page specs

### Briefing (`index.html`)

**Tonight hero** (`#tonight .tonight-card`): rendered by `briefing.js:renderTonight()`. Structure:

```
.tonight-card                       ← bordered surface, --c-paper-deep bg
  .tonight-card__head
    .tonight-badge                  ← lime pill, pulsing dot, "Tonight · TIME"
  .thumb.thumb--lg                  ← real image or halftone initials fallback
  p.photo-credit                    ← only if entry.imageAttr set
  .tonight-card__meta               ← flex row: .kind-badge + .meta
  a.tonight-card__title             ← 22/26/28px body-font venue link
  blockquote.tonight__quote         ← italic display font, lime left border
    p                               ← 22px mobile → 26px tablet → 28px desktop
    footer.tonight__attr            ← line ornament + handle <a>
  .tonight-actions
    a.btn-primary "I'm going →"
    label.btn-secondary.bookmark "Save"
```

Quote font is scoped: `.tonight-card .tonight__quote p` overrides `--fs-quote` (which is 32/44/52px globally) down to 22/26/28px. This keeps the bordered briefing card proportional without affecting the full-bleed venue detail hero.

**This Week list** (`.picks`): `briefing.js:renderThisWeek()`. Each `<li class="pick">` uses a `.pick__link` div grid — not a single `<a>` — to avoid nested anchor ejection. Contains: thumb link + title link + meta + via handle + bookmark checkbox.

**Curator's Column** (`.column`): injected above `.thisweek` by `briefing.js:renderColumn()` (async Supabase fetch). Absent if no published column exists. Minimal Markdown rendered to `<p>/<strong>/<em>`.

**Mood chips**: `mood-chips.js` populates `.mood-chips`; fires `wa:mood-changed`. Briefing re-filters This Week on that event; Tonight is not re-filtered.

**Surprise me** (`#surprise-btn`): cycles Tonight through catalog; respects `prefers-reduced-motion`.

### Map (`map.html`)

Full-bleed canvas via `.map-bleed` (full-bleed escape applied). Static SVG city plane illustration — no tile map.

**Pins**: rendered dynamically by `map.js:renderPins()` from the live catalog. Static pin buttons in `map.html` are removed on init and replaced with catalog-sourced buttons. Each pin button gets `style="left:XX%;top:YY%"` from `entry.pin.left` / `entry.pin.top`.

**Pin coordinate table** (current Tallinn catalog):

| Pin | Venue | left% | top% |
|---|---|---|---|
| 1 | Sveta Baar | 34% | 38% |
| 2 | Fotografiska | 58% | 30% |
| 3 | Paavli Kultuurivabrik | 22% | 58% |
| 4 | Kai Art Center | 72% | 52% |
| 5 | Turntable Tallinn | 46% | 70% |
| 6 | Võta või Jäta | 64% | 76% |
| 7 | Köögi Galerii | 28% | 22% |

**Adding a pin**: add `pin: { num: N, left: 'XX%', top: 'YY%', eyebrow: 'NEIGHBORHOOD' }` to the catalog entry. No HTML change needed.

**Pin SVG**: teardrop path, `stroke-width: 1.2`. CSS drives selected fill: `.map-pin[aria-pressed="true"]` → `--c-accent` on the path. Number is a `<text>` inside the SVG.

**Bottom sheet** (`.map-sheet`):

```
.map-sheet                          ← position: absolute; bottom: 0
  .map-sheet__handle                ← drag target, grab cursor
  .map-sheet__head
    .map-sheet__num                 ← lime 32×32px badge
    .map-sheet__body
      flex row: .map-sheet__tonight + .map-sheet__pos ("01 / 07")
      .map-sheet__title <a>
      .meta
    .map-sheet__close
  .map-sheet__quote
  .map-sheet__foot (.btn-primary + label.btn-secondary.bookmark)
```

`.map-sheet__pos` is `position: static` inside a flex row — not absolutely positioned.

**Drag-expand** (`map.js:207–306`): `pointerdown` on `.map-sheet__handle` captures pointerId; `pointermove` sets `sheet.style.height` live. On `pointerup`, snaps to peek (clear inline height) or `60vh` based on drag delta vs. `SNAP_DELTA = 48px`. Tap with no drag toggles. Desktop: sheet is `max-width: 720px` centered via `transform: translateX(-50%)`.

**Filter chips** (`.map-filters`): `All / Tonight / This week / Places`. Predicates in `map.js:CHIP_PREDICATES`. Mood chips compose with AND semantics; both call `applyVisibility()`.

**SVG neighborhood labels**: Tallinn-specific; hidden by `map.js` when `WA.CITY !== 'tallinn'`.

### Search (`search.html`)

Browse state (empty input): Curators (`.curator-rows`) + Neighborhoods + By Kind (`.browse-rows`). Browse rows are rebuilt from the live catalog by `search.js:populateBrowse()`. Any `[data-search]` row fills the input on click, triggering keyword search.

**Two modes** (`data-mode` on `.search-input-wrap`):
- `search` (default): filters `title, venue, neighborhood, kind, handle, quote` on every keystroke
- `match`: natural-language prompt sent to `match-pick` edge function (Groq) on Enter; shows `.match-card` result

**Sort control** (`#search-sort`): relevance (default) / newest / A→Z / by curator. Applied after text + mood filters. `disabled` when result count is 0 (opacity 0.35). Resets to `relevance` when query clears.

**States:**

| Condition | What's shown |
|---|---|
| Empty input, no mood | Browse sections; results hidden; sort enabled (reset to relevance) |
| Input has value or mood active | Browse hidden; `#search-results-section` with count |
| No results | `#search-empty` with copy; sort `disabled` |
| Match mode loading | `.match-loading` in `#match-result` |
| Match mode result | `.match-card` with why-text, curator handle, venue block |

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
| `.seg-tab` label | label → `--c-ink` | ring on preceding radio | white card lifted; lime count; bold label |
| `.btn-primary` | opacity 0.88 | 2px accent ring | — |
| `.city-selector` | `color: --c-accent` | 2px accent ring | — |

Global focus-visible rule (`styles.css:112`): `outline: 2px solid var(--c-accent); outline-offset: 3px; border-radius: var(--radius)`.

---

## Responsive behavior

Mobile-first. Two breakpoints.

**≥ 768px** (`styles.css:1905`)
- `--gutter`: 20px → 32px; `--reading-max`: 680px → 840px
- `--fs-quote`: 32px → 44px; `--fs-pick`: 18px → 20px; `--fs-venue`: 17px → 18px
- Body switches to `display: flex; flex-direction: column; min-height: 100vh`; bottom padding removed
- `.topbar`: `position: sticky` → `static`, `order: 1`
- `.nav`: fixed bottom → `position: sticky; top: 0; order: 2` (masthead below wordmark, above main)
- `.map-bleed`: `calc(100vh - 200px)`, clamped 580–820px; `.map-sheet` centered with `max-width: 720px`
- `.thumb--lg`: 72px → 88px; `.thumb`: 48px → 64px
- `.tonight-card .tonight__quote p`: 22px → 26px
- `.tonight-card__title`: 22px → 26px

**≥ 1100px** (`styles.css:2027`)
- `--reading-max`: 840px → 960px; `--fs-quote`: 44px → 52px
- `.tonight-card .tonight__quote p`: 26px → 28px

Safe-area insets: `body` bottom padding and `.nav` use `env(safe-area-inset-bottom, 0px)`.

`prefers-reduced-motion`: Surprise me fade skipped; drag-expand transition suppressed. `wa-pulse` animation not yet gated — see Known limitations.

---

## Pulse animation

`@keyframes wa-pulse` drives the ring on `.tonight-badge__dot::after` and `.map-sheet__tonight-dot::after`:

```css
@keyframes wa-pulse {
  0%   { opacity: 0.5; transform: scale(1); }
  100% { opacity: 0; transform: scale(2.5); }
}
```

The `::after` pseudo-element: `position: absolute; inset: -3px; border-radius: 50%; border: 1.5px solid var(--c-ink)`. Duration 1.8s, ease-out, infinite.

---

## Edge cases & content rules

**Handles.** Two formats: `@kaisa.writes` (Telegram-style) and `sigmundtells` (channel-name, no @). Both styled identically via `.handle`.

**Meta string format.** `Neighborhood · type · day time`. Day omitted for tonight picks. Use `.meta__time` span around ` · TIME` to prevent wrapping mid-separator.

**Long titles.** No line clamp — titles wrap naturally. On the map sheet, very long titles push content below the peek fold. Acceptable for the skeleton.

**Tonight fallback.** `briefing.js` uses `catalog.find(e => e.tonight) || catalog[0]`. If no entry has the `tonight` flag, the first catalog entry becomes the hero. This prevents a blank Briefing page after a fresh DB import.

**Tallinn only.** All venue names, neighborhoods, and pin coordinates are Tallinn-specific. City selector UI is a placeholder.

---

## Accessibility checklist

- **Landmarks:** `<header role="banner">`, `<main id="…">`, `<nav aria-label="Primary">` on every page.
- **Skip link:** `.skip-link` on every page, targets the main `id`.
- **Focus-visible:** global rule at `styles.css:112`. All interactive elements keyboard-reachable.
- **Contrast:** `--c-ink` on `--c-paper` → >21:1. `--c-ink-mute` (#71717a) on white → ~4.6:1 (passes AA at 12px+). `--c-accent` petrol on white passes AA for large/bold text only.
- **Bookmark inputs:** `aria-label="Save this pick"` or `aria-label="Bookmark: {title}"` on every checkbox.
- **Active nav:** `aria-current="page"` on the matching item. Visual active state is not color-only — also changes shape and adds a label.
- **Map pins:** `aria-label="Pin N: {title}"` and `aria-pressed="true/false"` on each button.
- **Reduced motion:** Surprise me transition gated. `wa-pulse` animation not yet gated — follow-up.
- **Touch targets:** nav pill items 52px tall. Bookmark checkboxes use `<label>` wrapper for larger hit area.

---

## Known limitations

- **Map sheet drag — momentum/fast-swipe**: basic snap to peek/60vh works; momentum-scroll and very fast flicks are not handled.
- **wa-pulse + reduced-motion**: `@keyframes wa-pulse` on the Tonight dot is not gated behind `prefers-reduced-motion`. Low priority.
- **City selector**: button has `aria-haspopup="listbox"` but no dropdown is implemented. Clicking does nothing.
- **Venue/curator pages**: rendered client-side from `catalog.js` via URL params. Deep links require JS to be enabled.
- **No `alt` on real images**: `image_url` thumbnails apply as CSS `background-image`; `aria-label` on the wrapper `.thumb` span is the accessible substitute. Worth revisiting if the approach moves to `<img>` elements.
- **Pin/label collisions**: at certain aspect ratios, pin teardrops can visually overlap the SVG neighborhood labels. Cosmetic only; labels are `aria-hidden`.

---

## How to extend

### Adding a new page

1. Create `newpage.html` with `<body data-page="newpage">`.
2. Add `<a class="nav__item" data-nav="newpage" href="./newpage.html">` (icon + label) to every existing HTML file's `<nav>`.
3. Add `aria-current="page"` to that item on `newpage.html` only.
4. Add the two CSS selector blocks (active fill + label show) to `styles.css` nav section.

### Adding a new map pin

1. Add a `pin` object to the catalog entry (or the Supabase `picks` row): `{ num: 8, left: '55%', top: '45%', eyebrow: 'KALAMAJA' }`.
2. `map.js:renderPins()` inserts the button automatically — no HTML change needed.
3. The pos counter (`01 / 07`) updates to reflect the new total automatically via `visibleTotal`.

### Adding a new neighborhood

Two places: (1) the SVG city-plane illustration (baked-in text label); (2) a `<li class="browse-row" data-search="Name">` in the Neighborhoods section of `search.html`.

### Adding a new kind/type

One place: By Kind browse rows in `search.html`. `search.js` filters on `entry.kind` matching `data-search`.

### Changing the accent color

Edit `--c-accent` in `:root`. Update `--c-accent-soft` to a matching tint. Focus rings, hover states, handles, and logo mark background all update automatically.
