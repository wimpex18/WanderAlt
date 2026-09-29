# Front end and design system

Plain HTML pages at the repo root, one `.js` renderer each, one stylesheet (`wa.css`). No framework and no build step. The direction is recorded in `docs/design-brief.md` under Decisions.

## Pages

| Page | Script | What it is |
|---|---|---|
| `index.html` | `home.js` | Tonight: search pill, category bar, card shelves (on now, starting soon or late, for you, this weekend, later this week); side column with places open now, areas and the map card. |
| `discover.html` | `programme.js` | Programme: search, seven-day strip, kind chips, filters (sheet on phones, sidebar from 1024), list grouped by day. |
| `map.html` | `map.js` | Map: event pills and venue pins, a swipeable row of cards for the chosen pin, a sheet (sidebar from 1024) of what is in view by walking time. |
| `places.html` | `places.js` | Places by kind, nearest then open first, with an Open now toggle. |
| `detail.html` | `detail.js` | The event page and the venue page (one template, two shapes). |
| `saved.html` | `saved-page.js` | Lists, then coming up, places, and what is over. |
| `profile.html` | `you.js` | You: interests, appearance, follows, opened earlier, account. |
| `review.html` | `review.js` | Review queue for held-back events; unlinked, `noindex`. See `docs/data.md`. |
| `source.html`, `about.html`, `404.html` | `source.js`, `about.js`, `notfound.js` | A source's feed, About, not found. |

Shared: `tabbar.js` (the tab bar's glass drop), `render.js` (`WA.R`: rows, cards, place rows, shelves, section heads, skeletons, empty states, areas, kinds, the "why" tag, interests, last visit), `icons.js` (`WA.Icon` UI icons, `WA.Picto` pictograms), `finder.js` (the Where / When / What sheet on desktop; on phones the search pill opens the Programme's ask field), `ask.js` (`WA.Ask`: reads a search sentence into filters). Data and state: `supabase.js`, `when.js`, `geo.js`, `hours.js`, `bookmark.js`, `lists.js`, `follow.js`, `seen.js`, `auth.js`, `theme.js`, `offline.js`, `sw.js`.

`supabase.js` loads `catalogue_redirects` alongside the catalogue. Retained event/venue ids resolve to canonical records in detail and map links, saves and list contents; raw saved ids remain stored so an admin undo is reversible. Paged results are unique by id and use stable ordering. Tonight claims displayed ids across shelves, so tomorrow's cards do not repeat under Later this week. Separate dated performances keep their own ids.

## System

- **Surfaces.** White paper (`--paper`), a quiet fill (`--paper-2`), ink `#1c1c1e`. Dark theme (`data-theme="dusk"`) is `#111113` paper. Never cream.
- **One accent**, Tallinn vermilion `--accent` `#d83a14`: the primary key (Tickets, Search), "now", the day-strip bars, the open ring on venue pins. White text on it is 4.7:1. Text in the accent uses `--accent-ink`.
- **Liquid Glass is for what floats over content**, never for content: the top bar, the floating tab bar and its drop, map controls and the Show control, the finder sheet, the ticket bar, the card time badge, the toast. One recipe (`--glass-*` tokens); `prefers-reduced-transparency` and browsers without `backdrop-filter` get solid paper.
- **Type.** Geologica (variable 300–800; Latin, Latin Extended, Cyrillic, self-hosted in `fonts/`), weights 500–700, tight tracking on headings. Geist Mono only for feed URLs.
- **Icons, two tiers.** UI icons: 24px line, 1.8 stroke (`WA.Icon`). Pictograms: 48px line drawings for kinds and cities on a tinted tile in their own hue (`WA.Picto`, `.wa-picto--<name>`). Hue decorates; the word beside it carries the meaning.
- **Shape.** Concentric radii: 8 / 12 / 16 / 20 / 28, pills for chips, search and pins. Cards 20px, sheets 28px.
- **Motion.** `--ease` and `--spring` only; press states scale, sheets rise with the spring. `prefers-reduced-motion` removes all of it. Map sheet snaps set the final list height once and animate its position; category folding uses grid rows. Tab-pill and grip widths do not animate. The Now badge uses a static dot; shelves move only through user input. Temporary loading skeletons shimmer until data arrives. Impeccable exceptions retain the specified spring, Geist Mono feed URLs and the loading shimmer misidentified as a marquee.
- WCAG 2.2 AA; 44px tap floor; focus ring 2px ink.

