# UX deep-read — end-user usability & 2026 design-trends evaluation (June 2026)

A second-pass analysis of the June 2026 screenshot corpus (42-shot smoke set + full-page scroll set + map-default probes — see `ROADMAP.md` § Frontend for the capture method). Where the first pass audited *design-system compliance* (grid, contrast, components), this pass evaluates the same evidence as an **end user**: first-visit comprehension, the filter→result feedback loop, detail-page payoff, and how the product sits against mid-2026 design practice. Numbered findings feed `ROADMAP.md` (F-18…F-22); journey conclusions re-rank the phases there.

Every claim below is tied to a frame in `.screenshots/` or a DOM measurement; nothing is asserted from memory.

---

## 1. The one journey that's broken (everything else is polish)

**Filter → result feedback fails on desktop.** `smoke-desktop-discover-tonight.png` (1280×900) is a user who tapped **Tonight** and got: an active chip, a rail of more chips, and a map pane showing open water. The one matching event and its pin are both below the fold — *zero feedback in the viewport that the filter worked*. On mobile (`smoke-mobile-discover-tonight.png`) the result is reachable but still sits under the full input stack, with the Map FAB partially covering the card.

This compounds three already-filed findings (F-9 water-dominated map default · F-15 rail placement · F-2 FAB occlusion) into a single journey-level failure, and it is the strongest argument for doing F-9 + F-15 *first*, ahead of the cosmetic items. The fix bar is concrete: **after any filter activation at 1280×900, the results count, ≥1 result row, and ≥1 pin must be inside the viewport** (now scenario V-11).

## 2. First-viewport economics

- **Discover (mobile, default):** the first ~1.5 viewports are inputs — banner 240px, standfirst, scope toggle, search, quick pills, +Filters, mood strip — before the first browse content (CURATORS). The default state is a launchpad, which is a defensible editorial choice, but the first *payoff* (a curator row, a section of picks) should crest the first viewport. 2026 practice (Airbnb/Booking/RA redesigns converged here) is controls-compress-content-leads.
- **Search field scale (desktop/wide):** ~1216×64px with a 28px italic placeholder — the visually heaviest element on the page for a secondary action. The scope toggle (used once per session at most) is the next heaviest. The control hierarchy is weight-inverted: the rarest actions are the loudest (F-22).
- **Today (mobile)** is the counter-example and the bar the rest should meet: TONIGHT signal → title → quote → two CTAs, all in the first viewport, voice-first. `smoke-mobile-briefing.png` is the brand argument in one frame.

## 3. Detail pages — payoff asymmetry

