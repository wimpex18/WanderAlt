# Facebook: reading venue Pages

What the pipeline reads from a venue's public Facebook Page, what Meta needs before it answers, and the steps to get there. The accounts and the token are in `docs/social.md`.

## What the code does

- `pipeline/facebook-hours.ts`, `lookupFacebookPage`: one Graph API call per venue Page (`fields=hours,website,about,is_permanently_closed`). It runs inside the hours step (`hours-sources.ts`) for places with no hours after their own site was read, at most 30 a run.
  - `hours` become the place's opening hours (`hours_source = 'facebook'`).
  - `website` fills a missing website (`website_source = 'facebook'`). It must be the venue's own site, never another profile or a link page (`pageWebsite`).
  - `about` fills a missing description.
  - `is_permanently_closed` writes a log line for a person to check. It never closes a place on its own.
- The Page link comes from the place's record or its own site, never from a search. Personal profiles, posts and events are not read.
- `facebookCheck` (run with `npm run facebook:check`, or the *facebook_check* box in **Actions → pipeline → Run workflow**) tries each step with the real token and prints one line per step. It writes nothing.
- The token is the system user token in the `INSTAGRAM_ACCESS_TOKEN` secret. Nothing new is needed in the repository once Meta grants access: the next run starts filling.

## Why it does not work yet

On 5 October 2026 every venue Page call answered **code 10**: "This endpoint requires the 'pages_read_engagement' permission or the 'Page Public Content Access' feature or the 'Page Public Metadata Access' feature". Here is what each of those means:

- `pages_read_engagement` covers only Pages our token manages.
- **Page Public Metadata Access** is the feature for reading another business's public Page facts: name, hours, website, about, location. This is the one to request.
- Page Public Content Access covers public Page posts and metadata. It is the feature to investigate for venue announcements, but that reader is not implemented. It does not promise a general Events search endpoint.

The feature needs:
- App Review;
- a verified business portfolio;
- the app in Live mode, with a privacy policy and data-deletion instructions at public addresses.

## Steps for the owner

Meta changes its screens often; if a name differs, look for the nearest match. The app now uses **Use cases → Customize → Permissions and features**, **Review → Verification / App Review**, and **Publish**, rather than the older Live-mode toggle.

1. **Check the starting point.** In GitHub: **Actions → pipeline → Run workflow**, tick *facebook_check*, run. Expected lines:
   - `token: works`;
   - a permissions list with `pages_show_list` and `pages_read_engagement`;
   - `our own Page WanderAlt: readable`;
   - each `venue Page …: refused (code 10)`.

   If the token line is refused, fix the token first (`docs/social.md`).
2. **Fill in the app's basic settings.** developers.facebook.com → *My Apps* → **WanderAlt pipeline** → *App settings* → *Basic*:
   - App domains: `wanderalt.app`
   - Privacy policy URL: `https://wanderalt.app/about#privacy`
   - Terms of service URL: `https://wanderalt.app/about#terms`
   - User data deletion: choose *Data deletion instructions URL*: `https://wanderalt.app/about#data-deletion`
   - Contact email: `dev@wanderalt.app`
   - App icon: `brand/social/meta-app-icon-1024.png` (1024 × 1024, the WanderAlt mark)
   - Category: *Travel* (or *Lifestyle*)

   Save.
