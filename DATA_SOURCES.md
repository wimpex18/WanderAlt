# WanderAlt — Data sources strategy

This file is the single source of truth for **where picks come from** and **how the filter pipeline works**. Updated each time we add/remove a source.

For deeper architecture context read `README.md` (what's built) and `HANDOFF.md` (component reference). For pipeline rules read `CLAUDE.md`.

---

## How the pipeline works

```
┌─ Sources ─────────┐    ┌─ Staging ──────────┐    ┌─ Picks ─────────┐
│ Telegram channels │ →  │ staging_messages   │ →  │ picks table     │
│ RSS feeds         │    │ (raw text + meta)  │    │ (curator quote, │
│ Fienta JSON       │    │                    │    │  pin coords,    │
│ Venue scrapers    │    │ status: pending    │    │  enriched venue)│
└───────────────────┘    │   → processed      │    └─────────────────┘
                         │   → rejected       │
                         └────────────────────┘
                                ↑       ↑
                  ingest-* fns │       │ process-staging
                  (cron-driven)         (Gemini 2.5 Flash,
                                         Groq fallback,
                                         every 30 min)
```

Three layers of filter:

1. **Source whitelist** — only configured sources land in `staging_messages`. Garbage venues never reach the pipeline.
2. **Gemini LLM filter** (`process-staging`) — reads each staging message, extracts events, decides curator handle, rewrites quote in editorial voice, *rejects* events that don't fit the WanderAlt brief (mainstream pop, tribute bands, stadium acts).
3. **Human review queue** — anything ambiguous is saved as `@discovery` handle with `pending_review = true`; admin approves/rejects via the panel.

---

## Active sources (`sources` table)

| ID | Kind     | Channel/URL                                 | City    | Curator handle  | Status   |
|----|----------|---------------------------------------------|---------|-----------------|----------|
| 1  | telegram | `sigmundtells`                              | tallinn | sigmundtells    | **on**   |
| 8  | rss      | giadafromgamma (Substack)                   | tallinn | @raul.reads     | **on**   |
| 9  | telegram | `notboring_riga`                            | riga    | @katestrelca    | **on**   |
| 12 | telegram | `proEesti`                                  | tallinn | proEesti        | **on**   |
| 14 | telegram | `udgstriga` (Underground Station Riga)      | riga    | @udgstriga      | **on**   |
| 15 | fienta   | `paavli-kultuurivabrik`                     | tallinn | @paavli         | **on**   |
| 16 | fienta   | `15` (Von Krahl Theatre)                    | tallinn | @vonkrahl       | **on**   |
| 17 | web      | `telliskivi` (telliskivi.cc/en/events/)     | tallinn | @telliskivi     | **on**   |

(Rows 2–5 hold placeholder slugs that match fictional curator handles. Disabled.)

---

## Filtering rules — "cool underground" vs "pop bullshit"

These rules live in the `pipeline_config` table (key/value) and are read by `process-staging` on every run. Edit the table → next run picks up the change. No edge function redeploy needed.

### Venue whitelist (auto-trust)

Any event at one of these venues is auto-approved to the picks pipeline with `source_trust = 'high'`. Gemini still rewrites the quote but won't reject.

**Tallinn**
- Paavli Kultuurivabrik
- Von Krahl Theatre
- Telliskivi Creative City (all sub-venues)
- Sveta Baar / Uus Laine / Hotbox / Fotografiska / Kai Art Center
- Nullpunkt / Ülase12 Social Center / HALL (Helitehas)
- Biit Me Record Store (in-store events) / Pudel Baar
- Kanuti Gildi SAAL / EKKM / Lugemik

**Riga**
- Kaņepes Kultūras centrs (KKC)
- Splendid Palace / Kino Bize
- Depo / Laska V21
- 1983 / Vagonu Halle / Aleponija / M Darbnīca
- Underground Station Riga

### Skip keywords (auto-reject)

Reject any pick if title or description contains these (case-insensitive):

- `tribute band`, `cover band`, `coverband`
- `Eurovision`, `chart-topping`, `top 40`
- `VIP table`, `bottle service`
- `arena`, `stadium`
- `family-friendly` (unless paired with `craft`, `market`, `flea`)
- `Coca-Cola`, `Red Bull` (any major sponsor branding)
- `karaoke night` (sorry but no)

### Keep signals (boost confidence)

These bias Gemini toward keeping a pick when it's borderline:

- `experimental`, `avant-garde`, `art house`, `arthouse`
- `DIY`, `underground`, `basement`, `cellar`
- `noise`, `improv`, `free jazz`, `post-rock`
- `flea market`, `vintage`, `antiques` (if in a curated context)
- `poetry`, `readings`, `talk` (small-venue context)
- `gallery opening`, `vernissage`
- `social center`, `community space`

---

## Telegram channels — current + candidates

**Active (in DB):**
- `@sigmundtells` (Tallinn)
- `@notboring_riga` (Riga)
- `@proEesti` (Tallinn)

**Mentioned in research, public-channel status unknown — try & enable if HTML fetch succeeds:**
- `@udgstriga` (Underground Station Riga) — forward-thinking electronic music
- *Telegram channels for Nullpunkt, HALL, Depo, Laska, Sveta — only if a curator confirms they exist as public broadcast channels.*

How to test a channel before adding:
```bash
curl -sL "https://t.me/s/<channel-slug>" | grep -ic "tgme_widget_message_text" \
  # >0 means public channel exists and ingest-telegram will succeed
```

If a channel doesn't exist or is private, the ingest function silently skips it (it just gets 0 messages). No harm in adding a row optimistically.

### Creating a Telegram bot (not currently needed)

If we ever need DM ingestion or private-channel access:
1. Open Telegram → message `@BotFather` → `/newbot` → pick a name + handle
2. BotFather returns a token (`123456:ABC-DEF...`) — store as `TELEGRAM_BOT_TOKEN` env var
3. Add the bot as a member of the target channel (channel admin has to approve)
4. Use `https://api.telegram.org/bot<TOKEN>/getUpdates` to read messages
5. Wire into `ingest-telegram` as a second branch (kind = 'telegram-bot')

We don't need this for public channels — the current HTML-scrape approach works fine.

---

## Phase plan (current execution)

### Phase 1 — DB-only changes (no redeploys) — **DONE**

- [x] Disable fictional placeholder sources (rows 2–5)
- [x] Create `pipeline_config` table with venue whitelist + skip/keep keywords
- [x] Add `@udgstriga` Telegram source for Riga (source id 14)
- [x] `process-staging` v31 deployed — reads `pipeline_config` on every run,
      city-aware (Riga picks land as `city='riga'`), skip_keywords checked
      before LLM call, venue_whitelist prepended to prompt

### Phase 2 — `ingest-fienta` edge function — **DONE & LIVE**

Fienta exposes a clean JSON API: `https://fienta.com/o/<organizer>?format=json` returns
`{events: [{id, title, starts_at, venue, description, image_url, organizer_id, ...}]}`.

Two Tallinn organizers covered by Fienta:
- `paavli-kultuurivabrik` (Paavli Kultuurivabrik)
- `15` (Von Krahl Theatre)

The function:
1. Fetches `?format=json` for each whitelisted organizer
2. For each event, builds a `staging_messages` row with synthesised text:
   `<title> — <venue> · <starts_at> · <description-text>` + permalink
3. Uses `source_id` of a new `fienta` source row
4. `process-staging` picks it up on next 30-min cron tick

**Verified first run** (2026-05-16 10:26 UTC): 41 events inserted, 0 errors, 2.9 s.
Scheduled: cron jobid 24, `0 4 * * *` (daily 04:00 UTC) via `wa-ingest-fienta`.

Riga organizers on Fienta: **none found**. `kanepes`, `klubsdepo`, `laska`,
`splendidpalace`, `kinobize` all return 404. Riga venues will need either own-site
scrapers (Phase 3) or rely on the `@notboring_riga` + `@udgstriga` Telegram feeds.

### Phase 3 — Venue HTML scrapers — **TALLINN DONE, RIGA FUTURE**

Each venue with a working website gets a parser. Lower priority than Phase 2
because Fienta covered the two highest-trust Tallinn venues with one fetch.

| Venue                | URL                              | Strategy                | Status |
|----------------------|----------------------------------|-------------------------|--------|
| Telliskivi CC        | telliskivi.cc/en/events/         | Server-side rendered HTML. Regex parser on `.card` elements inside `.js-events`. No AJAX needed. | **DONE** |
| Kultuurivabrik (own) | kultuurivabrik.ee/programm       | Covered by Fienta — no need for separate scraper. | **covered** |
| KKC Riga             | kanepes.lv                       | HTML scrape (TBD)       | **future** |
| Kino Bize Riga       | kinobize.lv                      | HTML scrape (TBD)       | **future** |
| Splendid Palace      | liveriga.com/.../splendid-palace | HTML scrape (TBD)       | **future** |

All push to `staging_messages` with `source_id` of a new source row per venue.

To investigate Telliskivi: open devtools on
`https://telliskivi.cc/en/events/`, watch the network panel as the events list
populates, and find the JSON endpoint the JS hits. Most likely
`/wp-admin/admin-ajax.php?action=...`. Once that's known, the edge function is
~20 lines.

### Skipped permanently (not worth the maintenance burden)

- **Facebook Events** — login walls, ToS issues
- **Instagram (Depo, Laska)** — against ToS, breaks constantly
- **Songkick** — API deprecated for new developers
- **Bandsintown** — Fienta covers same events
- **Reddit** — too low-frequency; useful for one-off venue discovery only
- **Artist popularity heuristics** (Spotify follower counts, ticket prices) — over-engineered, marginal gain

---

## Concrete next steps

1. Run Phase 1 SQL (this file + the migration committed alongside it)
2. Deploy `ingest-fienta` edge function with Paavli + Von Krahl organizers
3. Wire `ingest-fienta` into pg_cron (daily 04:00 UTC, after enrich-venues)
4. Verify staging queue gets new entries on first run
5. Spot-check `picks` output 24h later — are events being properly filtered?
6. Add Telliskivi JSON-LD parser as `ingest-telliskivi` (or fold into a generic `ingest-web`)
7. When confidence is high, redeploy `process-staging` with `pipeline_config` read

---

## Maintenance

- **When a venue dies / a Telegram channel goes silent**: set `enabled = false` in `sources`. Don't delete the row — historical picks reference `source_id`.
- **When adding a new venue to the whitelist**: edit the `pipeline_config` row, no code change.
- **If process-staging starts mis-classifying**: check `ingest_log` for the function, look at Gemini quota and Groq fallback rate.
- **Polling vs cron rule**: NEVER poll. Cron handles every schedule. Edge functions are fire-and-forget from CLI.
