# Social accounts

WanderAlt has a Meta setup and a small set of scripts for Threads and Instagram. Facebook Page posting is not built; it is the same system user token plus the `pages_manage_posts` permission, and a third publisher when wanted.

## Accounts

- Business portfolio **WanderAlt** (business.facebook.com), owned by Sergey's Facebook profile, with the Facebook Page **WanderAlt**, the Instagram Business account **wanderalt** (linked to the Page) and the Threads account **wanderalt**.
- Login email `social@wanderalt.app`, `hello@` and `dev@` are Cloudflare Email Routing addresses that forward to Sergey's Gmail. The app's contact email is `dev@wanderalt.app`.
- Meta app **WanderAlt pipeline** (development mode; use cases: Instagram API, Pages API, Threads API, Messenger). A **system user** in the portfolio holds its assets, and its token never expires.
- Repository secrets: `INSTAGRAM_ACCESS_TOKEN` (the system user token with `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`), `INSTAGRAM_BUSINESS_ID`, and `THREADS_ACCESS_TOKEN` (see below). Tokens never go into the repository, a page, a log line or a chat.

## What exists

| Job | Where | State |
|---|---|---|
| Venue profile pictures from Instagram | `pipeline/instagram.ts`, in the pipeline run | live (`business_discovery`) |
| Check tokens and Threads search | `node pipeline/social.ts check`, workflow *social* → `check` | manual |
| "Tonight" post text from the site's data | `node pipeline/social.ts tonight` | preview only unless `--publish threads` |
| Threads text or image post | `pipeline/social/threads.ts` | manual |
| Instagram JPEG post | `pipeline/social/instagram.ts`, `social.ts instagram --image … --caption … --publish` | manual |

Nothing posts on a schedule. The workflow *social* (`.github/workflows/social.yml`) is manual only: `check`, `tonight-preview`, `tonight-threads`.

## How to run it (nothing posts on its own)

All of it is manual. From GitHub: **Actions → social → Run workflow**, then choose:

- `check`: reads the secrets and reports, posting nothing. Shows the Instagram lookup, the posts readable from a known venue account, the publishing quota, the Threads token (refreshed and stored when under 30 days remain), Threads keyword search and profile lookup.
- `tonight-preview`: prints the "Tonight in Tallinn" text and its character count. Nothing is sent.
- `tonight-threads`: the only choice that posts (to Threads). Do not choose it until the preview has been approved.

From a terminal with the secrets in `.env`: `npm run social -- check`, `npm run social -- tonight`, and `npm run social -- tonight --publish threads` or `npm run social -- instagram --image https://…/a.jpg --caption "…" --publish`. Without `--publish` every command only prints.

## What can find events and places

| Source | Known venue account | Unknown accounts, free-text search |
|---|---|---|
| Instagram | Works, and is used: the pipeline source `instagram-venues` reads the recent posts of known venue accounts for events (`docs/data.md`, *Instagram venue posts*). `business_discovery` returns caption, date and link for a public Business or Creator account; posts are not republished. | Hashtag search needs "Instagram Public Content Access" (App Review). Not requested. |
| Facebook | Events and posts of a Page we do not manage need "Page Public Content Access" (App Review). | Open event search is gone from the API. |
| Threads | `profile_lookup` needs `threads_profile_discovery`; standard access reaches only Meta's own accounts, and review limits it to public profiles with 100+ followers. | `keyword_search` needs `threads_keyword_search`; without review it returns only our own posts. |

Finding venues we do not know yet still comes from open data (OpenStreetMap, Overture Maps, Wikidata) and from venue websites and ticket sites; social is for watching accounts we already know.

## Meta's rules the code follows (September 2026)

- **Threads** (`graph.threads.net/v1.0`): a post is 1–500 characters with at most 5 links, 250 posts per 24 hours; a container is created (`POST /{user}/threads`), rests about 30 seconds and is published (`POST /{user}/threads_publish`). Images are JPEG or PNG up to 8 MB.
- **Threads token:** it comes from Threads' own OAuth (the app's Threads user token generator; the `wanderalt` Threads account must be added as a Threads tester and accept). It lasts 60 days and is extended with `GET /refresh_access_token?grant_type=th_refresh_token`. The first token is the `THREADS_ACCESS_TOKEN` secret; the script stores it in the private table `social_tokens` (service role only) and refreshes it when under 30 days remain, so it keeps itself alive as long as it runs at least once a month. A private profile cannot be extended.
- **Threads search:** `GET /keyword_search` (`q`, `search_type` TOP/RECENT, `search_mode` KEYWORD/TAG, `since`, `until`, `author_username`, up to 100 results, 2,200 queries per 24 hours). Without App Review it returns only the token owner's own posts. `GET /profile_lookup?username=` works for Meta's own accounts until review, and only returns public profiles with 100 followers or more; 1,000 requests per 24 hours.
- **Instagram** (`graph.facebook.com/v26.0`, Facebook Login path): `POST /{ig}/media` then `POST /{ig}/media_publish`. JPEG only, at a public address while Instagram fetches it; 100 API posts per 24 hours (`/content_publishing_limit`); the container is polled until `FINISHED`; captions up to 2,200 characters; `alt_text` is supported for images.
- Instagram has no anonymous profile access and no public free-text search. Hashtag search and Page search need App Review features that are not requested.

## First check (30 September 2026)

`social check` showed: the Instagram lookup works and publishing quota is 0/100; the Threads token for `@wanderalt` was refreshed (valid 60 days) and stored; Threads keyword search answered with an error 500 and profile lookup of @instagram was refused. Those two need `threads_keyword_search` / `threads_profile_discovery` on the token and, for other people's content, App Review. The system user in the portfolio has Threads assigned, which gives the Facebook/Instagram token no Threads access; Threads uses only its own token.

Unresolved: a repeat run gave the same answers, with HTTP 500 and code 1 ("unknown error") on every keyword search, even the plainest (`q` only). `social check` now also runs a short probe set with the same token (own profile, own posts, insights, publishing limit, and four search variants) and prints each result with its HTTP status, code, subcode, type and Meta's trace id (the `fbtrace_id` body field or `x-fb-trace-id` header; quote it in a report to Meta), and the start of the body when it is not JSON. Read it like this: if the own-profile and own-posts probes pass but every search fails, the token lacks `threads_keyword_search` (generate it again in the Threads user token generator after the permission is in the use case, and accept the scope on the consent screen) or the endpoint is closed until review; if only the `author_username` variant passes, the endpoint works for our own posts and public search is what review unlocks.

## Using what Threads search finds

Posts are written by strangers. Anything found goes through the review queue with its link, is escaped like every listing, and is never republished on the site. Meta's terms for Threads content apply.