3. **Verify the domain.** business.facebook.com → *Settings* → *Brand safety* → *Domains* → add `wanderalt.app`. Choose the DNS TXT record and add it in Cloudflare (DNS → Records → Add, type TXT, name `@`), then press *Verify*. Completed on 5 October 2026: the DNS TXT record is present and Meta shows **Verified**. Keep the record in DNS.
4. **Verify the business.** business.facebook.com → *Settings* → *Security Center* → *Start verification* for the **WanderAlt** portfolio. The portfolio is eligible but unverified. In the current flow:
   - Select the real country of the operator. The Estonia flow offers **Sole Proprietorship** as well as **Private Company**; an OÜ is not the only option.
   - Sole Proprietorship offers **Registered** and **Not yet registered** (the latter explicitly includes a business represented by an individual).
   - The unregistered route still asks for a business name matching accepted documents, then business details. Seeing this route does not mean a personal ID or a domain alone will pass verification. No verification application has been submitted.
   - Meta's [accepted documents](https://www.facebook.com/business/help/159334372093366) include incorporation or registration documents, a business licence, government-issued business tax documents and business bank statements. A utility bill proves address/phone only, not the legal business name. Estonian-language documents need an officially stamped English translation unless Meta offers another supported route.
   - Use truthful details and documents belonging to the operator. Do not invent an OÜ, claim an unrelated company, or substitute the brand name for the name on the document. If there are no accepted documents, this remains unresolved; a registered sole trader (FIE) is one possible route, with its own legal and tax obligations, not a guaranteed approval shortcut. [RIK's FIE registration guide](https://abiinfo.rik.ee/index.php/en/applications-and-dashboard/establishment-new-legal-person/establishment-sole-proprietor-fie).

   Domain verification proves control of the website, not the operator's business status. The existing Instagram venue reader and own-account access continue to work while this is pending. See [Meta's verification guide](https://www.facebook.com/business/help/2058515294227817).
5. **Request the feature.** App dashboard → *Use cases* → *Manage everything on your Page* → *Customize* → *Permissions and features*. Look for **Page Public Metadata Access**. On 5 October it was not listed in this app's Pages table or its *Add more* screen, so the old instructions to search and request it are not yet executable. Resolve availability through Meta's app help/support before assuming review can be submitted. Do not request unrelated permissions as a substitute. When the feature is available, prepare its review with:
   - *How will your app use this feature?*
     > WanderAlt (https://wanderalt.app) is a free city guide to independent culture in Tallinn: record shops, bookshops, galleries, bars with live music. For a venue we already list, whose own website or OpenStreetMap entry links to its Facebook Page, our server reads that Page's public metadata (opening hours, website, about text, permanently-closed flag) at most once a fortnight, to show visitors whether the venue is open now and to link to its website. We read business Pages only, never personal profiles, posts, comments or events, store no personal data, and remove a venue's data on request (https://wanderalt.app/about#data-deletion).
   - *Screencast:* record about one minute.
     1. Open `https://wanderalt.app/places`.
     2. Open a venue that links a Facebook Page and show its *Opening hours* block and the line "hours from its Facebook page" (Hell Hunt once approved; before approval, show a venue with "Hours not filed" and say this is where the Page's hours will show).
     3. Show the *facebook_check* workflow run in GitHub.
   - Data handling questions:
     - Data is processed by the WanderAlt server (GitHub Actions) and stored in Supabase.
     - It is not shared with or sold to third parties.
     - It is not used for advertising.
     - Data is deleted on request, within 30 days.
6. **Submit**, then wait. Business verification and feature review are separate decisions. Meta may ask follow-up questions through the dashboard or the configured contact email (`dev@wanderalt.app`).
7. **After approval:**
   - Complete **Publish** in the app dashboard once its requirements are met; the app currently says **Unpublished**.
   - Run *facebook_check* again. Every `venue Page …` line should read `readable as "…"`, and the verdict line should say the Pages are readable.
   - The next scheduled pipeline run fills hours, then missing websites and descriptions, for places with a Facebook link, picked places first. Hell Hunt is the first test: its site sends readers to Facebook for its hours.
8. **If it is refused:** the email names the reason. The usual ones are a screencast that does not show the data in use, or a privacy policy that does not mention Facebook data. Fix that and resubmit. Nothing in the pipeline needs to change.

## Venue data coverage

The core use is venue identity, hours and event facts, not just posting to WanderAlt's own accounts:

- **Instagram:** the existing known-account reader gets public Business/Creator profile images, biographies (hours when explicitly stated) and recent captions used as event sources. This worked for `@laine.bar` on 5 October. It cannot read personal/private accounts or perform general free-text event search.
- **Facebook profile images:** the existing public Graph picture endpoint worked for `uuslaine` on 5 October. This does not grant About, hours or feed access.
- **Facebook facts:** [Page Public Metadata Access](https://developers.facebook.com/docs/features-reference/page-public-metadata-access/) permits aggregation of public About information, and requires business verification and App Review. It remains blocked for the three probed venue Pages.
- **Facebook announcements:** [Page Public Content Access](https://developers.facebook.com/docs/features-reference/page-public-content-access/) permits analysis/display of public Page posts, also requires business verification and App Review, and supersedes Metadata Access. If reading venue announcements is the intended submission, review this feature instead of applying for both. A caption/post reader for Facebook is not implemented. This feature must not be described as unrestricted event search or as a guarantee that the Events endpoint becomes available.
- With no operator documents, business verification cannot currently be completed from the evidence we hold. The unregistered UI route is not proof of a document-free exemption. The site, ticket sources, open data and working Instagram readers remain usable. Instagram hashtag recent/top media also worked with the current token on 5 October; `docs/social.md` describes the new fixed-tag source.

## Own accounts and broader access

A read-only local check on 5 October 2026 confirmed:

| Capability | Result |
|---|---|
| Facebook token and own WanderAlt Page | Work; token includes `pages_manage_posts` and `pages_read_engagement` |
| Other venues' Facebook metadata | Refused, code 10; Page Public Metadata Access still needed |
| Instagram known venue profile and recent posts | Work; publishing quota endpoint answers 0/100 |
| Threads own profile, posts, insights and publishing limit | Work for `@wanderalt` |
| Threads keyword search | Responds after reauthorization; zero Tallinn results with unreviewed own-post access |
| Threads profile lookup | Meta `@instagram` works; venue `@laine.bar` remains unavailable |

Publishing permissions and quota reads alone do not prove publication succeeds. On 5 October one owner-requested introductory post was published to Instagram and one to Facebook, with API readback and browser verification (`docs/social.md`). Manual publishers exist for all three (`docs/social.md`). Facebook is pinned to WanderAlt Page `1374524315739646`; its Page token, feed and first publication have been checked. No single token grants unrestricted access across all three services.

In **Threads → Permissions and features**, `threads_keyword_search` and `threads_profile_discovery` are already configured as **Ready for testing**. Choosing **Actions → Add to App Review** for keyword search opens a **Become a Tech Provider** gate. Meta says this status cannot be reversed, and requires business verification, access verification, App Review and data-handling answers. It has not been accepted. Review therefore needs this explicit owner decision as well as operator evidence. Reauthorization on 5 October added both search/discovery scopes, verified with the token debugger. Restricted search and Meta profile lookup now work; public search and venue profile lookup still need review.

## What not to do

- Request the feature matching the actual use. Do not promise venue posts under a metadata-only submission, or request Metadata Access alongside Page Public Content Access, which supersedes it. Include only implemented, demonstrable uses in App Review.
- Do not read Facebook pages without the API (scraping, a crawler user agent). It breaks Meta's terms, and the pipeline never does it.
- Do not put the token in a file, a page, a log line or a chat. It lives only in the repository secret, the private Supabase token store and a git-ignored `.env`.

## Local configuration

On 5 October the local `.env` was corrected to use the existing Supabase server secret (`sb_secret_…`) for WanderAlt project `aqnsmmbrspkbfcvougeh`. The pipeline client supports this key type through the `apikey` header. A read of `places` and the private `social_tokens` table succeeded; the file is git-ignored and restricted to its owner. The reauthorized Threads token is valid until 4 December 2026. Its seven permissions were verified and the token saved in local `.env`, private Supabase `social_tokens` and GitHub `THREADS_ACCESS_TOKEN` together. Tokens must be entered through private credential storage, never pasted into chat.

## Operating without a registered business

The operator has no business documents and does not intend to register an FIE or OÜ just for Meta access. Keep business verification pending. A personal address alone does not satisfy Meta's legal-business-name evidence requirement; no identity details or verification application have been submitted.

The usable setup is the known-venue Instagram reader (profile pictures, explicit bio facts and recent event announcements), Instagram hashtag search, Facebook profile pictures, and manual publishing to WanderAlt's own accounts. The `instagram-venues` source already runs in the scheduled pipeline; it does not need general event search. A read-only collection on 5 October asked 15 accounts, read 13 and found 60 recent announcements from 12 venues; it wrote no listings. Venue websites, ticket sources and OpenStreetMap supply the remaining facts. Do not mark another venue's Facebook About/feed access or public Threads search as connected: Facebook still refuses those calls, and Threads search is limited to our own posts before review. There is no demonstrated document-free exemption for these features in this app. Revisit approval only if Meta offers a supported individual route with evidence the operator actually holds.

The [manual CI check on 5 October](https://github.com/wimpex18/WanderAlt/actions/runs/37281150716) confirmed that the repository secrets can read the private token store, assigned Facebook Page feed, Instagram venue posts and own Threads account. Its successful workflow status means the check executed; its logs still report refused public Threads search/profile lookup. No post was published.

The reauthorized [CI connection check](https://github.com/wimpex18/WanderAlt/actions/runs/37286804110) passed. Its logs confirm all seven token scopes, four successful search variants with zero results, Meta `@instagram` profile lookup, and working own-account/Instagram venue reads. No post was published.
