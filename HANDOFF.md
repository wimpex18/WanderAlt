# WanderAlt — implementation checklist

The design package (`WanderAlt - Direction.dc.html`, Claude Design, Aug 2026) is prose
and drawn screens. It has no checkboxes, so this is the tracked version of it: every
item the direction asks for, as something that can be ticked.

**Rules for this file**

- `- [x]` means *verified in the running app*, with the evidence named. Not "the code
  looks right" and not "I remember doing it".
- An item stays `- [ ]` if it is unverified, blocked, or a deliberate divergence still
  awaiting a decision. Blocked and divergent items say so inline rather than being
  quietly ticked.
- Re-check with `node .scripts/design-spec.js`, then `await waDesignCheck([...])` in the
  browser at the viewport the section was drawn at. That catches missing **text** only —
  layout, spacing and colour still need measuring by hand.

---

## 1 · Data foundations

The direction's own build order puts these first: *"Distance and open-now in every row —
still the dependency for everything."*

- [x] **1a** `WA.Geo` is the single distance module; `haversineM` and `WALK_M_PER_MIN`
      de-duplicated out of `discover.js` and `map.js`.
- [x] **1b** `WA.Hours` parses both filed shapes (OSM and Google `weekday_text`).
- [x] **1c** Rail says when a place *shuts* (`→02`), `24H`, `SHUT`, or nothing when
      hours are not filed, and **never goes blank**.
- [x] **1d** A clock is printed only when one parses. `WA.when.statedMinutes` is the one
      implementation; midnight counts as absent.
      *1c and 1d were both refuted on 404.html*, which I had never opened. `notfound.js`
      was the only rail renderer in the repo that bypassed the time model — it printed
      `picks.time` raw, giving `00:00` on one row and a blank rail on three. The page
      also never loaded `geo.js`, which `statedMinutes` reads the clock through. Both
      fixed; re-measured: 4 rows, rails `FRI FRI THU FRI`, no blanks, no `00:00`.
- [x] **1e** Public holidays modelled (`PH`), four countries, Easter computed.
      Verified: 17 rail cases, per-country diagonal.
- [x] **1f** Geocoding runs for all four cities, not Tallinn only.
- [x] **1g** Opening-hours coverage — **nothing further in code; refresh is automatic.**
      The parser reaches 93.7% *of venues that file hours*; coverage across the whitelist
      is ~45%, because most venues file none. `wa-ingest-osm` runs monthly and is active,
      so anything newly filed in OSM arrives without intervention. The ceiling is what
      OSM contributors enter, which is also why Walks stays three hand-written routes
      rather than a generator (see 7j).

## 2 · The system

- [x] **2a** `wa.css` written fresh; `styles.css` (9,118 lines) deleted, not patched.
- [x] **2b** Glass on exactly two elements, `rgba(242,239,230,.92)` / `rgba(16,24,25,.94)`,
      blur 16px, 1px hairline on the content-facing edge. Measured in both themes.
      *Was refuted once:* the map drawer was a third glass surface, and the one case the
      rule exists to prevent — glass over live content, so rows sat on whatever colour
      panned beneath. Now opaque in the page ground, hairline kept. Re-measured: 2 in
      both themes, in list view and map mode.
- [x] **2c** Sticky chrome reserves real layout height (body reserves 60px).
- [x] **2d** Lime is signal only. *Refuted twice, same root cause both times:*
      `isTonight()` means TODAY, not now. First on 24 card badges, then on 34 `TON` row
      rails — I fixed the badges and ticked the item without checking the rail, which
      is the exact failure this file exists to stop. `TON` is "dated today, no door time
      stated"; it is not now and no longer wears the alarm. Saved and Source applied
      `--now` straight from `isTonight()` and never print `NOW` at all, so the class is
      gone there. Re-measured on discover.html: **4 lime elements, all `NOW`** (was 38);
      index.html: 0.
