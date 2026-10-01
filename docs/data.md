# Data and pipeline

Supabase project `aqnsmmbrspkbfcvougeh` (eu-west-1, Postgres 17). The schema is `supabase/migrations/`; the latest change is `20261001130000_email_digest.sql`; `20260927185820_pipeline_runs.sql` adds the run history. Add changes as new, later-dated migration files.

## Tables

| Table | Holds | Public read |
|---|---|---|
| `sources` | Where listings come from, plus each source's health (`last_ok_at`, `last_yield`, `consecutive_failures`, `last_error`) | `id, city, kind, url, handle, label` only |
| `raw_items` | Exactly what a source said, once per `(source_id, external_id)`, with a content hash and a processing `status` | no |
| `places` | Venues: name, folded `aliases`, coordinates, retained `osm_ids`, `kind`, neighbourhood, liveness observations, `merged_into` | yes, unless `hidden` |
| `events` | One row per dated occurrence: source facts, translations, classification, `status`, `flag`, `merged_into` | published, unmerged, not at a known closed venue |
| `event_sources` | Provenance and the last flag observed from each source | for published events, without `raw_item_id` or per-source `flag` |
| `place_redirects`, `event_redirects` | Retained ids pointing to canonical rows | yes; event targets must be published |
| `place_match_reviews` | Uncertain pairs, evidence, and `pending` / `separate` / `merged` decisions | no |
| `place_verification_reviews` (view) | Canonical venues awaiting activity evidence or review, including expired confirmations | no |
| `place_merge_log`, `event_merge_log`, `place_liveness_log` | Before/after snapshots, provenance, moved events and undo history | no |
| `pipeline_runs` | One row per run: neurons and model calls spent, events written, whether every source was healthy. Also the daily Workers AI budget | no |
| `bookmarks`, `saved_lists`, `saved_list_items` | Each user's saves | own rows only |
| `going` | Who marked "I'm going" on which pick | own rows only |
| `problem_reports` | Problems readers flag on an event: fixed reason, optional 280-character note, status `open` / `fixed` / `dismissed` | no (insert only; read at `/review` with the secret key) |
| `follows` | A signed-in reader's follows: `place:<id>` or `src:<handle>`, a label and city | own rows only |
| `digest_prefs` | Per reader: weekly digest and change-note switches (both default off), the unsubscribe token and last send; readers may write only the two switches | own row, select only; switches writable |
| `change_notices` | Which cancelled or postponed events a reader was already told about | no (service role only) |
| `going_counts` | How many are going to each pick, kept by a trigger on `going` | yes |

`picks` and `venues` are read-only views shaped like the old tables, so the current pages, `functions/_middleware.js`, `og-image` and `calendar-feed` read the new data unchanged. They go away with the front-end rebuild.

"Tonight" and "this week" are never stored; they are computed from `starts_at` in Europe/Tallinn.

## Pipeline

`pipeline/run.ts`, plain TypeScript that Node 24 runs directly. GitHub Actions runs it every six hours (four runs a day keep Workers AI inside its free allocation) (`.github/workflows/pipeline.yml`) and on demand from the Actions tab.

1. Sync `pipeline/sources.tallinn.json` into `sources`. The JSON file is the source of truth; add a source by PR. A source removed from the file is marked inactive, which also hides it publicly.
2. Collect each source; store only new or changed items in `raw_items` (compared by content hash). Exact unchanged items seen again refresh their event provenance timestamps without another model call or changing flags.
3. Read pending items into candidates: Fienta and JSON-LD are parsed; Telegram, HTML pages and RSS go to a model (`docs/models.md`). An item that fails is retried on the next runs and parked as `error` after three attempts. Prose items wait as `new` while no model is available.
4. Classify candidates in batches.
5. Reconcile stored venue and event copies, check a due OSM identity batch, collect the venue catalogue, resolve candidates to canonical places, and write events and provenance (details below).
6. Classify earlier events that were written without a model, archive ended events, verify venue activity from recent trusted listings and a small own-site batch, delete processed raw items older than 60 days, record source health.

A run exits non-zero when a source fails or returns nothing, which turns the Actions run red. A prose source whose items are fetched but yield no events is logged, since that usually means the page was redesigned.

