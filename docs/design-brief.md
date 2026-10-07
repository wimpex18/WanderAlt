# Design brief

Current product direction, evidence and unresolved questions. Implementation details live in [frontend.md](frontend.md), catalogue rules in [data.md](data.md), and model lanes in [models.md](models.md).

## Product

WanderAlt answers: *what is worth walking to in Tallinn in the next few hours, and what do I do around it?* Independent and alternative culture: gigs, club nights, arthouse film, contemporary art and dance, talks and markets, alongside record shops, bookshops, galleries, thrift, small cinemas, theatres and craft beer places. Daytime culture matters as much as nightlife.

Audience, in order: travellers staying two to five days, English-reading expats, and locals who do not follow every channel. They decide on the day, often on a phone while already out. Tallinn is the only city with data. The product has not launched; there are no usage or conversion results.

The unit is the walk: two to four places and, when something is on, a listing. Places carry the guide; events give it a clock. Ticket sellers handle booking. Picked places have an honest note based on their own words or a checked fact.

Every listing should answer when, how far, what kind and price, and who says so. Missing facts stay missing: unknown prices may pass a ticket cap with a note; Free requires known free entry, In English a stated performance language, and Open now known hours. An unlocated listing stays in results and is counted as omitted on Map. A missing picture gets its Label, never a guessed photo.

## Identity

- Vermilion `#d83a14`, Geologica, two-tone UI icons, round illustrated Labels, and the existing glass bars. Day surfaces are white paper over a soft gradient; dusk is warm charcoal. Green means open or free, blue means the reader or walking. No flat black, violet surfaces or decorative extra accents.
- Glass belongs to floating controls and sheets. Feed pictures and content surfaces stay quiet. A logo or verified photo takes priority over a Label.
- A walk is a spine of time, square nodes and stops, with the listing as the filled node and a vermilion thread. The collapsed A walk for now disclosure keeps it reachable without blocking someone looking for a listing.
- Four tabs: Now, Map, Saved, You. The header holds Search, language and appearance. Sign-in is one sheet, link first.
- Keep Geologica for Latin and Cyrillic. The bundled font covers the Ukrainian alphabet as well as Russian; helper-text length and wrapping are addressed in copy and layout. Interface translations cover English, Estonian, Russian and Ukrainian. A native-reader editorial pass remains useful.

## Screen responsibilities

| Surface | Reader's job | Controls shown first |
|---|---|---|
| Now | Choose a walk or a short list for the next few hours | Mood/ticket cap, Near, walk disclosure, Events/Places. The event preview has date choices. All events and All places open the complete catalogues. |
| Search dialog | Find a name, format, event or place | One query, a scope line, separate Events/Places matches and a full-results action. The empty state offers real matching examples and catalogue links. |
| All events / Search results | Browse any future date or refine a search | One query field, date, Refine with a count, and removable active filters. Refine starts with When, Kind and Price; More options holds less frequent choices and Follow this search. |
| All places | Browse the Guide beyond Now's preview | Place types, known Open now, a stated walking origin. |
| Map | Decide spatially from listings and places | Ordinary Map shares Now's dates and preferences. Map these results uses the complete search context, with Back to results and Clear search. |
| Saved / You | Keep choices and manage personal state | Saves/lists; taste, starting point, follows and account. |

Search has one adaptive entry: a labelled compact button on phones and a field-shaped button on desktop. Both open the same native dialog. On phones it occupies the available screen above the keyboard; on desktop it is a bounded modal. The permanent Now query field and duplicate magnifier are removed. The results page uses its own query field as its sole entry.

All events retains `discover.html` and `programme.js` internally, with the visible title All events or Search results. It is a child destination of Now, reached through an explicit link and an explicit Back to Now action. The tab bar marks Now as the parent; it is not a fifth peer tab. All places has the same hierarchy. Now's kind/type strips are removed; deliberate catalogue browsing has those choices on its full destination.