- [x] **2e** Eight category marks, 1.5px stroke, round caps, no fill; petrol on 9%-petrol
      by day, pale teal on 6%-cream at night.
      *Half-refuted by a census 12 Aug 2026.* Every renderer honoured the rule for a
      photo that is **absent** — and none of them for a photo that is **present and
      404s**, which renders identically: an empty well. Reproduced by pointing a tile's
      `img` at a missing file: it stays in the DOM at full size, `naturalWidth 0`, no
      mark behind it. That is the torn frame the rule bans, and `verify-images` only
      clears dead URLs on a schedule, so a decayed link renders that way until the next
      sweep. One delegated capture-phase `error` listener in `marks.js` now degrades each
      surface exactly the way its own renderer already does when there is no photo (row
      media degrades to *nothing*, so the third grid track collapses and the row reclaims
      112px — never a 96px glyph on a timetable). No inline `onerror`: the CSP blocks it.
      The census also caught an empty list mosaic drawing a blank tinted tile, which
      `wa.css`'s own comment forbids one paragraph above the rule.
- [x] **2f** Marks do both jobs: 44–62px on cards (clamped), 15px in chips and filter
      pills.
- [x] **2g** `--tap-min` 44px holds on every interactive control measured, across index,
      discover (list, sheet open, empty), saved, detail, profile, about **and walk**.
      *Was refuted:* `.wa-detail__more` measured 34.66 × 44 — `padding: 0` with no
      `min-width`, so it collapsed to the width of the word "more". A target you clear
      vertically and miss sideways. WCAG 2.2 exempts inline text buttons; this repo's
      rule does not. Now 44 × 44.
      *Refuted a second time, 12 Aug 2026, and the tell was in the tick itself:* the
      list of pages above did not include **walk.html**, so nothing had ever measured
      it. All four stop links on the Telliskivi route were **291 × 22** — a single line
      of title type, half the floor, and inconsistent with the one stop whose name
      wraps and therefore passed at 291 × 44. Fixed the way the map pin already does
      it: an invisible hit area centred on the name, so the target reaches 44 without
      the layout moving or the note being pushed away from its title. Re-measured: all
      four at 44, adjacent stops' hit areas do not touch, and a probe 8px above the
      text now resolves to the link. **When an audit item names the pages it covers,
      the pages it does not name are the finding.**
- [x] **2h** Radii, spacing scale and the `--reading-max` ladder unchanged.
- [x] **2k** Geometry audit — alignment, control size, type scale, painted overlap.
      Swept every public page at 375 / 768 / 1440, both themes, at three scroll
      positions, plus the filter sheet and map mode. Result after the fixes below:
      **no painted text overlap anywhere**, every `.wa-btn` exactly 48px
      (`--control-h`) on every page and state, every `<main>` child sharing one left
      edge, no computed font size off the token scale, no Fraunces under its 17px
      floor, and every focusable control carrying both an accessible name and a
      visible focus ring (49 on Tonight, 68 on Explore, 12 on a walk).
      Three real defects came out of it:
      **(a)** The Explore walk card's eyebrow and title are `<span>`s with no
      `display`, so they were inline: `A WALK` shared a line with the title and the
      title's `margin: 12px 0 8px` was silently discarded, leaving the blurb hard
      against it. Both are `display: block` now — measured 12px above the title and
      8px below, exactly what the rule asked for.
      **(b)** The offline banner hard-coded `color: #fffdf8`, which is `--card`'s day
      value, over a `--warn` ground that inverts between themes. 7.6:1 day but
      **2.71:1 dusk**, under the 4.5:1 AA floor. Now `var(--ground)` — 6.72:1 and
      6.97:1 — with no new token, because the banner is an inversion.
      **(c)** The rail's neighbourhood was allowed the track plus the *whole* 16px
      column gap, so a clipped value's ellipsis sat flush against the title while an
      unclipped row kept 12px. Half the gap instead: 8px of clearance on every row,
      and the common names still show in full.
      The method matters as much as the result, and is written up in CLAUDE.md: use
      the **box** on an element that clips and the **ink** on one that does not.
      Backwards, and line-clamped card titles report overlaps they cannot paint while
      a genuinely escaping rail reports none.
