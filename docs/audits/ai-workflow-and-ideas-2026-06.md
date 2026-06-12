# Working with Opus-4.8-class agents + WanderAlt improvement ideas (June 2026)

Research synthesis (real sources, June 2026) on how teams build with Claude
Opus 4.8 / Claude Code / Claude Design, what Karpathy is advising, plus a
prioritized list of things we could improve in WanderAlt. Sources linked
inline; where a claim was thin or social-only I've flagged it.

## A. How the best teams are working (and how we should)

**1. Plan first — a PRD beats a two-sentence prompt.** The single biggest
agentic-coding mistake is starting without a plan; a short Product
Requirements Doc (intent, who it's for, what success looks like, constraints)
dramatically improves output. For us: write a tight spec / use plan mode for
any multi-file feature before implementing.
([claudefa.st](https://claudefa.st/blog/guide/development/agentic-engineering-best-practices),
[Anthropic prompting docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices))

**2. Fix the system, not the instance.** Every recurring bug is a system
failure — encode the fix in the conventions, not one file. We already do this
(CLAUDE.md tokens/rules, the layout audit doc) and it's why our output isn't
generic. Keep doing it.

**3. Seed the design system or you'll fight a generic aesthetic.** The #1
designer pitfall with Claude is skipping brand seeding — default output is
"competent but generic." Our `CLAUDE.md` + `brand/BRAND.md` are exactly this
seed; the recent brand evolution (Inter/Fraunces, glass, photo-forward) only
worked because the brand is written down. ([Design Systems Collective](https://www.designsystemscollective.com/from-prompt-to-production-a-designers-step-by-step-workflow-with-claude-design-claude-code-a7705daad026), [Anthropic — Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs))

**4. Don't design and code in the same conversation; tell it what to do, not
what to avoid.** Separate exploration (questions / plan) from implementation,
and prefer positive instructions. We've used `AskUserQuestion` for brand forks
(fonts, glass intensity) — that maps to this. ([MindStudio](https://www.mindstudio.ai/blog/how-to-prompt-claude-opus-4-8))

**5. Karpathy's "verifiability thesis" is the big one for us.** *"LLMs
automate what you can verify."* The skill that matters now is judgment +
fast review, and the leverage is in **building verification** so the agent can
self-check. We already screenshot, measure pixels, and run overflow/error
sweeps each PR — the next step is to make that *automated and repeatable*
(see B-1). ([NextBigFuture](https://www.nextbigfuture.com/2026/03/andrej-karpathy-on-code-agents-autoresearch-and-the-self-improvement-loopy-era-of-ai.html),
[MindStudio — Karpathy/Sequoia](https://www.mindstudio.ai/blog/karpathy-sequoia-talk-5-predictions-agentic-engineering))

**6. Effort + parallelism levers.** Opus 4.8 defaults to high effort; xhigh/max
for the hardest multi-file work; it's ~4× less likely to let its own code flaws
pass unremarked, and Dynamic Workflows can fan out hundreds of subagents for
repo-scale migrations (e.g. the widely-cited Bun Zig→Rust 750k-line port).
We don't need fan-out yet, but it's the tool if we ever do a big migration.
([Anthropic — Opus 4.8](https://www.anthropic.com/news/claude-opus-4-8),
[Verdent guide](https://www.verdent.ai/guides/claude-opus-4-8-coding-agents))

> Honesty note: I could not directly verify specific Claude Instagram/Threads
> project posts via web search (social posts index poorly). The Bun port and
> Karpathy's AutoResearch (700 experiments in ~2 days) recur across multiple
> independent write-ups, so I've cited those; I did not invent post specifics.

## B. What we could improve in WanderAlt — prioritized

**B-1. A repeatable verification harness (embodies the verifiability thesis).**
Turn the ad-hoc per-PR checks into one `npm run verify` (or a SessionStart
hook): boot the static server, Puppeteer-sweep every page at 390/768/1440 for
(a) horizontal overflow, (b) console/page errors, (c) tap-target floors,
(d) a Lighthouse pass writing `docs/lighthouse/summary.json`. Highest leverage:
every future change gets self-verified, fewer regressions, faster review.

**B-2. Performance / Core Web Vitals pass (now that we're photo-forward).**
Photos became prominent (hero scrim, Discover/Saved cards, full-colour). Add
`loading="lazy"` + `decoding="async"` to non-hero images, `fetchpriority="high"`
+ preconnect for the LCP hero photo, responsive sizing on Google-Places URLs
(`=wNNN` param), and re-check CLS now that skeletons reserve space. NYT/Airbnb
treat this as a feature, not a chore.

**B-3. Dynamic OG / share images per pick.** NYT-style: a generated share card
(venue photo + Fraunces title + curator handle) so shared links look editorial.
We already have `share.js` (native share) and static OG; per-pick images are the
next step (Cloudflare Pages Function or a build-time generator).

**B-4. PWA install + offline reading.** Service worker caching the app shell +
last-seen picks + saved list, web manifest install. Lime/NYT-style "feels like
an app," and offline saved-list reading fits the curated-companion use case.
(Previously scoped, still the biggest single "feels native" win.)

**B-5. "For you" ranking via the embeddings we already have.** `taste.js` +
`match-pick`/`embed-picks` exist; surface a gentle taste-weighted ordering on
Discover/Today (opt-in, on-device preference) without adding tracking — stays
within the no-analytics privacy stance.

**B-6. Motion/interaction polish à la the references.** Lime/Airbnb use
restrained, physical micro-interactions. We're deliberately restrained (two
tokens); a tasteful image hover-zoom on photo cards and a shared-element
transition from a Discover card → venue hero (View Transitions API, already
enabled) would feel premium without bounce.

## Recommended next step
**B-1 (verification harness)** first — it's the meta-improvement that makes
every subsequent change safer and is the direct application of the
verifiability thesis. **B-2 (perf pass)** is the natural follow-up since the
photo-forward work raised the image budget.
