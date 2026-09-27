# Models

The pipeline uses a model for two jobs: reading prose (Telegram posts, venue pages, RSS) into dated events, and classifying every event (kind, tags, how well it fits WanderAlt, an English title and one-sentence summary). Structured sources (Fienta, JSON-LD) never need a model to be read.

Free tiers only. Checked against the live catalogues on 27 September 2026.

## Lanes

Tried in this order. A lane without its key is skipped; a lane that fails twice in a run is skipped for the rest of it. With no lane, structured sources still publish (trusted ones) or wait for review, and prose sources wait in `raw_items`.

| Lane | Model (pin) | Key | Why |
|---|---|---|---|
| Gemini | `gemini-3.5-flash-lite` | `GEMINI_API_KEY` ([AI Studio](https://aistudio.google.com/apikey), free) | Cheapest current Gemini with a free tier, JSON-schema output, reads images (event posters). |
| Workers AI | `@cf/openai/gpt-oss-120b` | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (Workers AI: Read) | 10,000 neurons a day free. The pin Eesti-Keelt measured and uses in production. Text only. |
| OpenRouter | `google/gemma-4-31b-it:free` | `OPENROUTER_API_KEY` | 50 requests a day free; JSON-schema support. Last resort. |

Override a pin without a code change: `GEMINI_MODEL`, `WORKERS_AI_MODEL`, `OPENROUTER_MODEL`.

Free-tier Gemini traffic may be used by Google to improve its products. Everything the pipeline sends is already public (listings and posts), so that is acceptable here; never send user data through a free lane.

## What replaced what

The retired pipeline (removed 15 September 2026) used Groq, then `mistral-small-2603`, `nemotron-3.5-lightning-30b-a3b` on NVIDIA and OpenRouter `:free` lanes.

- `mistral-small-2603` (Mistral Small 4) is still Mistral's newest small model, but Mistral's free plan is now $10 of monthly credits rather than a free API allowance, so it is not a lane.
- `nemotron-3.5-lightning` survives as `nvidia/nemotron-3.5-lightning:free` on OpenRouter; it has no JSON-schema support there, so Gemma 4 took the OpenRouter slot.
- Gemini's free tier is Flash and Flash-Lite only (Pro models left it in May 2026). `gemini-3.8-flash` (GA 2 September 2026) is also free and is the step up if Flash-Lite misreads posts: set `GEMINI_MODEL=gemini-3.8-flash`.
- Workers AI candidates: `@cf/qwen/qwen3.8-27b` reads images and runs on the free plan, but Eesti-Keelt saw empty answers from it at long outputs; GLM-5.3 and DeepSeek V4 are not on the free plan.

## Checking

```bash
npm run pipeline:models     # every configured lane answers a one-line JSON probe
npm run pipeline:dry        # full read of every source, nothing written
```

Model ids disappear without notice. When a lane starts failing, run the probe, check the provider's catalogue, and re-pin. Before switching the primary lane, compare a dry run's output on the same day with both models.