- [x] **2i** Type fork (6a) — **landed.** Plus Jakarta Sans is the chrome face; Inter is
      out of the public token set. Two files, not four: Google ships v12 as a variable
      font, so one woff2 per subset carries the whole 200–800 axis. Both `latin` and
      `latin-ext` ship, because Estonian õäöü are Latin-1 but Latvian ā ē ķ ļ and
      Lithuanian ą č ė ų are U+0100+ — shipping `latin` alone would have rendered
      Āgenskalns, Mežaparks and Šnipiškės in a fallback, i.e. three of four cities
      quietly wrong. `unicode-range` means a Tallinn reader never downloads the second
      file. Verified: both faces report `loaded`, and canvas measurement confirms both
      latin and latin-ext render as Jakarta rather than the system fallback. The Inter
      woff2 files stay on disk for `admin-tokens.css` only — 6e's verdict on admin is
      "keep, not redesigned", and no public page loads that stylesheet. `sw.js` bumped
      to v2 so a held v1 shell cannot keep a font the CSS no longer asks for.
- [ ] **2j** 5g's open question — a geometric sans for headlines too, with Fraunces kept
      only for timetable rows. Now **judgeable for the first time**, since 2i has landed
      and Explore is finally rendering in the face the direction specified. The designer
      offered to draw the fork; whether to ask for it is an aesthetic call that belongs
      to the owner, not a gap in the build.

## 3 · Explore (5a phone, 5b desktop)

- [x] **3a** Where / When / What capsule, one control, search key inside it.
- [x] **3b** Capsule compact and centred on desktop (840px), not full-bleed.
- [x] **3c** Four scope tabs — All, Tonight, Places, **Walks** — icon over label,
      underline on the active one.
- [x] **3d** On desktop the scope tabs **are** the masthead; the four app tabs are a
      phone pattern (5b draws no app nav, 5d's header is the capsule's answers).
- [x] **3e** Saved strip between capsule and first shelf, and the desktop route to Saved.
- [x] **3f** Named carousels with a count in the subtitle; 6-up at 1280 with the
      "See all N as a timetable" bridge as the last cell.
- [x] **3g** "Open right now" is bounded to a 20-minute walk when location is known, and
      says so; unbounded and honestly labelled when it is not.
- [x] **3h** Walks scope: "Tallinn · this weekend / Walks we assembled", routes labelled
      "N stops · X km" with the distance computed from the legs.
- [x] **3m** Walk-in-progress: Skip works more than once, and skipping everything is
      an answer rather than a blank page.
      Found auditing pages this branch had not touched (12 Aug 2026). `skipped` holds
      indices into `r.stops`, but the Skip button emitted the index into the already
      *filtered* list — right by coincidence for the first press, wrong for every one
      after it, because skipping the new first stop re-added 0 to a set that already
      contained 0. Measured: the counter went "Stop 1 of 4" → "1 of 3" and then froze,
      so **only one stop could ever be skipped** on a feature whose own copy says
      "Skipping a stop re-times the rest of the walk". The button now carries the
      original index; re-measured 4 → 3 → 2 → 1 with the venue name advancing each
      press, and Undo restores exactly the stop it removed.
      Fixing it made a second bug reachable that had been sitting behind the first:
      with every stop skipped, `live.length` is 0, `idx` computes to -1, and
      `sch.stops[-1].state` throws — a blank page. It now renders a named empty state
      with the way back to the route.
      Chasing *that* found a third, which had been throwing in production the whole
      time. `resolve()` drops any stop whose venue is not in the catalogue, and
      `load()` renders as soon as walks.json lands — well before the Supabase
      catalogue does. So every cold load of a `/walk.html?stop=N` URL threw on
      `stops[-1]`, was silently recovered by the re-render on `wa:catalog-ready`, and
      left nothing but a console error nobody was reading. The two empty cases are now
      told apart, because they are not the same thing: no stops **resolved** says the
      catalogue has not arrived and it fills in on its own; no stops **left** says you
      skipped them. Calling the first one "you skipped every stop" would have been a
      fact about our load order dressed up as something the reader did.