## Patterns

- **Card**: square photo, glass badge for when ("Tonight · 19:00", "On now · till 23:00"), heart to save, title (two lines), venue · area, walk · price · why tag. No photo: the kind's pictogram on its tint.
- **Picture identity**: event images always belong to the event; missing artwork uses its category pictogram, never a venue photo. Venue logos use pictograms in lists/maps and a small labelled logo on venue details. Photo retrieval and review rules are in `docs/data.md`.
- **Row** (Programme, venue programme, Saved): rail with time then walk (area when location is off), kind and why tag, English title, venue · area · price, thumbnail.
- **Place row**: photo or pictogram, name, kind · area, open state (filled dot open, square shut, dashed not filed), walk.
- **Event page**: photo or pictogram, English title, 1–2 sentence English highlights, explicit performance languages when stated, facts as an icon list (When, Entry, Walk or Area), the ticket bar (price and the ticket seller's host, Tickets or Walk me there), Calendar / Walk there / Save / List, the Going row, the venue card, a native Original description disclosure, Address (mini-map, address, Walking directions), provenance. On phones the tab bar steps aside and a back key appears.
- **Flags**: what the source says about a show, from `flag`. Cancelled and postponed are solid ink pills; the card or row greys its photo, strikes the title, never reads "On now", and sorts last on Tonight's shelves; the event page opens with an ink notice and drops tickets, calendar and Going. Sold out and few tickets left are outlined pills; sold out turns Tickets into "Check for returns". Never the accent, which means now.
- **Going** (`going.js`): "I'm going" marks the event in this browser (`wa:going:v1`) and, when signed in, in `going`. The row shows the public count from `going_counts` ("12 going", "You and 11 others"); nobody sees who. Signed out, the mark stays local and a toast offers sign-in. If the count can't be read, the row shows no number.
- **Original description**: closed by default. Opening it fetches at most 2,000 source characters, the original title and a link to the full source. Failed requests offer Try again and retain the source link. Known text languages use `lang`; performance languages come from explicit source statements, never from the announcement's language. English-source excerpts are labelled Source description. English highlights also feed page metadata and social previews.
- **Mini-map**: a still MapLibre map with the pin, in the page's theme; tapping it opens `map.html?pick=<id>`, which centres on that event or place and chooses it.
- **Venue page**: photo or a monogram of the name on its kind's tint, open state, Follow / Walk there / Save, labelled links (Website, Instagram, Facebook), a Next fact (the next show and how many follow), programme by day, the week's hours, Address with the mini-map, provenance. Retained closed venues show a closure notice and never read Open now from old hours.
- **Tab bar** (phones): a vermilion-tinted pill marks the current tab. Press the bar (hold or start sliding) and it swells slightly while a drop of clear glass, taller and wider than a tab, lifts under the finger. The drop carries a magnified vermilion copy of the tabs clipped to its shape, so a tab half under it is half tinted. Letting go settles the drop on the nearest tab and opens it; a quick tap just follows the link.
- **Kind row** (Tonight): pictograms on their own tinted tiles; the chosen kind gets an ink ring, not a tab underline.
- **Map**: one row of controls, Show (All · Events · Places, a segmented capsule) and When, both 44px glass. Events are pills with the start time (vermilion when on now); places are round pins with their pictogram, ringed when open now. The places layer is what is open now plus the rooms hosting an event in the chosen window. Pins cluster in screen space; the chosen pin never clusters. Choosing a pin raises a row of cards for what is in view (in the sheet's order); swiping the row moves the choice from pin to pin, and the map slides only when that pin is hidden. Tapping bare map closes the cards. On phones the sheet drags between peek, half and full (a flick goes one stop on); the list drags it too when it cannot scroll that way itself. The locate key rides above the sheet and hides when the sheet is full or cards are up. `?show=events|places` keeps the Show choice; `?pick=<id>` opens on one event or place.
- **Map style**: `map-style.json` (day) and `map-style-dusk.json` (night) are generated by `npm run build:map-styles` from one layer list and two palettes in `.scripts/build-map-styles.js`; edit the palette there, not the JSON. Tiles and fonts are OpenFreeMap. Colour carries the city (green parks, blue water, warm main roads, dashed footpaths); there are no POI icons, because our pins are the points of interest.
- **Programme and search**: one pill field for a title, a venue or a sentence, with the filters key inside it; one scrolling row of quick chips (what a sentence set, removable, then Tonight · Tomorrow · Weekend · This week, a hairline, then the kinds with their pictograms, no counts). Days, area, order, start time, distance and switches live in Filters. A focused empty field offers four example questions. A title or a venue is searched as typed. A sentence ("free jazz tonight in Kalamaja", "джаз сегодня", "täna tasuta kontsert") is read in the page by `ask.js` into those same filters plus the words left to look for, and a line under the chips says what it understood, with "Search the words" to undo. Only when words are left that the page could not place and nothing matches is `/api/ask` asked (see `docs/models.md`); its answer also only sets filters, and it is dropped if it finds nothing. The list is always our own listings.
- **Never empty**: Tonight falls back to the next listed day. Programme offers one compact recovery action that brings most listings back while retaining other filters. Query text stays in the field, never in a button label; reset is available in Filters. When no single change helps, the empty state offers “Start over”.
- **Mobile density**: On now artwork is capped at 162.5px below 768px; its time, title and venue sit below, with a short On now badge. Other shelves keep their normal size. The map has 12px side gutters (16px around the desktop map). Below 1024px, the centred preview is about 70% of the former width, with neighbours at 86% of that size. Tapping a neighbour centres it; tapping the active card opens it. Swiping or focusing a card moves the selected pin. Save and close retain 44px targets on the active card; neighbours expose just the card link. Reduced motion disables the scale transition.
- **Detail artwork**: from 600 to 1023px the media occupies 65% of the content width. At desktop sizes its column is 65% of its former width, leaving more room for the event facts. Phone artwork remains full width. Poster links have their own flex boxes, click areas and keyboard focus outlines.
- **Address previews**: mount MapLibre when the section comes into view, resize with the container and show a loading message until the basemap is ready. Failed bundle, WebGL or tile loading offers an explicit Open map link instead of a blank pin. The complete map remains available from the preview.
- **Venue recommendations**: Places, Tonight venue suggestions and venue pins request only fresh verified records from the `venues` view. Retained direct details for an unverified venue say “Status unverified”; a closed venue says “Listed as closed”. Neither gets an Open now claim from old hours. Verification and review rules are in `docs/data.md`.
- Venue programmes and the map's time order compare the date before the clock, so an early screening next week cannot become “Next” ahead of tonight.
- Areas print in the names visitors use (`R.area`: Põhja-Tallinna → Põhja-Tallinn, All-linn → Old Town, Kesklinna → City centre).
- Interests (`wa:interests:v1`) give Tonight a "For you" shelf and nothing else. The last visit (`wa:visit:v1`) powers "N new since Thursday".
- Location is asked for only on a tap; when already granted, walking times fill in by themselves.

## localStorage

`wa:appearance`, `wa:city`, `wa:going:v1`, `wa:seen:v1`, `wa:follows`, `wa:lists:v1`, `wa:interests:v1`, `wa:visit:v1`, `wanderalt:bookmarks:v1`, `wanderalt:session:v1`. New keys: `wa:` prefix, `:v1` suffix for structured shapes.

## Working locally

- `npm start`, open touched pages at 390 and 1440 in both themes (You → Appearance).
- The service worker serves stale files while debugging. Clear it, and bump `VERSION` in `sw.js` when the shell changes:
  ```js
  caches.keys().then(k => Promise.all(k.map(x => caches.delete(x))));
  navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister()));
  ```
- MapLibre gives its container `position: relative`; `.map-canvas.maplibregl-map` restores absolute positioning.
- Brand: a white walking route and night-time spark on the vermilion tile, with the lowercase Geologica wordmark. All pages share a one-second CSS logo reveal (`brand-reveal.js`), once per tab session (`sessionStorage` key `wa:brand-reveal:v1`). Reduced motion or unavailable storage skips it; without JavaScript the page is visible immediately.
- Brand icons are SVG masters in `brand/`; `npm run build:icons` rasterises the PNGs and `favicon.ico`. Social cards use outlined Geologica 700 from the bundled font so their PNGs do not depend on installed fonts. Icon, manifest and OG references carry `?v=route-spark` to refresh the immutable brand assets without changing their paths.
