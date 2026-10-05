# Social accounts

WanderAlt has a Meta setup and manual publishers for Threads, Instagram and its Facebook Page. Facebook posting uses the existing system user token to obtain the Page token for the exact `FACEBOOK_PAGE_ID`; it never selects another assigned Page. Nothing posts without an explicit publishing command.

## Accounts

- Business portfolio **WanderAlt** (business.facebook.com), owned by Sergey's Facebook profile, with the Facebook Page **WanderAlt**, the Instagram Business account **wanderalt** (linked to the Page) and the Threads account **wanderalt**.
- Login email `social@wanderalt.app`, `hello@` and `dev@` are Cloudflare Email Routing addresses that forward to Sergey's Gmail. The app's contact email is `dev@wanderalt.app`.
- Meta app **WanderAlt pipeline** (development mode; use cases: Instagram API, Pages API, Threads API, Messenger). A **system user** in the portfolio holds its assets, and its token never expires.
- Repository secrets: `INSTAGRAM_ACCESS_TOKEN` (the system user token with at least `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`), `INSTAGRAM_BUSINESS_ID`, `FACEBOOK_PAGE_ID` (the public ID of our own Page, also in `.env`), and `THREADS_ACCESS_TOKEN` (see below). Tokens never go into the repository, a page, a log line or a chat.

## Profile kit (what the accounts should say)

The profile kit is set by hand: the Instagram Graph API and the Threads API have no endpoint for a profile picture, bio or link, and editing the Facebook Page needs `pages_manage_metadata` (present in the local token checked on 5 October 2026, but no profile-editing tool is implemented). Set it by hand in each app; the files are in `brand/social/`.

