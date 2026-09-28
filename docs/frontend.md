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
| `source.html`, `about.html`, `404.html` | `source.js`, `about.js`, `notfound.js` | A source's feed, About, not found. |

Shared: `tabbar.js` (the tab bar's glass drop), `render.js` (`WA.R`: rows, cards, place rows, shelves, section heads, skeletons, empty states, areas, kinds, the "why" tag, interests, last visit), `icons.js` (`WA.Icon` UI icons, `WA.Picto` pictograms), `finder.js` (the Where / When / What sheet). Data and state: `supabase.js`, `when.js`, `geo.js`, `hours.js`, `bookmark.js`, `lists.js`, `follow.js`, `seen.js`, `auth.js`, `theme.js`, `offline.js`, `sw.js`.

## System

- **Surfaces.** White paper (`--paper`), a quiet fill (`--paper-2`), ink `#1c1c1e`. Dark theme (`data-theme="dusk"`) is `#111113` paper. Never cream.
- **One accent**, Tallinn vermilion `--accent` `#d83a14`: the primary key (Tickets, Search), "now", the day-strip bars, the open ring on venue pins. White text on it is 4.7:1. Text in the accent uses `--accent-ink`.
- **Liquid Glass is for what floats over content**, never for content: the top bar, the floating tab bar and its drop, map controls and the Show control, the finder sheet, the ticket bar, the card time badge, the toast. One recipe (`--glass-*` tokens); `prefers-reduced-transparency` and browsers without `backdrop-filter` get solid paper.
- **Type.** Geologica (variable 300–800; Latin, Latin Extended, Cyrillic, self-hosted in `fonts/`), weights 500–700, tight tracking on headings. Geist Mono only for feed URLs.
- **Icons, two tiers.** UI icons: 24px line, 1.8 stroke (`WA.Icon`). Pictograms: 48px line drawings for kinds and cities on a tinted tile in their own hue (`WA.Picto`, `.wa-picto--<name>`). Hue decorates; the word beside it carries the meaning.
- **Shape.** Concentric radii: 8 / 12 / 16 / 20 / 28, pills for chips, search and pins. Cards 20px, sheets 28px.
- **Motion.** `--ease` and `--spring` only; press states scale, sheets rise with the spring. `prefers-reduced-motion` removes all of it.
- WCAG 2.2 AA; 44px tap floor; focus ring 2px ink.

## Patterns

- **Card**: square photo, glass badge for when ("Tonight · 19:00", "On now · till 23:00"), heart to save, title (two lines), venue · area, walk · price · why tag. No photo: the kind's pictogram on its tint.
- **Row** (Programme, venue programme, Saved): rail with time then walk (area when location is off), kind and why tag, English title, original title under it when different, venue · area · price, thumbnail.
- **Place row**: photo or pictogram, name, kind · area, open state (filled dot open, square shut, dashed not filed), walk.
- **Event page**: photo or pictogram, English title, original title, summary, facts as an icon list (When, Entry, Walk or Area), the ticket bar (price, Tickets or Walk me there), Calendar / Walk there / Save / List, In their words, the venue card, address, provenance. On phones the tab bar steps aside and a back key appears.
- **Venue page**: photo or a monogram of the name on its kind's tint, open state, Follow / Walk there / Save, icon links, programme by day, the week's hours, provenance.
- **Tab bar** (phones): a vermilion-tinted drop sits under the current tab. Press anywhere on the bar and slide: the drop lifts into clear glass with an iridescent rim, follows the finger and enlarges the tab under it; letting go settles it there and opens that page. A tap still just follows the link.
- **Kind row** (Tonight): pictograms on their own tinted tiles; the chosen kind gets an ink ring, not a tab underline.
- **Map**: one row of controls, Show (All · Events · Places, a segmented capsule) and When, both 44px glass. Events are pills with the start time (vermilion when on now); places are round pins with their pictogram, ringed when open now. The places layer is what is open now plus the rooms hosting an event in the chosen window. Pins cluster in screen space; the chosen pin never clusters. Choosing a pin raises a row of cards for what is in view (in the sheet's order); swiping the row moves the choice from pin to pin, and the map slides only when that pin is hidden. Tapping bare map closes the cards. On phones the sheet drags between peek, half and full (a flick goes one stop on); the list drags it too when it cannot scroll that way itself. The locate key rides above the sheet and hides when the sheet is full or cards are up. `?show=events|places` keeps the Show choice.
- **Never empty**: Tonight falls back to the next listed day; empty states name what emptied the list and offer the drop that brings most back.
- Areas print in the names visitors use (`R.area`: Põhja-Tallinna → Põhja-Tallinn, All-linn → Old Town, Kesklinna → City centre).
- Interests (`wa:interests:v1`) give Tonight a "For you" shelf and nothing else. The last visit (`wa:visit:v1`) powers "N new since Thursday".
- Location is asked for only on a tap; when already granted, walking times fill in by themselves.

## localStorage

`wa:appearance`, `wa:city`, `wa:seen:v1`, `wa:follows`, `wa:lists:v1`, `wa:interests:v1`, `wa:visit:v1`, `wanderalt:bookmarks:v1`, `wanderalt:session:v1`. New keys: `wa:` prefix, `:v1` suffix for structured shapes.

## Working locally

- `npm start`, open touched pages at 390 and 1440 in both themes (You → Appearance).
- The service worker serves stale files while debugging. Clear it, and bump `VERSION` in `sw.js` when the shell changes:
  ```js
  caches.keys().then(k => Promise.all(k.map(x => caches.delete(x))));
  navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister()));
  ```
- MapLibre gives its container `position: relative`; `.map-canvas.maplibregl-map` restores absolute positioning.
- Brand icons are SVG masters in `brand/`; `npm run build:icons` rasterises the PNGs and `favicon.ico`.
