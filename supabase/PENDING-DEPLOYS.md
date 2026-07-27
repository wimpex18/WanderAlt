# Pending edge-function deploys

**Delete this file once the list is empty.** It exists because the repo is
currently ahead of what is deployed for a handful of functions, and that
gap is invisible from either side unless it is written down.

Everything here is committed and reviewed. Nothing here is broken — every
one of these functions is **frozen** (its cron is disabled), so a stale
deployed copy changes no live behaviour today. The exception is noted.

## Deploy these

| Function | What the repo has that the deploy doesn't | Priority |
|---|---|---|
| `process-staging` | Reads `staging_messages.payload` and copies facts (description, start/end time, ticket URL, price, entities) into `picks`. Plus the Groq model fix. | **Do first** |
| `match-pick` | Groq model fix only. The dead model id sat first in its fallback list, so every live Concierge query pays a wasted 404 round-trip before falling through. **This is the only one with live user impact.** | High |
| `ingest-fienta` | Writes `payload` (starts_at, description, ticket_url, image_url, categories, organiser) | Medium |
| `ingest-ra` | Writes `payload` — including `artists[]`, which is what `resolve-links` feeds to MusicBrainz | Medium |
| `ingest-hanzas-perons` | Writes `payload` + `parsePrice()` — the only source in the fleet that publishes a price | Medium |
| `ingest-echo-gone-wrong` | Writes `payload` (the RSS description is a real editorial blurb) | Medium |
| `classify-moods` | Groq model fix only | Low |
| `draft-column` | Groq model fix only | Low |

## Order matters for one of them

`process-staging` should go **before** anything drains the queue. There are
currently **49 rows with `status='new'`**, staged by the revived scrapers
(splendidpalace, kinobize, telliskivi) and a manual `ingest-ra` run. Those
rows carry `payload`. If the *old* deployed `process-staging` consumes them,
it will mark them `processed` and the facts in `payload` are lost for those
picks — the column stays, but nothing reads it a second time.

So: **do not invoke `process-staging` until it has been redeployed.** Its
cron is disabled, so this only happens if someone runs it by hand.

## How to deploy

There is no `supabase` CLI checked in (by design — see CLAUDE.md), and the
MCP tooling is what has been used so far. Two options:

**A. Supabase dashboard** — Edge Functions → pick the function → Deploy new
version → paste the file contents from `supabase/functions/<name>/index.ts`.

**B. CLI via npx**, if you would rather do it in bulk:

```bash
npx supabase login
npx supabase functions deploy process-staging --project-ref aqnsmmbrspkbfcvougeh
```

Whichever you use, **preserve each function's existing `verify_jwt`
setting** — it is not uniform across the fleet:

```
verify_jwt = true   process-staging, ingest-hel-linkedevents, ingest-telegram,
                    ingest-osm, ingest-rss, archive-stale, generate-context,
                    translate-picks, enrich-pick-images, import-pick-photos,
                    check-secrets
verify_jwt = false  everything else, including match-pick, ingest-fienta,
                    ingest-ra, ingest-hanzas-perons, ingest-echo-gone-wrong,
                    classify-moods, draft-column
```

Getting that wrong is what makes a cron return 401: a `verify_jwt: true`
function called through raw `net.http_post` fails, which is why the healthy
crons go through `public.invoke_wa_fn(fn)` instead.

## Verifying a deploy landed

```bash
curl -s -X POST https://aqnsmmbrspkbfcvougeh.supabase.co/functions/v1/<name> \
  -H 'Content-Type: application/json' -d '{}'
```

The ingest functions now report `errors` and `zero_yield` in their JSON
response — `zero_yield: true` means the run produced nothing, which is a
failure worth looking at rather than a quiet success.