| | Instagram `@wanderalt` | Facebook Page **WanderAlt** | Threads `@wanderalt` |
|---|---|---|---|
| Picture | `brand/social/avatar-1080.png` (1080 px, the mark on vermilion, safe inside the round crop) | the same | the same (Threads uses the Instagram picture unless changed) |
| Cover | — | `brand/social/cover-facebook-1640x624.png` (everything centred, so a phone's crop keeps it) | — |
| Name | WanderAlt | WanderAlt | WanderAlt |
| Bio / intro | Independent culture in Tallinn, a walk at a time: gigs, club nights, arthouse film, art and the places around them. EN · ET · RU · UA (133 of 150) | Independent culture in Tallinn, a walk at a time: gigs, film, art and the places around them. (93 of 101) | What's on tonight in Tallinn, and what is worth the walk around it. Gigs, club nights, film, art. EN · ET · RU · UA (115 of 150) |
| Link | https://wanderalt.app | Website: https://wanderalt.app | https://wanderalt.app |
| Category | Arts & entertainment (shown off: Settings → Business tools → Profile display) | Website; second: Arts & entertainment | — |
| Contact | hello@wanderalt.app (optional, as an email button) | Email hello@wanderalt.app; city Tallinn, no street address (no premises) | — |

Facebook's longer *About* text can be the About page's first fold: "DIY gigs, club nights, arthouse film, contemporary art and dance, talks and markets, and the shops and rooms that host them. No hosts, no bookings, no commission. If a listing is wrong, the venue's own page is wrong, and we say where we read it." The voice rules hold here too: no exclamation marks, no marketing words, never "discover".

## What exists

| Job | Where | State |
|---|---|---|
| Venue profile pictures from Instagram | `pipeline/instagram.ts`, in the pipeline run | live (`business_discovery`) |
| Check tokens and Threads search | `node pipeline/social.ts check`, workflow *social* → `check` | manual |
| "Tonight" post text from the site's data | `node pipeline/social.ts tonight` | preview only unless `--publish threads` or `--publish facebook` |
| Threads text or image post | `pipeline/social/threads.ts` | manual |
| Facebook text post | `pipeline/social/facebook.ts`, `social.ts tonight --publish facebook` | manual; first live post and permalink verified on 5 October |
| Instagram JPEG post | `pipeline/social/instagram.ts`, `social.ts instagram --image … --caption … --publish` | manual |

Nothing posts on a schedule. The workflow *social* (`.github/workflows/social.yml`) runs `check` on the 1st and 15th of each month, which posts nothing and keeps the Threads token (60 days) refreshed; `tonight-preview`, `tonight-threads` and `tonight-facebook` are manual only.

## How to run it (nothing posts on its own)

Posting is manual; `check` also runs twice a month. From GitHub: **Actions → social → Run workflow**, then choose:

- `check`: reads the secrets and reports, posting nothing. Shows the assigned Facebook Page and a read of its feed (no post created), the Instagram lookup, the posts readable from a known venue account, the publishing quota, the Threads token (refreshed and stored when under 30 days remain), Threads keyword search and profile lookup.
- `tonight-preview`: prints the "Tonight in Tallinn" text and its character count. Nothing is sent.
- `tonight-threads` / `tonight-facebook`: post the preview to the named service. Do not choose either until the preview has been approved.

From a terminal with the secrets in `.env`: `npm run social -- check`, `npm run social -- tonight`, and `npm run social -- tonight --publish threads`, `npm run social -- tonight --publish facebook`, or `npm run social -- instagram --image https://…/a.jpg --caption "…" --publish`. Without `--publish` every command only prints.

## What can find events and places

| Source | Known venue account | Unknown accounts, free-text search |
|---|---|---|
| Instagram | Known exact public Business/Creator handles: picture, bio, website and recent announcements. Explicit hours may be read from the bio. Personal, private and age-gated accounts are unavailable. | No free-text search. Hashtag API diagnostics work technically, but scheduled city aggregation is disabled pending approval of the use case. |
| Facebook | Other venues’ hours, website and About require Page Public Metadata Access; public Page posts require Page Public Content Access. Both need eligible verification and App Review. Some public Page profile pictures work via the picture endpoint. | No global venue/event search. The current [Event reference](https://developers.facebook.com/docs/graph-api/reference/event/) restricts Pages/users Events to Facebook Marketing Partners; ordinary feature review alone does not unlock it. |
| Threads | `profile_lookup` needs `threads_profile_discovery`; standard access reaches only Meta's own accounts, and review limits it to public profiles with 100+ followers. | `keyword_search` needs `threads_keyword_search`; without review it returns only our own posts. |

Finding venues we do not know yet still comes from open data (OpenStreetMap, Overture Maps, Wikidata) and from venue websites and ticket sites; social is for watching accounts we already know.

## Meta's rules the code follows (September 2026)

- **Threads** (`graph.threads.com/v1.0`): a post is 1–500 characters with at most 5 links, 250 posts per 24 hours; a container is created (`POST /{user}/threads`), rests about 30 seconds and is published (`POST /{user}/threads_publish`). Images are JPEG or PNG up to 8 MB.
- **Threads token:** it comes from Threads' own OAuth (the app's Threads user token generator; the `wanderalt` Threads account must be added as a Threads tester and accept). It lasts 60 days and is extended with `GET /refresh_access_token?grant_type=th_refresh_token`. The first token is the `THREADS_ACCESS_TOKEN` secret; the script stores it in the private table `social_tokens` (service role only) and refreshes it when under 30 days remain, so it keeps itself alive as long as it runs at least once a month. A private profile cannot be extended.
- **Threads search:** `GET /keyword_search` (`q`, `search_type` TOP/RECENT, `search_mode` KEYWORD/TAG, `since`, `until`, `author_username`, up to 100 results, 2,200 queries per 24 hours). Without App Review it returns only the token owner's own posts. `GET /profile_lookup?username=` works for Meta's own accounts until review, and only returns public profiles with 100 followers or more; 1,000 requests per 24 hours.
- **Instagram** (`graph.facebook.com/v26.0`, Facebook Login path): `POST /{ig}/media` then `POST /{ig}/media_publish`. JPEG only, at a public address while Instagram fetches it; 100 API posts per 24 hours (`/content_publishing_limit`); the container is polled until `FINISHED`; captions up to 2,200 characters; `alt_text` is supported for images.
- Instagram has no anonymous profile access and no public free-text search. Hashtag queries work with our current token, limited to 30 distinct tags in seven days; Page search is a separate Facebook feature.

## State of the checks (5 October 2026)

`social check` confirms Instagram lookup and `business_discovery` work (30 distinct handles per venue run after merge), with publishing quota 0/100. The reauthorized Threads token belongs to `@wanderalt` and has the original five permissions plus `threads_keyword_search` and `threads_profile_discovery`. Own profile, posts, insights and publishing quota work. Keyword search now responds successfully, returning zero Tallinn results under the unreviewed own-post restriction. Profile lookup of Meta's `@instagram` works; `@laine.bar` remains unavailable. Public venue discovery is not connected.

The new long-lived token was verified and saved together in local `.env`, private Supabase `social_tokens`, and GitHub `THREADS_ACCESS_TOKEN`; it expires on 4 December 2026 and the existing check workflow refreshes it when fewer than 30 days remain. One introductory Instagram post and one Facebook post were published and verified on 5 October (links below). On Facebook, another business's Page hours, website and about still need Page Public Metadata Access; the hours step logs the refusal and stops that source for the run. The system user's Threads asset assignment does not confer Threads API access: Threads uses its own token.

To resume: follow the dashboard evidence in `docs/facebook.md`. Domain verification is complete; business verification and public-data approval are not. The owner has no business documents. Meta AI initially suggested ID plus a utility bill, then corrected that claim when asked for evidence: address documents cannot establish a legal business/sole trader. It could not open a human case. No individual exemption has been demonstrated; do not convert to Tech Provider or submit the unrelated oEmbed draft.

`social check` runs a short probe set with the same token (own profile, own posts, insights, publishing limit, four search variants) and prints each result with its HTTP status, code, subcode, type, Meta's trace id (the `fbtrace_id` body field or `x-fb-trace-id` header) and the start of the body when it is not JSON.

## Using what Threads search finds

Posts are written by strangers. Anything found goes through the review queue with its link, is escaped like every listing, and is never republished on the site. Meta's terms for Threads content apply.

## Instagram hashtag collection

`npm run social -- search-instagram --hashtag tallinn --experimental` prints recent post dates, links and captions without writing or publishing. Each new hashtag consumes one of the account's 30 distinct tags per rolling seven days; repeat requests for the same tag do not consume another distinct tag. Keep a fixed, small list.

The `instagram-hashtags` source is disabled by default pending approval for the city-guide use case. Its experimental implementation uses one fixed tag, deduplicates post links and infers no venue. Successful diagnostic reads do not waive Instagram Public Content Access requirements; do not enable scheduled city aggregation based on token success.

Current official references: [Instagram hashtag search](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search), [Threads token debugger](https://developers.facebook.com/documentation/threads/troubleshooting/debug-access-token), and [Threads keyword search](https://developers.facebook.com/documentation/threads/keyword-search). Threads search scopes are separate from review: testing searches the authenticated user's posts; reviewed access searches public posts.

The live hashtag collector read five valid captions with source links on 5 October. Larger batches encountered a Meta timeout and HTTP 500/code 1; the reader retries once with five posts for these transient failures, and never retries a permission refusal. These reads wrote nothing.

## Adding Threads search scopes

The current [Threads authorization guide](https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions) uses an OAuth authorization window followed by token exchange. In Meta Graph API Explorer, select `graph.threads.net`, select **WanderAlt pipeline**, then **Generate Threads Access Token**. Unlike the app dashboard generator, Explorer requests the configured search/discovery permissions. Its default request also includes deletion, location tagging, mentions and cross-posting; narrow the OAuth `scope` list to the existing five permissions plus `threads_keyword_search,threads_profile_discovery` before authorizing. Retain the generated callback and state.

The authorization completed on 5 October with the owner's approval. Explorer produced a short-lived token with all seven intended permissions. For a long-lived token without exposing the app secret, use **Threads → Settings → User Token Generator** for the same tester. Its default OAuth request includes only five scopes: retain the generated callback/state and set `params[scope]` and `params[steps].read` to the same seven approved scopes. Verify the consent before continuing. The built-in callback exchanges the token to 60 days; `debug_token` confirmed all seven scopes and the expiry. Deletion, location tagging, mentions and cross-posting were excluded.

Update private `social_tokens`, local `.env` and the repository secret together, then run the read-only checks. Updating `.env` alone leaves the stored token in use. Never publish credentials or OAuth codes in logs, screenshots or chat. Public search still needs review; a successful grant does not prove public discovery access.

## Publication and integration audit (5 October 2026)

The scheduled pipeline reads `instagram-venues`; source records and 43 upcoming published listings were verified on 5 October. The expanded collector asked 30 distinct handles, read 29 accounts and kept 114 recent announcements (94 with image evidence available); no listings were written by that diagnostic. The live catalogue has 444 active places and 71 distinct valid Instagram handles. Coverage gaps remain, and the report lists them. Three verified bios filled descriptions for Heldeke!, Purtse resto and Uus Laine; Heldeke’s own site supplied its missing website and exact social links. The new venue ticket-calendar source yielded 23 structured occurrences. These code changes take effect after merge; the verified database fact updates are already applied. Facebook metadata remains refused. Threads is own-account management and manual publishing, not a public venue/event source. The app AI searches only the stored catalogue.

The publisher now refuses to publish an Instagram container unless processing reports `FINISHED`; errors, expiry and processing timeouts leave it unpublished. Check the returned container ID before trying again after a timeout. Tonight previews load `has_time`, so an all-day listing is not assigned an invented midnight time.

The owner requested one introductory post on each service. Published once, then read back through the APIs and checked in the browser:

- [Instagram introduction](https://www.instagram.com/p/DeG1_CUijVk/), using `brand/social/intro-instagram.jpg` and factual introductory copy, with alt text.
- [Facebook introduction](https://www.facebook.com/122097876891504823/posts/122097876873504823), on the configured WanderAlt Page.

The JPEG is a format conversion of the existing OG artwork. Its public API-fetchable copy is in the existing image bucket at `venue-pictures/social/wanderalt-intro-20261005.jpg`; this prefix is brand material and never attached to a venue record.

Instagram's desktop Edit profile screen disables Website and explicitly requires the mobile app to edit links. `wanderalt.app` was appended to the existing bio and read back successfully; this is plain text, not a clickable website link. To finish that field in the Instagram mobile app: **Profile → Edit profile → Links → Add external link**, URL `https://wanderalt.app`, title `WanderAlt`. The supported Graph API has no profile-link write endpoint.
