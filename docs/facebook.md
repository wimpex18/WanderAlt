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

On 4 October 2026 every venue Page call answered **code 10**: "This endpoint requires the 'pages_read_engagement' permission or the 'Page Public Content Access' feature or the 'Page Public Metadata Access' feature". Here is what each of those means:

- `pages_read_engagement` covers only Pages our token manages.
- **Page Public Metadata Access** is the feature for reading another business's public Page facts: name, hours, website, about, location. This is the one to request.
- Page Public Content Access is for posts and events. It is stricter and not needed now.

The feature needs:
- App Review;
- a verified business portfolio;
- the app in Live mode, with a privacy policy and data-deletion instructions at public addresses.

## Steps for the owner (tomorrow, in this order)

Meta changes its screens often; if a name differs, look for the nearest match.

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
3. **Verify the domain.** business.facebook.com → *Settings* → *Brand safety* → *Domains* → add `wanderalt.app`. Choose the DNS TXT record and add it in Cloudflare (DNS → Records → Add, type TXT, name `@`), then press *Verify*.
4. **Verify the business.** business.facebook.com → *Settings* → *Security centre* (or *Business info*) → *Start verification* for the **WanderAlt** portfolio. It asks for:
   - a legal name, address, phone and website (`https://wanderalt.app`);
   - one document that shows the name and address (a business register extract, a utility bill or a bank statement).

   **Blocker to know:** Meta verifies a business, not a person. Without a registered company or sole trader (in Estonia an OÜ or FIE), this step cannot pass, and without it the feature cannot be granted. If there is none yet, stop here; everything else keeps working without Facebook.
5. **Request the feature.** App dashboard → *App Review* → *Permissions and features* → search **Page Public Metadata Access** → *Request advanced access*. Paste:
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
6. **Submit**, then wait. Review takes from a few days to a few weeks, and Meta may ask follow-up questions by email to `social@wanderalt.app`.
7. **After approval:**
   - Switch the app to **Live** (the toggle at the top of the app dashboard) if it is not already.
   - Run *facebook_check* again. Every `venue Page …` line should read `readable as "…"`, and the verdict line should say the Pages are readable.
   - The next scheduled pipeline run fills hours, then missing websites and descriptions, for places with a Facebook link, picked places first. Hell Hunt is the first test: its site sends readers to Facebook for its hours.
8. **If it is refused:** the email names the reason. The usual ones are a screencast that does not show the data in use, or a privacy policy that does not mention Facebook data. Fix that and resubmit. Nothing in the pipeline needs to change.

## What not to do

- Do not request Page Public Content Access, Instagram Public Content Access or Threads search in the same submission. A smaller request passes more easily.
- Do not read Facebook pages without the API (scraping, a crawler user agent). It breaks Meta's terms, and the pipeline never does it.
- Do not put the token in a file, a page, a log line or a chat. It lives only in the repository secret and in a git-ignored `.env`.
