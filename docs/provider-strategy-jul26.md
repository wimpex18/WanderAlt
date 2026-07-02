# Provider strategy — AI, places & events (July 2026)

A researched revision of every external API/AI dependency, written pre-release (no users; only the owner + Claude Code exercise the app). Goal: **everything on free tiers or open data**, no surprise bills, and catch up with the July 2026 landscape before launch. Companion to `docs/backend-and-pipeline.md` (current pipeline state) and the LLM policy in `CLAUDE.md`.

**Status update (2 Jul 2026, evening session): P0 + P1 + the Gemini-text exit are APPLIED.**
- **P0 done** — cron dial-down live (`process-staging` hourly, `embed-picks` 4×/day, `geocode-picks` daily; restore SQL in `docs/backend-and-pipeline.md`). Spend caps remain owner-console TODOs.
- **P1 done, Google-free venue search shipped** — `places_index` (1,895 Overture venues, 4 cities incl. Vilnius) + `wa_search_places_index` RPC + `discover-venues` v2. R5 closed.
- **Gemini text fallback retired** (`gemini_fallback_enabled=false`; owner asked to avoid Gemini) — text generation is Groq-only; R3 is superseded by the stronger exit, R4 (OpenRouter/Cerebras lane) awaits an owner-created free key. Embeddings remain the one Gemini free-tier call pending the Workers-AI migration (needs CF token + re-embed).
- **Bonus outage fix** — `embed-picks` had been 500ing every run since ~12 Jun (client-side id-diff blew the HTTP/2 header limit past ~500 embeddings; 496/516 active picks unembedded). v3 ships a DB-side anti-join RPC; backfill embedded 303 immediately, cron drains the rest. The concierge had been silently degraded the whole time.
- R2 (Groq prompt caching) and R9 (hybrid retrieval) remain open — see the phased plan.

**Second status update (2 Jul 2026, late session):**
- **ALL crons frozen** (owner decision — pre-release, nobody uses the app): every `cron.job` set `active=false`, schedules preserved; embeddings backlog fully drained first. Re-enable SQL + per-cron API analysis in `docs/backend-and-pipeline.md`.
- **ICS calendar feed shipped** (`calendar-feed` edge fn + Today/curator UI links) — the market-scan top pick.
- **OpenRouter lane wired in repo** (process-staging/generate-context/draft-column), inert until `OPENROUTER_API_KEY` exists; deploy-on-key procedure in the backend doc. R4 closed code-side.
- Remaining owner console actions: create the OpenRouter key (free, no card) → Supabase secret `OPENROUTER_API_KEY`; optional CF API token (`CF_ACCOUNT_ID` + `CF_AI_TOKEN` secrets) for the Workers-AI embeddings exit; Groq spend cap + Google budget alert.

Each recommendation below is marked R-n; the phased plan at the bottom orders them.

### July 2026 free-tier landscape — second research pass (verified)

- **Cerebras**: ~1M tokens/day free, no card; free catalog volatile (llama-3.3-70b, qwen3, gpt-oss-120b seen; 8K context cap on free) — fastest inference available.
- **Mistral La Plateforme**: ~1B tokens/month on the Experiment tier, but requires opting into data training — borderline for curator content; use only with that trade-off acknowledged.
- **GitHub Models**: free access incl. GPT-4o/Claude-class models behind Azure — fine for experiments, rate-limited for pipelines.
- **Places/geo interactive APIs (complements to the Overture open-data path)**: LocationIQ 5,000 req/day free (2 rps, attribution); Geoapify 3,000 req/day (free batch geocoding); HERE 250K transactions/month; TomTom 50K/day. Any of these could replace Nominatim for interactive admin lookups if volume ever grows — none are needed today.

---

## 1. Where the money went (post-mortem, closed)

The ~€45 Google bill was **not** normal usage: `geocode-picks`, `enrich-venues`, and the old `enrich-pick-images` re-billed the Google Places API **every cron tick** for venues/picks they could never resolve — an uncapped retry loop running around the clock during a phase where nobody uses the app. Fixed June/July 2026 (already on `main`):

- `GOOGLE_PLACES_API_KEY` removed; all three functions now stamp a `*_failed_at` cooldown (14-day skip) so unresolvables are never hot-looped again.
- `enrich-pick-images` cron unscheduled (dormant).
- `discover-venues` (admin venue search) kept the Places code path and now 503s — **it is the one capability left without a provider** (see R5).

The structural lesson generalises: *any* metered API + a cron + no per-item failure cooldown = an open-ended bill. The cooldown-stamp pattern is now the house rule for every enrichment function.

## 2. What we spend today (verified 2 Jul 2026)

