# Design brief

For a Claude Design session or anyone redesigning a screen. Current state only: when a decision changes, change it here.

## Product

WanderAlt answers: *what is worth walking to in Tallinn tonight, and what do I do after it?* Independent and alternative culture (DIY gigs, club nights, arthouse film, contemporary art and dance, talks, record and flea markets) and the places around it (record shops, bookshops, galleries, thrift, small cinemas, clubs, theatres, bars).

**Audience, in order:** travellers staying 2–5 days; English-reading expats; locals who don't follow every channel. They decide on the day, on a phone, often already out.

**Every row answers four things:** when (a time), how far (walking minutes), what it is (kind, price), who says so (the venue or channel it came from).

**The idea (Night Guide):** the unit is the *evening* (two to four stops on foot), not the event card. Places carry the guide and events give it a clock. Fienta and the like are the cashier we link to; we are the guide. Not every bar: places are **picked** by hand, with one honest line on why.

## Identity (decided 2 Oct 2026)

- Vermilion `#d83a14` and white, Geologica, the glass bars, the splash. Not black and yellow.
- **Labels:** round flat discs of Tallinn objects with a faint groove ring (`icons.js`); a logo or photo wins, the disc is the fallback. Not Meetup's offset stickers, not Airbnb's 3D.
- A route is a spine: time, square node, stop; the listing is the one filled node.
- No sparkle icon for "ask" (Airbnb, Meetup and Bend all use it). Four tabs: Tonight, Guide, Map, Saved; You is the avatar. Sign-in is one sheet, link first.
- Design canvas from the first pass: https://claude.ai/artifact/41QjFPZyhwnY68ugNeespd (25 boards, light and night; it predates some shipped details).

## What exists

Tonight (route card, day tabs, a time-ordered list, Near me) · Programme (all listings, paged, filters, search that reads sentences) · Guide (`places.html`: picked places by kind) · Map · Route page · Event and venue pages · Saved · You · sign-in sheet. Details: `docs/frontend.md`.

Live data: about 600 events a fortnight, about 430 places (31 picked), all Tallinn. Titles arrive in Estonian or Russian with an English title and summary added. Half the venues have hours, a minority photos, 58% of events a price. **Design for missing data**: no photo, no hours, no time, no price.

## What users told us

**27 Sep, first review:** English must lead; search first; an empty night must say "still going"; a weak map; area names people know; no reason to come back. Mostly addressed; the map and return reasons are still thin.

**2 Oct, two interviews, shown the version before the redesign** (so some of this may already be answered; ask them again on the new one):

| They said | Now |
|---|---|
| Tapping an event's title should open its details | Every row and card is one link to its page; the route card opens the route, not its stops, and nothing shows that a row is tappable. Which screen they tried is unknown. |
| Don't make me scroll filter chips (gigs, club nights, film…); I often don't know what I want. Austria took hours | Tonight still opens with a row of kind chips. Routes and the plan search help, but there is no mood-led start. |
| A ceiling of about €20 a person, or free only | A Free switch on the Programme; "under 20" works in a typed sentence. Nothing on Tonight, and routes show no cost. 47 events are free, 298 priced, 251 have no price listed. Places carry no price. |
| Focus on today and tonight; plan the evening; after Philly Joe's, show a few real, reviewed places nearby by mood | Built: route card, More evenings, plan words in search. Not built: "what next from here" on an event or place page (designed on the canvas), options by mood. We hold no reviews and have no free source for them; "picked" plus a link out is the honest version. |
| Onboarding by mood: listen or dance, craft bar, board games | None. "Your taste" on You holds up to three kinds. |
| (noticed here) craft beer bars and board games | Not covered. The OSM catalogue reads arts, cinema, clubs, community, theatre, galleries and shops; bars only appear as event hosts. Three craft-beer places exist unpicked (Beer&Barrel, Hiiu Õlletuba, Pühaste Taproom). No board-game place or event exists. Needs new sources and kinds, then moods. |

## Open questions

- Moods: how many, what are they, and do they replace the kind chips on Tonight? Each mood should map to listing kinds and place kinds and feed the route.
- Budget: one control (free / up to €10 / up to €20) or a default cap on You? Unknown prices must be handled honestly, not hidden or assumed free.
- A "what next from here" block on event and place pages: how many options, nearby how far, by mood?
- The Guide page: neighbourhood chips, nearest first, add to a route. To be challenged before it is built.
- Visible complexity is the cost of every idea above. Fewer elements wins.

## Constraints

- Static HTML, one stylesheet (`wa.css`, tokens as CSS variables), vanilla JS; no framework, so `/design-sync` (React components) doesn't apply. Strict CSP: no inline scripts, no third-party scripts or analytics, self-hosted fonts.
- WCAG 2.2 AA: 44 px targets, visible focus, `prefers-reduced-motion`. Listing text is untrusted: titles may run three lines, be all caps or Cyrillic.
- Free tiers and free models only. Never guess a photo from a name.
- Check at 390 and 1440 px, light and dark.

## Do not use

Cream backgrounds, italic accent words, numbered section labels, monospace for every small label, a generic grid of identical rounded cards, emoji, purple-to-blue gradients, anything that looks like Google Maps or a booking site.

## Voice

Handles start with `@`; no exclamation marks; no marketing register; never "discover" as a verb; metadata reads "Area · kind · day + time".
