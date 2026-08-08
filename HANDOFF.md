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
- [x] **2f** Marks do both jobs: 44–62px on cards (clamped), 15px in chips and filter
      pills.
- [x] **2g** `--tap-min` 44px holds on every interactive control measured, across index,
      discover (list, sheet open, empty), saved, detail, profile and about.
      *Was refuted:* `.wa-detail__more` measured 34.66 × 44 — `padding: 0` with no
      `min-width`, so it collapsed to the width of the word "more". A target you clear
      vertically and miss sideways. WCAG 2.2 exempts inline text buttons; this repo's
      rule does not. Now 44 × 44.
- [x] **2h** Radii, spacing scale and the `--reading-max` ladder unchanged.
- [ ] **2i** Type fork (6a) — **blocked on the font files.** `--ff-ui` names Plus Jakarta
      Sans first and falls through to Inter, so the product's chrome face is still Inter.
      Verified the landing path is genuinely one step: the two `@font-face` blocks are
      written and commented out in `wa.css` with the reason (declaring them now would
      404 on every page load). *Unblocks when:* `plus-jakarta-sans-600.woff2` and
      `-700.woff2` are dropped into `fonts/` — then uncomment those two blocks and
      delete the four Inter files and their rules. No layout changes.
- [ ] **2j** 5g's open question — a geometric sans for headlines too, with Fraunces kept
      only for timetable rows. The designer offered to draw that fork. **Owner's call,
      and it cannot honestly be judged until 2i lands**, since the question is whether
      Explore reads stiff *with Jakarta in place*.

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
- [x] **4d** Map is a mode, and carries a way out, "Search this area", and a drawer of
      the picks in view.
- [x] **4e** Pins carry time · distance, and time alone only when location is unknown.
- [x] **4f** Retired params (`?ai=`, `#mood=`, `?nhood=`) drop silently and still render
      a list. Verified: 34 rows, URL rewritten clean.
- [x] **4g** Night is the same layout at different values; no layout switch.
- [x] **4h** Map's way out — **deliberate divergence, decision recorded.** 5d draws
      "Show list" on the drawer; we spell it as the symmetric "List" key in the chrome,
      paired with "Map". 2a's actual requirement is "a way out", and there is one.
      Verified present in map mode. Nothing outstanding.

## 5 · Detail, Source, Saved, You (3b, 5f, 6c)

- [x] **5a** One detail template for both shapes; `venue.html` and `place.html` deleted.
- [x] **5b** Provenance closes every detail page; `via <handle>` replaces the byline.
- [x] **5c** A missing description gets a sentence, not blank space — on Tonight *and*
      on detail, which previously printed nothing.
- [x] **5d** A description that only paraphrases the title counts as missing
      (`WA.UI.descriptionOr`). 49 of 462 live picks were restatements.
- [x] **5e** `source.html` replaces `curator.html`; follow store added.
- [x] **5f** Saved sorts by expiry, lists as mosaics, dead-listing notice; city chips
      conditional on more than one city.
- [x] **5g** You is three counts plus the inference sentence and a reset; Appearance is
      a three-way; source count as the footer.
- [x] **5h** Add-to-list lives on detail, not on a Saved row.
- [x] **5i** Share routed through `WA.Share`; per-pick `.ics` deleted as superseded by
      the subscribable feed.
- [x] **5j** Apple sign-in (6c) — **dropped by owner, decision recorded.** No Apple
      developer account, so the provider cannot be configured. `auth.js` and `you.js`
      were reverted to their pre-Apple state and email + Google verified working.
      Nothing outstanding.

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
