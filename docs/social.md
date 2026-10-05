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
| Facebook text post | `pipeline/social/facebook.ts`, `social.ts tonight --publish facebook` | manual; assigned Page token/feed read checked, no live post tested |
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
| Instagram | Works, and is used: the pipeline source `instagram-venues` reads the recent posts of known venue accounts for events (`docs/data.md`, *Instagram venue posts*). `business_discovery` returns caption, date and link for a public Business or Creator account; posts are not republished. | Hashtag search works with the current token: recent and popular `#tallinn` posts returned captions and links on 5 October. The new `instagram-hashtags` source reads recent posts. Meta documents Instagram Public Content Access review requirements; this live result is not a promise of unrestricted production access. There is no public free-text search. |
| Facebook | Events and posts of a Page we do not manage need "Page Public Content Access" (App Review). | Open event search is gone from the API. |
| Threads | `profile_lookup` needs `threads_profile_discovery`; standard access reaches only Meta's own accounts, and review limits it to public profiles with 100+ followers. | `keyword_search` needs `threads_keyword_search`; without review it returns only our own posts. |

Finding venues we do not know yet still comes from open data (OpenStreetMap, Overture Maps, Wikidata) and from venue websites and ticket sites; social is for watching accounts we already know.

## Meta's rules the code follows (September 2026)

- **Threads** (`graph.threads.com/v1.0`): a post is 1–500 characters with at most 5 links, 250 posts per 24 hours; a container is created (`POST /{user}/threads`), rests about 30 seconds and is published (`POST /{user}/threads_publish`). Images are JPEG or PNG up to 8 MB.
- **Threads token:** it comes from Threads' own OAuth (the app's Threads user token generator; the `wanderalt` Threads account must be added as a Threads tester and accept). It lasts 60 days and is extended with `GET /refresh_access_token?grant_type=th_refresh_token`. The first token is the `THREADS_ACCESS_TOKEN` secret; the script stores it in the private table `social_tokens` (service role only) and refreshes it when under 30 days remain, so it keeps itself alive as long as it runs at least once a month. A private profile cannot be extended.
- **Threads search:** `GET /keyword_search` (`q`, `search_type` TOP/RECENT, `search_mode` KEYWORD/TAG, `since`, `until`, `author_username`, up to 100 results, 2,200 queries per 24 hours). Without App Review it returns only the token owner's own posts. `GET /profile_lookup?username=` works for Meta's own accounts until review, and only returns public profiles with 100 followers or more; 1,000 requests per 24 hours.
- **Instagram** (`graph.facebook.com/v26.0`, Facebook Login path): `POST /{ig}/media` then `POST /{ig}/media_publish`. JPEG only, at a public address while Instagram fetches it; 100 API posts per 24 hours (`/content_publishing_limit`); the container is polled until `FINISHED`; captions up to 2,200 characters; `alt_text` is supported for images.
- Instagram has no anonymous profile access and no public free-text search. Hashtag queries work with our current token, limited to 30 distinct tags in seven days; Page search is a separate Facebook feature.

## State of the checks (5 October 2026)

`social check` shows: the Instagram lookup and `business_discovery` work (the pipeline reads 13 to 15 of its 15 venue accounts a run), the publishing quota is 0/100, and the Threads token for `@wanderalt` is valid (own profile, own posts, insights and the publishing limit answer). Threads keyword search and profile lookup do **not** work: every search variant answers HTTP 403, code 10, "Application does not have permission for this action" (on 30 September the same calls answered 500), and profile lookup of @instagram is refused. The official token debugger now confirms both the saved and `.env` tokens lack `threads_keyword_search` and `threads_profile_discovery`. The dashboard shows these as Ready for testing, which does not add grants to an existing token. Reauthorization with these scopes is needed even for their restricted test behavior; public search additionally needs App Review. The built-in token generator requests only the five existing scopes, so repeating that flow will not fix search. Its popup requires a Threads login; no new token or authorization was submitted. On Facebook, reading another business's Page `hours`, website and about needs Page Public Metadata Access (also App Review); the pipeline's hours step logs the refusal and stops that source for the run. The code is ready and the owner's steps are in `docs/facebook.md`; `npm run facebook:check` (or *facebook_check* in the pipeline workflow) shows which step is missing. Nothing user-facing depends on Threads or Facebook search. The system user in the portfolio has Threads assigned, which gives the Facebook/Instagram token no Threads access; Threads uses only its own token. Do not read Threads' public pages with a crawler user agent: that poses as Meta's crawler, which this project does not do.

To resume: follow the verified current dashboard steps in `docs/facebook.md`. Domain verification is complete. The business flow offers an unregistered individual route but still needs accepted evidence; Threads App Review additionally opens an irreversible Tech Provider gate. Page Public Metadata Access was absent from this app's Pages use case on 5 October. Prepare each actual data use separately and resolve these gates before submitting; token scopes alone do not unlock public access.

`social check` runs a short probe set with the same token (own profile, own posts, insights, publishing limit, four search variants) and prints each result with its HTTP status, code, subcode, type, Meta's trace id (the `fbtrace_id` body field or `x-fb-trace-id` header) and the start of the body when it is not JSON.

## Using what Threads search finds

Posts are written by strangers. Anything found goes through the review queue with its link, is escaped like every listing, and is never republished on the site. Meta's terms for Threads content apply.

## Instagram hashtag collection

`npm run social -- search-instagram --hashtag tallinn` prints recent post dates, links and captions without writing or publishing. Each new hashtag consumes one of the account's 30 distinct tags per rolling seven days; repeat requests for the same tag do not consume another distinct tag. Keep a fixed, small list.

The `instagram-hashtags` source uses only `#tallinn`, up to 25 recent posts per run, and passes qualifying captions through the existing event extraction, classification and review queue. A hashtag does not identify an organiser or venue. No author contact details or post pictures are collected, and no venue is inferred from the tag. Hashtag results overlap and the collector deduplicates post links. It uses the existing Instagram secrets and adds no permissions or business-verification dependency to the tested connection. It joins scheduled collection after this PR is merged.

Current official references: [Instagram hashtag search](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search), [Threads token debugger](https://developers.facebook.com/documentation/threads/troubleshooting/debug-access-token), and [Threads keyword search](https://developers.facebook.com/documentation/threads/keyword-search). Threads search scopes are separate from review: testing searches the authenticated user's posts; reviewed access searches public posts.

The live hashtag collector read five valid captions with source links on 5 October. Larger batches encountered a Meta timeout and HTTP 500/code 1; the reader retries once with five posts for these transient failures, and never retries a permission refusal. These reads wrote nothing.