- [x] **3i** "Get the Saturday email" in the desktop masthead.
- [x] **3j** Card anatomy: square well, one badge top-left, bookmark top-right, title
      2 lines never truncated, two mono lines (distance · area, then kind · time/price).
- [x] **3k** Digest card at the foot of Explore.
- [x] **3l** "Locals kept coming back to" shelf — **deliberately absent, decision
      recorded.** It ranks by save count and the bookmarks table has no rows; a
      popularity shelf invented from nothing is the kind of claim this redesign removed
      everywhere else. The reason is in `explore.js` so it returns when there is
      something to count. Nothing outstanding.

## 4 · Tonight and the map (5d, 2a, 2b, 3a)

- [x] **4a** Four facets collapsed to the capsule plus one filter sheet.
- [x] **4b** Seven-day density strip as Tonight's header; counts from the same filter
      chain as the rows; a genuinely empty day gets no bar.
- [x] **4c** Rows lead with the rail (time, then distance), never a photo.
      *Refuted 12 Aug 2026 on the rail's second line.* The 52px track is sized for a
      measured distance ("450 m"); the NEIGHBOURHOOD fallback, shown before location
      is granted, does not fit. Measured at 375: 13 of 30 rows overran the track, and
      `Telliskivi` (71px of ink) crossed **into the title column** by 2.4px, while
      `Põhja-Tallinn` wrapped and made that rail three lines where every other was two.
      The line may now use the track plus the 16px column gap and is clipped at the
      column boundary. That leaves the 27 unaffected rows pixel-identical, costs no
      list height, and truncates 3 rows instead of the 14 a plain ellipsis at 52px
      would have. Widening the track to 72px was measured and rejected: it truncated
      nothing but took 20px off every title forever (5 two-line titles → 7, list 116px
      taller) to buy a state that disappears the moment permission is granted — and
      widening only *while* the fallback shows is barred, because the rail must not
      reflow when permission arrives. Re-measured on Tonight, Saved, Source and You:
      0 rows entering the title column, 0 multi-line rails.
- [x] **4d** Map is a mode, and carries a way out, "Search this area", and a drawer of
      the picks in view.
      *Refuted 12 Aug 2026, and the tick was the problem.* All three were in the DOM,
      which is what "verified" had meant here — but the bar and the drawer were both
      `position:absolute; bottom:0` at the same `z-index:3`, so the drawer, later in the
      DOM, painted straight over the bar. Measured at 390: bar 679–752, drawer 541–752.
      The pin count and "Show list" were invisible at every width below 1024, i.e. the
      mode had no visible way out on any phone, for as long as this item has been ticked.
      Now one `.tonight-map__foot` stacks them; re-measured: bar 541–614, drawer 614–752,
      no overlap, both hit-testable, foot still 42% so the map keeps the larger half.
      **The lesson is about the evidence, not the bug**: `querySelector` finds an element
      that another element is painted on top of. Hit-test the centre of a control
      (`elementFromPoint`) before calling it present.
