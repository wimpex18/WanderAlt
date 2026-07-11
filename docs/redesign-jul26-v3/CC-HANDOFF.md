# WanderAlt — Dusk Glass · complete redesign handoff (July 2026, FINAL)

**Canvas:** `WanderAlt Redesign Jul26.dc.html` — turn 3 (boards 3a–3f) + turn 4 (boards 4a–4g).
**This file is the single source for `/design-sync`.** It supersedes and replaces `docs/redesign-jul26-v2/` (deleted) and the turn-1/turn-2 canvas passes (kept on canvas as history only). `docs/redesign-jun26/` boards remain historical reference — do not implement from them.

---

## 1 · The idea

Three named layers, nothing else. Every element must say which layer it is:

1. **Scene** — full-bleed background: tonight's `image_url` (Today, pick detail), dark MapLibre (Discover), dusk gradient (Saved/Profile/auth/404). Scene never carries text without a scrim (floor rgba(10,16,17,.78) at text position).
2. **Glass** — every panel and control. ONE recipe (`.island`), never hand-rolled.
3. **Signal** — lime: exactly one CTA per screen, live dots, TONIGHT tag, selected map pin. Never body text, borders, or icon color.

## 2 · Tokens — append GLASS block to styles.css

```css
:root {
  /* DUSK (default after civil dusk) */
  --g-bg:#0a1011;  --g-text:#f4f1e8;
  --g-mute:rgba(244,241,232,.72);          /* AA floor for running text */
  --g-faint:rgba(244,241,232,.5);          /* placeholder/decor only */
  --g-petrol:#7adcd6;                       /* interactive text/icons on dark */
  --g-petrol-deep:#055959;                  /* filled keys: logo, ✦ send */
  --g-lime:#d2dc50; --g-ink-on-lime:#0a1011;
  --glass:rgba(16,24,25,.55);               /* panels + secondary controls */
  --glass-deep:rgba(16,24,25,.82);          /* chrome: topbar, dock, sheets */
  --glass-active:rgba(60,184,178,.16);      /* + border rgba(60,184,178,.4) */
  --glass-hair:rgba(255,255,255,.14);
  --glass-blur:24px;                        /* chrome 28–32px */
  --unit:48px;                              /* EVERY interactive control */
  --radius:14px;          /* controls */
  --radius-island:20px;   /* floating bars, cards */
  --radius-sheet:24px;    /* sheets, hero answer cards */
  --radius-tag:8px;       /* tags, date cells, count badges */
}
[data-theme="day"] {
  /* DAYBREAK twin (board 4e) — same DOM, tokens only */
  --g-bg:#f4f1e8; --g-text:#101a1b;
  --g-mute:rgba(16,26,27,.72); --g-faint:rgba(16,26,27,.5);
  --g-petrol:#055959;                       /* CTA by day (lime fails on paper) */
  --glass:rgba(255,255,255,.62); --glass-deep:rgba(255,255,255,.72);
  --glass-active:rgba(5,89,89,.10);         /* + border rgba(5,89,89,.3) */
  --glass-hair:rgba(16,26,27,.10);
  /* lime steps back to signal-only (live dots, TONIGHT tag) */
}
.island {
  background:var(--glass);
  backdrop-filter:blur(var(--glass-blur)) saturate(1.5);
  border:1px solid var(--glass-hair);
  border-radius:var(--radius);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12);
}
/* modifiers: .island--deep (chrome), .island--active (selected) */
@supports not (backdrop-filter: blur(1px)) { .island{background:#131b1c} }
@media (prefers-reduced-transparency: reduce) { .island{background:#131b1c;backdrop-filter:none} }
```

## 3 · Laws (add to CLAUDE.md in PR 1; review-reject anything that breaks them)

1. **One glass recipe.** Any translucent surface = `.island` (+modifier). Hand-written rgba+blur is a reject.
2. **One unit.** Every control is `height:var(--unit)` (48px), radius `--radius`, icon 20px stroke 1.75. Keys docked inside a field (✦ send, password eye) are 38px inside the 48 shell. No 32/40/44/52 anywhere.
3. **Single-line law** (replaces per-screen alignment fixes):
   - control rows: `display:flex;align-items:center;gap:8px;height:var(--unit)` — never wrap;
   - chip sets: horizontal snap-rail (mobile inline) or `repeat(3,1fr)` grid (sheet/rail) — never a ragged wrapped line;
   - meta lines: `white-space:nowrap;overflow:hidden;text-overflow:ellipsis`; only titles may take 2 lines (cards) — rows/tickets 1 line;
   - siblings share width: `flex:1` or equal grid tracks; no per-element widths.
4. **One lime CTA per screen** (dusk). Daybreak: CTA petrol, lime = signal only. Secondary = `.island`; quiet = borderless 48 icon square.
5. **Active state** = `--glass-active` + petrol content, everywhere (tabs, segs, chips, dock, pins). Chips keep leading ✓ (never color-only).
6. **Type scale:** Fraunces 600 display — 34 mobile hero / 64 desktop hero / 30 page titles; quotes Fraunces italic 20–21 mobile / 27 desktop with lime rule (petrol rule by day); Geist Mono 11–12 `·`-separated one-line tickers replace stacked label rows; Inter body ≥14.
7. **Rhythm:** 8 inside a row · 12–16 between rows · 20–24 heading→content · 32+ between groups. A heading is never the tightest gap near it.
8. **Motion:** `--t-fast`/`--t-mid` only. Sheet detents + dock tab expansion animate transform/opacity at `--t-mid`; disabled under `prefers-reduced-motion`.
9. **Voice:** empty/error states speak curator voice (Fraunces italic), never system voice. "No results found" is banned copy. No "discover" in copy, no exclamation marks, no em-dashes in headlines.

