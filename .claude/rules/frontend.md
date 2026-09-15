---
paths:
  - "*.html"
  - "*.css"
  - "*.js"
  - "functions/**"
---

# Frontend and design system

## System

- `wa.css` is the whole system: 49 tokens, 13 components, two themes (`data-theme="day" | "dusk"`). A screen that needs something new gets a modifier on an existing component, not a screen-local rule.
- **Use tokens. Never hand-roll a colour, blur or rgba literal** — it breaks the other theme.
- Material is flat opaque paper. **Day is the default**; `theme.js` swaps pre-paint from a precomputed per-city sun table, never an API.
- **Glass is exactly two elements**: sticky `.wa-topbar` and bottom `.wa-tabbar`, both ≥92% opaque, both reserving real layout height. Never nest glass; they are siblings because `backdrop-filter` becomes the containing block for fixed descendants.
- **Petrol is the only accent** (CTA included). **Lime means "now" only**: the NOW pill and the selected/now map pin. **`--warn`** marks states the reader must act on (offline banner, `.wa-note`, expired saved count) — never emphasis, never a control.
- Radii: 999 pills · 12 controls · 14–16 cards · 18–20 sheets. `--tap-min` 44px is a hard floor on public pages.
- Type: Plus Jakarta Sans 600/700 for chrome; Fraunces 600 for catalogue voice, **never under 17px**; Geist Mono for facts. `--fs-label` and `--fs-mono` share a value but stay separate tokens.
- Jakarta is variable, two files (`latin`, `latin-ext`); **both subsets are required** for Latvian/Lithuanian diacritics. Only `latin` is preloaded. Inter stays on disk only for `admin-tokens.css`.
- Spacing from `--s-*`. Tighter within an item than between items; a heading always gets more room below than the gap between what it introduces.
- Photo scrims use `--scrim-photo` (theme-invariant dark). Active state is tint plus a mark, never colour alone. Motion: the two existing tokens only. WCAG 2.2 AA floor.
- **A class styled only in `admin.css` is unstyled in the product.** Check which stylesheet defines a class and which pages load it.
- **A `<span>` in a component needs an explicit `display`** if it carries vertical margin — page scripts build components from spans.

## Patterns