- **30 active pg_cron jobs.** Three run frequently regardless of content: `wa-process-staging` */30 min, `embed-picks-auto` */30 min, `wa-geocode-picks` hourly — ~120 invocations/day that are no-ops most ticks pre-release. The rest are nightlies/weeklies.
- **LLM:** ~100% Groq free tier in practice (`llama-4-scout` primary, `llama-3.3-70b` fallback). Gemini fallback is gated by `pipeline_config.gemini_fallback_enabled` and `send-digest` runs Gemini weekly at trivial volume. Embeddings on `gemini-embedding-001` free tier.
- **Geo/data:** Nominatim (free), Overpass/OSM (free), Wikidata/Wikimedia (free), OpenFreeMap tiles (free, no key). Zero metered geo APIs remain on crons.

So today's steady-state external cost is **€0** — the revision below is about (a) filling the venue-search hole for free, (b) resilience/quality upgrades that stay free, and (c) guardrails so a future bug can't re-create the bill.

---

## 3. LLM strategy (July 2026 landscape — verified)

**Facts checked against primary docs this week:**

| Provider | Free capacity (Jul 2026) | Notes |
|---|---|---|
| **Groq** | Free tier per-model RPM/RPD/TPM (numbers shown per-org on the console Limits page); has covered 100% of pipeline volume to date | **Cached tokens don't count against rate limits**; structured outputs + prompt caching are GA |
| **Gemini API** | Free tier exists per project; Google no longer publishes per-model numbers on the docs page (visible in AI Studio); spend-based limits: Free tier = no spend possible | **Model landscape moved: Gemini 3.5 Flash + 3.1 Flash-Lite/Pro are current**; 2.5 family is legacy-but-live. The CLAUDE.md rule "gemini-3.5-flash doesn't exist / 404" is now outdated as a *fact* (it was true when written) |
| **OpenRouter** | 23 `:free` models incl. `meta-llama/llama-3.3-70b-instruct:free`, `openai/gpt-oss-120b:free`, `qwen/qwen3-next-80b-a3b-instruct:free`, `nvidia/nemotron-3-super-120b-a12b:free` | One key, OpenAI-compatible; daily caps on free models |
| **Cloudflare Workers AI** | **10,000 neurons/day free** (~free small-model inference + embeddings/reranking); we're already a Cloudflare Pages customer | Models: llama-3.x, bge embeddings, bge reranker; resets 00:00 UTC |

**Recommendations:**

- **R1 — Keep Groq-first exactly as is.** It's free, it carries the whole pipeline, and nothing in the July 2026 market beats it for our volume. No change.
- **R2 — Add prompt caching to `process-staging` (free win).** Restructure the prompt so the static prefix (system rules + `CITY_CONTEXT`) leads and the per-message content trails: Groq cached tokens don't count against rate limits, which both speeds the 30-min drain and effectively raises our free ceiling. Zero risk, one-function change.
- **R3 — Refresh the Gemini fallback pins once, deliberately.** Move fallbacks `gemini-2.5-flash`/`-flash-lite` → `gemini-3.1-flash-lite` class (verify exact id in AI Studio at implementation time), and rewrite the CLAUDE.md guard from "3.5 doesn't exist" to "pin models by exact id; verify in AI Studio before changing" — the *rule we actually need* is anti-drift, not anti-3.5. Keep the `gemini_fallback_enabled` gate. Embeddings stay `gemini-embedding-001` until R9 decides.
- **R4 — Add OpenRouter as the third lane (resilience, not capacity).** One `OPENROUTER_API_KEY` secret + ~10 lines in the shared LLM helper: if Groq 429s/5xxs and the Gemini gate is off, try `llama-3.3-70b-instruct:free`. The pipeline currently has a single point of failure on Groq for its free path.

## 4. Places & venue search (replace Google Places for good)

**Verified July 2026:**

- **Overture Maps places theme** — 75M+ POIs (June 2026 release), CDLA-Permissive/CC0 licensed, includes the Foursquare (Apache-2.0) and Meta corpora, distributed as GeoParquet — queryable with DuckDB, **no key, no rate limit, no ToS trap**.
- **Foursquare OS Places** — free open data, now delivered via the FSQ Places Portal (Iceberg catalog, token from portal signup).
- **Nominatim** — policy re-verified: max 1 rps, real UA, attribution, caching required, periodic app requests = bulk = discouraged. Our cooldown-stamped, low-volume crons comply; keep it interactive/low-volume only.

**Recommendation R5 — rebuild `discover-venues` on Overture instead of re-keying Google.** One-shot (repeatable per city): DuckDB extract of the Overture places theme for each city's bbox → filter to our `VENUE_KINDS` taxonomy → land in a `places_index` table (name, kind, lat/lng, address, website/socials, source attribution). The admin "find venues" search then queries Postgres (`pg_trgm` + tsvector) instead of a metered external API — instant, free forever, and it works offline in admin. Nominatim stays the interactive fallback for one-off address lookups; Overpass keeps the weekly OSM refresh it already does. FSQ OS Places is the optional second corpus if Overture coverage of Baltic venues proves thin (spot-check Telliskivi/Kalamaja density first).

