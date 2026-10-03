# Design brief

For a Claude Design session or anyone redesigning a screen. Current state only: when a decision changes, change it here.

## Product

WanderAlt answers: *what is worth walking to in Tallinn in the next few hours, and what do I do after it?* Independent and alternative culture (DIY gigs, club nights, arthouse film, contemporary art and dance, talks, record and flea markets) and the places around it (record shops, bookshops, galleries, thrift, small cinemas, clubs, theatres, bars). It is as much a day-trip guide as a night guide: bars and clubs are the smaller job.

**Audience, in order:** travellers staying 2–5 days, often on a day trip; English-reading expats; locals who don't follow every channel. People on their own, in two, or in a group: most venues and events suit all of them, and where a format is built for strangers to mix (quiz, chess, craft nights) it says so. They decide on the day, on a phone, often already out.

**Every row answers four things:** when (a time), how far (walking minutes), what it is (kind, price), who says so (the venue or channel it came from).

**The idea (Night Guide):** the unit is the walk (two to four stops on foot), not the event card. Places carry the guide and events give it a clock. Fienta and the like are the cashier we link to; we are the guide. Not every bar: places are **picked** by hand, with one honest line on why.

## Identity (decided 2 Oct 2026, revised 3 Oct)

- Vermilion `#d83a14` and white, Geologica, the glass bars, the splash. **No black surfaces**: ink `#24222c` is for type only; selection is tinted glass with a vermilion ring, the one primary action is a vermilion gradient, the page sits on a soft daybreak gradient, and the dark theme is a violet-blue gradient, not flat black. Glass only where it floats; it bends a gradient, never a photo.
- **Labels:** round flat discs of objects with a faint groove ring (`icons.js`); a logo or photo wins, the disc is the fallback. Moods use neutral objects (a framed picture, a record sleeve, a pencil, headphones, a mirror ball, two stools) so they mean the same in any city. Not Meetup's offset stickers, not Airbnb's 3D. A few hand-drawn sketches (the Old Town skyline on the route card) with a small wobble, one line weight, where a screen has room and a job.
- A route is a spine: time, square node, stop; the listing is the one filled node. The thread is a vermilion gradient.
- No sparkle icon for "ask" (Airbnb, Meetup and Bend all use it); search uses the glass. Four tabs: Now, Guide, Map, Saved; You is the avatar. Sign-in is one sheet, link first.
- Design canvas: https://claude.ai/artifact/9UrJzeMvP9vtHz6MdaJUV4 (the second look: audit, data check, research, designs, questions; supersedes the first pass at https://claude.ai/artifact/41QjFPZyhwnY68ugNeespd).

## What exists

