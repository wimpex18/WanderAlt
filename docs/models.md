# Models

The pipeline uses a model for three jobs: reading prose (Telegram posts, venue pages, RSS) into dated events; classifying every event (kind, tags, how well it fits WanderAlt, an English title and one-sentence summary); and giving a kind to venues OpenStreetMap cannot name. Structured sources (Fienta, JSON-LD) never need a model to be read.

Free models only, with no paid plan and no card on file. Same approach as Eesti-Keelt: Cloudflare Workers AI first, OpenRouter's `:free` models as fallback. Checked against the live catalogues on 27 September 2026.

## Lanes

Tried in this order. A lane without its key is skipped; a lane that fails twice in a run is skipped for the rest of it. With no lane, structured sources still publish (trusted ones) or wait for review, and prose sources wait in `raw_items`.

| Lane | Model (pin) | Keys | Free allowance |
|---|---|---|---|
| Workers AI | `@cf/openai/gpt-oss-120b` | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (permission: Workers AI Read) | 10,000 neurons a day on the Workers Free plan, shared by every model on the account |
| OpenRouter | `google/gemma-4-31b-it:free` | `OPENROUTER_API_KEY` (free account, no card) | 50 requests a day, 20 a minute |

Override a pin without a code change: `WORKERS_AI_MODEL`, `OPENROUTER_MODEL`.

`gpt-oss-120b` is the model Eesti-Keelt measured and runs in production on the same free plan. Workers AI's allocation is per Cloudflare account: if WanderAlt uses the same account as Eesti-Keelt, the two share the 10,000 neurons. A first run classifies a few hundred Fienta events, which uses a large share of one day's allocation. Later runs only see new or changed items and use far less. When the allocation runs out, Workers AI refuses and the run falls through to OpenRouter.

Calls to OpenRouter are spaced 3.1 s apart. A 429 waits (for `Retry-After`, else 20 s) and retries the same lane twice before counting as a failure. `LLM_CALL_BUDGET` (default 60) caps calls per run.

**Posters.** A Telegram post's first photo is read by Workers AI's free vision model, `@cf/meta/llama-4-scout-17b-16e-instruct` (override: `WORKERS_AI_VISION_MODEL`), and its text is added to the post before extraction, since a poster often carries the date, time and venue the post leaves out. About 35 neurons a poster, at most 30 posters a run (`--max-posters`). Workers AI takes images only as base64, so the pipeline downloads each one (under 3 MB). Checked on a real poster on 27 September 2026; Gemma 4 on Workers AI returned nothing for the same image.

**Budget.** A run stops using Workers AI after 1,500 neurons (`WORKERS_AI_NEURON_BUDGET`), or sooner when the day's runs have together spent 6,000 (`WORKERS_AI_DAILY_NEURONS`, counted from `pipeline_runs` since 00:00 UTC, when the allocation resets), and falls through to OpenRouter. That leaves at least 4,000 a day for Eesti-Keelt on the same account. Measured on 27 September 2026: reading 11 Telegram posts cost about 1,500 neurons (≈135 each), Vaba Lava's schedule page about 450. Every run logs the neurons it spent.

## Why not the others

- **Gemini**: its free tier needs a Google AI Studio key, and Google may use free-tier traffic to improve its products. Not used.
- **Mistral** (`mistral-small-2603`, used by the retired pipeline): the free plan is now $10 of monthly credits rather than a free allowance.
- **NVIDIA** `nemotron-3.5-lightning` (used by the retired pipeline): survives as `nvidia/nemotron-3.5-lightning:free` on OpenRouter but has no JSON-schema support there, so Gemma 4 took the OpenRouter slot.
- **GitHub Models**: closed to new customers in June 2026.
- **Other Workers AI models**: `@cf/qwen/qwen3.8-27b` reads images and runs on the free plan, but Eesti-Keelt saw empty answers from it at long outputs. GLM-5.3 and DeepSeek V4 are not on the free plan.

## Not yet verified

No model lane has been called for real yet: this machine had no keys when the pipeline was written. Both lanes use the OpenAI-compatible chat-completions API as their providers document it (Eesti-Keelt calls the same Workers AI endpoint), and the tests use fake lanes. Once the keys are set, run `npm run pipeline:models`, then `npm run pipeline:dry`, and read the output before trusting the scores.

## Checking

```bash
npm run pipeline:models     # every configured lane answers a one-line JSON probe
npm run pipeline:dry        # full read of every source, nothing written
```

Model ids disappear without notice. When a lane starts failing, run the probe, check the provider's catalogue, and re-pin. Before switching a pin, compare a dry run's output on the same day with both models.