## 4 · Page passes (boards → files; DOM stays, JS additions ≈50 lines total)

| Board | File | Pass |
|---|---|---|
| 3b, 3e | index.html | Tonight's photo = viewport scene. Mobile: glass topbar island; lime TONIGHT tag; 34px title + 20px quote on scrim; 48 action row; THIS WEEK snap-rail of 64px tickets; floating dock (active tab expands with label). Desktop: one 64px masthead island (logo · tabs · search-or-ask · city — all 48 units, one line); 64px headline block left; venue+column card right; 4 equal tickets bottom (digest = 4th). |
| 3c, 4d | discover.html (+map.html retired) | Map always the scene; results in a draggable glass sheet — detents peek 88px / half / full. Filters: one horizontal 48 snap-rail; More + opens the filter sheet: 3-col equal grids per section (WHEN/KIND/MOOD/PRICE), Reset:Show = 1:2, CTA live-labeled "Show N picks". Same section blocks render the desktop rail (no Apply on desktop). |
| 3d | place.html | Scene hero + one glass answer card: quote → 3 equal 56px info cells (WHEN/WHERE/GETTING IN, 12px values, single-line) → 48 action row. Long tail (venue, curator) scrolls beneath. |
| 4a | saved.html | Dusk-gradient scene; 48 seg (Going/Reading/Past, counts inline); rows 76px with fixed 58px date cell (lime = TONIGHT only); Saved row meta = `venue · time` (drop neighborhood — it must fit one line at 390px beside date cell + bookmark); summary card in curator voice. Radio-sibling tabs unchanged. |
| 4b | profile.html | Taste-cue card + 48 edit; digest composite field (38 key inside); settings plate with 56px rows incl. new **Appearance: AUTO · DUSK AT hh:mm**; glass Sign out; calm-tech footer. |
| 4c | auth (signed-out profile) | Glass card over dusk scene: 28px Fraunces heading, 24px gap to fields, fields 48 at 12px gaps, lime Sign in (labeled), Google + Create account equal-width glass row. Primary conversion CTAs always labeled. |
| 4e | theme | Daybreak twin via `[data-theme="day"]` only. Auto-switch at civil dusk per city (precomputed sunset table per city in cities config — no API); override stored per the existing storage policy. `prefers-color-scheme` honored when AUTO. |
| 4f | curator.html, 404.html, states | Curator: glass head card (avatar, handle, mono ticker, motto quote) + standard 76px rows. 404: curator-voice line + lime "Tonight in Tallinn →". Empty saved / no-picks-tonight / offline / no-photo fallback / city sheet / concierge answer + empty — all specified on board 4f. Long text: titles clamp 2 (cards) / 1 (rows); quotes clamp 4 + "more"; handles never wrap; counts >99 → "99+". |

## 5 · Contract amendments (CLAUDE.md, same PR as tokens)

- Floating glass dock **supersedes** the June full-width docked bar.
- `.island` glass on all chrome + controls **supersedes** the 3-surface Liquid Glass limit.
- One 48 `--unit` **supersedes** the 52/44 two-tier system.
- Quote scale 20/27 **supersedes** 32/44; app pages ride scenes, not white paper (about.html may stay paper).
- List|Map toggle and separate map.html **retired** (redirect map.html → discover.html).
- Dusk/Daybreak twin themes; lime CTA at night, petrol CTA by day.
- Radius vocabulary 8/14/20/24 supersedes 4/8/12.

## 6 · Explicitly unchanged

Petrol+lime two-tone discipline · Fraunces/Inter/Geist Mono self-hosted, no new fonts · DOM structure, JS logic, `WA.UI` single-impl helpers · Supabase pipeline, bookmarks/taste/digest flows · CSP: no inline scripts, no CDNs, no new deps (icons = tabler.io outline SVG pasted inline, 20px stroke 1.75, one family per surface) · no tracking; offline snapshot uses existing strictly-necessary localStorage · `image_url` pipeline; fallback = kind glyph on dusk gradient (never a gray box) · 44px tap floor (unit is 48) · WCAG 2.2 AA (dusk pairs: text 15.6:1, mute 10.8:1, petrol 9.4:1, lime-CTA ink 13.9:1).

## 7 · Implementation order (5 PRs, each ready-for-review)

1. **Tokens + `.island` + single-line law** (styles.css, CLAUDE.md amendments, fallbacks).
2. **index.html + place.html** — scene hero, dock, answer card.
3. **discover.html + map merge** — sheet with detents (~30 lines discover.js), filter sheet/rail from shared blocks.
4. **saved + profile + auth + curator + 404** — sheets, settings, empty states.
5. **Daybreak** — theme block, Appearance row, sunset auto-switch.

Gates per PR: `npm run verify` · `npm run e2e` · `npm run smoke` re-baseline at 390/768/1440 · Lighthouse a11y 100 · contrast audit of text-over-scene (scrim ≥ .78) · perf: ≤6 backdrop-filter layers per viewport (nest controls inside parent islands where possible).
