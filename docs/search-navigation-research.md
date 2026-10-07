# Search, Now and the full programme

Research and recommendation, 7 October 2026. **Proposed direction; the production interface has not changed.** This follows the [6 October discovery review](discovery-review.md) and revisits its decision to keep a search field visible at every width.

## Recommendation

Use **one search flow**, with one entry on a screen. On phones, try a labelled **Search** button in the header that opens a full-screen search view. On desktop, use a compact field in the header that opens the same search experience. Remove the second field from Now's body. Keep a single visible body field, without the header magnifier, as the comparison design for testing.

Give the screens different jobs:

| Screen | Question it answers | Main action |
|---|---|---|
| Now | What fits the next few hours, or this day of my visit? | Choose a short walk, event or picked place. |
| Search | Can I find this venue, subject, kind of place or constraint? | Type, inspect matches, then open a result or all results. |
| All events, currently Programme | What else is on, including further ahead? | Browse by date without having to invent a query. |
| Map | Where are the selected things, relative to my start? | Compare walking distances and open a pin. |
| Saved / You | What did I keep / what are my preferences? | Return to a shortlist / change preferences. |

Keep **Now, Map, Saved, You** as the four primary tabs. All events is a clearly labelled destination within Now, reached beside the Events section heading and from search. Give it an explicit Back to Now link. Preserve `discover.html` and existing shared URLs; the visible name can change independently of the filename. Search is an action available across the app, rather than another catalogue tab.

This is a recommendation from the audit and desk research. A popup's appearance alone does not establish better usability; search visibility and the ability to browse without typing are the decisions to test.

## What the app actually does

Checked the current branch starting at `20c2aae`, its ten preceding commits, `AGENTS.md`, README, the design brief, front-end documentation, discovery and copy reviews, data documentation and the model/search documentation. Traced `index.html`, `home.js`, `discover.html`, `programme.js`, `finder.js`, `ask.js` and the catalogue loader. Ran `npm start` and inspected Now and Programme at **390×844 and 1440×1000**, in light and dusk.

