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
| `ingest-splendidpalace` | v6 → **v7** | parser rewritten: titles were arriving as URL slugs |
| `ingest-kinobize` | v5 → **v6** | parser rewritten: day-grouped schedule, dates were empty |

### Known drift introduced 4 Aug 2026 — deploy these two next

`ingest-splendidpalace` and `ingest-kinobize` are deployed at the
rewritten parsers (v7 / v6, verified live: real titles, real dates), but
**one commit later than production**: `fec9253`, which decodes numeric
HTML entities in `stripTags`. Both listings carry them — "Candlelight:
Vivaldi&#039;s Four Seasons" staged exactly like that.

Recorded here rather than left silent because that is what the rule at
the foot of this file requires. It is cosmetic and low-risk: the title
passes through `process-staging`'s LLM rewrite before it reaches a pick,
which usually normalises it. Deploy both on the next pass.

### Still behind — deploy from this repo when you're ready

| function | deployed | missing | severity |
| --- | --- | --- | --- |
| `send-digest` | 8 Jun | `f3ed3bf` XSS escaping in the digest email | **security**; cron is frozen so it isn't sending |
| `ingest-hanzas-perons` | 3 Jul | `3190013` payload contract | Riga events land without a timestamp |
| `classify-moods` | 3 Jul | `df25819` model repoint | **confirmed** still pinned to `meta-llama/llama-4-scout-17b-16e-instruct`, which 404s at Groq — the function cannot succeed |
| `draft-column` | 15 Jul | `df25819` model repoint | same dead model |
| `match-pick` | 26 Jul | `df25819` model repoint | same dead model |

`classify-moods` and `match-pick` serve Mood and the Concierge, both of
which the Aug 2026 redesign deletes — so those two may not be worth a
deploy at all. `send-digest` and `ingest-hanzas-perons` are.

## The rule

**Deploying is a separate act from committing.** When you change an edge
function, deploy it in the same session, preserve its existing
`verify_jwt`, and say in the commit message that you did. If you cannot
deploy, say so in the PR — an undeployed fix reads exactly like a
shipped one six weeks later.
