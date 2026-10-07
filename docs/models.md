# Models

The pipeline uses a model for four jobs: reading prose (Telegram posts, venue pages, RSS) into dated events; classifying every event (kind, tags, how well it fits WanderAlt); giving a kind to venues OpenStreetMap cannot name; and editing stored English titles and short highlights independently of extraction/classification. Structured sources (Fienta, JSON-LD) never need a model to be read.

Free models only, with no paid plan and no card on file. Same approach as Eesti-Keelt: Cloudflare Workers AI first, OpenRouter's `:free` models as fallback. Checked against the live catalogues on 29 September 2026.

## Lanes

Tried in this order. A lane without its key is skipped; a lane that fails twice in a run is skipped for the rest of it. With no lane, structured sources still publish (trusted ones) or wait for review, and prose sources wait in `raw_items`.

| Lane | Model (pin) | Keys | Free allowance |
|---|---|---|---|
| Workers AI | `@cf/openai/gpt-oss-120b` | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (permission: Workers AI Read) | 10,000 neurons a day on the Workers Free plan, shared by everything on WanderAlt's Cloudflare account: the pipeline and the site's search function (`functions/api/ask.js`) |
| OpenRouter | `google/gemma-4-31b-it:free` | `OPENROUTER_API_KEY` (free account, no card) | 50 requests a day, 20 a minute |

**Classification.** Kind, tags and fit are judged by `@cf/openai/gpt-oss-20b` (override: `WORKERS_AI_CLASSIFY_MODEL`), a smaller and cheaper Workers AI model, with the same OpenRouter fallback, ten listings a call. The answer carries no English text (the English step writes it from the full source), which keeps it short; a batch that is still cut off or unreadable is asked again in halves before it is left to the rules. Measured on 30 September 2026: with 20 listings a call and English fields in the answer, OpenRouter cut off two of three batches and only 60 of 200 waiting events were classified.

**English editing.** `pipeline/english.ts` uses `@cf/openai/gpt-oss-120b`, the same free model as extraction/classification, with the existing OpenRouter free fallback. Override with `ENGLISH_MODEL`. Ten editorial calls of five events each are reserved per pipeline run. One neuron counter covers the run, with a ceiling for each step inside the run's allowance (2,400 by default): extraction stops at half of it, classification at three quarters, English copy at all of it, so a later step is never starved by an earlier one. Saved copy and input hashes avoid repeating translations on page visits or unchanged source refreshes. No paid translation API.

Override a pin without a code change: `WORKERS_AI_MODEL`, `OPENROUTER_MODEL`.

OpenRouter is asked with a `models` list, so when Gemma 4 is rate-limited upstream (it often is) the request moves to `nvidia/nemotron-3-super-120b-a12b:free`, then `google/gemma-4-26b-a4b-it:free` (OpenRouter takes at most three), all free with structured output. The 50-requests-a-day account limit still applies.

`gpt-oss-120b` is the model Eesti-Keelt measured and runs in production on the same free plan. Workers AI's allocation is per Cloudflare account. WanderAlt has its own Cloudflare account, separate from Eesti-Keelt's. The Pages project, the repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, and a local `.env` all use that account, so the 10,000 neurons a day are shared only by the pipeline and the site's search. A first run classifies a few hundred Fienta events, which uses a large share of one day's allocation. Later runs only see new or changed items and use far less. When the allocation runs out, Workers AI refuses and the run falls through to OpenRouter.

Calls to OpenRouter are spaced 3.1 s apart. A 429 waits (for `Retry-After`, else 20 s) and retries the same lane twice before counting as a failure. `LLM_CALL_BUDGET` (default 60) caps calls per run.

**Posters.** A Telegram post's first photo is read by Workers AI's free vision model, `@cf/meta/llama-4-scout-17b-16e-instruct` (override: `WORKERS_AI_VISION_MODEL`), and its text is added to the post before extraction, since a poster often carries the date, time and venue the post leaves out. About 35 neurons a poster, at most 30 posters a run (`--max-posters`). Workers AI takes images only as base64, so the pipeline downloads each one (under 3 MB). Checked on a real poster on 27 September 2026; Gemma 4 on Workers AI returned nothing for the same image.

**When Workers AI says the day's allocation is used up** (error 4006, quoted in the log), the lane is skipped for the rest of the run without retries. The run logs the last four characters of `CLOUDFLARE_ACCOUNT_ID` so it can be compared with WanderAlt's account ID in the Cloudflare dashboard. If the pipeline's counter says 0 but the first call is refused, the secret points at some other account. A long programme page is read in parts of at most 5,000 characters, since one answer for a whole page was cut off at the free models' output limit.