### English copy

`pipeline/english.ts` edits published, unarchived events independently of classification: an English title (including translated production titles), 1–2 factual English sentences, and a bounded original excerpt. `picks.title` and `picks.quote` serve this same copy to Tonight, Programme, Map, Saved, venue programmes, calendars and social previews. Artist, band and venue names retain their identity.

Each pipeline run reserves six free editorial calls: up to 20 pending events before collection, then up to 40 after writes. A hash of source title, description, venue, kind and URL makes unchanged copy reusable and changed input due again. Invalid or unavailable answers remain pending for a later run. Classification refreshes never overwrite saved English fields. Run `npm run pipeline:english -- 300` for a bounded backfill with a valid service-role key; it edits only copy fields.

Full structured descriptions are already collected. Thin listings can fetch their exact source URL, with a ten-second/400 KB limit and cached repeated URLs. Kino Sõprus checkout URLs follow the exact ScreeningEvent’s workPresented identity to its film synopsis and official translated title. Only a matching Event node or a matching sole h1 supplies fuller copy; matching Movie descriptions are accepted on that identified film page. Programme indexes and related events are rejected. Unsupported and login pages fall back to filed facts. Inputs are capped at 8,000 characters and organiser contacts are scrubbed. Original excerpts are limited to 2,000 characters and loaded on disclosure, with their source URL and text language.

`event_languages` records spoken/performance languages only when the model cites an exact statement present in the source. The containing clause must identify that language and a language statement; subtitle and interpretation clauses are rejected. Subtitles, a venue's nationality and the language of an announcement do not establish a performance language. The In English filter and interest use this evidence instead of classification tags. Unknown language stays unstated.

### Venues

Places come from two directions. The **catalogue** (`pipeline/venues.ts`, source `osm-tallinn`) reads Tallinn's record shops, bookshops, galleries, thrift shops, arts centres, cinemas, clubs, community centres and theatres from OpenStreetMap through Overpass once a run. **Events** add the venues they happen at. Matching uses retained OSM identities, names/aliases and location evidence; a catalogue venue fills missing facts without replacing existing facts. The store retains colliding names, so two branches cannot overwrite each other in memory. An ambiguous event venue stays unresolved rather than creating another ambiguous copy.

