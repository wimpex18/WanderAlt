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
      hours are not filed. Verified: 67 rows, no `00:00`.
- [x] **1d** A clock is printed only when one parses. `WA.when.statedMinutes` is the one
      implementation; midnight counts as absent.
- [x] **1e** Public holidays modelled (`PH`), four countries, Easter computed.
      Verified: 17 rail cases, per-country diagonal.
- [x] **1f** Geocoding runs for all four cities, not Tallinn only.
- [ ] **1g** Opening-hours coverage — **blocked on data, not code.** The parser reaches
      93.7% *of venues that file hours*; coverage across the whitelist is ~45%, because
      most venues file none. Above the 70% floor for what exists, below it for the
      catalogue as a whole, which is why Walks stays three hand-written routes rather
      than a generator. *Unblocks when:* more sources carry hours — `ingest-osm` already
      captures the tag, so a re-sweep picks up anything newly filed in OSM, but the
      ceiling is what OSM contributors have entered.

## 2 · The system

- [x] **2a** `wa.css` written fresh; `styles.css` (9,118 lines) deleted, not patched.
- [x] **2b** Glass on exactly two elements, `rgba(242,239,230,.92)` / `rgba(16,24,25,.94)`,
      blur 16px, 1px hairline on the content-facing edge. Measured in both themes.
- [x] **2c** Sticky chrome reserves real layout height (body reserves 60px).
- [x] **2d** Lime is signal only. Verified after fixing 24 card badges that painted lime
      for anything merely happening today.
- [x] **2e** Eight category marks, 1.5px stroke, round caps, no fill; petrol on 9%-petrol
      by day, pale teal on 6%-cream at night.
- [x] **2f** Marks do both jobs: 44–62px on cards (clamped), 15px in chips and filter
      pills.
- [x] **2g** `--tap-min` 44px holds on every interactive control measured.
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
- [ ] **7h** `draft-column` — **blocked on an owner decision, not on code.** It is a
      curator-era feature with no public surface: reads `curators`, writes `columns`
      tagged `curator_handle`, rendered nowhere but admin. 16 rows, none since 4 Jul.
      Deployed v20 is pinned to the decommissioned `llama-4-scout`, so every call 404s
      and its cron is off. I deliberately have **not** redeployed it: doing so would
      make a deleted product's feature work again, which presumes the decision. The
      exposure meanwhile is near zero — inert, and idempotent per city per week.
      *Unblocks when:* you say delete (function + cron + `columns` table + the admin
      panel) or keep (then it gets the model fix, `verify_jwt: true`, and its cron
      repointed through `invoke_wa_fn`).
- [ ] **7i** `classify-moods` and `match-pick` are tombstoned but still ACTIVE.
      Confirmed inert: no cron references either, `classify-moods` last ran 4 Jul and
      `match-pick` has never written a log row. Both are `verify_jwt: true`, so they are
      not open to the internet. Sources are in the repo, so deletion is recoverable.
      *Unblocks when:* you delete them in the Supabase dashboard — the MCP has no delete
      verb and the Management API needs an access token I do not hold.
- [ ] **7j** 6b's decision metric — **a product and privacy decision, not a code task.**
      Walks ships, but "third-stop opens ≥25%" has nothing counting opens, and the site
      carries no analytics by design. *Unblocks when:* you decide whether first-party,
      aggregate-only telemetry is acceptable. Without it the two-week test cannot
      return a number and Walks' fate is decided by judgement instead.