Now (one answer, a mood and price key, Walk it, Another, the day's list) · Programme (all listings, paged, filters, search that reads sentences) · Guide (`places.html`: picked places nearest first, from a stated start) · Map · Route page · Event and venue pages (each ending in After this) · Saved · You · sign-in sheet. Details: `docs/frontend.md`.

Live data: about 600 events a fortnight, about 430 places (31 picked), all Tallinn. Titles arrive in Estonian or Russian with an English title and summary added. About a fifth of listings have a date and no time; two in five no price; a quarter of places have hours; a minority photos. **Design for missing data**: no photo, no hours, no time, no price.

## What users told us

**27 Sep, first review:** English must lead; search first; an empty night must say "still going"; a weak map; area names people know; no reason to come back. Mostly addressed; the map and return reasons are still thin.

**2 Oct, two interviews, shown the version before the redesign** (so some of this may already be answered; ask them again on the new one):

| They said | Now |
|---|---|
| Tapping an event's title should open its details | Every row and card is one link to its page; the route card opens the route and now has an explicit Walk it. Which screen they tried is unknown; ask again. |
| Don't make me scroll filter chips (gigs, club nights, film…); I often don't know what I want. Austria took hours | Built: Now opens with one answer (a short walk) and one key for mood and price; no row of kinds. Another gives the next route. Check with someone who does not know what they want. |
| A ceiling of about €20 a person, or free only | Built: Tickets up to (Free, €10, €20, Any) in the mood sheet; it narrows the route and the list, keeps listings with no price (two in five) and says so, and counts tickets only because places carry no price. The Programme keeps its Free switch and typed "under 20". |
| Focus on today and tonight; plan the evening; after Philly Joe's, show a few real, reviewed places nearby by mood | Built: the next few hours (evenings and, by day, places on foot), After this on venue and event pages (up to three picked places within ten minutes, one per mood, each with its own words) and Plan from here. We hold no reviews and have no free source for them; "picked" plus a link out is the honest version. |
| Onboarding by mood: listen or dance, craft bar, board games | Built as a sheet, not onboarding: Look, Browse, Make, Listen, Dance (after 20:00) from data we hold. Craft bar and board games wait for picks (see below). |
| (noticed here) craft beer bars and board games | Not covered. Three craft-beer places exist unpicked (Beer&Barrel, Hiiu Õlletuba, Pühaste Taproom); no board-game place or event exists. Drink needs those picked with a reason; Join in (quiz, chess, craft nights, for people on their own) is live from the `easy-alone` rule, which reads formats from titles and leaves out adult-themed and group-of-friends listings (drawing nights called "DnD" are caught by their venue's name). A mood shows only with three behind it, so Drink does not appear until two more craft-beer places are picked. |

## Open questions

- Join in is live from a rule (`pipeline/easy.ts`), not from organisers: nobody has confirmed any listing with its organiser. Who does, and does a confirmed one get a stronger mark than "our reading"?
- Drink and Play: which three to five venues, picked by someone who knows the scene, with a stated reason each.
- Daytime places: three museums are picked (Kumu, Kiek in de Kök, the Architecture Museum). 20 more are held and unpicked; the Applied Art and Design Museum has no coordinates; the Museum of Photography, the City Life Museum and Kiek in de Kök each exist twice under English and Estonian names. Cafés (13 held) are not shown.
- Hours: 28 of 40 Guide places show "hours not filed", so "open now" is often unanswerable. Where do hours come from beyond OpenStreetMap?
- Where to enter (courtyards, upstairs rooms) and how to get back after a late show: not held; the second needs transport data I have not checked.
- Languages and cities: route titles are templates over kinds so they can be translated in the browser; listing text and pick notes need a per-language table before a second reading language. See the Scale board on the canvas.
- The Guide has the lens; whether "Plan from here" belongs on every place row is open. Not built: neighbourhood chips (the wrong grain for Tallinn) and "add to a route" (a draft object nobody asked for).
- Visible complexity is the cost of every idea above. Fewer elements wins.

## Constraints

- Static HTML, one stylesheet (`wa.css`, tokens as CSS variables), vanilla JS; no framework, so `/design-sync` (React components) doesn't apply. Strict CSP: no inline scripts, no third-party scripts or analytics, self-hosted fonts.
- WCAG 2.2 AA: 44 px targets (chips, keys and segments are 44 px high), visible focus, `prefers-reduced-motion`. Listing text is untrusted: titles may run three lines, be all caps or Cyrillic.
- Free tiers and free models only. Never guess a photo from a name.
- Check at 390 and 1440 px, light and dark.

## Do not use

Cream backgrounds, black or near-black surfaces, tracked all-caps eyebrow lines, an arrow on every link, italic accent words, numbered section labels, monospace for every small label, a generic grid of identical rounded cards, emoji, purple-to-blue gradients as decoration (the dusk theme is the one deliberate exception: a low-contrast violet to plum behind glass), anything that looks like Google Maps or a booking site.

## Voice

Handles start with `@`; no exclamation marks; no marketing register; never "discover" as a verb; metadata reads "Area · kind · day + time".
