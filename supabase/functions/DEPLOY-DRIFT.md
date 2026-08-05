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
| `classify-moods` | 3 Jul | `df25819` model repoint | dead model, but it served Mood, which the redesign **deleted**. Nothing calls it. Retire rather than deploy. |
| `draft-column` | 15 Jul | `df25819` model repoint | same dead model; `draft-column-weekly` stays off until it is repointed |
| `match-pick` | 26 Jul | `df25819` model repoint | dead model, served the Concierge, which the redesign **deleted**. Nothing calls it. Retire rather than deploy. |

`ingest-hanzas-perons` cleared itself: it is deployed and its 03:50 cron
inserted 3 rows on 5 Aug, so the payload contract is live.

### Cleared 5 Aug 2026

| function | to | why |
| --- | --- | --- |
| `send-digest` | **v16**, `verify_jwt` false → **true** | the XSS escaping fix, plus the redesign catch-up and a live open-relay fix (below) |
| `geocode-picks` | **v11** | multi-city sweep; the cron could only ever reach Tallinn |

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