- **Venue (pick) detail** pays off: hero, quote, context, "more from" rail. Its flaws are mechanical (F-1 scrim, F-10 repeated fallback quote, F-13 raw markdown).
- **Place detail is a dead end** (`smoke-desktop-place-detail.png`): eyebrow `GALLERY`, title, then the *same word again* ("Gallery") as the kind line, one unlabeled globe glyph, two adjacent map links whose difference is unguessable ("Open in maps ↗" = external app vs "See on map →" = Discover pane — the labels don't say so), and ~85% dead white below. For a page reachable from every Places row and every map pin, this is the weakest end-user moment in the product (F-20). The no-events line ("No events scheduled here right now. Check back, or browse what's on →") is good copy stranded in a bare layout — it wants the `.picks-empty` card treatment.
- **Curator** has the strongest content and a layout bug: the bio measures **142ch per line** at 1280 (measured: 1136px at 16px) against the documented 56–64ch rule — genuinely hard to read, not a nitpick (F-18). Its `Share →` control measures **73×27px**, under the 44px floor, and its selector isn't in verify's committed list, so the harness is structurally blind to it (F-19).

## 4. Promise→affordance mapping

The standfirst sells "…or let the **concierge** match your night," but the only entry to that feature is an unlabeled sparkle glyph inside the search field. Post-2024 sparkle-fatigue is real: the icon reads "generic AI add-on," which is exactly what the brand voice isn't. Label the affordance with the product's own word — "Concierge" — at least on desktop where space is free (F-21). This is the cheapest trust win in the audit.

## 5. Smaller end-user friction (filed, lower priority)

- CURATORS browse rows: trailing bare counts ("63") with no unit; quotes truncate mid-clause with no ellipsis; the Map FAB sits on top of the last visible row (part of F-2).
- City dropdown: all four cities labeled "Live" — a status that only informs when it varies; noise otherwise.
- Category chips are identical across cities (Tallinn's "Craft beer / Vinyl & books / Street art" verbatim in Riga) — fine while true, worth a data-driven pass when city #5 lands.
- Bottom chrome stacking on mobile (glass nav + FAB + content showing through) is the one place the app feels *layered* rather than printed; F-2/F-8 cover the mechanics.

## 6. 2026 design-trends scorecard

**Where WanderAlt is ahead of the field:**
- **Editorial identity against AI-slop fatigue.** Real human voice as the largest element, illustrated city plates, "VOUCHED BY HUMANS", robots.txt blocking AI crawlers — this is precisely the counter-position that 2025–26 award juries rewarded. The brand needs no trend-chasing; the trends came to it.
- **Type system.** Expressive display serif (Fraunces) + workhorse sans (Inter) + mono for machine-ish labels is the canonical mid-2026 editorial stack, self-hosted, with a disciplined scale.
- **Restrained Liquid Glass.** Three chrome surfaces only, with `@supports` fallbacks — matches how iOS 26's material is actually used well, rather than the glass-everything misreads.
- **View-Transition card→hero morphs, `@starting-style` entrances, reduced-motion discipline** — the modern motion stack, used editorially. Nothing to add; the restraint *is* the trend.
- **No cookie banner, no tracking, one-scroll About** — calm-tech credibility most products can't claim.

**Where it trails 2026 practice:**
- **Results-first discovery surfaces** (§1–2): the field consolidated on instant-feedback filtering; WanderAlt's rail-above-results + empty-sea map reads a generation older.
- **Free-floating FAB over a list** is a 2018 Material idiom; 2026 mobile patterns dock view toggles into the bottom chrome (the List|Map control belongs in or beside the nav pill, not floating over content).
- **Control idiom consolidation**: three filter languages (pills / sheet / chips) + an oversized search field where one compact, consistent row would do (F-15 + F-22).
- **Named AI affordances**: the unlabeled sparkle is the one "generic 2024 AI app" tell in the product (F-21).

**Net:** the brand foundation is current and differentiated; the gap to "award-grade 2026" is concentrated in Discover's interaction layer and the two weak detail/empty moments — not in the visual language.

## 7. What this re-ranks

1. **F-9 + F-15 move to the front of Phase 1** (journey-critical; V-11/V-12 are their gates). Scrim (F-1) remains Phase 1 but second.
2. **F-18 + F-19** join Phase 1 as one-line CSS/markup fixes with outsized reading/ergonomic impact (F-19 also patches a harness blind spot).
3. **F-20 place-page rescue and F-21 concierge label** join Phase 3 (component unification) — both reuse existing patterns (`.picks-empty`, labeled button).
4. F-22 folds into the F-15 redesign as its sizing principle: *control weight proportional to use frequency*.

New regression scenarios added to the suite: **V-11** (filter feedback in viewport), **V-12** (map default frame: per-city zoom ≥ ~11.5, city core in frame, every live city present in `CITY_BOUNDS`), **V-13** (no prose block wider than 70ch), **V-14** (generic interactive-control sweep ≥44px — catches controls missing from the committed selector list, e.g. curator Share).

---

## Progress

Implementation status lives in one place: `ROADMAP.md` → "Progress tracker". As of PR #65 (third batch): F-1 (root cause turned out to be a cascade-order bug painting the hero title ink — the scrim was secondary), F-2, F-4, F-7, F-9, F-10, F-12, F-13, F-14, F-15(b), F-18, F-19, F-20, F-21 fixed; F-22 mostly (search-field scale pending under F-16); F-3 partial. The V-14 sweep is live in `verify.js` and caught two controls this document never saw (`taste-skip` at 18px, `map-cluster` at 42px) on its first run. V-11 after F-15(b): results count + first row now in the first viewport at 1280×900 with a filter active; the pin lands one short scroll down — the remaining lever is above-the-pane chrome height (F-16). Fourth batch closed F-5/F-6/F-8/F-11 and extended the width ladder to 1440/1600 (≥1680/≥1920); the English-only content pipeline shipped cloud-side (see ROADMAP § English-only content pipeline).

---

*June 2026 — second-pass (deep) read of the same screenshot corpus; companion to `ROADMAP.md` § Frontend and the per-page audits in `docs/design-audit-*.md`.*
