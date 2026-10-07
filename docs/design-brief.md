# Design brief

For a Claude Design session or anyone redesigning a screen. Current state only: when a decision changes, change it here.

## Product

WanderAlt answers: *what is worth walking to in Tallinn in the next few hours, and what do I do after it?* Independent and alternative culture (DIY gigs, club nights, arthouse film, contemporary art and dance, talks, record and flea markets) and the places around it (record shops, bookshops, galleries, thrift, small cinemas, clubs, theatres, bars). It is as much a day-trip guide as a night guide: bars and clubs are the smaller job.

**Audience, in order:** travellers staying 2–5 days, often on a day trip; English-reading expats; locals who don't follow every channel. People on their own, in two, or in a group: most venues and events suit all of them, and where a format is built for strangers to mix (quiz, chess, craft nights) it says so. They decide on the day, on a phone, often already out.

**Every row answers four things:** when (a time), how far (walking minutes), what it is (kind, price), who says so (the venue or channel it came from).

**The idea (Night Guide):** the unit is the walk (two to four stops on foot), not the event card. Places carry the guide and events give it a clock. Fienta and the like are the cashier we link to; we are the guide. Not every bar: places are **picked** by hand, with one honest line on why.

## Identity (decided 2 Oct 2026, revised 3 Oct)

- Vermilion `#d83a14` and white (with two small signals: green for open and free, blue for you and walking), Geologica, the glass bars, the splash. **No black surfaces**: ink `#24222c` is for type only; selection is tinted glass with a vermilion ring, the one primary action is a vermilion gradient, the page sits on a soft daybreak gradient, and the dark theme is warm charcoal like Claude's (`#262624`), not flat black and no longer violet (owner, 4 October). Glass only where it floats; it bends a gradient, never a photo.
- **Labels:** round flat discs of objects with a faint groove ring (`icons.js`); a logo or photo wins, the disc is the fallback. Moods use the same discs (a framed picture, a microphone on stage, a mirror ball, a record player, a pencil, a pint of craft beer), so a mood looks like the rows it leads to. Not Meetup's offset stickers, not Airbnb's 3D. A few hand-drawn sketches (the Old Town skyline on the route card) with a small wobble, one line weight, where a screen has room and a job.
- A route is a spine: time, square node, stop; the listing is the one filled node. The thread is a vermilion gradient.
- No sparkle icon for "ask" (Airbnb, Meetup and Bend all use it); search uses the glass. Four tabs: Now, Map, Saved, You; the header holds search, language and theme. UI icons are two-tone (a line and a soft body), solid when selected. Sign-in is one sheet, link first.
- Design canvas: https://claude.ai/artifact/9UrJzeMvP9vtHz6MdaJUV4 (the second look: audit, data check, research, designs, questions; supersedes the first pass at https://claude.ai/artifact/41QjFPZyhwnY68ugNeespd).

## What exists