**Budget.** A run stops using Workers AI after 2,400 neurons (`WORKERS_AI_NEURON_BUDGET`), or sooner when the day's runs have together spent 6,000 (`WORKERS_AI_DAILY_NEURONS`, counted from `pipeline_runs` since 00:00 UTC, when the allocation resets), and falls through to OpenRouter; a run that crashes still records the neurons it spent (before this, a crash recorded none and the next run spent them again); with four runs a day the default 6,000 leaves headroom, and the repository secret can move it. The cap counts only what the pipeline itself spends: search (`/api/ask`), local runs and anything else on the account come out of the same 10,000, so keep the secret near 7,000 to leave about 3,000 for them. Measured on 27 September 2026: reading 11 Telegram posts cost about 1,500 neurons (≈135 each), Vaba Lava's schedule page about 450. Every run logs the neurons it spent and which sources cost model calls (`model calls by source:`), which is where the next structured adapter pays off most (Vaba Lava's has one already).

**OpenRouter's free limit.** Without credits the free models allow 50 requests a day across the account (HTTP 429, "free-models-per-day"). A run may make `OPENROUTER_RUN_CAP` (12) of them, so the four daily runs share the day's and the first does not spend it, and the first 429 of that kind ends the lane for the run instead of retrying for minutes. Credits would raise it to 1,000 a day but are not used: free tiers only.

## Opening hours (`pipeline/model-hours.ts`)

The last step of the hours cascade (`docs/data.md`), for up to eight places a run whose own site or Instagram bio has lines about hours that no rule could read. It shares the event reader's `Models` (and so its call budget and neuron ceiling) and sees only those lines, at most 1,800 characters. It answers per day ("HH:MM-HH:MM", "closed" or "unknown"); the answer is dropped when any day is unknown or any time is not written in the text. A short call, well under 100 neurons.

## Guide notes (`pipeline/place-notes.ts`)

For a picked place with no `pick_note`, up to ten a run: the model sees the place's name, kind, area, its stored description and its Instagram bio when the run read it, and writes one English sentence. The sentence is dropped when it has an exclamation mark, a handle or link, a price, a marketing word or "discover", or a number or capitalised name that is not in those words. A kept note is `pick_note_source = 'model'` and is written only into an empty note. A place with nothing kept is asked again after a month.

## Estonian, Russian and Ukrainian copy (`pipeline/localize.ts`)

After the English step, its own `Models` with 8 calls a run and the run's neuron ceiling. Five events a call: the model sees each listing's original title and text (at most 3,000 characters), the title's language and the English title for reference, and returns a title and a 1–2 sentence summary in each of the three languages. Notes go fifteen a call. The checks are in `docs/data.md`. A batch whose answer is cut off or unreadable is split in half and tried again, down to one event; any other failure leaves it due next run. It is held to the day's Workers AI allowance like the other readers (`WORKERS_AI_DAILY_NEURONS`). OpenRouter calls carry its own `reasoning: { effort: 'low', exclude: true }`, so a thinking fallback model does not spend the 8,192-token answer on reasoning (the 5 October run lost two batches and a route title that way).

## Routes (`pipeline/routes.ts`)

Once per pipeline run, after places are verified. Code finds every working evening for today and the next two days: a published listing with a start time, a picked place before it (record shop, bookshop, gallery, thrift, arts centre, cinema) and a picked bar or club after it, each within 15 and 12 minutes' walk, never the same building, open when you would be there according to `hours.js` (the pipeline loads the site's own reader through `pipeline/hours.ts`), at least half an hour at the first stop, a bar after four and a club after nine. The best around each listing are shortlisted (no place more than twice a day) and one model call per day gets a short brief of facts we hold (times, names, kinds, pick notes) and returns up to three ids with a plain title and one sentence. Code then keeps only ids that exist, rejects any text that breaks the voice (exclamation marks, handles, links, "discover", marketing words, a "late" title before nine), and fills anything missing by rule. With no model lane the same routes are titled by rule (`engine` says `rules`). Rows go to `routes` with an upsert and older rows are deleted after. The call budget is four and the neuron ceiling is the run's allowance, so it takes about 25 neurons a day. The page re-checks every stop (the listing has not started, no place is shut), so a stale route is never shown. `npm run routes:dry` prints; `npm run routes` writes; `--public` reads with `SUPABASE_ANON_KEY` for a dry run without the service key.

## Search (`/api/ask`)

Typing and previews use `ask.js` and `search-data.js` locally, in English, Estonian, Russian and Ukrainian. Only an explicit full-results submission may ask the model, when words remain unplaced and no event matches. Local plan words use stored/composed walks. Accepted interpretations and manual overrides travel in the results URL to Map; Map does not issue another inference request.

`functions/api/ask.js` uses the existing free Workers AI model `@cf/openai/gpt-oss-20b` (`ASK_MODEL` override), direct JSON Schema output, low reasoning effort, temperature 0.2 and at most 700 tokens. It returns intent, date/window, event/place kinds, free/English/open-now, cap, mandatory place words and topic synonyms. Fields and real calendar dates are checked; the model cannot invent catalogue entries. Local date/kind/free/English/cap constraints remain authoritative and later edits invalidate an in-flight answer. Mandatory place words are never relaxed into an OR search. A model answer that finds no events leaves the local reading in place; valid place matches can still answer a place intent.

The server derives the Tallinn date, caches answers per question and day, and applies a daily fresh-question cap when `ASK_KV` is bound (`ASK_DAILY_CAP`, default 100). Configuration requires an `AI` binding and the KV namespace on Production and Preview. The existing zone rate-limit rule for `/api/ask` is 10 requests per 10 seconds per IP, blocked for 10 seconds. Origin checks are forgeable and are not a quota limit. Workers AI’s free allowance is shared with the pipeline; keep the search cap within the pipeline’s reserved budget. No paid model lane is introduced here.

Without `AI` the function returns 503; unavailable inference returns 502, and a reached daily cap returns 429. Search remains local in every case. The client pauses remote retries for five minutes after failure, and keys its short-lived cache by the Tallinn date. Verify live bindings and limits when changing deployment configuration; this document does not infer their presence from a successful local search.

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

Instagram poster reading shares the existing vision model and neuron counter: at most five per run within the 30-poster limit, resolved from fresh official media URLs. Poster-derived event dates/times require manual review; no vision capacity leaves raw items pending. Signed Instagram media is never republished as event artwork.
