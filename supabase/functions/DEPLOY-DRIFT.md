# Deployed functions can be older than this repo

There is no CI and no `supabase` CLI here, so an edge function only
changes when somebody deploys it by hand through the Supabase MCP
`deploy_edge_function` tool. Committing does nothing. Nothing warns you.

That went unnoticed for a month and produced the empty Tonight list:
`ingest-fienta` v6 added `composePayload()` on 27 Jul 2026, was
committed, and was never deployed — so every Fienta event reached
staging with its date only in prose and `payload.starts_at` null, and
`process-staging` (which reads `starts_at` from the payload and nowhere
else) had nothing to copy. Every Tallinn pick landed undated and could
never appear on Tonight.

## How to check

`list_edge_functions` returns `updated_at` in **milliseconds**. Compare
it to the last commit that touched the function's directory:

```bash
for d in supabase/functions/*/; do
  fn=$(basename "$d")
  echo "$fn $(git log -1 --format=%ct -- "$d")"
done | sort
```

A repo timestamp meaningfully newer than `updated_at / 1000` means the
deployment is behind. "Meaningfully" matters: a few hundred seconds is
just the gap between deploying and committing, which is the normal
order. Days or weeks is drift.

**One false positive to expect.** Commits titled *"Sync deployed
sources: …"* pulled deployed code INTO the repo, so the repo timestamp
is legitimately newer while the content already matches. `rotate-tonight`,
`verify-venues`, `ingest-rss` and `unsubscribe-digest` are all this case.

Timestamps only narrow the search. Confirm with `get_edge_function` and
read the actual source before deploying anything.

## Audit, 4 Aug 2026

Three commits had landed in the repo without reaching production.

| commit | date | what |
| --- | --- | --- |
| `3190013` | 27 Jul | Carry the facts through the pipeline (adds `payload`) |
| `df25819` | 27 Jul | The primary Groq model is decommissioned; repoint it |
| `f3ed3bf` | 26 Jul | Escape the last unescaped sinks (incl. the digest email) |

### Deployed during that audit

| function | was | why it mattered |
| --- | --- | --- |
| `ingest-fienta` | v5, Jun | no `payload.starts_at` → every Tallinn pick undated |
| `ingest-kinobize` | — | also fixed the fabricated `new Date()` event time |
| `ingest-splendidpalace` | — | same fabricated-time fix |
| `ingest-osm` | v12 | new: captures `opening_hours` |
| `ingest-ra` | v2, Jul | no `payload.starts_at` → Vilnius events undated |
| `ingest-splendidpalace` | v6 → **v8** | parser rewritten (titles were URL slugs) + numeric entity decode |
| `ingest-kinobize` | v5 → **v7** | parser rewritten (day-grouped schedule) + numeric entity decode |

### Still behind — deploy from this repo when you're ready

| function | deployed | missing | severity |
| --- | --- | --- | --- |
| ~~`draft-column`~~ | — | — | **Deleted Aug 2026.** Curator-era feature with no public surface; cron unscheduled, source and admin panel removed. There is no remaining deploy drift. |

`classify-moods` and `match-pick` were **retired**, not deployed. See the
tombstone note below.

**`ingest-hanzas-perons` did not clear itself, and the way I first
concluded it had is the point.** I saw its 03:50 cron insert 3 rows and
read that as "the payload contract is live". Inserting rows only proves
the scraper runs. The rows themselves had `payload = NULL`, so every
Riga event was landing undated — the same failure the Fienta bug caused,
sitting in plain sight behind a green log line. **Check the artefact, not
the exit code.**

Deploying it then exposed a second bug, in the repo rather than in
production: commit `3190013` added `payload` and in doing so dropped
`text`, leaving `composeText()` defined and never called. The committed
file would have staged Riga rows with no prose for `process-staging` to
read. Only the *older deployed* version still set it, which is the only
reason nothing looked broken. Fixed as v7 and verified end to end: all
three rows now carry `starts_at`, `ticket_url` and `text`.

### Cleared 5 Aug 2026

| function | to | why |
| --- | --- | --- |
| `send-digest` | **v16**, `verify_jwt` false → **true** | the XSS escaping fix, plus the redesign catch-up and a live open-relay fix (below) |
| `geocode-picks` | **v11** | multi-city sweep; the cron could only ever reach Tallinn |
| `classify-moods` | **v9**, tombstone, `verify_jwt` → **true** | Mood is deleted; nothing calls it |
| `match-pick` | **v16**, tombstone, `verify_jwt` → **true** | the Concierge is deleted; nothing calls it |
| `ingest-hanzas-perons` | **v10**, `verify_jwt` false → **true** | payload contract; Riga events were landing undated |

### Retiring a function is not the same as deleting its directory

`classify-moods` and `match-pick` served Mood and the Concierge, both of
which the redesign deleted. Nothing calls either one — no page script, no
cron, no other function. The instinct is to `rm -rf` the directory, and
that would have been the wrong move: **deleting the source does not
undeploy anything.** Both would have kept answering on their public URLs
at `verify_jwt:false` — unauthenticated, LLM-calling endpoints spending
free-tier quota for features that no longer exist.

So each is now a ~30-line tombstone that returns 410 and costs nothing,
deployed at `verify_jwt:true`, with the real implementation left in git
history. Verified: unauthenticated → 401 at the edge, anon key → 410 with
a body naming the feature and the date.

The MCP tool set has `deploy` / `get` / `list` but **no delete**, so
removing them for good is a dashboard action. Do that, then delete the
two directories.

## The open relay, and what it says about `verify_jwt`

`send-digest` sat at `verify_jwt:false` and took its recipient straight
from the request body. This, with **no `Authorization` header at all**,
returned `{"ok":true,"sent":1}` against production:

```
POST /functions/v1/send-digest   {"dry_run":true,"email":"anyone@example.com"}
```

Outside dry-run that is a real message from the WanderAlt domain, on our
Resend quota and our sending reputation, to any address on the internet.

Two layers closed it. The recipient override now requires the **service
role key** — the one credential that is never published — and that is
the actual control. `verify_jwt` also went true, which rejects
unauthenticated callers at the platform edge; the Saturday cron was
repointed through `public.invoke_wa_fn()` first, because its old command
sent only a `Content-Type` header and would have started 401ing silently.

The lesson is the one the audit rule above missed: **"preserve the
existing `verify_jwt`" protects the caller, it does not vouch for the
setting.** And `verify_jwt:true` is not by itself a security boundary
here, because the anon key is public by design — it raises the bar from
"anyone" to "anyone who reads `supabase.js`". Anything outward-facing
needs a service-key check in code.

Audited at the same time, no action needed: `resolve-links` and
`backfill-pick-facts` fetch URLs from the **database**, not the request
body, and both pass them through `safeUrl()`, so neither is an SSRF
vector; `discover-venues` takes a body prompt but only regex-matches it
against a local index and makes no LLM call. The remaining
`verify_jwt:false` functions expose resource and free-tier quota abuse
(triggering a scrape, an embedding run, a Nominatim sweep), not
impersonation or data exfiltration. Tightening them is worthwhile
defence in depth, but four of their crons send `apikey` only, or no auth
header at all, so those commands have to move to `invoke_wa_fn` **before**
any function is flipped — otherwise they fail silently, which
`cron.job_run_details` will happily report as `succeeded`.

## The rule

**Deploying is a separate act from committing.** When you change an edge
function, deploy it in the same session, preserve its existing
`verify_jwt`, and say in the commit message that you did. If you cannot
deploy, say so in the PR — an undeployed fix reads exactly like a
shipped one six weeks later.