Now (one search field, mood/price and Near keys, a compact walk disclosure opening Walk it and Another, one switch between the day's events (with a row of their kinds) and the picked places (with a row of place types); moods Art & film, Live music, Club nights, Records & books, Workshops & talks, Craft beer, several at once, each narrowable) · Programme (all listings, paged, filters, search that reads sentences) · Guide (`places.html`: picked places nearest first, from a stated start) · Map · Route page · Event and venue pages (each ending in After this) · Saved · You · sign-in sheet. The interface is English, Estonian, Russian and Ukrainian. Details: `docs/frontend.md`.

Live data (3 October): about 400 events a fortnight, about 440 places (44 picked: three museums, ten craft beer places), all Tallinn. Titles arrive in Estonian or Russian with an English title and summary added. About a fifth of upcoming listings have a date and no time; a third no price; three in ten no picture; about half of the picked places have hours. **Design for missing data**: no photo, no hours, no time, no price.

## What users told us

**27 Sep, first review:** English must lead; search first; an empty night must say "still going"; a weak map; area names people know; no reason to come back. Mostly addressed; the map and return reasons are still thin.

**2 Oct, two interviews, shown the version before the redesign** (so some of this may already be answered; ask them again on the new one):

| They said | Now |
|---|---|
| Tapping an event's title should open its details | Every row and card is one link to its page; the route card opens the route and now has an explicit Walk it. Which screen they tried is unknown; ask again. |
| Don't make me scroll filter chips (gigs, club nights, film…); I often don't know what I want. Austria took hours | Built: Now keeps a labelled short walk in a collapsed disclosure and one key for mood/price; kind facets sit with the listings. Another gives the next route. Check with someone who does not know what they want. |
| A ceiling of about €20 a person, or free only | Built: Tickets up to (Free, Up to €20, Any) in the mood sheet; it narrows the route and the list, keeps listings with no price (two in five) and says so, and counts tickets only because places carry no price. The Programme keeps its Free switch and typed "under 20". |
| Focus on today and tonight; plan the evening; after Philly Joe's, show a few real, reviewed places nearby by mood | Built: the next few hours (evenings and, by day, places on foot), After this on venue and event pages (up to three picked places within ten minutes, one per mood, each with its own words) and Plan from here. We hold no reviews and have no free source for them; "picked" plus a link out is the honest version. |
| Onboarding by mood: listen or dance, craft bar, board games | Built as a sheet, not onboarding: Art & film, Live music, Club nights (hour-aware for a walk, available at any hour when filtering future listings), Records & books, Workshops & talks, Craft beer. Board games sit under Easy alone, inside Workshops & talks. |
| 3 Oct (owner): eight mood tiles are too many; the sheet's grip does not drag; let me pick several moods; the price note is too long and €10 is not needed; the mood icons look off | Six moods as a list with their Label discs, several at once, each opening optional narrower picks; Free, Up to €20, Any with one short line; every sheet drags down to close. |
| 3 Oct (owner): Still going at midnight sent me to Fotografiska and a record shop, both shut | Places on foot were treated as daytime after midnight, and a place with no filed hours was tried at any hour. Now an unfiled place is tried only in its kind's usual hours and nothing between 03:00 and 06:00. About two in five picked places still have no hours (`docs/data.md`). |
| 3 Oct (owner): Near me changed nothing visible | It is a switch now: the route starts near you and says how far, the list goes nearest first. |
| 3 Oct (owner): Weekend was grey; I cannot find all workshops or all comedy, or a bookshop or a techno club | Day shortcuts remain visible, including empty Today; the third is This week from Friday, followed by a date picker; Now has one row of the kinds in the day's list; the Guide's row is place types (Records, Books, Galleries, Craft beer, Clubs and bars…). |
| 4 Oct (owner): the icons are plain; the tab bar has an empty slot after Saved; does the Guide earn a tab when Now's Worth the walk repeats it at the bottom of the page? | Icons redrawn in two tones, solid when selected. The bar had a five-column grid for four tabs. The Guide is no longer a tab: Now has Events \| Places under the answer, Places being the Guide in brief, and the Guide is its full page. Four tabs: Now, Map, Saved, You; You moved from the header on 5 October. |
| (noticed here) craft beer bars and board games | Craft beer: ten places are picked as the `taproom` kind (Põhjala, Põhja Konn, Pudel, Uba ja Humal, Pühaste, Koht, Brewklyn, Tuletorn, Hell Hunt, Purtse resto), so the Craft beer mood and a Guide type exist. No board-game place exists; Easy alone (quiz, chess, craft nights, for people on their own) covers the events from the `easy-alone` rule, which reads formats from titles and leaves out adult-themed and group-of-friends listings. A mood shows only with three behind it; future-date discovery does not hide it just because of the current hour. |

## Discovery review, 6 October 2026

Now and Map share mood/submood, ticket cap, Near intent and a calendar day/range. Now's explicit date stays selected when empty. The walk remains the product unit, available in a labelled inline disclosure; it no longer forces listing-first visitors past a full route. Events/Places reuses the existing glass segment. Now and Programme have image-first feeds with essential facts below, retaining our type, palette, Labels and source evidence. A missing photo is a short Label panel, not a guessed picture. See `docs/discovery-review.md` for the critical assessment, sources and verification limits.

Reject a draggable floating recommendation: production chat bubbles and Picture in Picture solve ongoing tasks, while our recommendation would obscure the feed and add positioning/accessibility state. Reconsider persistence for an active walk after use is observed. The compact walk and larger feed are hypotheses, not proven conversion improvements. Check whether undecided visitors still notice and use the walk, and whether long feeds remain easy to scan.

The mini uses the same system adapted to its current window: bounded content and centred sheets in portrait, narrower sidebar/side content in landscape. There is no separate iPad theme or device detection.

## Open questions

- Search and the full programme: the header magnifier and Now's field both open Programme, which overlaps Now and keeps its tab selected. The [7 October research](search-navigation-research.md) proposes one adaptive search entry and a clearly labelled All events destination under Now. It compares a compact mobile entry with one visible field; no interface change has shipped and participant validation remains open.
- Easy alone is live from a rule (`pipeline/easy.ts`), not from organisers: nobody has confirmed any listing with its organiser. Who does, and does a confirmed one get a stronger mark than "our reading"?
- Craft beer picks are ours from each place's own page; someone who knows the scene should confirm or change them, and say whether board-game cafés belong.
- Daytime places: three museums are picked (Kumu, Kiek in de Kök, the Architecture Museum). 20 more are held and unpicked; the Applied Art and Design Museum has no coordinates; the Museum of Photography, the City Life Museum and Kiek in de Kök each exist twice under English and Estonian names. Food and drink venues (cafés, restaurants) are out of scope: tallinntastebuds.ee covers them; craft beer bars are in because they are a culture stop.
- Hours: about half the picked places have hours. They come from OpenStreetMap, then the venue's site, Facebook and Instagram bio, then a free model reading that same text, checked against it (`docs/data.md`); Facebook returns other Pages' hours only after an App Review. Rooms that open for events read "Open for events" instead of "Hours not filed". Open: searching the web for a venue with no links needs a search API key the owner signs up for (Brave Search has a free tier); until then a place is found only through its own links, OpenStreetMap, Wikidata and Overture.
- Where to enter (courtyards, upstairs rooms) and how to get back after a late show: not held; the second needs transport data I have not checked.
- Languages and cities: the interface is translated in the browser (`docs/frontend.md`, Languages); our event titles, summaries and pick notes use the pipeline translations when available; original source text keeps its own language. See the Scale board on the canvas.
- Does Places on Now get used, or does the Map's Places do that job? Watch whether the Guide page is reached at all. The Guide has a row of place types; whether "Plan from here" belongs on every place row is open. Not built: neighbourhood chips (the wrong grain for Tallinn) and "add to a route" (a draft object nobody asked for).
- Visible complexity is the cost of every idea above. Fewer elements wins.

## Constraints

- Static HTML, one stylesheet (`wa.css`, tokens as CSS variables), vanilla JS; no framework, so `/design-sync` (React components) doesn't apply. Strict CSP: no inline scripts, no third-party scripts or analytics, self-hosted fonts.
- WCAG 2.2 AA: 44 px targets (chips, keys and segments are 44 px high), visible focus, `prefers-reduced-motion`. Listing text is untrusted: titles may run three lines, be all caps or Cyrillic.
- Free tiers and free models only. Never guess a photo from a name.
- Check at 390 and 1440 px, light and dark.

## Do not use

Cream backgrounds, black or near-black surfaces, tracked all-caps eyebrow lines, an arrow on every link, italic accent words, numbered section labels, monospace for every small label, a generic grid of identical rounded cards, emoji, purple-to-blue gradients, anything that looks like Google Maps or a booking site.

## Voice

Handles start with `@`; no exclamation marks; no marketing register; never "discover" as a verb; metadata reads "Area · kind · day + time".