Previews, complete results and Map use one query engine. Typing stays local. A submitted search may use the existing free model fallback when the local sentence reader cannot find matches. Dates, kind, budget, manual overrides and model readings travel in the URL. A chosen override survives refresh and the Map round trip. Clearing the query removes its automatic constraints. Search starts at All dates and does not silently inherit a narrow Now mood, price or day. See this selection deliberately carries Now's context.

## Evidence and design rationale

The 7 October 2026 audit combined repository/docs inspection, the running app, read-only catalogue inspection, the owner's screenshots and recording, live competitor websites, and primary product documentation. The sample below is a comparison of product patterns, not a representative study of each country's customers. Native screens supplied by the owner are observations of those captured versions; web documentation does not establish every native-app gesture.

| Product / market | Relevant observed or documented pattern | What it informs here |
|---|---|---|
| [DICE / UK](https://dicefm.zendesk.com/hc/en-gb/articles/22365220986897-How-to-find-events-you-ll-love-on-DICE) | Discovery by time, search and map serve different ways of finding a gig. | A time-led Now and a wider query can coexist when their scope is clear. |
| [Resident Advisor / UK](https://ra.co/ra-guide) | A culture-specific guide connects events, date/genre choices and spatial browsing. | Preserve WanderAlt's culture and walking purpose rather than turn the home into a general marketplace. |
| [Eventbrite / US](https://www.eventbrite.co.uk/help/en-us/articles/783059/how-to-use-the-eventbrite-app/) | Search sits within Discover; Saved, Tickets and Account have separate jobs. The supplied screens show a prominent field and richer controls after a query. | A persistent field is credible for a search-led catalogue, but its prominence is a product choice rather than a universal requirement. |
| [Luma / US](https://help.luma.com/p/searching-for-events) | The supplied Home is a personal schedule; Discover has city/category browsing and a search icon, then a query/date/location screen. | Home and catalogue earn separation through different content ownership. WanderAlt's public Now does not need another public discovery tab. |
| [Meetup / US](https://help.meetup.com/hc/en-us/articles/39235072484109-Finding-an-event) | Explore finds events/groups; the supplied Home contains personal groups and Going/Saved/Past. Search exposes event/group scope. | Label entity groups and avoid recreating a personal Home/Explore split before WanderAlt has that use case. |
| [Fever / international, including UK, US, Singapore and Japan](https://play.google.com/store/apps/details?hl=en-IN&id=com.feverup.fever) | Curated experiences, date/time choices, favourites and map; the supplied web screens separate choosing a city from searching activities. | Keep location visible, but Tallinn-only does not need a city picker in every search. |
| [Catch / Singapore](https://www.catch.sg/) | The inspected website exposes a search overlay across events/articles alongside its event browsing form. | A richer overlay can unify entity types, but retaining competing entries would preserve the problem. |
| [Peatix / Singapore and Japan](https://apps.apple.com/sg/app/peatix/id561632513) | Publisher release notes describe nearby event browsing, See all and suggestions/topics. | Keep a short browse preview and a clear path to its complete set. |
| [Secret Tel Aviv / Israel](https://secrettelaviv.app/) | The inspected web app combines city-guide content and labelled search; the [publisher's description](https://www.secrettelaviv.com/magazine/blog/toptens/meet-the-new-secret-tel-aviv-app-10-great-reasons-to-check-out-our-new-app) includes events and places. | One query can support both named venues and their listings without forcing an entity choice first. |
| [Easy / Israel](https://easy.co.il/en/list/Events) | The inspected event page offers Today/Tomorrow/Weekend and more date/time and category facets. | Dates are valuable; the larger facet catalogue is a reason to disclose controls progressively. |
| [Tokyo Art Beat / Japan](https://www.tokyoartbeat.com/articles/-/tokyoartbeat-design-renewal-news-202609) | The publisher's September redesign separates exhibition discovery, map and personal records. | Distinct jobs justify destinations; duplicated public feeds do not automatically justify a tab. |

The recurring useful pattern is a short browse surface, a clearly scoped query/catalogue flow, and personal or spatial destinations with different jobs. The sample supports both a visible field and an icon entry, so it does not prove that a popup converts better. We choose a labelled compact phone entry to free room for the walk and feed, and retain a larger desktop affordance for recognition.

The implementation follows [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) and [recognition over recall](https://www.nngroup.com/articles/recognition-and-recall/): show the current scope and selected constraints, reveal the complete choices on request, and label Search and catalogue exits. Suggestions are useful only when they lead to real matches. The [W3C modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) informs focus, Escape, background isolation and focus return. These are design grounds, not WanderAlt usability findings.

A floating draggable recommendation is still unnecessary for browsing: it would cover the feed and require positioning state. Persistence for an active walk can be reconsidered once real use is observed.

## Existing qualitative feedback

The first review on 27 September and two interviews on 2 October used earlier versions. Their needs remain evidence; whether the current screens satisfy them must be checked again. Owner feedback supplied the duplicate-search and hidden-Programme problems.

| Need | Current response |
|---|---|
| English first; open details by tapping a listing | English catalogue fallback, complete row/card links, original text available on details. |
| Do not make an undecided visitor scroll through lots of filters | A visible walk disclosure, one mood sheet, short previews, full controls in Refine. |
| About €20 per ticket or free only | Ticket cap in the mood sheet and full results; unknown prices retained with a note, Free requires a known fact. |
| Plan today/tonight and suggest real places after a show | Walk it, Another, After this and Plan from here, using picked places and verified source facts. No reviews are invented. |
| Find a future workshop, comedy, record shop or techno club | All events defaults to every future date, including workshops and tag-based comedy. Search includes place types; All places provides the full Guide. |
| Near must change something visible | Named or device origin, walking facts and nearest order, with permission requested through the location action. |
| Late-night suggestions must not send people to shut daytime places | Hour-aware walk composition. Search Open now includes only known open hours; hours missing or opening only for events stay explicit. |

## Validation still needed

The implementation is checked with automated query/context tests and responsive Chromium previews; those do not certify native keyboards or user comprehension. DEV-31 retains the physical iPhone/iPad mini/Android check and participant validation.

Use a small moderated sample of seven prospective travellers, expats and locals, counterbalancing a labelled compact Search entry against one visible field. Measure task completion, time to first relevant result, wrong turns, search findability, and recovery. Tasks should include jazz tomorrow under €20; a record shop open nearby; a workshop next month; a venue with both an event and a place; a walk for today; a zero-result query; and refining, mapping and returning to the same selection. Observe whether people understand All dates versus Now's date, discover the walk, and keep their place after opening details. No participant results are claimed here.

Check real keyboards, text-size settings, reduced motion/transparency, dialog focus and return, long RU/UK labels, and landscape mini layouts. The system adapts to the current window; there is no separate iPad theme or device detection.

## Open product questions

- Easy alone is a title/format rule, not organiser confirmation. Decide who verifies it and whether a confirmed format needs a stronger mark.
- Local expertise should confirm or change craft beer and daytime place picks, including whether board-game cafés belong. Cafés and restaurants remain out of scope; craft beer can be a culture stop.
- Hours, entrance details and late-night transport remain incomplete. Keep the sources and limitations in [data.md](data.md); do not hard-code a changing catalogue snapshot here.
- Do people use Places on Now, All places and Map for different tasks? Observe before adding another tab or Plan from here to every row.
- Catalogue translation quality and native interface editing remain separate tasks. Other cities need actual sources and language support before entering the interface.

## Constraints and voice

Static HTML, vanilla JS, one stylesheet, self-hosted fonts, strict CSP, free tiers and free models only. Check 390 and 1440 px in both themes. Aim for WCAG 2.2 AA, 44 px targets, visible focus and reduced motion. Titles may be long, all caps or Cyrillic; source text is untrusted and must be escaped, URLs validated.

Handles start with `@`. No exclamation marks, marketing register or “discover” as a verb. Keep helper text brief without removing consequences, provenance or recovery instructions. Do not add cream page backgrounds, flat black surfaces, tracked all-caps eyebrows, decorative arrows, italic accent words, numbered section labels, emoji, purple-to-blue gradients or a generic booking-site identity.
