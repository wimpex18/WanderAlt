# Market scan — event discovery & city culture apps (July 2026)

Competitor/adjacent-industry read, done pre-release so the new version ships against the current market, not 2024's. Filtered hard through the brand contract (`ROADMAP.md` framing: curator voice loudest, time not feed, no algorithm-worship). Each idea is tagged **adopt / adapt / avoid**. Web sources at the bottom; feature claims about specific apps are from July 2026 coverage and should be spot-checked in-app before copying mechanics.

## The field

| Player | What they are | What actually works for them |
|---|---|---|
| **Dice** | Mobile-first gig/club discovery + ticketing | Taste-learning feed from listening habits + attendance; price transparency (no hidden fees); waiting lists that stop scalping |
| **Resident Advisor** | The electronic-music institution | Editorial authority (reviews/features/podcasts); RA Picks as human curation; scene credibility nobody else has |
| **Partiful** | Gen-Z party invites ("unserious events") | Free, SMS-first, high-energy aesthetic; the *invite* is the social object; text blasts |
| **Luma** | Tech/creator event platform | Minimalist calendar-first UX; subscribe-to-a-calendar as a primitive; clean host pages |
| **Fever** | Mass-market experiences marketplace | Volume + urban reach — and exactly the algorithmic, sponsored-content model we exist against |
| **Ticket Fairy / nightlife stack** | Promoter tooling | 2026 trend read: AI-driven discovery feeds for niche underground events driving incremental sales |
| **Local culture newsletters** (The Skint model, Substack locals) | Human-curated city lists in email | The trusted-human-filter posture; 2026 has strong anti-algorithm energy — readers explicitly seek curation over feeds |

## What the 2026 market says (and how it maps to us)

**1. The anti-algorithm turn is real and we're early to it.** 2026 media-trend coverage keeps repeating: people are tired of algorithmic noise and want trusted human filters. Substack itself drifted feed-ward and its most engaged users grumble. WanderAlt's whole premise — a named human vouches for every pick — *is* the trend. **Adopt: say it louder in product copy** (the "Vouched by humans" eyebrow shipped in the July redesign is exactly right); never add a "trending" rail (already in NOT-building).

**2. Dice's lesson is taste-learning, quietly.** Their recommendation engine learns from attendance and listening habits — but the *feel* is "the app gets me", not "the algorithm feeds me". We already have the mood/taste nudge as a quiet secondary sort. **Adapt (small): feed the taste signal with saves + "I'm going" + concierge queries** we already store — no new tracking, no feed, just a better-ordered This Week. The R9 hybrid-retrieval upgrade in `docs/provider-strategy-jul26.md` is the technical half of this.

**3. Luma's calendar-subscription primitive fits us perfectly.** Subscribing to a *calendar* (not a feed, not push) is editorial, quiet, and native to how our audience plans. We already build `.ics` per pick client-side. **Adopt: a per-city (and per-curator) subscribable ICS feed** — "put @sigmundtells in your calendar." One edge function serving `text/calendar` from active picks; zero new UI beyond a link on Today/curator pages; fully consistent with the no-push stance because the user's calendar app does the reminding. Strongest single feature idea in this scan.

**4. Partiful's insight is that the invite is social, not the listing.** We don't do invites — but the *shareable object* matters: when someone shares a pick, the artifact should feel like a personal recommendation, not a listing. We already have OG cards + native share. **Adapt (copy-level): share text should lead with the curator quote** ("@sigmundtells: 'Loud, weird, excellent' — Thu at Sveta") rather than title+URL. Cheap, on-voice. **Avoid** RSVP-visibility / guest-list mechanics — that's a social network in disguise.

**5. Price transparency (Dice) → "free" as a first-class signal.** We already carry a Free pill in Discover. **Adopt (small): show ticket price on the venue page when a source provides it** (Fienta has it) — underground audiences are price-sensitive and hiding it is a dark pattern we don't need.

**6. RA's editorial authority = our curator pages, deepened.** RA wins on *written* authority. Our shelf already holds "curator weekly synthesis" (ROADMAP calls it the strongest editorial idea). This scan agrees: **adopt "Reading lately" / weekly curator note before any feature work** — it compounds the moat (voice) rather than the commodity (listings).

**7. Fediverse events (Mobilizon/Gancio) are the underground's own rails.** Self-hosted, federated event calendars with clean APIs, zero ToS friction, ideologically native to DIY scenes. Baltic/Nordic instance coverage is still thin (unverified — probe per R6). **Adopt-when-available: a standing quarterly probe; wire the first local instance that appears.** Being the app that surfaces fediverse events would be both practically useful and exactly our crowd.

**8. AI concierge — we match the leaders' pattern already.** iOS 27 merged search+assistant into one field; our in-field ✦ Concierge is that shape (ROADMAP shelf note). The gap is retrieval quality, not UX: hybrid search + reranking (R9), now that the embedding outage is fixed. **Avoid** chatbot-ification (multi-turn agent personas, "planning agents") — 2026's over-agented apps are already reading as slop; one good matched quote beats a conversation.

## Avoid list (re-affirmed against the 2026 field)

- **Feeds, trending, popularity counts** — Fever's model; the opposite bet to ours.
- **Push notifications** — the digest + (new) calendar subscription are the sanctioned channels.
- **RSVP social graphs / guest lists** (Partiful's core) — forum-adjacent; we're a paper.
- **In-app ticketing** — Dice's business, a compliance/ops swamp; we link out to the source.
- **Multi-turn AI companions** — concierge stays one-shot match.

## Priority read

1. **Per-city + per-curator ICS calendar feeds** (Luma primitive, no-push native) — small edge fn, big retention primitive.
2. **Curator weekly synthesis on curator pages** (RA lesson; already top of the ROADMAP shelf).
3. **Quote-first share text** (Partiful lesson at copy level) — an hour of work.
4. **Price on venue page where sources carry it** (Dice lesson).
5. **Taste signal fed by saves/going/concierge + R9 hybrid retrieval** (Dice lesson, quiet version).
6. **Fediverse probe** on the R6 events-source session.

## Sources

- [Best UK event discovery apps 2026 (Dice/RA read)](https://tickts.co.uk/blog/best-event-discovery-apps-websites-uk)
- [Partiful vs Luma vs Lemonvite comparison](https://www.lemonvite.com/blog/partiful-vs-luma-vs-lemonvite)
- [Partiful app review 2026](https://party.pro/partiful/)
- [Ticket Fairy: nightclub ticketing technology 2026](https://www.ticketfairy.com/blog/the-future-of-technology-in-nightclub-ticketing-shaping-the-nightlife-experience)
- [Reuters Institute: journalism/media/tech trends 2026](https://reutersinstitute.politics.ox.ac.uk/journalism-media-and-technology-trends-and-predictions-2026)
- [Robin Good: best curated newsletters 2025/26 (anti-algorithm curation)](https://robingood.substack.com/p/the-best-curated-newsletters-of-2025)
- [2026 predictions: youth, media, culture](https://abbyho.substack.com/p/2026-predictions-youth-media-culture)