- [x] **4e** Pins carry time · distance, and time alone only when location is unknown.
- [x] **4i** Pins cluster with a count, and the layer tracks the camera.
      A pin here is a ~90px label, so at city zoom the Old Town was an unreadable pile:
      106 placed picks drew 106 overlapping labels. Clustered in projected pixel space
      (these pins are DOM nodes over the canvas, not a GeoJSON source, and swapping
      sources would mean rewriting the pin↔row pairing). Petrol, never lime — a count is
      not "now". The selected pin never clusters, so the pairing survives.
      Found on the way: **the pin layer never followed the camera at all.** `place()` ran
      on sync/open/focus and nothing else, so a `jumpTo` a tenth of a degree east left
      every pin at its exact `left`/`top` — labels detached from the city on the first
      drag, and had done since the layer was written. Now bound to `move`.
      *That fix was itself wrong on the first cut, and review caught it.* Binding the
      whole of `place()` to `move` dragged the DRAWER along per frame: 14.8ms a frame
      against a 16.7ms budget, and — worse — `drawer.innerHTML` was rewritten on every
      frame of a drag, so a keyboard user focused on a drawer row had focus thrown to
      `<body>` and any scroll position in the drawer was lost. Split: `placePins` on
      `move`, `placeDrawer` on `moveend`, and the drawer write is skipped when the
      resulting markup is unchanged, which is the common case when panning within the
      same visible set. Re-measured by firing `move` alone (a `jumpTo` fires `moveend`
      synchronously and so hid the bug): **1.31ms a frame, focus and scroll survive**;
      `moveend` with an unchanged view costs 0.4ms and does not touch the DOM.
      Verified: 106 → 22 nodes; sum of cluster counts + solo pins = 106 at zoom 12.4 and
      again at 15; clusters re-form on zoom (13/9 → 22/18); contrast 8.14:1 day,
      10.57:1 dusk; tap target 44 × 44 via the pin's `::after`, visual 34 × 34.
      **The cluster-tap zoom is now verified, by removing the need to watch it.**
      The preview pane's document reports `visibilityState: hidden`, so rAF never
      ticks and MapLibre's tween genuinely cannot run there — measured, not assumed
      (0 rAF callbacks in 1s). Instead the destination is asserted directly: the tap
      lands on exactly what `map.cameraForBounds()` computes for the same bounds,
      padding and maxZoom (12.4 → 13.26, centre 24.7450,59.4340 → 24.7497,59.4377),
      and clusters re-form 13 → 17. What remains unobserved is only MapLibre's own
      tween between two states we have both pinned, which is library code.
- [x] **4j** Camera moves honour `prefers-reduced-motion`.
      Found reviewing 4i: `wa.css` respects the setting in three places and
      `view-transition.js` checks it before naming a transition, but **no camera move
      did** — `fitToPicks` and `flyTo` both hard-coded `duration: 480`, and a map
      easing across the viewport is precisely the large-area motion the setting exists
      for. Fixed in `map-tiles.js` rather than at the call sites, so the fit when the
      mode opens, the flyTo on row focus and the new cluster zoom all take it from one
      place. Reduced motion does not mean "do not go there" — the destination is
      identical, it just arrives without the tween, which is also what made 4i
      verifiable in a pane that cannot animate.
- [x] **4f** Retired params (`?ai=`, `#mood=`, `?nhood=`) drop silently and still render
      a list. Verified: 34 rows, URL rewritten clean.
- [x] **4g** Night is the same layout at different values; no layout switch.
- [x] **4h** Map's way out — **deliberate divergence, decision recorded.** 5d draws
      "Show list" on the drawer; we spell it as the symmetric "List" key in the chrome,
      paired with "Map". 2a's actual requirement is "a way out", and there is one.
      *"Verified present in map mode" was true of the DOM and false of the screen, in
      both places at once* (12 Aug 2026). The drawer's "Show list" was under the drawer
      (see 4d). The chrome's "List" key was worse, because the divergence had made it
      the only remaining way out: the chip row and controls scroll with the page, so
      with the map centred in the viewport `#scope` measured `top: -47` — behind the
      glass top bar. Both escapes gone at once, on the item that exists to guarantee one.
      The chips and the Filters/List keys now stick under the top bar in map mode
      (below 1024 only; from 1024 the map is a companion column and the chain never
      leaves the screen). Opaque paper, not a third glass surface. Re-measured: head at
      `top: 56` under a 56px bar, chips and Filters both hit-testable with the map
      centred, list mode pixel-identical to before (gaps 24/12/0/32, checked by stash).
      The divergence itself stands; what needed fixing was that neither spelling of it
      was reachable.