- **Rows lead with the rail: time, then walking distance.** Never a photo first.
- Rail values: a clock only when one parses (midnight = absent); `OPEN` for undated/ongoing; unknown distance falls back to the neighbourhood.
- A place's rail says when it shuts: `WA.Hours.rail()` → `→HH`, `24H`, `SHUT`, or empty (caller falls back to `OPEN`).
- `hours.js` models public holidays per country (`WA.CITY`-keyed; `week.ph`; `null` = inherit, `[]` = shut). Month/year selectors are refused on purpose.
- Titles wrap to two lines, never truncate. Meta lines may ellipsize.
- Photos are optional. The phone row has no photo region; desktop rows add a media track via `:has(.wa-row__media)`. No photo → kind glyph on 9% petrol tint, never a grey box. `marks.js` contains (not crops) an image under 60% of its box.
- **One implementation per pattern.** `.wa-row` has four builders (`tonight.js`, `saved-page.js`, `source.js`, `you.js`); copy the nearest one rather than inventing a fifth.
- Desktop masthead (≥1024): brand left, `.wa-tabbar` repositioned to `top: 0` and transparent (one blur, the top bar's), account right. Active nav = petrol ink + 600 + 2px underline. The capsule's centred 960px column is deliberate: full width drifts the slots apart.
- In-page anchors that are link targets carry `scroll-margin-top: calc(var(--topbar-h) + var(--s-4))`, scoped to those ids (not `[id]`, which would shift Tonight's `scrollIntoView`). About's calendar section is `#calendar`, its heading `#calendar-feed`.
- Explore rows: top bar = app nav (on every page, every width) · capsule = Where/When/What · scope tabs = All/Events/Places under the capsule, on its 840px column.
- Below 768 the capsule collapses to one key that carries the applied search ("Tallinn · Anytime"), defaults omitted. A collapsed control must still show its state.
- Scrolling chip rows run full bleed with the gutter in the scroller's padding, and scroll the selected chip into view (the row, never the page).
- Tonight's header is the seven-day density strip: counts from the same filter chain as the rows minus time; an empty day draws no bar. Below 372px the grid gap is zero and the strip bleeds full width so each day stays ≥44px.
- **The map is a mode and never empty**: a way out, "search this area", and a drawer of picks in view. Camera padding is read live from the foot elements covering the canvas, per side. Honour `prefers-reduced-motion` (in `map-tiles.js`). Pins cluster in projected pixel space into a petrol count bubble; the selected pin never clusters. `placePins` runs on `move`; `placeDrawer` on `moveend` and skips unchanged markup (keeps focus and scroll).
- Sheet booleans (free, hide-seen, only sources I follow) don't round-trip in the URL. `?date= ?q= ?cat= ?time= ?sort= ?within= ?view=map` do.
- **Zero-count filter options are disabled, never hidden.**
- **Empty/error states name the filter that emptied the list and offer a next-best answer with a real, non-empty count.** Name the answer, not a control a viewport may not draw.
- A missing or restating description (`WA.UI.descriptionOr`) gets a sentence saying so. The filler list has three copies — `ui-helpers.js`, `functions/_middleware.js`, `og-image` — and they must stay identical.
- Metadata closes with provenance: `via <handle>`.
- **Detail never states a fact about the world that is really a fact about the cache.** On a miss, `WA.byId()` asks the database: render, "That listing has closed down" with the date, or "We have no listing at that address".
- Detail: three labelled cells (event: doors/entry/walk; place: closes/entry/walk + week strip), then one primary key, then secondary keys. Cells with no answer are not rendered. Add-to-list lives on detail, not on Saved rows.
- `.wa-btn-row` is content-width with wrap; an instance wanting a full-width key sets `flex: 1`.
- Follows (`WA.Follows`, localStorage only) hold venue names and raw handles; a pick matches "Only sources I follow" if its venue or handle is followed. You's "Opened earlier" lists the last 8 resolvable entries and claims nothing about the rest.
- Saves and lists are one store: adding to a list saves; unsaving purges from every list.
- **One toast at a time**, above the tab bar, ~4s, always with the reverse action, never for navigation. `WA.Toast` is optional per page — guard the call. It refuses a toast without a reverse action. Focus ring: `:focus-visible`, 2px petrol, 2px offset. Content caps at 1560px.
- Loading is a skeleton matching the real row height exactly. No spinners.
- Rows and cards underline their title on hover inside `@media (hover: hover)`.
- Prose carries the `62ch` measure.
- Viewports: cap heights for landscape (`max-height` queries, `min(clamp(...), calc(100vh - var(--topbar-h) - var(--tabbar-h) - var(--s-6)))`); cap `aspect-ratio` heroes at wide widths (`.wa-detail__well` `max-height: min(46vh, 460px)` from 768). Canonical mobile width 390; `--reading-max` ladder is shared by every page.
- Offline banner is inserted after `.wa-topbar`, sticky at `--topbar-h`. Under it, Tonight's map-mode head goes `position: static`. Two sticky elements cannot share one offset.
- `sw.js`: navigations network-first; static assets stale-while-revalidate; last picks/venues cached with `x-wa-cached-at`. `/sw.js` is `no-cache`. Never cache a signed-in response.
- `.wa-sheet` (`<dialog>` + `showModal()`) is the one modal, including auth.

## localStorage

`wa:appearance`, `wa:city`, `wa:seen:v1`, `wa:follows`, `wa:lists:v1`, `wanderalt:bookmarks:v1`, `wanderalt:session:v1`, admin `wa-admin-*`. New keys: `wa:` prefix, `:v1` suffix for structured shapes; a shape change bumps the suffix with a one-shot migration in the owning file.

## Working locally

- `npm start`, open touched pages at 390, 768 and 1440 in both themes; check every other instance of a pattern you change. Screen-local fixes are the recurring failure mode.
- The browser pane is real Chrome on the GPU: `backdrop-filter`, photos and the MapLibre basemap all render locally. Front the tab before capturing the map (rAF throttles when hidden). Dusk basemap is near-black by design. The PR preview is the check for CSP/header behaviour.
- **The service worker serves stale files while debugging.** Clear it, and confirm `navigator.serviceWorker.controller` is null — a controller outlives unregistering:
  ```js
  caches.keys().then(k => Promise.all(k.map(x => caches.delete(x))));
  navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister()));
  ```
  Compare `fetch('/x.js?b='+Date.now(), {cache:'no-store'})` against the DOM when unsure.
- Overlap: use `getBoundingClientRect()` on elements that clip, `Range.getBoundingClientRect()` (ink) on elements that don't. Fixed layers and `.wa-sr` are expected false positives.
- Tap targets: test with `document.elementFromPoint` at half a target from centre (`.wa-pin::after` extends the hit area).
- **Never decide a class is unused by grepping** — class names are composed at runtime. Use a DOM census across pages, widths, themes and states.
