# Design brief: WanderAlt redesign

The brief for a Claude Design session (`/design` in Claude Code). Keep it current: when a design is chosen, record the decision at the end.

## Product

WanderAlt answers one question: *what's on tonight in Tallinn that's worth walking to?* It covers independent and alternative culture: DIY gigs, club nights, arthouse film, contemporary art and dance, talks, record and flea markets, and the venues that host them (record shops, bookshops, galleries, thrift shops, small cinemas, arts centres, clubs, theatres).

**Audience, in order:**
1. Travellers staying 2–5 days.
2. Expats who read English, not Estonian.
3. Locals who don't follow every channel.

They decide on the day, on a phone, often while already out.

**Every row answers four things:** when (a time), how far (walking minutes), what it is (kind, price), and who says so (the venue or channel it came from). Those four facts are the product; everything else serves them.

## What exists (keep the structure, redesign the look)

- **Explore** (`index.html`): search field; Where / When / What capsule; tabs All · Events · Places; sections "Tonight", "Open right now", "Places".
- **Tonight** (`discover.html`): seven-day density strip, list of rows, filter sheet, map mode.
- **Event page** (`detail.html?id=ev_…`):
  - photo;
  - English title, original title under it;
  - English one-line summary;
  - cells: doors · entry · walk;
  - buttons: Tickets · Walk me there · Add to calendar · Save · Add to a list;
  - "In their words" (the source's own text), address;
  - **The venue** row linking to the venue page;
  - "Where this came from".
- **Venue page** (`detail.html?id=tallinn-…`):
  - photo;
  - kind · area;
  - cells: closes · entry · walk;
  - Website / Instagram / Facebook;
  - **Listed here next** (its programme);
  - opening hours week;
  - provenance.
- **Saved**, **You**, **About**, **404**.

Live data: about 400 events a fortnight and about 220 venues, all Tallinn. Titles arrive in Estonian or Russian with an English title and summary added by the pipeline. About half of venues have opening hours, and a minority have photos. **Design for missing data**: no photo, no hours, no time (date only), no price.

Real examples to design with (from the live database, September 2026):
- "Lai Tsung Yun (TW) | Sander Saarmets | Glitch Korts" · gig · Uus Laine, Kalamaja · Thu 19:00 · €10 · via @fienta
- "Öömaaeg" (English title to come) · theatre · Von Krahl, Telliskivi · Mon 19:00 · €25
- "Screening at Kai Cinema: Sisters" · film · Kai Art Center, Noblessner · Sun 18:00 · €6
- "Heldeke Vinyl Sessions" · gig · Heldeke!, Kalamaja · Wed 17:00 · free
- Venues: Kino Sõprus (cinema, Old Town), Biit (record store), Raamatukoi (bookshop), Tütar gallery, Helitehas (club), Kultuurikatel (arts centre)

## What users told us is wrong (end-user review, 27 Sep 2026)

1. **English doesn't lead.** A visitor can't tell a premiere from a children's show.
2. **Nothing to search.** Search was hidden in a sheet. It's now a field on Explore; make it the first thing.
3. **Empty at night.** "Nothing we can confirm is open" appears exactly when people look. At night the answer should be "still going" and "late": clubs, bars, films starting after 21:00.
4. **The map is weak.** Near-black in dark mode, events only. It needs venues too, as a clearly different layer.
5. **Areas.** People know Kalamaja, Telliskivi, the Old Town, Noblessner, not district names. Areas now arrive as asum names; give them a role.
6. **No reason to come back.** No interests, nothing new since last visit.

## Screens to design

At 390 px (primary) and 1440 px, each in light and dark:

1. **Home / Tonight**
   - A search field on top.
   - "Starting soon" and "Still going" (after 22:00).
   - "This weekend".
   - Venues open now nearby.
   - One screen that is never empty.
2. **Event row and event card**
   - Time and walk on a rail.
   - English title first, original title quiet underneath.
   - Venue · area · price.
   - One tag that says why it's listed ("arthouse", "DIY", "techno").
3. **Event page**
   - Tickets as the primary action.
   - Add to calendar, Walk me there, Save.
   - The venue as a small card with its photo.
4. **Venue page**
   - Identity (photo, or a strong typographic fallback when there's none).
   - Open now or closed, with the week's hours.
   - Instagram, Facebook and Website as icons.
   - Programme grouped by day.
   - Follow.
5. **Map**
   - A light basemap by default.
   - Two layers with distinct pin shapes: events tonight and venues open now.
   - A drawer listing what's in view by walking time.
6. **Places list**
   - Filter by kind: records, books, galleries, thrift, cinema, clubs, theatres.
   - Sorted by distance, then open now.
7. **Interests** (optional first run): three taps, skippable.
8. **States:**
   - loading skeleton;
   - offline;
   - an event that has ended;
   - a venue with nothing listed;
   - no location permission;
   - a search with no match.

## Direction

- **Mood:** the paper culture of Tallinn's scene: gig posters on Telliskivi walls, zines, risograph flyers, cinema programmes. It should read like a well-made club listings sheet, not a travel app and not a map app.
- **Show three distinct directions first** (typography, colour and density), each applied to the same Home and event page, before going deeper on one.
- **Typography:**
  - Plus Jakarta Sans, Fraunces and Geist Mono are self-hosted today and can be replaced.
  - Estonian, Latvian and Russian characters must render (õ, ä, ö, ü, š, ž, Cyrillic).
- **Colour:** one accent. The current one is petrol `#055959`, with lime meaning "now". Colour never carries meaning alone.
- **Do not use:**
  - a cream or off-white background;
  - italic accent words in headlines;
  - numbered "01/02/03" section labels;
  - monospace for every small label;
  - pill-shaped buttons everywhere;
  - glassmorphism beyond the two existing bars;
  - purple-to-blue gradients;
  - emoji;
  - a generic grid of identical rounded cards;
  - anything that looks like Google Maps or a booking site.
- **Voice** (from `AGENTS.md`):
  - handles start with `@`;
  - no exclamation marks;
  - no marketing register;
  - never "discover" as a verb;
  - metadata reads "Area · kind · day + time".

## Constraints for the build

- The site is static HTML, one stylesheet (`wa.css`, design tokens as CSS variables) and vanilla JS. There is no framework, so Claude Design's `/design-sync` (which needs React components) does not apply. Design freely; the handoff is implemented against `wa.css` and the page scripts.
- Strict Content Security Policy:
  - no inline scripts;
  - no third-party scripts, analytics or web fonts from a CDN (fonts are self-hosted).
- WCAG 2.2 AA:
  - tap targets of at least 44 px;
  - visible focus;
  - respect `prefers-reduced-motion`.
- Listing text is untrusted. Designs must survive very long titles (three lines), all-caps titles, and titles in Cyrillic.

## Handoff

When a direction is chosen, export it and "Send to Claude Code". Claude Code then implements it page by page and checks each page at 390 and 1440 px in both themes. Record the chosen direction and its tokens below.

## Decisions

- (none yet)