## 5 · Detail, Source, Saved, You (3b, 5f, 6c)

- [x] **5a** One detail template for both shapes; `venue.html` and `place.html` deleted.
- [x] **5b** Provenance closes every detail page; `via <handle>` replaces the byline.
- [x] **5c** A missing description gets a sentence, not blank space — on Tonight *and*
      on detail, which previously printed nothing.
- [x] **5d** A description that only paraphrases the title counts as missing
      (`WA.UI.descriptionOr`). 49 of 462 live picks were restatements.
- [x] **5e** `source.html` replaces `curator.html`; follow store added.
      *"Added" was the whole of it, and that was the gap* (12 Aug 2026). `WA.Follows`
      was written by `source.js` and read only by You's chip list — no list, shelf or
      facet consumed it, so following a venue changed nothing a reader could see. It now
      drives **"Only sources I follow"** in Tonight's filter sheet.
      The reconciliation is the part worth recording: the store holds two different kinds
      of key, because `?venue=` follows the venue name while `?handle=` follows the venue
      name *only when* the feed's picks share exactly one venue, and otherwise falls back
      to the raw handle. A pick matches if either its venue or its handle is followed —
      the complete set of what `toggle()` can write, not a guess.
      Zero-count follows 2a: the switch is **disabled and dimmed, never hidden**, saying
      where follows come from. Verified through the real UI: venue follow 315 → 15 rows
      (including one pick under a *different* handle, correctly matched on venue); handle
      follow → 34 rows, 19 by handle + 15 by venue, none unmatched; counts come off the
      same filter chain, so the switch's sub cannot disagree with its list.
- [x] **5f** Saved sorts by expiry, lists as mosaics, dead-listing notice; city chips
      conditional on more than one city.
- [x] **5g** You is three counts plus the inference sentence and a reset; Appearance is
      a three-way; source count as the footer.
      **"Opened earlier" added** (12 Aug 2026): the opened/saved log already existed and
      You printed only its *length*. A count is a claim the reader cannot check; the list
      is the receipt this page says it is. Last 8 resolvable entries, newest first, in
      the ordinary row component. `hours.js` added to `profile.html` — the place rail
      needs it and that is not an optional dependency.
      The subline reads `8 OF 14 · NEWEST FIRST` and deliberately claims **nothing**
      about the remainder: the browser loads less than the database holds (picks exclude
      archived rows, venues are filtered to `VENUE_KINDS`), so "3 no longer listed" would
      be a fact about our cache dressed as a fact about the world.
- [x] **5h** Add-to-list lives on detail, not on a Saved row.
- [x] **5i** Share routed through `WA.Share`; per-pick `.ics` deleted as superseded by
      the subscribable feed.
- [x] **5j** Apple sign-in (6c) — **dropped by owner, decision recorded.** No Apple
      developer account, so the provider cannot be configured. `auth.js` and `you.js`
      were reverted to their pre-Apple state and email + Google verified working.
      Nothing outstanding.

- [x] **5k** The offline banner is actually visible.
      6f#5 backed the offline *claim* — the worker caches the shell and the last
      picks/venues responses, and the banner prints how stale the list is. What was
      never checked is whether anyone could see it. `wa.css` gives it
      `position: sticky; top: var(--topbar-h)` and its own comment says it "sits under
      the top bar rather than over the tab bar, because the toast owns that slot";
      `offline.js` appended it to `<body>`. A sticky element cannot travel up past its
      own place in the flow, and its place was the end of the document. Measured on
      Tonight: the banner rendered at y=4589 of a 4724px page — **3,852px of scrolling
      to discover you were offline** — and mid-screen on a short page like Saved.
      Now inserted after `.wa-topbar`. Re-measured: visible on load at top 56 under a
      56px bar, still stuck at 56 after scrolling 1200px, and it reserves its own
      58px so the first row moves down rather than being covered. No collision with
      the toast, which owns the opposite edge.