## 5. Events sources (the moat + candidates)

The Telegram/Fienta/Linked-Events mix is the moat — human-curated channels are exactly what "curated by humans" means, and no API replaces them. Candidates to widen coverage, all free:

- **Ticketmaster Discovery API** — verified: 5,000 calls/day + 5 rps free, "other European countries" listed. **Verify Baltic inventory before wiring anything** (Piletilevi dominates Estonia and is not TM; likely low yield here — this is a cheap probe, not a plan).
- **City open-data event feeds** — Helsinki Linked Events already ships. Tallinn (kultuurikava/Visit Tallinn), Riga, and Vilnius (api.vilnius.lt / data.gov.lt) all *claim* open event data; each needs a 30-minute probe for a machine-readable feed + licence. Structured feeds are the sustainable shape (per ROADMAP: HTML scrapers must earn their keep).
- **Fediverse events (Mobilizon / Gancio)** — the most on-brand source in the 2026 landscape: self-hosted, federated, DIY-scene event calendars with clean ActivityPub/JSON APIs and no ToS friction. Coverage in our cities is unproven — worth a standing quarterly check whether a local instance appears; adopt the moment one does.
- **RA GraphQL** stays hand-invoke only (ToS decision stands, do not re-raise).

**R6:** run the three probes above as one time-boxed session; wire only what yields real underground-relevant events with a licence we can attribute.

## 6. Guardrails (so this never happens again)

- **R7 — Dial the pre-release cron cadence down** (owner call — crons own the schedule): `wa-process-staging` */30min → hourly at :12; `embed-picks-auto` */30min → 4×/day; `wa-geocode-picks` hourly → daily (it drains a mostly-empty queue). Restore launch cadence with one SQL when the app goes live. Cuts ~85% of invocations while testing; zero product impact at zero users.
- **R8 — Hard spend caps everywhere they exist:** Groq console spend limit ≈ $0 (free tier only); Google Cloud budget alert at €5 with email; Supabase is already on a fixed plan. Add a line to `docs/backend-and-pipeline.md` when set so the caps are documented, not tribal.

## 7. Catching up with July 2026 (product-side, free)

What we already match: the in-field concierge = the iOS 27 "search or ask" unified pattern (ROADMAP shelf note); no-tracking + open-data posture is the 2026 grain.

- **R9 — Hybrid retrieval for the concierge (the one real quality gap).** Current match = embeddings-only vector search. The 2026 baseline is hybrid: Postgres full-text (tsvector, free, already in Supabase) + pgvector, fused with RRF — then optionally reranked by Cloudflare Workers AI's bge reranker inside the 10k free neurons/day. Better matches for names/venues the embedding misses, still €0 and inside the existing stack. This also opens the door to moving embeddings themselves to Workers AI if Google ever gates `gemini-embedding-001`.
- **R10 — Batch the nightlies.** `generate-context` / `classify-moods` / `translate-picks` are offline jobs; Groq and Gemini both ship batch APIs (Gemini batch at 50% price if the paid path is ever used; Groq batch raises effective free throughput). Worth adopting only when volume grows — noted so we reach for it then, not for more crons.

---

## Phased plan

| Phase | Items | Effort | Risk |
|---|---|---|---|
| **P0 — guardrails now** | R7 cron dial-down (after owner OK) · R8 spend caps | ~1h | none |
| **P1 — fill the hole** | R5 Overture `places_index` + rebuilt `discover-venues` · R2 Groq prompt caching | ~1 day | low (admin-only surface + one prompt refactor) |
| **P2 — resilience & quality** | R4 OpenRouter lane · R3 Gemini pin refresh (+ CLAUDE.md wording) · R9 hybrid retrieval | ~2 days | low-med (R9 touches match-pick ranking; baseline-gate it) |
| **P3 — coverage probes** | R6 events-source probes (TM Baltics, city open data, fediverse) | one session | none (research only) |

## Sources

- Gemini rate-limit docs (updated 2026-06-30): https://ai.google.dev/gemini-api/docs/rate-limits — free tier per-model numbers moved to AI Studio; Gemini 3.x current; spend tiers table
- Groq docs: https://console.groq.com/docs/rate-limits — limit dimensions; cached tokens exempt; per-org numbers on console Limits page
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/ — 10,000 neurons/day free, resets 00:00 UTC
- Overture Maps places guide: https://docs.overturemaps.org/guides/places/ — 75M+ POIs, June 2026 release, source/licence table
- Foursquare OS Places access: https://docs.foursquare.com/data-products/docs/access-fsq-os-places — free, Places Portal + Iceberg delivery
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/ — 1 rps max, UA + attribution + caching, bulk discouraged
- OpenRouter model list (live API): https://openrouter.ai/api/v1/models — 23 `:free` models on 2 Jul 2026
- Ticketmaster Discovery API: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/ — 5,000 calls/day, 5 rps