| Observation | Evidence | Consequence |
|---|---|---|
| Both home search controls now open Programme. | Header link: `discover.html?focus=search`; `home.js` sends the body form to `discover.html?q=…`. Now no longer loads the legacy `finder.js`. | There are two entry points to one destination, rather than two search engines. A redesign should reuse that capability. |
| The header describes its destination as “Search the programme”. | `index.html` and `discover.html` accessible labels. | This understates place search and makes a generic magnifier stand for an ambiguously named page. |
| Programme also has a header magnifier beside its own field. | Browser and `discover.html`. Its visible placeholder is “Ask for a night out”. | Duplication continues after navigation, and the wording underplays daytime places. Use “Search events or places”. |
| Programme does not explain its relationship to Now. | Its heading says Programme, while the Now tab has `aria-current="page"`. | A secondary page can sit under Now, but needs a visible parent/back relationship and truthful accessibility state. It does not automatically need a fifth tab. |
| Now and Programme share a feed and many filters. | Both have date shortcuts and image-first event cards. Desktop Programme repeats date choices in a top strip and sidebar. | Separate the immediate shortlist from the complete date-led catalogue. Repeating every control is avoidable. |
| A no-query route to Programme is buried below the home feed. | Now's “All 31” link follows five cards and Show more; at this snapshot it carries `time=tonight`. | Put a plainly labelled All events link near the section heading. Offer access to all dates as well as the selected day. |
| Place search already works. | “records” changed the heading to Places and showed Vinyl Records, Tallinn Old Town Records, Terminal and Biit Me, with place-type/hour controls. | Do not build a separate search for the Guide. Expose events and places as understandable result groups. |
| Sentence reading already works locally. | “jazz tomorrow under 20” produced one 8 October gig, Free, with date/kind/price in the URL and an “Unknown prices included” note. | A conventional input can carry complex intent without another AI mode or requests on every keystroke. |
| Search and browsing currently have different context rules. | The home form sends only `q`; contextual feed links can carry mood, cap and dates. Programme reads those without changing Now/Map preferences. | Make scope visible and specify precedence. Preserve the useful separation between a temporary search and lasting taste preferences. |
| The Map shortcut does not represent the full search. | For the jazz query it linked to `map.html?when=tomorrow`; topic/kind/cap were not transferred as a complete query. | Continue [DEV-33](https://linear.app/pm-career-transition/issue/DEV-33/wa-carry-programme-listing-searches-into-map). Do not promise “Map these results” before that contract is implemented. |

The live browser showed 31 items on Now for Today, including running items, and 646 in the unfiltered Programme. These are time-dependent **interface counts**, not market demand or usage measures.

Review images: [Now, phone light](screenshots/search-research/now-mobile-light.jpg), [Now, phone dusk](screenshots/search-research/now-mobile-dark.jpg), [Now, desktop light](screenshots/search-research/now-desktop-light.jpg), [Now, desktop dusk](screenshots/search-research/now-desktop-dark.jpg), [Programme, phone light](screenshots/search-research/programme-mobile-light.jpg), [Programme, phone dusk](screenshots/search-research/programme-mobile-dark.jpg), [Programme, desktop light](screenshots/search-research/programme-desktop-light.jpg), [Programme, desktop dusk](screenshots/search-research/programme-desktop-dark.jpg).

## What the supplied references show

The screenshots are direct visual evidence of the supplied screens, not independently verified app versions. They contain example listings from several cities; those listings are not evidence of Tallinn coverage.

| Reference files | Observed arrangement | Useful lesson |
|---|---|---|
| Eventbrite: `IMG_5858`, `5859`, `5823`, `5824` | Discover contains a prominent search field. Results retain that field and expose date/category/neighbourhood/price refinements. Bottom tabs serve discovery, saves, tickets and account. | One obvious search entry; essential time and price in the result. Ticket and urgency features serve its commercial job. |
| Luma: `IMG_5815`–`5818`, `5856`, `5857` | Home centres on your events/calendars. Discover holds public recommendations. A header magnifier opens a focused search screen with Nearby and Any Date and compact rows. | Home and discovery earn separate screens because their jobs differ. The concise result format suits search. |
| Meetup: `IMG_5820`–`5822` | Home shows your groups/going/saved/past events; Explore shows new events, search and dates. Search opens an Events/Groups view with query and location. | Personal activity and public browsing differ. Copying both pages into WanderAlt would repeat two public catalogues. |
| Fever: `IMG_5830`–`5832` | City selection opens a sheet; the city page uses a large search field and themed collections. These supplied screens appear in a browser-style container. | An on-demand selector is useful when there is a choice. Tallinn alone does not need a city picker. A hero, rankings and extra vibe strip would compete with the walk. |

The supplied recording is **5.71 seconds**: Meetup's Explore feed opens the search overlay and keyboard, briefly switches the Events/Groups context, then returns to Events. It shows the transition and editing space; it contains no submitted query or result selection, so it cannot establish search success or speed.

## Market comparison

This is a purposive comparison of relevant products, not a ranking, market-share analysis or a claim about national user preferences. “UK”, “US”, etc. identify a relevant market/product context; several services operate internationally. Official documentation establishes supported features, not their effectiveness. Native apps were not installed or independently tested in this session.

| Market and product | Home, search and navigation evidence | Implication for WanderAlt |
|---|---|---|
| UK — DICE | Its current help describes home sections such as Tonight and This week, a search area and a map available from search. [Official guide](https://dicefm.zendesk.com/hc/en-gb/articles/22365220986897-How-to-find-events-you-ll-love-on-DICE). | Keep immediate time intent close to the home answer. Deeper search can be a focused task. Following artists and buying tickets are different product responsibilities. |
| UK / global — Resident Advisor | RA Guide describes club-event discovery through date, genre and other refinements, recommendations and map support. [Official product page](https://ra.co/ra-guide). | Its culture scope is closer than a general ticket marketplace. Borrow locality and date clarity; the existence of many filters does not justify displaying them all. |
| US / global — Eventbrite | Official app help separates Discover, search/filtering and purchased Tickets; it documents date/category/price refinements and date/relevance order. Supplied screenshots corroborate the prominent field. [Official help](https://www.eventbrite.co.uk/help/en-us/articles/783059/how-to-use-the-eventbrite-app/). | A visible field is a credible alternative. Tickets deserve a tab there because people buy them; Programme does not gain a tab just because it has a separate URL. |
| US / global — Luma | Search starts from Discover in the apps, can run within a city/category, and covers more events than curated city pages. Nearby ordering and map browsing complement it. Supplied Home screens show personal calendars. [Official help](https://help.luma.com/p/searching-for-events). | Distinguish curation from completeness, but keep one result system. Show geographic scope. WanderAlt's Now is already public browsing, unlike Luma's personal calendar. |
| US / global — Meetup | Its help explicitly assigns your calendar to Home and finding new events to Explore; date/distance and keyword search refine new events. The supplied screens and recording show those separate tasks. [Official help](https://help.meetup.com/hc/en-us/articles/39235072484109-Finding-an-event). | Preserve the useful task split rather than adopting another public feed. Keep dates easy to choose and show enough facts before opening a card. |
| US / global — Fever | The supplied city screens put query and themed browsing together; the developer description lists date/time filters, favourites and map functions. [Developer listing](https://play.google.com/store/apps/details?hl=en-IN&id=com.feverup.fever). | Support both undecided browsing and known queries. Its city hero and commercial rankings would consume attention without adding WanderAlt's walking value. |
| Singapore — Catch | **Live web inspection:** the arts/culture home has Events/Articles navigation, a header magnifier and a large search form. The magnifier opens a modal for events/articles with date/price choices and suggestions. [Live home](https://www.catch.sg/), [Events](https://www.catch.sg/Event). | A modal can unify content types. Catch also demonstrates that adding a modal while retaining another form can preserve the same clutter. Remove the redundant entry. |
| Singapore / Japan — Peatix | Developer release history describes home modules with nearby events and See All in 3.9.0; 3.10.6 adds typing suggestions, direct event matches and search across events/groups/categories/topics. [Developer release notes](https://apps.apple.com/sg/app/peatix/id561632513). | A short home preview plus explicit full results is a concrete pattern. Suggestions help without requiring a second search mode. These are publisher descriptions, not our native-app observations. |
| Israel — Secret Tel Aviv | **Live web-app inspection:** a labelled header Search opens a dedicated search view; restaurant/event/directory scope changes the refinements. Home combines places, upcoming events, happy hours and neighbourhoods. Its August 2026 announcement describes browsing by date/type and nearby places. [Live app](https://secrettelaviv.app/), [18 August announcement](https://www.secrettelaviv.com/magazine/blog/toptens/meet-the-new-secret-tel-aviv-app-10-great-reasons-to-check-out-our-new-app). | A single-city guide can combine places and events. Relevant controls should follow result type. Its dense tags, rankings and deals are not necessary for our narrower culture scope. |
| Israel — Easy | The live public web catalogue groups going-out events and places; its Events view exposes Today/Tomorrow/Weekend/date range and time of day, alongside many further facets. [Home](https://easy.co.il/en), [Events catalogue](https://easy.co.il/en/list/Events). | Day and time are useful common intent. Keep the useful few controls visible and expose the long tail on request. Native-app navigation was not inspected. |
| Japan — Tokyo Art Beat | Its **8 September 2026** publisher announcement separates the home mix, exhibitions, map comparison and personal records. Search, exhibition browsing and map remain available without registration; map lists and record features have membership conditions. [Current redesign announcement, Japanese](https://www.tokyoartbeat.com/articles/-/tokyoartbeat-design-renewal-news-202609), [developer listing](https://apps.apple.com/jp/app/tokyoartbeat/id354579592). | Local cultural outings benefit from an exhibition/venue/map relationship, with personal records kept distinct. Use this current announcement rather than its older English app overview, which describes different access rules. |

**Synthesis, inferred from the comparison:** the clearest separation concerns a different task, rather than a differently named screen. Public discovery and personal calendars are different; two public event feeds with similar date controls are much closer. Search can be on demand, but browse paths must still work with an empty query. Compact search rows and explicit full results can coexist with image-first browsing.

## User research: evidence and limits

### WanderAlt evidence already held

The [design brief](design-brief.md) records a 27 September review and two interviews on 2 October, before the present redesign. It contains notes rather than transcripts, recruitment details or measured task results. No new participants were recruited or interviewed in this session, and the product has not launched.

| Recorded need | Design response to test |
|---|---|
| Search first; English leads. | Keep Search unmistakable, including a visible label on mobile. Test the compact entry against one visible field. |
| I do not know what I want; do not make me scroll categories. | Keep a useful Now answer and the walk before asking for a query. A blank search offers a few available examples and browse links. |
| Today/tonight, a plan for the evening, and somewhere after a venue. | Maintain the walk and After this. Search results should lead to these existing actions. |
| Free or about €20. | Keep the combined mood/ticket cap key; show its value and uncertainty. Avoid a separate home price toolbar. |
| Find all workshops, comedy, bookshops or techno clubs, including later dates. | Give All events and All places direct access; search across both types; dates remain easy to adjust. |

These needs can conflict: removing a large field helps the first screen, while making Search too subtle harms the explicit search-first request. Two interviews cannot resolve the balance, and fewer pixels is not a usability outcome.

### Secondary user evidence

A small, non-systematic scan of the Tokyo Art Beat developer listing surfaced reviews describing small map-close targets and losing map/list position after returning from details. These are volunteered reports, not a representative sample or confirmed bugs in its latest redesign. They justify including target size and Back/scroll restoration in our tasks. [Public reviews](https://apps.apple.com/jp/app/tokyoartbeat/id354579592).

Peatix's Singapore listing includes a **2020** review describing broad categories, long lists and having to open events for prices; that historical version is not evidence of a current defect. It reinforces a question for our own study: can people judge time, price and relevance from results without repeatedly opening details? [Dated public review](https://apps.apple.com/sg/app/peatix/id561632513).

### General usability evidence

- Progressive disclosure supports a small first layer and clear access to advanced options; frequently used actions still need visibility. Applied here, it supports hiding the long filter form rather than hiding all routes to search and browsing. [NN/g](https://www.nngroup.com/articles/progressive-disclosure/).
- Recognition requires less recall than generating a query from nothing. A few specific examples and a no-query browse path help undecided visitors; a wall of categories adds another selection task. [NN/g](https://www.nngroup.com/articles/recognition-and-recall/).
- NN/g's search guidance supports a visible desktop field, with a magnifier more acceptable on mobile. This is commerce research and an analogy, not a WanderAlt experiment. It is meaningful counterevidence to making desktop search icon-only. [Search guidance](https://www.nngroup.com/articles/state-ecommerce-search/).
- Suggestions should lead somewhere useful and must retain access to full results. A small preview must not trap visitors in a tiny list or force a guessed suggestion. [Search-suggestion research](https://www.nngroup.com/articles/site-search-suggestions/).

## Proposed interaction

### Now

1. Header: brand, the single Search entry, language and theme. On narrow phones the labelled entry must fit with 44px targets; do not shrink controls to squeeze in a wordmark.
2. The next few hours, with the existing combined mood/price key and Near me.
3. The compact A walk for now disclosure and real route title; its expanded actions remain intact.
4. Events / Places, followed by the useful date shortcuts. Put **All events** beside the Events section heading; on Places use **All places**. All events without a selected-day restriction must be reachable directly.
5. A short feed, keeping time, walking origin/distance, price and source. Keep the image-first browsing treatment already agreed.

The permanent second kind strip is a further simplification hypothesis: move detailed kinds into the existing mood/refinement sheet and All events, while displaying active choices. Check that workshops/comedy remain easy to find. Do not remove this strip solely because it looks busy; it was added in response to a real request.

### Search opens

On mobile use a full-screen view or a near-full-height sheet, with a stable query field, clear Close/Back and the keyboard. Hide the primary tab bar while editing. Avoid a half-height results area stacked under the keyboard, or a filter sheet stacked over another sheet. On desktop use a bounded dialog with a single query field and concise matches.

With no query, show **Tallinn · All dates**, two or three available examples, and All events / All places. Recent searches may be offered only when they exist, stored locally with a clear way to remove them. Do not invent popular searches, require a city selection or introduce a Where/When/What wizard.

While typing, show a small local preview grouped into **Events** and **Places**, with the same result predicate as the full page. A name such as Terminal may match a venue and its events. Do not force a type choice before searching. A clear shop-only query can prioritise Places. An optional All / Events / Places scope belongs in results, when useful.

Every event preview carries date/time, venue, price and source. Every place carries kind, area, walking time from a named start and the filed open/hours state. Use compact rows here, retaining larger imagery for browsing. **Enter / View all results** always reaches a shareable full result page. Suggestions do not replace it.

Interpret “jazz tomorrow under 20” into visible, removable constraints. Keep a literal-word fallback. Local parsing and catalogue matching happen first; the existing model fallback remains an explicit-submit enhancement, subject to its free quota. No model requests on typing or invented results.

### All events and results

Keep the complete catalogue in `discover.html`. Use **All events** for no-query event browsing, **Search results** for a mixed query and **Places** for a places-only view. Give the page an explicit Back to Now link/breadcrumb. The Now tab can signal its parent section; it should not claim that the Now page itself is current.

Provide one query field, one date control and one labelled **Refine** action with an active count. Show selected constraints outside the closed panel, with removal. On desktop, the refinements can use a collapsible sidebar; do not repeat its date controls above the feed. Place results get place-type/hours refinements rather than ticket/start-time controls. Keep explicit future dates and date ranges available.

Opening an event/place keeps the query, selected constraints and scroll position for Back. When full Map continuity is implemented, Map and list are views of the same selection. Until then, retain the honest Browse map wording and explain its shared-filter scope.

### Context rules

| Entry | Initial scope |
|---|---|
| Global Search on Now or another page | Tallinn, all dates; query constraints are explicit. Keep the known walking origin, but do not silently inherit a hidden Today/category restriction. |
| All events near the section heading | Whole programme, all dates. A separate “See all for this day” can preserve the selected date when needed. |
| A contextual category/day link | Carry that visible selection into full results and show removable constraints. |
| Search inside an existing results view | Retain explicit manual refinements; clearly resolve conflicts when query words name a different date/type. |

Query-stated dates and constraints take precedence over defaults. A conflicting manual choice should replace the corresponding interpretation, with the resulting constraint visible. Closing search returns to the originating page and its selection. Search changes must not overwrite durable mood/price preferences. Use Tallinn dates rather than the device timezone.

## Data limits affect the design

A read-only aggregate of the public Supabase views on 7 October found **865 upcoming/running unarchived Tallinn rows**, **542 starting before 21 October**, **63 active public venues**, and **44 picked places**. The next-fortnight subset had 113 without a supplied time, 185 without a price, 156 without event artwork and 110 without coordinates. Eighteen picked places lacked hours. These are raw public-view counts; front-end editorial/kind/date checks make the displayed feed different.

The query used Tallinn midnight on 7 October as the lower bound (`starts_at` or `ends_at`), 21 October midnight as the fortnight upper bound, and active venues for place counts. It read aggregates only and changed no data.

This supports four practical constraints: do not fill every preview with a poster; do not claim Open now when hours are absent; do not imply an unknown ticket price is within the cap; retain unlocated events in text results while explaining their absence on a map. A date-only listing says Time not listed. No guessed venue photos, rankings, ratings or attendance counts.

The client already loads a bounded paged catalogue. Consolidating the existing reader/filter/rendering logic can serve this design without a new search service, schema migration or paid model. The free-model budget is shared with the pipeline, as documented in [models.md](models.md#search-apiask).

## Alternatives and decision

| Option | Benefit | Cost / test question |
|---|---|---|
| **Compact entry**, preferred: labelled Search on mobile, small header field on desktop | Now's answer moves up; search has one focused editing surface; desktop keeps recognition. | One extra tap on mobile; will visitors notice Search? Does focus open the keyboard reliably? |
| **Visible field**: one body field at every width, remove header magnifier on Now | Strong search-first cue; smallest structural change. | Consumes the same vertical space; does it reduce browsing/route use, or help enough to justify it? |
| Search/Browse as a new primary tab | A complete catalogue is always one tap away. | Adds navigation or displaces You; does not itself remove duplicate filters/feeds. Reconsider if observed use makes full-catalogue browsing a primary job. |

The first two concepts can be compared with the same content and full-results flow. This prevents a more attractive poster, different events or different filter defaults from deciding the test accidentally. The recommendation is adaptive, so a phone preference alone should not dictate desktop treatment.

Concept review images: [compact entry](screenshots/search-research/concept-compact.jpg), [single visible field](screenshots/search-research/concept-visible.jpg), [grouped search matches](screenshots/search-research/concept-search.jpg), [All events](screenshots/search-research/concept-all-events.jpg). The small fixed example catalogue illustrates search entry, matches, full results and return to Now; it does not implement the production parser, full filter forms, map continuity or physical keyboard layout. The browsing cards here omit artwork to keep that comparison controlled.

## Validation still needed

Recruit **seven people** as a small qualitative round: three short-stay travellers, two English-reading expats, two locals; include people unsure what they want and people seeking a known thing. Revisit the earlier interviewees where possible. This is a proposed sample, not completed recruitment. Counterbalance the two layouts, use identical fixed catalogue snapshots and allow about 25 minutes per session. Do not treat seven observations as an A/B conversion experiment.

Tasks, without telling participants which control to use:

1. You have two hours and about €20. Pick something and explain where you would go after it.
2. Find what is on at Philly Joe's, then return to where you started.
3. Find a record shop; decide whether it is open and how far away it is. Include a result with unknown hours.
4. See all workshops for a later weekend without knowing an event name.
5. Search a topic that has both places and events; explain what each result group means.
6. Move from results to Map and back, then from a detail page back to results. Check query, refinements and position.
7. Open and close search with the phone keyboard; repeat with keyboard-only desktop navigation.

Record first click, hesitation, assistance, completion, interpretation of dates/unknown prices/hours, Back-state loss and whether the walk is noticed. Ask participants to explain Now versus All events in their own words. Proposed qualitative gates: at least six of seven find Search and the no-query full catalogue unaided; no false open/price belief caused by the interface; no lost query/filter state; the undecided participants still find a useful walk. These are product acceptance goals, not predicted performance.

Before shipping, test physical iPhone Safari and Android keyboards, safe areas, native Back, focus restoration, screen-reader announcements and all four interface languages. For desktop dialogs, focus enters the dialog, Tab stays inside, Escape closes, background content is inert and focus returns to the trigger. Follow the [WAI modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), use 44px targets and respect reduced motion/transparency. Existing device work is tracked in [DEV-31](https://linear.app/pm-career-transition/issue/DEV-31/wa-validate-discovery-on-iphone-and-ipad-mini).

## Implementation boundary

If this direction is chosen, first extract shared search interpretation, predicates and context serialization from `programme.js`; use them for both preview and full results. Then add the entry/dialog and parent/browse links, update page headings and translations, and consolidate visible refinements. Preserve existing URLs, saves, source evidence, catalogue/offline behavior and the free fallback. `WA.UI.esc()` and `safeUrl()` still apply to every untrusted result field and URL; production scripts remain external under CSP.

Test equivalence between preview and full results for named venues, mixed intent, four languages, unknown hours/prices/time, future ranges and stale async responses. Test history/focus and query-to-Map serialization rather than duplicating the UI's markup in tests. The old finder should not become a second engine.

This research PR changes documentation and review evidence only. It does not ship a popup, rename a production page, migrate Supabase or deploy anything. Browser viewport inspection is complete; primary participant validation remains open.

The two phone concepts were checked at 390 and 1440 px preview widths, in light and dusk. Query entry, grouped event/place matches, Enter and View all results, no-query All events, all-date search scope and return to Now were exercised. These are concept behavior checks; physical keyboards and the proposed desktop dialog remain to be validated.

Repository checks on 7 October: `npm test` passed all **338** tests and `npm run typecheck` passed. These checks protect the unchanged codebase; they do not validate the design hypotheses.