## 6 · Sheets, states, About (5c, 6d)

- [x] **6a** One question expanded at a time; Where sheet grouped Nearby / Live cities /
      Not live yet, with "Around me".
- [x] **6b** Zero-count filter options disabled, never hidden.
- [x] **6c** Every toggle prints its consequence; the primary key names the outcome
      ("Show 18 gigs").
- [x] **6d** Kind pills carry their category mark at 15px.
- [x] **6e** Placeholder kinds refused — the sheet was offering an option labelled
      `null`.
- [x] **6f** Empty and error states name the filter that emptied the list; banned copy
      absent ("No results found", "discover" as a verb, em-dashes in headlines).
- [x] **6g** One toast at a time, above the tab bar, always with a reverse action —
      enforced in `WA.Toast`, which refuses actionless toasts.
- [x] **6h** About carries the source count and the four city plates.
- [x] **6i** Offline claim backed by a real service worker; banner prints how stale.
- [x] **6j** Calendar feed reachable — About prints the per-city subscribe URL.

## 7 · Pipeline, deploy, docs (6e, 6f, 4a)

- [x] **7a** Deletions done: `taste.js`, `taste-flag.js`, `mood-chips.js`, `search.html`,
      `map.html`, `discover-redirect.js`, the Concierge entry point.
- [x] **7b** `_redirects` updated; no bare→`.html` rules.
- [x] **7c** `send-digest` open-relay closed; gated on the service-role key in code.
- [x] **7d** `calendar-feed` v2: honest description, `detail.html` links, no quote marks.
- [x] **7e** `process-staging` v43: curator-voice prompt removed, 4a's rule stated and
      enforced in code by `saysSomething()`.
- [x] **7f** Untrusted text escaped at the interpolation site; DB URLs through
      `WA.UI.safeUrl`.
- [x] **7g** CLAUDE.md and README brought current; the spec tooling documented.
- [x] **7h** `draft-column` — **deleted.** It drafted a weekly editorial column
      attributed to a `curator_handle`, on a product whose curators the redesign
      removed, and nothing public ever rendered it. Repairing it would have restored a
      deleted product's feature, so the decision went the other way: cron
      `draft-column-weekly` unscheduled, function source removed, the admin panel and
      its 145 lines of wiring removed. The `columns` rows are **left in the database on
      purpose** — 16 real drafts from July; deleting them buys nothing and no surface
      reads them. Verified: 30 cron jobs, 0 inactive. Removing the edge function from
      the dashboard list is the one cosmetic step left.
- [x] **7i** `classify-moods` and `match-pick` — **already neutralised, verified.** I had
      been carrying these as an open risk; they are not one. Both deployed functions are
      410 tombstones, confirmed by invoking each through `invoke_wa_fn`: `410` with
      `"classify-moods was retired in the Aug 2026 redesign along with Mood."` and the
      matching line for the Concierge. Deleting the directory would not have undeployed
      them, which is exactly why a tombstone was the right shape. No cron references
      either. Dashboard removal is cosmetic.
- [x] **7j** 6b's decision metric — **decided: no telemetry, and Walks stays as it is.**
      The metric would need first-party event tracking on a product whose About page and
      CLAUDE.md both promise no analytics and no third-party scripts. Building it to
      satisfy a two-week experiment would trade a stated product value for a number, and
      the number could not justify the generator anyway: that needs hours coverage the
      catalogue does not have (1g, ~45% of the whitelist). So Walks keeps its three
      hand-written routes — built, honest, cheap, and still deletable — and its future is
      a judgement rather than a measurement. Recorded here so it is not reopened as an
      oversight.