**Enrichment** fills a venue page, 60 places a run, each only from a source that identifies the venue: its Wikidata item (photo from Commons, website, Instagram, Facebook, description), then its own homepage (Instagram and Facebook links whose handle shares a word with the venue's name or domain, `og:image`, meta description). A homepage that has become a domain-parking page is ignored. `enriched_at` records that a place was done.

A venue name is matched against every place's name and `aliases` (lowercased, accents folded). A new name becomes a place and is looked up twice in Nominatim:

- by its address, reduced to the form Nominatim matches ("Kentmanni tänav 28, 10116 Tallinn" becomes "Kentmanni 28, Tallinn"; "maantee" and "puiestee" become "mnt" and "pst"), for coordinates;
- by its name, for OpenStreetMap's own record of the venue. That record's id and a `kind` from its tags are kept only when the names agree and it lies within 250 m of the address, because a name alone can match a namesake across town.

Places still unplaced or unidentified are retried, ten per run, at most 100 lookups a run, with at least 1.1 seconds between requests, including failures. Venues OpenStreetMap cannot name get a kind from the model, judged by name, address and the events held there.

**Areas.** A place's `neighborhood` is the asum a visitor knows (Kalamaja, Old Town, Pelgulinn), from Nominatim's `quarter`, never the district (Põhja-Tallinna linnaosa). Active places still labelled with a district or nothing are reverse-geocoded, 40 a run, from the same lookup allowance. The site folds small asum names into the areas a visitor looks under (`render.js` `FOLD` and `AREA_LIST`: Old Town, City centre, Kalamaja, Telliskivi, Noblessner, Kopli, Põhja-Tallinn, Kristiine, Pirita, Lasnamäe, Mustamäe, Õismäe, Nõmme); only names whose district is certain are folded, and the Tonight list and the Programme's area filter show just those areas. A venue or area written in Cyrillic is never shown, and the pipeline never creates a place from it: extraction is told to give Latin-script venue names, `resolve` refuses a Cyrillic name, and each run removes earlier such places (no OSM id, no coordinates), clearing the venue on the events that named them.

The site's Places tab and venue map pins recommend only freshly verified, canonical places whose `kind` is one of `VENUE_KINDS` in `supabase.js` (record store, bookshop, gallery, club, thrift, arts centre, cinema, community, theatre, bar). OSM supplies a kind for some places; set the rest in the Table Editor. Unverified records remain available for admin review and direct detail links, without an Open now claim.

### Duplicates

Each event id is a hash of city, title, Tallinn date and time, and place. Because two sources rarely title a show the same way, a candidate also joins an existing upcoming event when both are at the same place within 30 minutes and at least 60% of the shorter title's words appear in the other (`pipeline/dedupe.ts`). Repeated cinema prefixes such as "Screening at Kai Cinema:" and "Linastus Kai kinos:" are removed for comparison so two different films cannot match on their room name alone. Kai's collector uses the canonical name Kai Art Center. Every source that listed it gets an `event_sources` row.

Eligible matches are ranked by closest time, strongest title overlap, then id. Stored occurrences are reconciled again after venue merges, choosing a published row, then the oldest observed id. Timed and date-only occurrences stay separate in this reconciliation. Different performance dates and separate screenings remain separate. Title-only or coordinate-only event merging is never used. Thresholds remain 30 minutes / 60%; the observed misses were caused by different venue ids.

`pipeline/place-match.ts` chooses the oldest venue id deterministically. Shared OSM ids merge unless coordinates conflict by more than 250 m. Otherwise matching requires an exact address or at most 100 m, compatible kinds, matching room numbers and no conflicting address. Exact names/aliases, a distinctive name with generic/legal suffixes removed, or edit similarity ≥ 0.92 with an exact address or at most 40 m can merge. Weaker matches become private reviews. Distance alone never merges neighbours; conflicting coordinates over 150 m cannot prove a name match. Translated names, different halls, missing locations and moved businesses can still need review.

`merge_places` atomically adds aliases and all OSM identities, fills missing facts, moves events, retains the other row as hidden, flattens old redirects and logs the change. `merge_events` retains both source observations, archives the extra occurrence and logs an old-id redirect. No row is deleted. `catalogue_redirects` is an invoker view used by the site: old detail/map links, saves and list entries resolve to one canonical id. Tonight shelves also avoid repeating an id across sections. Sentence search only filters the loaded catalogue; neither reader generates listings.

### Place liveness

The check calls Overpass on up to four mirrors in turn. If all fail, the run logs it, skips the venue catalogue and retries next run; it does not turn the run red, because it is maintenance, not a source.

`pipeline/place-liveness.ts` re-queries stored node/way/relation ids, without category filters that could hide disused objects. Each identified canonical place is due every seven days; each pipeline run checks the oldest 50 due places in one Overpass request. Unidentified places need a manual check or later Nominatim identification. This confirms what OSM currently records, not independently that a business is operating.

`osm_checked_at`, `osm_last_seen_at`, `osm_state`, `osm_note` and `osm_missing_count` record the result. Explicit venue lifecycle tags (`disused`, `abandoned`, `closed`, `removed`, and their category prefixes) can set `status=closed`; every retained identity must agree. A recognised live alternate identity keeps the OSM observation present. Missing objects, renamed businesses and conflicting identities stay available for review, with recommendations controlled separately by verification. Opening-hours `off` and a disused building part never prove permanent closure. OSM presence never reopens a closed venue; reopening requires an explicit admin verification. `osm_auto_close=false` disables automatic closure for one row. Conflicting closure states go to duplicate review, and the database prevents merging a closed row into an active one.

Overpass requests are sequential, time-bounded and reject partial or stale replies. HTTP 429/406 stops that run without trying another host. A failed check changes no venue visibility; the catalogue request is skipped for that run and `osm-tallinn` keeps its status. A failed catalogue read (Overpass timing out on every mirror) also keeps the run green while the last good read is under 48 hours old, and marks `osm-tallinn` failing after that. Every successful observation has a private before/after audit row. A closed venue drops out of active lists and its retained detail page says it is listed as closed.

### Operating verification

`verification_state` is `unverified`, `verified`, `review` or `closed`. Evidence lives in `verification_source`, `verification_url`, `verification_note`, `verified_at` and `verification_checked_at`. The `venues` view exposes `status=active` only for an active venue with a verified observation within 90 days, so existing public clients also exclude unverified recommendations. Expiry is computed when queried. This confirms recent activity, not that a door is open right now; opening hours remain separate.

`verify_event_places` accepts a published, unmerged, unarchived event dated from 30 days ago to 90 days ahead, observed within seven days by an active curated source or a trusted Fienta organiser. Cancelled and postponed events do not qualify. It uses existing provenance and costs no model calls. Newer website concerns and manual reviews block older listing evidence.

`pipeline/place-verification.ts` checks up to thirty due own websites sequentially per run (`--max-website-checks`, at most 40), at most one venue per host in that batch and once per venue per seven days. Requests stop at ten seconds, with no retries; a page over 400 KB is read as far as 400 KB, not refused. When the homepage names this venue but shows no dated event, the one link on the same host whose address or text says events or programme (`programmeLink`) is read under the same rules, and a recent dated event there at this venue verifies it. Recent schema.org events must identify the same venue as their location; HTTP 200, undated hours, a copyright year or old promotion proves nothing. Parked domains, identity changes and explicit closure wording go to review, never directly to permanent closure. A 403 is asked for once more with curl and the same user agent, since some hosts refuse only Node's TLS handshake (Cargo sites such as uuslaine.com); the same fallback serves the logo step (`getHtml`). A timeout, challenge, other HTTP error or unsupported content preserves previous verification and records the attempt in `website_checked_at`. Console logs show outcomes; `place_verification_reviews` lists unresolved or expired records. A weaker undated homepage cannot erase fresh dated evidence. Fresh manual confirmations and manual reviews are protected from automatic replacement.

There is no Google Places API integration. It requires a billing-enabled project, so verification uses free OSM, trusted programmes, own websites and documented admin decisions. A manual Google Maps cross-check can support a review; do not bulk-import its business database or invent a paid API fallback.

### Review and undo

Use `npm run places:audit -- --out /tmp/places.json` to inspect a read-only plan, or `npm run places:maintain` to reconcile, check one OSM batch and verify activity. Both require a valid service-role key. Inspect `place_match_reviews` in the Supabase Table Editor: confirm a pair with the service-only `merge_places` RPC, or set `state=separate` to suppress it. The CLI accepts `--merge <duplicate-id> --into <canonical-id> --reason "verified source/address"`. Console output includes merge reasons, distances, OSM states and undo ids.

Inspect `place_verification_reviews` and `place_liveness_log` before a manual activity decision. Record it with `npm run places:maintain -- --verify <canonical-id> --state verified --url https://venue.example/current-programme --reason "dated independent evidence"`; `--state review` withholds recommendations, and `--state closed` confirms permanent closure and disables automatic reopening. Use an actual evidence URL and reason. Correct a decision by recording another manual state; snapshots retain both observations. Do not confirm a venue solely from stale OSM hours. `--no-verification` skips the pipeline activity batch; `--max-website-checks 0` retains event verification while skipping homepages.

Admin SQL (service role only; replace the example ids):

```sql
select public.merge_places('duplicate-id', 'canonical-id', 'verified source/address');
select public.undo_event_merge(123); -- id from event_merge_log
select public.undo_place_merge(456); -- id from place_merge_log
```

Undo event merges before their venue merges, and later dependent merges before earlier ones. Undo restores retained rows and original links, preserves later edits and observations, and suppresses the pair from future reconciliation. For a mistaken liveness closure, inspect `place_liveness_log`, confirm current activity with `record_place_verification(..., 'verified', 'manual', ...)` and set `osm_auto_close=false`; later checks still record evidence.

### Flags

`events.flag` is what a source says about the show: `cancelled`, `postponed`, `sold_out` or `few_left`, else null. Every processed observation refreshes its `event_sources.flag`; `refresh_event_flags` derives the most serious flag across retained source observations. An unchanged source's cancellation survives a different source's update, and a flag clears when all sources that reported it clear it. The migration conservatively seeds existing provenance from the stored event flag until each source is read again. It comes from structured fields where they exist (Fienta `event_status`, schema.org `eventStatus` and `offers.availability`), from the model reading prose (`state` in the extraction schema), and from `pipeline/flags.ts`, which reads the title and short description lines for words like "sold out", "välja müüdud", "jääb ära" or "отменён". Prose counts only when the phrase is shouted or leads its line, so refund policies don't flag a show. Fienta's cancelled events are kept and flagged, not dropped.

### Contact details

Descriptions pass through `scrubContacts` (`pipeline/util.ts`) before they are stored: email addresses, phone numbers and any label left bare by removing them are dropped. `raw_items` keeps the source's text as it was, service-role only.

### Status

| Source | Fit (`relevance`) | Status |
|---|---|---|
| Trusted (`curated`, or a Fienta organiser in `trusted_organizer_ids`) | ≥ 0.3 or not yet classified | `published` |
| Trusted | < 0.3 | `review` |
| Other | ≥ 0.6 | `published` |
| Other | 0.35 to 0.6, or not yet classified | `review` |
| Other | < 0.35 | `rejected` |

Once written, an event keeps its status; later runs refresh its facts only, and a run without a model leaves the earlier classification alone. To publish or reject by hand, open `/review` (not linked from the site, `noindex`, disallowed in `robots.txt`), paste the Supabase secret key (kept in that tab's sessionStorage only) and press Publish or Reject; it sets `status` and a `status_note` starting with `manual`, which no run changes, not even the late classification of unclassified events. The Table Editor works too: edit `status` and start `status_note` with `manual`.

Before any model is asked, titles naming a format WanderAlt never lists (conference, summit, forum, seminar, expo, trade fair, hackathon, business, networking, job fair; Estonian forms too) are rejected by rule, whoever lists them: Kultuurikatel rents its halls out and lists these beside its gigs.

Model output decides publication for untrusted sources, and listing text is written by strangers, so a crafted post could talk its way to a high fit score. The prompts tell the model to ignore instructions in the text; the review queue is the backstop.

### Sources (Tallinn)

| id | Kind | Notes |
|---|---|---|
| `fienta-tallinn` | Fienta public API | Every public Tallinn event on Fienta. Organiser email and phone are dropped at collection. |
| `kino-soprus` | JSON-LD | `ScreeningEvent` markup on the full schedule page (`/kinokava/`), 45 days ahead. |
| `kultuurikatel` | WordPress REST | The venue's own events post type (`/wp-json/wp/v2/events`, ACF date fields). Date and ticket link are structured; most listings carry a date but no time. |
| `telliskivi` | HTML → model | Telliskivi Creative City's events page. |
| `vabalava` | HTML → model | Vaba Lava's performance schedule (`/mangukava/`), Tallinn tab. |
| `kai` | WordPress REST, Kai's own routes | Kai Art Center, Noblessner: `/wp-json/www-api/v1/calendar` (films, each screening dated) and `/current-events` (exhibitions). One post per language; the English one is kept. School-ticket screenings and closures are skipped (`skip_titles`). Read by `sources/kai.ts` through `config.shape: "kai"`. |
| `paavli` | HTML → model | Paavli Kultuurivabrik's events page. Its "SOLD OUT" and "80% SOLD OUT" labels become flags. Also on Fienta; duplicates merge. |
| `saal` | HTML → model | Kanuti Gildi SAAL's programme: contemporary dance, performance, talks. |
| `uuslaine` | HTML → model | Uus Laine's calendar page. |
| `tg-sigmundtells` | Telegram → model | Public channel preview, `t.me/s/…`, no API key. |
| `osm-tallinn` | OpenStreetMap | Not events: the venue catalogue (below). |
| `instagram-venues` | Instagram Graph API | Not one account: the recent posts of venues we already know, for places whose record carries an Instagram profile (see below). |

A source whose config names a `venue_name` is a single venue's own programme: every event it lists is placed there, whatever hall name the page uses (Vaba Lava's "Suur saal" and "Väike saal" are Vaba Lava). Give every curated one-venue source a `venue_name` and `venue_site`.

Not used, and why: Instagram and Facebook (no free way to read public posts or events), Resident Advisor (its terms forbid scraping; there is no public API), Eventbrite (search API removed), Meetup and Luma (their APIs need paid plans), Substack newsletters such as Gamma Tallinn (Substack refuses GitHub's runners), Piletilevi (no public feed), Visit Tallinn (no feed; its listings are mainstream). Elektriteater is in Tartu, not Tallinn.

The `probe-sources` job in `ci.yml` runs a dry run of the newest sources on every pull request, without keys: its log shows how many items each one collects. It never fails the check.

### Running it

```bash
npm run pipeline:dry                          # read everything, print, write nothing
node pipeline/run.ts --dry-run --source kino-soprus --out /tmp/x.json
npm run pipeline                              # needs SUPABASE_SERVICE_ROLE_KEY
npm test && npm run typecheck
```

Keys come from the environment or a git-ignored `.env`: `SUPABASE_SERVICE_ROLE_KEY` (required to write) and the model keys in `docs/models.md`. In GitHub they are repository secrets of the same names.

GitHub pauses scheduled workflows in a public repository after 60 days without a commit. If the pipeline stops, re-enable it on the Actions tab; the first 36 events were loaded by hand on 27 September 2026 and are ordinary rows.

## Security

- The anon key in `supabase.js` is public on purpose. RLS: catalogue tables are SELECT-only for the public, `raw_items` is service-role only, users touch only their own saves.
- The service-role key lives only in the Actions secret and local `.env`; it never reaches the browser.
- Every SECURITY DEFINER function in `public` is an anon-callable RPC: revoke EXECUTE from `anon, authenticated, public` in the same migration.
- `pg_net` is not installed and must stay that way (Supabase grants `anon` EXECUTE on `net.http_*` through a grant we cannot revoke).
- Listing text is written by strangers. Pages escape every field with `WA.UI.esc()` and pass every DB-sourced URL through `WA.UI.safeUrl()`; the pipeline only stores http(s) URLs.

## Edge functions

| Function | `verify_jwt` | Used by |
|---|---|---|
| `og-image` | false | `functions/_middleware.js` share cards (satori 0.33.4, resvg-wasm 2.6.2) |
| `calendar-feed` | false | the About page's calendar subscription. Reads `picks` with the anon key, so only published events appear, with their real `starts_at`/`ends_at` for the next 30 days. `?place=<places.id>` and `?handle=@source` narrow the feed to one venue or source (a malformed place is 400). `?id=ev_…` downloads one event; invalid ids are 400 and missing records 404. Cancelled entries retain their UID with `STATUS:CANCELLED`, postponed entries are tentative with an explicit notice. Text escapes all newline forms and folds at 75 UTF-8 octets. |

Deploy only through the Supabase MCP `deploy_edge_function` tool, always passing the function's existing `verify_jwt` (the tool defaults it to true). Committing does not deploy, and deleting a directory does not undeploy. The share surface fails open with a valid card, so judge the rendered card; `og-image?…&debug=1` returns the error instead.

## Images

A venue or event photo is looked up by identity, never guessed from a name; no photo draws the category mark. Images are stored as source URLs with attribution, not uploaded copies. Structured sources supply artwork for their own event or film. A prose post's photo is used only when the extractor finds one distinct show (repeat dates can share a poster); roundups get no event image. A text-only refresh preserves existing reviewed artwork and its credit.

An event shows its own artwork; without it, its venue's own logo or photo (the `picks` view carries `venue_image_url`, `venue_image_attr` and `venue_image_source` beside the event's); without either, its category pictogram. The venue picture is the venue's, found by identity, and the detail page says so ("Venue logo", "Venue photo"). Venue enrichment uses Wikidata P18 for photos; a homepage's `og:image` is not evidence of a venue photo because it can show a current event, an advert or a placeholder. A venue has one picture slot, so a logo fills it only when there is no photo.

**Venue logos** (`image_source: logo`) come only from the venue itself: its Wikidata logo (P154, when there is no P18 photo), a `logo` its website declares for its organisation in JSON-LD, an `og:image` whose file is named as a logo, or the first `<img>` on the site's own host with a logo filename. Sponsor and partner ribbons (other hosts, other names), icons, banners and placeholders are refused, and so is a parked domain. A place with a website, a Facebook page or a Wikidata item and no picture is looked at again after seven days. After those, the site's own header logo is taken: the image inside a link to its own homepage (`homeLinkImg`), or on a Cargo site the media item that links home (`cargoHomeLogo`, which has no `<img>`); then an icon the site declares (`declaredIcons`: touch icons and .ico files). These weaker candidates are accepted only after `pipeline/imageprobe.ts` reads the file header: a header logo needs 48 px on the short side and no strip shape (over 8:1); an icon needs 128 px and to be nearly square. A 16 px favicon fails. The city portal's own mark (tallinn.ee) is never a venue's logo, and a site that redirects to another host gives nothing. Last of all, a Facebook page link the record or the site gave (a named page must share a distinctive word with the venue's name, as `handleFits` tests; a numeric page id is taken from the record) yields the page's public profile picture through Facebook's documented Graph API picture endpoint (`graph.facebook.com/<page>/picture`, no login or token; not a silhouette, 100 px or more). It is stored as that address and served by our own function `functions/img/fb`, so readers never contact Facebook and the signed CDN address is never kept. `--no-facebook` skips it. **Instagram** has no anonymous equivalent (requests are refused, and getting past that would need a login or a spoofed crawler, which we do not do). The official route is the Instagram Graph API's `business_discovery` (`pipeline/instagram.ts`): our own Instagram Business account (`wanderalt`, linked to the WanderAlt Page in the WanderAlt business portfolio) asks for another public Business or Creator account by the username the place already carries, and gets its profile picture. The answer must name the account asked for. The picture address is a signed CDN link that expires, so the file (JPEG, PNG or WebP, up to 2 MB) is copied into the public Storage bucket `venue-pictures` (migration `20260930181740`) and that address is stored, attributed to the venue's Instagram account. It runs after the website and Facebook steps, for up to 20 places a run (`--max-instagram`, `--no-instagram` skips), and needs the repository secrets `INSTAGRAM_ACCESS_TOKEN` (a system user token of the app *WanderAlt pipeline* with `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, set never to expire) and `INSTAGRAM_BUSINESS_ID`. A personal account, a missing name or a private account simply gives nothing; the same call also reads an account's recent posts as a source (*Instagram venue posts* below); a refused token (Meta codes 190, 10, 200 or a rate limit) ends the step for that run with one line. To test the token alone, run the workflow by hand with *instagram_check* ticked: it makes two lookups and writes nothing. The accounts, tokens and posting scripts are described in `docs/social.md`. A place gets a website only from a link that names it: its OSM tags (`website`, `contact:website`, `operator:website`, `url`), its Wikidata item, a curated one-venue source's `venue_site` (`website_source: source`), or an Overture Maps record (`website_source: overture`). A place with an OpenStreetMap id and no Wikidata item is matched once a run to the item that names that object as its own (P11693, P10689, P402), in one query; two items for one object are left alone. Vector logos from Commons are served as PNG renders, since the image proxy takes raster only.

**Overture Maps** (`pipeline/overture.ts`) is the source that works in any city, since OpenStreetMap and Wikidata are thin where venues are small. Its places theme is free and open (CDLA Permissive 2.0); a run reads one bounding box around the places that lack a website or a profile, with the DuckDB CLI, which the workflow installs (without it the step logs "skipped"). A record is taken as the place only when all of these hold: within 75 m, a cultural or nightlife category, not closed, confidence 0.5 or more, and every distinctive word of the shorter name is in the longer (inflected forms count; generic words like kino and teater do not). Two matching records with different websites are no answer, and listing, ticketing, delivery and social sites are never a website (a Facebook or Instagram address becomes the profile). Every match is logged with the record's name and distance. Places without coordinates cannot be matched; give the source a `venue_site` instead. To skip it: `--no-overture`. On 29 September 2026 it matched 72 of 340 places, 40 with no website before; Heldeke, Kanuti Gildi Saal, Krulli and Fotografiska have no record. The stored Instagram and Facebook profiles are used to confirm that a link belongs to the venue (`handleFits`); their pictures, feeds and posts are never fetched, since there is no free reliable API and it breaks their terms. Logos are drawn whole on a white tile in venue lists, map cards, venue links and the detail page.

**Event posters** come from `pipeline/posters.ts`: for up to 30 upcoming published events without artwork, tried in a fresh random order each run so the soonest ones cannot use every attempt a run reads the event's own page (its `url`, `ticket_url` and provenance links, never a social profile) and takes the image only when the page's JSON-LD Event or headline has the event's title. On a page that lists a series, the node for the event's day is used, and no node for that day means no picture. Fienta's extensionless image proxy is read by its `file` parameter. Pages behind a bot challenge (piletitasku.ee) and Facebook events are skipped. A logo, a default or share image, or a picture already on two other events is refused. The credit reads "Image from {host}". `--no-posters` skips the step.

**Owner-supplied files** live in `assets/venues/` and `assets/events/` and are served from `https://wanderalt.app/assets/…`, cached as immutable: give a changed file a new name. The migration `20260929130000_venue_logos_and_poster.sql` attaches the Südalinna Teater and Philly Joe's logos and the COSMODOLPHINS poster, and only where no picture is stored. Apply it after the files are deployed.

Reviewed physical venue photos can retain `image_source: website`.

Wikimedia images are served through `functions/img/wm/[[path]].js` (allowlisted hosts, raster only, cookies stripped). A trigger rewrites `thumb.wikimedia.org` to `upload.wikimedia.org` and clears stock-library URLs. Share metadata uses the event's own artwork when available, otherwise the branded `og-image` card; its lockup is generated with the static brand assets.

## Instagram venue posts

The source `instagram-venues` (`pipeline/sources/instagram.ts`, kind `instagram`) reads event announcements on the Instagram accounts of venues we already know. Each run it picks 15 places at random whose record carries an Instagram profile (`accounts_per_run`), asks the Graph API for their latest 10 posts (`business_discovery`; Business and Creator accounts only, anything else gives nothing), keeps captions of at least 20 characters from the last 14 days (`max_age_days`), and stores each as a raw item (`ig:<username>:<post code>`, the post link as its URL). A model then reads the caption like a Telegram post, told which venue's account it is. An event it finds gets that venue unless the caption names another place. The source is not curated, so events go through classification and the review queue like any other untrusted source; they carry the post link as their source. Posts are read for facts, never republished, and pictures are not taken from them. Without the two Instagram secrets, in `--dry-run`, or when no account has recent posts, the source yields nothing and does not turn the run red.

## Email alerts

`pipeline/digest.ts` (logic in `digest-core.ts`) runs daily on GitHub Actions (`.github/workflows/digest.yml`, 13:30 UTC; manual runs default to a dry run). Only readers who switched an alert on in You are mailed.

- **Change note:** a cancelled or postponed event the reader saved or marked going, once per `(event, flag)` (`change_notices`). Runs every day.
- **Weekly digest:** the next seven days at followed places and sources (`follows`), soonest first, cancelled and postponed events left out. Sent Thursday to Saturday to readers not mailed in the last six days.
- **Never empty.** No matching event, no mail. At most `DIGEST_DAILY_CAP` (default 90) mails a run, under Resend's free 100 a day; the rest follow the next day.
- **Unsubscribe.** Every mail has a `List-Unsubscribe` header with one-click POST and a visible link to `/api/unsubscribe?t=<token>` (`functions/api/unsubscribe.js`). Opening the link shows a button; the POST turns both switches off.
- **Matching** is by place id and source handle, never by a typed name. There is no model call anywhere in sending.
- **Secrets:** repository secret `RESEND_API_KEY` (and the existing `SUPABASE_SERVICE_ROLE_KEY`); the Pages project needs `SUPABASE_SERVICE_ROLE_KEY` for the unsubscribe function. Sender `digest@wanderalt.app` must be verified in Resend (`DIGEST_FROM` overrides it). Run `npm run digest:dry` to preview.
