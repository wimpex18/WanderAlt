# Models

The pipeline uses a model for four jobs: reading prose (Telegram posts, venue pages, RSS) into dated events; classifying every event (kind, tags, how well it fits WanderAlt); giving a kind to venues OpenStreetMap cannot name; and editing stored English titles and short highlights independently of extraction/classification. Structured sources (Fienta, JSON-LD) never need a model to be read.

Free models only, with no paid plan and no card on file. Same approach as Eesti-Keelt: Cloudflare Workers AI first, OpenRouter's `:free` models as fallback. Checked against the live catalogues on 29 September 2026.

## Lanes

Tried in this order. A lane without its key is skipped; a lane that fails twice in a run is skipped for the rest of it. With no lane, structured sources still publish (trusted ones) or wait for review, and prose sources wait in `raw_items`.

| Lane | Model (pin) | Keys | Free allowance |
|---|---|---|---|
| Workers AI | `@cf/openai/gpt-oss-120b` | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (permission: Workers AI Read) | 10,000 neurons a day on the Workers Free plan, shared by everything on WanderAlt's Cloudflare account: the pipeline and the site's search function (`functions/api/ask.js`) |
| OpenRouter | `google/gemma-4-31b-it:free` | `OPENROUTER_API_KEY` (free account, no card) | 50 requests a day, 20 a minute |

**English editing.** `pipeline/english.ts` uses `@cf/openai/gpt-oss-120b`, the same free model as extraction/classification, with the existing OpenRouter free fallback. Override with `ENGLISH_MODEL`. Six editorial calls are reserved per pipeline run, sharing the run's 1,500-neuron Workers AI ceiling; extraction cannot consume those reserved calls, and its Workers lane stops 500 neurons below the shared ceiling to leave room for English after new events are written. Saved copy and input hashes avoid repeating translations on page visits or unchanged source refreshes. No paid translation API.

Override a pin without a code change: `WORKERS_AI_MODEL`, `OPENROUTER_MODEL`.

OpenRouter is asked with a `models` list, so when Gemma 4 is rate-limited upstream (it often is) the request moves to `nvidia/nemotron-3-super-120b-a12b:free`, then `google/gemma-4-26b-a4b-it:free` (OpenRouter takes at most three), all free with structured output. The 50-requests-a-day account limit still applies.

`gpt-oss-120b` is the model Eesti-Keelt measured and runs in production on the same free plan. Workers AI's allocation is per Cloudflare account. WanderAlt has its own Cloudflare account, separate from Eesti-Keelt's. The Pages project, the repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, and a local `.env` all use that account, so the 10,000 neurons a day are shared only by the pipeline and the site's search. A first run classifies a few hundred Fienta events, which uses a large share of one day's allocation. Later runs only see new or changed items and use far less. When the allocation runs out, Workers AI refuses and the run falls through to OpenRouter.

Calls to OpenRouter are spaced 3.1 s apart. A 429 waits (for `Retry-After`, else 20 s) and retries the same lane twice before counting as a failure. `LLM_CALL_BUDGET` (default 60) caps calls per run.

**Posters.** A Telegram post's first photo is read by Workers AI's free vision model, `@cf/meta/llama-4-scout-17b-16e-instruct` (override: `WORKERS_AI_VISION_MODEL`), and its text is added to the post before extraction, since a poster often carries the date, time and venue the post leaves out. About 35 neurons a poster, at most 30 posters a run (`--max-posters`). Workers AI takes images only as base64, so the pipeline downloads each one (under 3 MB). Checked on a real poster on 27 September 2026; Gemma 4 on Workers AI returned nothing for the same image.

**When Workers AI says the day's allocation is used up** (error 4006, quoted in the log), the lane is skipped for the rest of the run without retries. The run logs the last four characters of `CLOUDFLARE_ACCOUNT_ID` so it can be compared with WanderAlt's account ID in the Cloudflare dashboard. If the pipeline's counter says 0 but the first call is refused, the secret points at some other account. A long programme page is read in parts of at most 5,000 characters, since one answer for a whole page was cut off at the free models' output limit.

**Budget.** A run stops using Workers AI after 1,500 neurons (`WORKERS_AI_NEURON_BUDGET`), or sooner when the day's runs have together spent 6,000 (`WORKERS_AI_DAILY_NEURONS`, counted from `pipeline_runs` since 00:00 UTC, when the allocation resets), and falls through to OpenRouter; with four runs a day the default 6,000 leaves headroom, and the repository secret can raise it toward the account's 10,000. Measured on 27 September 2026: reading 11 Telegram posts cost about 1,500 neurons (≈135 each), Vaba Lava's schedule page about 450. Every run logs the neurons it spent.

## Search (`/api/ask`)

The site's search reads a sentence in the page first (`ask.js`). Only when words are left that it cannot place and nothing matches does it call `functions/api/ask.js`, a Pages Function that asks `@cf/openai/gpt-oss-20b` (override: `ASK_MODEL`) for filters in a strict JSON schema: when, day, kinds, free, English, price cap, place words, topic words with English and Estonian synonyms, and a note of at most 60 characters. Reasoning effort is low, temperature 0.2, at most 700 tokens; about 25 neurons a question. Every field is checked against known values before it goes back, and answers are cached for a day per question and date. The model never writes listings; the list is always our own.

It needs a Workers AI binding named `AI` on the Pages project: Workers & Pages → wanderalt → Settings → Bindings → Add → Workers AI, variable name `AI`, for Production and Preview, then redeploy. It uses that account's free 10,000 neurons a day. Only the site's own pages may call it (`Sec-Fetch-Site: same-origin`, or an Origin/Referer on the site's host); anything else gets 403, so a script or crawler cannot spend the allocation. Without the binding the function answers 503 and search works on the page's own reading.

## Why not the others

- **Gemini**: its free tier needs a Google AI Studio key, and Google may use free-tier traffic to improve its products. Not used.
- **Mistral** (`mistral-small-2603`, used by the retired pipeline): the free plan is now $10 of monthly credits rather than a free allowance.
- **NVIDIA** `nemotron-3.5-lightning` (used by the retired pipeline): survives as `nvidia/nemotron-3.5-lightning:free` on OpenRouter but has no JSON-schema support there, so Gemma 4 took the OpenRouter slot.
- **GitHub Models**: closed to new customers in June 2026.
- **Other Workers AI models**: `@cf/qwen/qwen3.8-27b` reads images and runs on the free plan, but Eesti-Keelt saw empty answers from it at long outputs. GLM-5.3 and DeepSeek V4 are not on the free plan.

## Checking

```bash
npm run pipeline:models     # every configured lane answers a one-line JSON probe
npm run pipeline:dry        # full read of every source, nothing written
```

Model ids disappear without notice. When a lane starts failing, run the probe, check the provider's catalogue, and re-pin. Before switching a pin, compare a dry run's output on the same day with both models.
