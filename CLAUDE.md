# WanderAlt — Claude Code instructions

Static site for underground/alternative culture in European cities. First city: Tallinn. Curated by humans, not algorithms — **curator voice is the loudest thing on every screen.**

For deeper context, read these on demand (do NOT auto-import — they bloat context):
- `README.md` — product overview, deploy instructions, current roadmap
- `HANDOFF.md` — engineering reference (tokens, components, state matrices, per-page specs)

## Project overview

- **Stack:** static HTML + CSS + vanilla JS. **No build step, no framework.**
- **Backend:** Supabase (REST + Edge Functions + pg_cron). Project ID `aqnsmmbrspkbfcvougeh`, region `eu-central-1`.
- **Anon key:** in `supabase.js` (public on purpose — RLS is SELECT-only for tables, INSERT only for `bookmarks` and `digest_opt_ins`).
- **Service role key:** never commit. Set as env var `SUPABASE_SERVICE_ROLE_KEY` in cloud env, or paste into admin panel localStorage locally.
- **Canonical mobile viewport:** 390×844. Desktop breakpoint: **768px** (bottom nav → top masthead). Content width is the shared `--reading-max` token, the SAME on every page so edges line up across navigation, and it widens up a responsive ladder so the layout uses the screen like a modern site instead of stranding empty margins (Apple-style: wide shell, text kept readable by per-block `ch` measures). Ladder: **1100px** ≥768 · **1200px** ≥1100 · **1280px** ≥1440 · **1440px** ≥1680 · **1600px** ≥1920 (mobile is full-width minus a 20px gutter; desktop gutter 32px). The topbar, masthead nav, city banner, `.page` and Discover's list/map split all key off this one token, so chrome and content stay aligned. Quote font scales again at 1100px. (June 2026: widened from the old 840/960 caps; Discover's bespoke 1240 override was removed so it shares the ladder.)

## Key commands

```bash
npm start          # local dev server at http://localhost:5173 (npx http-server, no cache)
npm run admin      # admin panel server at http://localhost:8080
npm run verify     # structural sweep: self-boots a server, asserts no overflow / no console errors / 44px tap targets across every public page × 390·768·1440 (exits non-zero on failure)
npm run smoke      # screenshot regression set (server must be running) ; npm run lighthouse = perf audit
```

There is no unit-test suite, but **run `npm run verify` after any layout/CSS/markup change** — it's the automated version of the manual overflow/error/tap-target sweep and catches regressions (it's how the 42px nav tap-target was found). For visual/photo fidelity, still eyeball the Cloudflare branch preview (`npm run preview`). Chrome MCP / opening `localhost:5173` works for ad-hoc inspection.

For a **production-fidelity** check (real Google-Places photos + petrol duotone, which a local/sandbox server can't fetch), screenshot the **Cloudflare branch preview** the Pages bot posts on every PR: `npm run preview -- <branch-preview-url> [city] [page ...]` (`.screenshots/preview.js`). It launches headless Chrome with the flags needed to reach `*.pages.dev` from a restricted environment — `--disable-quic` (the sandbox blocks UDP/QUIC) and `--disable-features=EncryptedClientHello,UseDnsHttpsSvcb,UseDnsHttpsSvcbAlpn` (Cloudflare's ECH otherwise trips `ERR_ECH_FALLBACK_CERTIFICATE_INVALID`). `curl` reaches these URLs without flags; Chrome needs them.

Deploy edge functions via the Supabase MCP `deploy_edge_function` tool — never via `supabase functions deploy` CLI (the user doesn't have it installed).

## File map

| File | Role |
|---|---|
| `index.html` / `briefing.js` | Briefing — editorial landing (Tonight hero + This Week list). Pure read; no filter UI. |
| `discover.html` / `discover.js` | **Discover** — unified search/filter/map surface. Replaces the old Search + Map pages. |
| `discover-redirect.js` | Loaded by the `map.html` and `search.html` redirect stubs; maps legacy params → Discover URL. |
| `map.js` | Pin overlay + clustering + detail panel. Exposes `window.WA.MapView` API; embedded inside Discover's map pane. Pin positions projected via `WA.MapTiles.project(lng, lat)`. |
| `map-tiles.js` | MapLibre GL basemap. OpenFreeMap vector tiles, custom editorial style (see `map-style.json`). Exposes `window.WA.MapTiles` API used by `map.js`. |
| `map-style.json` | Custom MapLibre style file — newsprint cream land, muted petrol water, off-white roads, JetBrains-style labels. |
| `map-venues.js` | Category definitions (`WA.MAP_CATEGORIES`) — shared by map.js and discover.js chip rendering. |
| `map.html` | 5-line redirect stub → `discover.html?view=map` (preserves `?id`, `?day`, `?mood` legacy params). |
| `search.html` | 5-line redirect stub → `discover.html` (preserves `?q`, `?mode=match` legacy params). |
| `saved.html` / `saved.js` | Going / Reading / Past segments. **Change-watch (A2):** snapshots each bookmarked pick in localStorage (`wa:saved-snapshots`) and flags, on the reader's device, when a saved event's day/time changed since they last looked (`time changed` badge on Going) or when it's dropped from the listings — cancelled / moved / deduped (a "no longer listed" gone-row with a Dismiss that unbookmarks). On-device only. |
| `venue.html` / `venue.js` | Pick (event) detail page — quote, venue, context, more from curator. The "more from curator" rows are photo-forward `.list-row--card`s (matching Discover/Saved/Curator) with the staggered entrance; loads view-transition.js so those cards morph into the next pick's hero. Back-link returns to full Discover URL (filters preserved). |
| `place.html` / `place.js` | Standalone Places (venue) detail page — name, kind, neighborhood, social glyphs, and upcoming picks at that venue (each linking to its `venue.html`). Opened from Discover Places list rows + the map's venue detail panel (`?id=<venue-id>`). |
| `curator.html` / `curator.js` | Curator profile — bio + all picks. Picks render as photo-forward `.list-row--card` rows (thumb · body · bookmark, consistent with Discover/Saved), with the staggered entrance, card→hero View Transition, and the on-device taste nudge + cue. |
| `profile.html` / `profile.js` | Account — bookmarks, digest, export, delete |
| `about.html` | Static editorial page — About / Curators / Venues / Privacy / Contact in one scroll. No JS beyond catalog.js + city.js + auth.js for the banner + topbar chrome. Linked from every page's colophon. |
| `admin.html` / `admin.js` | Admin panel — pick/venue CRUD, pipeline, column approval, enrichment |
| `catalog.js` | Static fallback catalog. Exposes the raw multi-city list as `WA._catalogAll` / `WA._curatorsAll` and the city-filtered slice as `WA.catalog` / `WA.curators` (read from localStorage `wa:city` since city.js loads after this file). `WA.past` too. supabase.js replaces these with live data when the network responds. |
| `supabase.js` | Live data fetcher; exposes `WA.BASE_URL` + `WA.ANON_KEY`; fires `wa:catalog-ready` |
| `auth.js` | Email/password + Google OAuth, password reset; dispatches `wa:signed-in` / `wa:signed-out` |
| `bookmark.js` | localStorage primary store + Supabase cloud sync; fires `wa:bookmarks-synced` |
| `taste.js` | Taste-profile onboarding (energy/company/money axes); exposes `WA.taste.matchParams()` + `WA.taste.tasteScore(entry)`. **Four surfaces are gently re-ordered by `tasteScore`** (stable sort — ties keep curation/recency; 0 score = no reorder) once a taste profile exists: Today's **This Week**, Discover's default **Relevance** sort (Events only; skipped on active query / Places), Saved's **Reading** list (undated saves; Going stays soonest-first), and the **Curator** page's pick list (curator's own order stays primary on ties). Each carries one subtle "· tuned to you" cue (section-sub on Today; results count on Discover; Reading seg-note; picks-label eyebrow on Curator) — on Discover/Saved/Curator the cue is a `.taste-cue` link to `index.html#taste-onboarding` so the reader can adjust (briefing.js re-opens the taste check from that hash even when already onboarded). On-device only (localStorage); curation stays primary — no per-card "for you" badges. |
| `city.js`, `mood-chips.js` | Small shared utilities (city switcher, mood-tag filter via `#mood=…` hash) |
| `share.js` | Shared share/calendar helper. `WA.Share.url()` = native OS share sheet (`navigator.share`) with clipboard fallback; `WA.Share.downloadIcs(entry)` = client-side `.ics` for dated picks (no dep, Blob download); `WA.Share.isDated()`. Used by venue.js (Share + Add-to-calendar), curator.js + discover.js (Share). Load before the page script. |
| `view-transition.js` | Cross-document **card→hero** View-Transition helper (on index/discover/saved/curator/venue). Tags the clicked card photo (or Tonight hero) with `view-transition-name: venue-hero` so it morphs into venue.html's `.detail-hero`. Reduced-motion-skipped; no-op without VT support. |
| `ui-helpers.js` | **Shared render helpers** (`WA.UI`: `esc` / `buildMeta` / `isEchoQuote` / `bookmarkSVG` / `thumb` / `rowMedia`). Loads right after `catalog.js` on all six content pages; page scripts alias from it instead of hand-copying (the copies drifted — venue.js missed the F-12 guard for a week). saved.js keeps a local `buildMeta` on purpose (Going rows carry the day in a separate time column). |
| `styles.css` | All styles. Every design decision lives as a `:root` CSS variable. |
| `brand/` | **Canonical brand kit** — SVG masters for tile/wordmark + favicon ladder + PWA/iOS/Android icons + social cards + city-plates v2 docs. Start at `brand/BRAND.md` for palette/type/lockup rules + § 5 city-plates two-mark rule; `brand/IMPLEMENTATION.md` for integration notes; `brand/city-plates.html` for the design preview. Do NOT inline brand colors; use the `--c-accent` (petrol) / `--c-lime` tokens which match the canonical OKLCH literals 1:1. |
| `assets/<city>-overview.svg` | **City plates** (Tallinn, Helsinki, Riga). 1800×1200 illustrated SVGs used as 80×60 thumbnails in the city-selector dropdown AND as a cityscape ribbon (`.city-banner`, 96px mobile / 120px desktop, cropped to the skyline via `object-position: center 74%`) injected by `city.js` below the topbar on every content page. The active city is stamped on `body[data-city]` so the banner background swaps when the user switches city. Spec: `brand/BRAND.md` § 5 (two-mark rule — one national flag + one lime accent, never the same element). |
| `functions/_middleware.js` | **Cloudflare Pages Function** (the repo's only edge middleware; no build step). Rewrites per-pick/curator Open Graph meta server-side for `/venue` + `/curator` so social crawlers (no JS) get real link previews: og:image = the venue photo (`=w1200`) for picks with a photo, else the `og-image` Supabase card; per-item og:title/description. Fail-open — never breaks a page. Inert under local `http-server`; verify on the Cloudflare preview. |
| `manifest.webmanifest` | PWA web manifest. References `brand/pwa/*.svg`. Theme color `#055959` (petrol). |
| `_headers` / `_redirects` | Cloudflare Pages config. `_headers` sets HSTS / CSP / cache rules; `_redirects` handles wanderalt.com → wanderalt.app 301, www → apex, and the `/map` + `/search` legacy aliases. **Do NOT add bare-name → `*.html` rules** (e.g. `/discover → /discover.html`) — Pages serves pretty URLs natively and such a rule creates an infinite redirect loop (fixed June 2026). |
| `robots.txt` / `sitemap.xml` / `.well-known/security.txt` | SEO + security-contact files. robots.txt blocks GPTBot / ClaudeBot / PerplexityBot etc — curator credit matters more than AI training data. |
| `LAUNCH.md` | Launch-day checklist — DNS, Pages, email, Search Console, OG verification, social handles. Read top-to-bottom on the actual launch day. |

## Design system canon (June 2026 — canonical for all UI work)

One brand, one component language, one spacing grid. The full execution roadmap + audit findings live in `ROADMAP.md` § Frontend; per-page deltas in `HANDOFF.md`. The rules below are the contract every UI change must satisfy.

### Brand independence

WanderAlt's aesthetic is **editorial newsletter, not AI product**. Never reach for tool-default or AI-startup styling: no Anthropic-palette defaults (clay/coral/cream chat-UI tones), no purple/indigo gradient washes, no glassmorphism beyond the three sanctioned Liquid Glass surfaces, no default system-font fallback shipping as the actual face. The brand is two-tone petrol + lime over white with Inter/Fraunces/Geist Mono — anything that reads "generic 2024 AI app" is off-brand by definition.

### Color & contrast (WCAG 2.2 AA is the floor; measured ratios)

| Pair | Ratio | Use |
|---|---|---|
| `--c-ink` `#0a0a0c` on `--c-paper` `#fff` | 19.8:1 | body, titles — AAA |
| `--c-ink-soft` `#1f1f23` on paper | 16.4:1 | secondary prose |
| `--c-ink-mute` `#5c5c66` on paper / `--c-paper-deep` | 6.6:1 / 6.4:1 | meta, eyebrows — passes AA at 11–13px (this token was darkened from `#71717a` precisely to clear 4.5:1; do not lighten) |
| `--c-accent` petrol `#055959` on paper (and white on petrol) | 8.1:1 | links, focus rings, accents, solid panels |
| `--c-lime` `#d2dc50` under ink text | 13.3:1 | badges/fills only |
| `--c-lime` on paper | 1.5:1 | **forbidden as text/icon** — lime is a fill behind ink, never a foreground |
| `--c-faint` `#a1a1aa` on paper | 2.6:1 | decorative only (placeholder italic, search glyph) — never labels |

- Single primary accent: **petrol** (`--c-accent`) — handles, arrows, hover, focus, logo tile, map quote bar, locate-fab "on". **Lime** (`--c-lime`) is signal-only: live/active state (Tonight badge, active segment count, active-nav underline, logo diamond). **No third color** (oxblood `#8a2a1a` fully retired May 2026). Background `--c-paper` = pure white; `--c-paper-deep #fafaf9` for recessed surfaces (the map style's newsprint-cream land is separate from app background).
- **Text over photos:** white text on a bottom-anchored black scrim, **never** raw `text-shadow`. Rule of thumb: overlaid text must sit within the scrim's ≥0.4-alpha zone — long (3-line) titles on tall heroes are the known failure mode (see ROADMAP F-1); extend the scrim ramp rather than shrinking the title.

### Typography

- **Fraunces** (`--ff-display`) = city names, venue/event titles, curator quote. **Inter** (`--ff-body`) = everything else. **Geist Mono** (`--ff-mono`) = uppercase eyebrow/label runs only. Self-hosted woff2 in `fonts/` (CSP `font-src 'self'`, no Google Fonts CDN). Inter replaced Geist (read as generic AI-startup); Fraunces replaced DM Serif Display.
- Scale (mobile-first, harmonic — do not add intermediate steps): eyebrow 11 → meta 12 → body 16 → item-title 18 → quote 32 (`--fs-*`). Venue + pick titles share the single 18px step on purpose; the old 16/17/18 mid-cluster was deliberately collapsed.
- **Curator quote is the largest element on every screen** — larger than venue name or photo. Voice is the product.

### Component canon (one implementation per pattern — reuse, never fork)

- **Segmented control** (`.seg-tab` / `.discover-scope__btn`): compact ink-fill, lime = active/live count only. Shared by Saved Going/Reading/Past and Discover Events|Places.
- **Photo card row** (`.list-row--card`): full-colour `.thumb--lg` photo left · title/meta/quote body · bookmark; initials-tile fallback when no `image_url`. Shared by Discover Events, Saved, Curator picks, venue "more from", place "events here". Places rows stay social-glyph-only (OSM venues carry no photos).
- **Hero with scrim** (`.tonight__hero` / `.detail-hero`): photo + bottom-anchored scrim + white eyebrow/title/meta; flat-header fallback without `image_url`.
- **Chips** (`.chip`/`.mood-chip`/`.venue-mood`): ~32px tall (Material chip spec — the sanctioned exception to the 44px floor); active state carries a leading "✓" (WCAG 1.4.1, never color-only).
- **Buttons:** desktop CTA pairs size to content, left-aligned, primary first; mobile primary goes full-width and the pair stacks (`.tonight__actions`, `.venue-actions`). Gaps 8–16px via tokens.
- **Empty states:** the crafted card pattern (`.picks-empty` — city plate + title + sub) is the canon, live on Today, Saved (Going/Reading) and the place page (ROADMAP F-4 closed June 2026); never ship a bare one-line mono string.
- **Liquid Glass** is allowed on exactly three chrome surfaces — sticky topbar, bottom-nav pill, mobile sheets — via `--glass-bg`/`--glass-blur`/`--glass-hair` + `backdrop-filter` with the `@supports` solid fallback. Do NOT scatter gradients/shadows elsewhere; the only other sanctioned gradient is the hero scrim, the only sanctioned shadow belongs to Discover's docked List|Map pill (`.discover-view-fab` — since June 2026 a centered segmented pill above the glass nav, not a corner FAB).
- Section dividers are **1px horizontal rules** (`--c-rule`), never background changes or large gaps. Strictly left-aligned content — **no centered blocks** (the desktop masthead nav is the one chrome exception).
- Corner radius: `--radius` 8 / `--radius-card` 12 only.
- **Editorial redesign deltas (May 2026)** all live in the "EDITORIAL REDESIGN" block at the end of `styles.css` and reuse `:root` tokens — Today's flat Tonight hero (lime TONIGHT signal → kindline → title → display-italic quote with lime rule → actions), Discover's `1fr/1.18fr` list/map split + mono-eyebrow filter rail + solid-petrol AI concierge mode keyed on `body.discover-ai-mode`, Profile's flat petrol avatar + real toggle switch.
- All tokens live in `:root` in `styles.css`. Do not introduce new CSS variables without asking.

### Spacing & sizing (the grid is law)

- Use the `--s-*` scale only: 4/8/12/16/20/24/32/40/56/72 (4px base, 8px rhythm — Apple HIG / M3 / Fluent 2 compliant). **No off-grid literals** (`6px`, `10px`, `14px`…) — the June 2026 sweep converted the legacy ones to tokens; the only sanctioned exceptions are chip-class paddings (annotated `chip spec — exempt` in styles.css) and 1–2px optical text fits. Chrome offsets derive from tokens, not magic numbers (the FAB's hardcoded `72px` clearance vs `--nav-h: 68px` is the cautionary example, ROADMAP F-3).
- **Tap targets: 44px floor** (Apple HIG) on public/touch pages — `min-height: 44px` or padded 44px hit area on: `.btn-primary`/`.btn-secondary`/`.btn-going`/`.btn-save` (heroes use 50px), `.seg-tab`, `.discover-scope__btn`, nav items, `.city-selector`, `.auth-btn`, `.topbar__about`, `.discover-view-fab`, `.venue-social__link` (44px box, 16px glyph), `.auth-panel__submit`/`__close`, `.profile-toggle`, list-row `.bookmark` (44×44 padded hit area, 20px glyph). **Correct exceptions, do NOT "fix":** chips ~32px (Material spec); inline text links (colophon, "on map →", handles — WCAG-exempt); the admin panel (desktop mouse tool, ~32px density). Sources: `docs/layout-audit-2026-06.md`.
- **Width:** one shared `--reading-max` ladder for every page (1100 ≥768 · 1200 ≥1100 · 1280 ≥1440 · 1440 ≥1680 · 1600 ≥1920) so chrome and content edges align; long-form text keeps per-block `ch` measures (56–64ch) inside the wide shell.
- Real photos via `image_url` only (never external URLs bypassing that flow), rendered **full-colour** (petrol-duotone overlay retired June 2026); CSS halftone fallback otherwise.
- Perf: long lists (`.list-row`) use `content-visibility: auto` + `contain-intrinsic-size`; fonts self-hosted. Both no-build.

### Validation (run before claiming any UI change done)

1. `npm run verify` — overflow / console errors / 44px floor, 8 pages × 3 widths. Non-negotiable after any layout/CSS/markup change.
2. `npm run smoke` (server running) — 40+ screenshots; diff the high-signal set against `docs/screenshots/baseline/` (see `docs/screenshots/README.md`). Replace baselines only for intentional changes.
3. `npm run e2e` — behavioural sweep (photo cards on all five surfaces, taste cue, VT tagging, bookmark persistence).
4. Production fidelity (real photos + live data): screenshot the Cloudflare branch preview via `npm run preview -- <url>`.

## Motion conventions (May 2026)

Restrained on purpose — editorial voice, not product flash. Two tokens, no bounce, no parallax, no scroll-driven choreography:

- `--t-fast: 120ms ease` — color / border / background swaps (hover, focus, mood-chip on-state). Used in ~30+ rules across the file.
- `--t-mid: 280ms cubic-bezier(.2,.8,.2,1)` — entrances, state changes, hover micro-lifts. Out-cubic, no overshoot.

Five entrance surfaces share one `@starting-style` rule so motion is consistent across every tab and every paint path (server-rendered + JS-appended): `.pick`, `.tonight`, `.match-card`, `.profile-section`, `.about-section`. Each rises 8px and fades in over `--t-mid`. `transition-behavior: allow-discrete` keeps the entrance visible past the discrete-property hop.

Cross-document View Transitions are enabled globally (`@view-transition { navigation: auto }`). The `.topbar` and `.nav` carry `view-transition-name` so chrome morphs instead of cross-fading — pages without VT support fall back to instant nav. **Card→hero shared-element morph (June 2026):** `view-transition.js` (on index/discover/saved/curator/venue) tags the clicked source — the Tonight hero, or a card's photo `.thumb` — with `view-transition-name: venue-hero` on click; venue.html's `.detail-hero` carries the same name (CSS), so the photo expands into the detail hero across the navigation. Only one element is tagged at a time (cleared first + on `pageshow`); skipped under reduced-motion; harmless no-op where VT is unsupported.

Bookmark click is a smooth fill transition (no scale pop), bookmark hover is `scale(1.06)`. Desktop `.pick:hover` lifts 1px (hover-capable pointers only). **Photo-card hover-zoom (June 2026):** on hover-capable pointers the thumbnail of a photo card gently lifts + zooms — `.list-row--card:hover .thumb` → `translateY(-2px) scale(1.03)` (Discover events + Saved), `.pick:hover .thumb` → `scale(1.03)` (This Week). Reuses `--t-mid`, no keyframes/bounce; cancelled under reduced-motion by the global `transition: none`.

**June 2026 mobile-home polish (all reuse the two tokens, no new keyframes):**
- **Staggered list entrance** — rows settle in sequence on the shared `--t-mid` fade-up via a per-row `transition-delay` ramp (0/45/90/135/180/225ms, capped at row 6). Pure delay on the existing entrance; zeroed by the reduced-motion `transition: none`. Applies to: **Briefing** This Week (`.thisweek .pick`, always on) and — since the follow-up — **Discover** + **Saved** lists (`.list-rows[data-animate] .list-row`). `.list-row` was added to the entrance fade-up selector list too (it previously had no entrance). The **`data-animate` attribute is the opt-in**: Saved's three `.list-rows` set it permanently in markup; Discover toggles it in `renderList`/`renderVenueList` and **drops it while the user is typing** (`suppressEntrance` flag set in the search `input` handler) so the results list never re-animates per keystroke (`run()` fires per input event, no debounce).
- **Tonight quote lime-rule draw-in** — the quote's lime left-rule is a `.tonight__quote::before` bar (replaced the old `border-left`) that draws in top-to-bottom via `scaleY(0→1)` using the same `@starting-style` + `allow-discrete` pattern as the entrance system. Reduced-motion resets it to `scaleY(1)`.
- **Active-tab nav lime indicator** — a 2px `--c-lime` underline (`::after`) inside the active nav pill ("you are here", lime = active state).

**Tap targets (WCAG 2.5.5 / Apple HIG):** hero `.btn-going`/`.btn-save` use `min-height: 50px` (a bare `height` was being dropped on these flex items), and the hero Save button re-asserts `align-self: stretch` to beat the base `.bookmark { align-self: start }`. List-row `.pick .bookmark` is padded to a 44×44 hit area while the glyph stays 20px.

`@media (prefers-reduced-motion: reduce)` cancels all of the above with `transition: none !important` + an explicit `@starting-style` override that zeros the entrance offset, sets `.tonight__quote::before` to `scaleY(1)`, and `::view-transition-*` `animation: none`.

**Do not add new keyframes, parallax, or bouncy easings.** If you need new motion, pick `--t-fast` or `--t-mid` and reuse the existing entrance selector list.

## Content conventions

- **Real Tallinn places only:** Sveta Baar, Fotografiska, Paavli Kultuurivabrik, Kai Art Center, Uus Laine, Kelm, EKKM, Lugemik, Telliskivi, etc. No fake venues, no marketing-voice copy.
- **Curator handles** always start with `@` and match the Telegram channel slug exactly: `@sigmundtells` (URL `t.me/sigmundtells`), `@notboring_riga` (URL `t.me/notboring_riga`), `@katestrelca`, etc. The May 2026 normalisation migration retired the legacy bare-handle exception; `curator.js` keeps back-compat for old `?handle=sigmundtells` URLs by auto-prefixing `@` on lookup miss.
- **Metadata format:** `Neighborhood · type · day + time`.
- **Editorial voice:** no em-dashes in headlines, no exclamation marks, no "discover", no marketing voice. Reads like the back page of a newsletter.

## Brand identity (Beacon · v2 · May 2026)

The mark is a **petrol squircle tile with a centered lime diamond**. One mark, no system. Full spec in `brand/BRAND.md` — read it before touching anything that renders the logo.

- **Canonical colors:** petrol `oklch(0.42 0.07 195)` / `#055959`, lime `oklch(0.86 0.16 113)` / `#d2dc50`. Already live as `--c-accent` / `--c-lime` in `styles.css`.
- **Canonical proportions:** tile `rx = 0.18 × side` (iOS squircle), diamond side = `0.20 × tile side`, diamond `rx = 0.12 × diamond side`. The CSS `.logo-mark` in `styles.css:163` is hand-tuned to these ratios at 26 px — do NOT change the 26/5/5/1 px figures without re-deriving from spec.
- **Two wordmark variants:** primary (`brand/masters/wordmark.svg` — Geist 600 lockup) for product chrome; editorial (`wordmark-editorial.svg` — italic "Alt.") for marketing only. Never use editorial in nav.
- **Theme color:** all HTML files declare `<meta name="theme-color" content="#055959" />`. Mobile browser chrome tints petrol.
- **Favicons / app icons:** referenced from `brand/favicon/` and `brand/pwa/` via `<link>` tags + `manifest.webmanifest`. SVG-only currently (universal support in 2026). PNG/ICO rasterizations are a follow-up if older browsers need them — pipeline TBD.
- **OG / Twitter cards:** `brand/social/og-default.svg` (1200×630) and `twitter-default.svg` (1200×675). Wired into `index.html` and `venue.html`.
- **Do not introduce a third color.** Two-tone for a reason. `--c-accent` (petrol) is the only accent; `--c-lime` is signal-only (live/active). Map pins are uniform petrol (`WA.MAP_CAT` in `map-venues.js`) — category is differentiated by the per-kind **glyph**, not hue (The-Economist discipline: a muted multi-hue pin palette was trialled June 2026 and reverted as too "app" for a two-tone editorial brand). Lime marks the active/live pin state only.

## Domain + page architecture (May 2026)

- **Single domain.** `wanderalt.app` is the primary. `wanderalt.com`
  is registered as brand-defense and 301-redirects via the rules in
  `_redirects` (Cloudflare Pages handles it; no DNS code in this
  repo). Both domains are registered at spaceship.com; nameservers
  point to Cloudflare for DNS + Email Routing + Pages.
- **Hosting target: Cloudflare Pages**, NOT Vercel. Reasons in
  `README.md` § Domain. Pages config lives in `_headers` (security
  + cache) and `_redirects` (apex/www + legacy URL aliases).
- **Everything lives at `/`.** Marketing, app, account, legal —
  all on the same domain. The split-domain pattern (Stripe-style
  marketing.com + dashboard.com) was unwound across the industry by
  ~2024; single-domain wins on SEO, share-link continuity, and
  auth complexity.
- **No separate Terms / Privacy / Support pages.** The single
  `about.html` carries the editorial mission, curator pitch, venue
  contact, privacy notice (we don't track), and email — five sections,
  one scroll. Anything more legalistic would clash with the
  back-page-of-a-newsletter voice.
- **No cookie banner.** We use only strictly-necessary localStorage
  (auth session, bookmarks, preferences). No analytics, no ads, no
  third-party scripts. Document this clearly in `about.html` and
  don't add tracking without adding consent UI first.

## Working rules

- When asked for a visual change, **make only that change** — do not refactor adjacent code.
- Don't add CSS variables, npm packages, or dependencies without asking.
- Keep `README.md` updated when structure or feature scope changes.
- Always end a session with **2–3 short "next step" suggestions** so the user knows what's left.
- **Open pull requests as READY for review, not draft** (`mcp__github__create_pull_request` with `draft: false`). The user reviews them directly and does not want to manually flip drafts to ready each time. Only use draft if the user explicitly asks for it.

## Supabase pipeline — token-efficient rules (CRITICAL)

The user is on a constrained plan. Polling burns quota and accomplishes nothing.

- **Never poll.** Do not fire repeated `net.http_post` calls. Do not check `staging_messages` more than once per assistant turn.
- **Fire once, then stop.** Trigger a cron / edge function, tell the user "queue is draining, check back in ~10 min", and end the turn.
- **Health checks are one-shot queries:**
  ```sql
  -- queue depth
  SELECT status, COUNT(*) FROM staging_messages GROUP BY status;
  -- active picks
  SELECT COUNT(*) FROM picks WHERE archived_at IS NULL;
  -- recent ingest results
  SELECT fn, status, inserted, rejected, error, finished_at
    FROM ingest_log ORDER BY id DESC LIMIT 5;
  ```
- **Crons own the schedule.** `process-staging` runs every 30 min; `ingest-telegram` nightly at 02:15 UTC; `generate-context` at 02:30; `enrich-venues` at 03:30; `archive-stale` (expired picks → `archived_at`) + `rotate-tonight` daily ~04:00; `wa-dedup-picks` (04:30, in-DB `wa_dedup_active_picks()`) + `wa-purge-archived` (04:45, `wa_purge_old_archived()` deletes picks archived > 90 days); `send-digest` Saturday 09:00 UTC. Only touch a schedule if the user asks.
- **Pick lifecycle (June 2026):** `picks.archived_at` soft-archives (app reads `archived_at IS NULL`); `picks.archive_reason` ∈ {`duplicate`, …} records why. `wa_dedup_active_picks()` archives EXACT-duplicate active picks (same city·venue·title·day·time — sources re-posting an event, or a correction posted as a NEW message that upsert-by-id can't merge), keeping the richest/bookmarked twin. Same-message EDITS already update in place via `process-staging`'s `upsert(onConflict:id)`. **Silent source-side cancellations** (event dropped with no new message) are detected via `picks.last_seen_at`: the snapshot scrapers (web/fienta — telliskivi/kinobize/splendidpalace/fienta + deployed-only hanzasperons/echogonewrong/hel-linkedevents) bump it every crawl for every event still listed, and `wa_reconcile_absent_picks(p_enforce, p_grace_days)` flags future-dated picks gone stale (`archive_reason='source_absent'`). It only considers sources flagged **`sources.reconcile_absences = true`** — the genuine full-snapshot crawls (telliskivi/kinobize/splendidpalace/hanzasperons/hel-linkedevents + Fienta). Deliberately **excluded**: `echogonewrong` (a recent-items RSS feed — items age off naturally) and `ra-vilnius` (hand-invoke-only), plus all Telegram/append-stream sources; new sources default false. It runs daily (`wa-reconcile-absent`, 05:00) in **DRY-RUN** (logs candidates to `ingest_log`, archives nothing) until the signal is validated; flip to enforce by scheduling with `(true, …)`. SQL: `supabase/migrations/20260609_pick_lifecycle_dedup_and_purge.sql` + `…_last_seen_and_absence_reconcile.sql` + `…_reconcile_absences_per_source.sql`.
- **Edge function versions:** deploy via Supabase MCP, confirm the returned version number, then stop. Do not test-fire manually in a loop.

## Discover page — architecture notes

`discover.html` is the canonical discovery surface. It replaced `search.html` and the standalone `map.html`. Key facts for any future work:

- **Bottom nav:** 4 items — Today · Discover · Saved · Profile. All five HTML pages share this nav. (The home tab's visible label is "Today"; its internal id stays `data-page="briefing"` / `briefing.js`.)
- **Events vs Places scope switch:** a segmented control at the top of Discover toggles `state.type` between `events` (picks) and `places` (venues). Mode-first, then filters narrow within it (a category means event-categories in Events, venue-kinds in Places). The permanent thing (venue) and the dated thing (event) are different objects — this is a scoped toggle, not a facet (RA / Google Maps pattern). Places shows all alt-culture venues by default (no "empty until filtered" gate, since a finite venue set is scannable), and hides the mood strip + AI link (both pick-only). Events mode is unchanged. Both modes use the list + map split.
- **Places data:** `WA.venues` / `WA._venuesAll` (supabase.js fetches the `venues` table, filtered client-side to `WA.VENUE_KINDS` = record store, bookshop, gallery, club, thrift, arts centre, cinema, community — generic bars/museums/libraries excluded to protect the curated identity). Static seed in `catalog.js` is the offline fallback. Venues carry `website` / `facebook` / `instagram` (OSM `contact:*` tags via ingest-osm v10; nullable). Venue cards carry no curator quote (places aren't picks) — name + kind + neighborhood + a row of minimalist social glyphs (website/FB/IG, shown only when present).
- **Places map:** `WA.MapView.setPlaces(venues)` switches the map to a venue-pin layer (clears `placesMode` again on the next `setFilters`). `discover.js runPlaces()` pushes the filtered venue set to the map every render; pins use the same overlay/clustering as events. Pin tap opens a venue-specific detail panel (`venueDetailHTML` — name + kind + neighborhood + social, no quote/bookmark/"I'm going"). Unlike Events, Places shows pins immediately (no empty-until-filtered gate).
- **URL schema:** `?type=events|places&q=&view=list|map&time=tonight|thisweek|all&cat=music,drink&nhood=Kalamaja&within=5|15|30&sort=…&id=<pick-id>&ai=<prompt>&mode=match`
  - `within` = the walking-radius filter (minutes). A "Distance" control (Any/5/15/30 min walk) requests geolocation once, then a shared haversine (`~80 m/min`) filters both the list and the map pins in Events **and** Places. Falls back to unfiltered (with a note) if location is declined.
  - `?type=places` scopes to venues; absent/`events` is the default.
  - **Sort** is mode-aware and trimmed: Events → `relevance` (default) / `newest` (labelled "Soonest"); Places → `featured` (default) / `nearest` (geolocation). A→Z and by-curator were dropped (curator is a browse section). The default **Relevance** sort folds in the on-device **taste nudge** (`WA.taste.tasteScore`, same as Today's This Week / B-5) as a *secondary* signal — a stable sort so curation/recency stays primary; skipped when a search query is active (keyword relevance already ranks) or in Places mode (venues have no mood_tags). Surfaced as one quiet "· tuned to you" suffix on the results count, no per-card badges.
  - `?id=` is the active pin — written on pin tap, restored on load, persists across filter changes.
  - `#mood=…` is owned by `mood-chips.js` (hash, not search param) — do not unify. Mood only applies in Events mode.
- **Basemap:** MapLibre GL JS **5.24.0** (CDN-pinned in `discover.html` + `admin.html`; upgraded from 4.7.1 June 2026 — `map-tiles.js` only uses the stable core API `Map`/`project`/`flyTo`/`fitBounds`/`LngLatBounds`/`on('load')`, none of the v5 breaking changes touch us; verified live with zero console errors and the editorial style intact) + OpenFreeMap (free, no API key, OSM vector tiles). Custom editorial style at `map-style.json`. Pins are positioned by projecting `picks.lat/lng` to container pixels via `WA.MapTiles.project(lng, lat)`. Picks without lat/lng don't render on the map but still appear in the list pane.
- **Empty by default:** the map renders NO pins when no filter is active. UX decision — at city zoom 100+ pins is unscannable. Picking Tonight / This week / Free / a category / a mood / a search term immediately populates pins. The `#map-empty-hint` overlay communicates the empty state.
- **Pick coords:** stored on `picks.lat` / `picks.lng`. `picks.address` is the postal address (used as a secondary check + shown in the detail panel). `picks.coords_source` ∈ {`nominatim`, `google_places`, `venue_join`, `manual`}. `picks.coords_locked = true` means admin overrode the coords; the nightly cron skips locked rows.
- **`geocode-picks` cron** (`wa-geocode-picks`, hourly at :20): calls the `geocode-picks` edge function. It selects picks with NULL lat/lng OR NULL address and either forward-geocodes (Nominatim → Google Places fallback) or reverse-geocodes coords-only rows. Skips locked rows. Filters out non-spatial venue names (`%various%`, `%multiple%`, `%online%`, `%popup%`).
- **`geocode-picks` reverse action** (v4+): `POST {action: 'reverse', lat, lng}` returns the resolved postal address. Admin pin editor calls this so the browser never hits Nominatim directly — single User-Agent identity, OSM usage policy respected, editor IPs hidden.
- **`enrich-pick-images` cron** (`wa-enrich-pick-images`, hourly at :40): for each active pick with NULL `image_url`, calls Google Places API Text Search to find the venue, then fetches a CDN photo URL via the Places media endpoint. ~$0.039 per unique venue. Skips "Various venues" / "Multiple" / "Online" / "Popup" entries (no fixed location → no representative photo).
- **Admin pin editor** (`admin.html` pick modal): MapLibre mini-map with a draggable petrol marker. Dragend writes lat/lng to the form; reverse-geocoded address is displayed for sanity checking. "Lock coords" checkbox sets `coords_locked = true` so cron doesn't undo manual placements.
- **WA.MapView API** (exposed by `map.js`):
  - `setFilters({ q, time, cats, mood, nhoods })` — Events layer: syncs all 5 filter dimensions into the map engine (also resets `placesMode`).
  - `setPlaces(venues)` — Places layer: renders an already-filtered venue set as pins (sets `placesMode`). Call it even before the map is ready — it stashes the state the map reads on its own `onReady` boot.
  - `render()`, `fitView()`, `focusPin(id)`, `closeDetail()`, `isReady()`.
- **WA.MapTiles API** (exposed by `map-tiles.js`):
  - `init(containerId, opts)`, `project(lng, lat) → {x,y}`, `unproject(x, y) → {lng,lat}`.
  - `fitToPicks(entries)`, `flyTo(lng, lat, zoom)`.
  - `on(event, cb)`, `onReady(cb)`, `resize()`, `isReady()`, `getMap()`.
- **Custom events:**
  - `wa:map-pin-changed` — fired by `map.js` when a pin is tapped or focused; `detail.id` is the pick id (empty string on deselect). `discover.js` listens to scroll+highlight the card and update `?id=`.
  - `wa:mood-changed` — fired by `mood-chips.js` when mood selection changes.
- **Desktop split view:** ≥1024px CSS grid, list left / map fills right. `view` param ignored on desktop.
- **Filters:** the `#discover-sheet` lives inside the list pane. Mobile = fixed bottom sheet opened by "+ Filters" (Apply commits; `openSheet` flips map→list first so the fixed sheet isn't trapped in a `display:none` pane). Desktop ≥1024px = **one compact facet-pill row directly above the results** (F-15b, June 2026 — replaced the stacked left-rail that pushed the first result ~900px down): each sheet fieldset's `.facet-pill` button toggles `[data-open]`, revealing `.discover-sheet__panel` as an anchored paper popover (one open at a time; outside click/Escape closes; pills are labelled with the live selection — "Category · 2", "≤ 15 min", "Sort: Soonest" — via `updateFacetPills()`). Sort is pushed to the row's right end (view control, not filter). "+ Filters"/Apply hidden on desktop, changes apply live (`liveApply()`). Active pills/chips carry a leading "✓" (WCAG 1.4.1); sort is a radio list, not a `<select>`.
- **Category icons:** filter chips are text-only (text-forward brand); category glyphs live on **map pins** — event pins use category-bucket glyphs, Places pins use per-venue-kind Lucide glyphs (`VENUE_PIN_ICONS` in `map.js`).
- **Event rows are photo-forward cards (June 2026):** Discover **Events** rows (`renderRow`) are `.list-row--card` — a full-colour `.thumb--lg` venue photo (left) + title/meta/quote body, falling back to the initials tile when a pick has no `image_url`. `content-visibility` keeps them lazy. **Places** rows stay social-glyph-only (OSM venues carry no photos), so the photo card is Events-only. Saved Going/Reading rows use the same `.list-row--card` treatment.
- **Mobile:** list or map, toggled by FAB. `view=map` in URL shows map pane.
- **popstate:** `discover.js` has a `popstate` listener — browser back/forward fully restores state without a page reload.

## Live data sources & ingest pipeline (May 2026)

Sources live in the `public.sources` table; each row has `kind`, `channel`, `city`, `curator_handle`, `enabled`, `feed_url`. **Crons own the schedule** (see `cron.job`) — read-only here, only touch if asked.

**Active source matrix (24 rows · 20 enabled · 4 intentionally disabled):**

| Kind | City | Channel | Curator | Cron | Status |
|---|---|---|---|---|---|
| telegram | tallinn | sigmundtells | `@sigmundtells` | `wa-ingest-telegram` (02:15 UTC daily) | ✅ live |
| telegram | tallinn | proEesti | `@proeesti` | same | ✅ live |
| telegram | tallinn | hel_nocturnes | `@hel.nocturnes` | — | ❌ no real channel yet |
| telegram | tallinn | kaisa_writes | `@kaisa.writes` | — | ❌ no real channel yet |
| telegram | tallinn | mattias_v | `@mattias.v` | — | ❌ no real channel yet |
| telegram | tallinn | raul_reads | `@raul.reads` | — | ❌ disabled — RSS feed below covers it |
| rss | tallinn | giadafromgamma | `@raul.reads` | `wa-ingest-rss-{morning,evening}` (09 + 17 UTC) | ✅ live |
| fienta | tallinn | paavli-kultuurivabrik | `@paavli` | `wa-ingest-fienta` (04:00 UTC) | ✅ live |
| fienta | tallinn | 15 (Von Krahl org id) | `@vonkrahl` | same | ✅ live |
| web | tallinn | telliskivi | `@telliskivi` | `wa-ingest-telliskivi` (03:45 UTC) | ✅ live |
| telegram | helsinki | helsinkievents | `@helsinkievents` | `wa-ingest-telegram` (02:15 UTC) | ✅ live (May 2026) |
| telegram | helsinki | otaniemievents | `@otaniemievents` | same | ✅ live (May 2026) |
| telegram | helsinki | ayyevents | `@ayyevents` | same | ✅ live (May 2026) |
| web | helsinki | hel-linkedevents | `@hel_today` | `wa-ingest-hel-linkedevents` (03:50 UTC) | ✅ live (May 2026) |
| telegram | riga | notboring_riga | `@notboring_riga` | `wa-ingest-telegram` (02:15 UTC) | ✅ live |
| telegram | riga | udgstriga | `@udgstriga` | — | ❌ channel exists but dormant since July 2024 |
| telegram | riga | AfishaRiga | `@AfishaRiga` | `wa-ingest-telegram` (02:15 UTC) | ✅ live (May 2026) — RU aggregator, ~200 subs |
| web | riga | kinobize | `@kinobize` | `wa-ingest-kinobize` (03:30 UTC) | ✅ live |
| web | riga | splendidpalace | `@splendidpalace` | `wa-ingest-splendidpalace` (03:35 UTC) | ✅ live |
| web | riga | hanzasperons | `@hanzasperons` | `wa-ingest-hanzas-perons` (03:50 UTC) | ✅ live (May 2026) — major contemporary venue, hosts Skaņu Mežs; ~2 upcoming events publicly listed at a time |
| web | riga | echogonewrong | `@echogonewrong` | `wa-ingest-echo-gone-wrong` (03:55 UTC) | ✅ live (May 2026) — Baltic art press RSS, filtered to Latvia categories; ~5-10 Riga items/week |
| telegram | vilnius | afishavilnius | `@afishavilnius` | `wa-ingest-telegram` (02:15 UTC) | ✅ live (May 2026) — RU aggregator |
| web | vilnius | ra-vilnius | `@ra_vilnius` | `ingest-ra` (no cron yet — see Vilnius note) | ⚠️ deployed + validated, cron pending RA-ToS call |
| (osm) | tallinn + riga + helsinki + vilnius | — | — | `wa-ingest-osm` (Mon 03:30 UTC) | ✅ live — multi-city since v8 (Vilnius added v11) |

**Riga — May 2026 curator-voice round (notes for next session):**
- **`@kseniakamikaza` curator added (no source row, no automated feed).** Ksenia Kamikaza (DJ, founder of UNDER Festival + Platz Für Tanz label, host of "Intelligent Beats" on Radio Naba since 2003) is the closest equivalent to `@sigmundtells`. She confirmed she's too busy organising events to personally curate a channel. Every alternative data source in her orbit was investigated (May 2026) and found not viable — see below. Admin-panel manual seeding is the only path for now.
- **Echo Gone Wrong RSS quirk**: the feed at `echogonewrong.com/feed/` returns HTTP 403 to default user-agents (Cloudflare) but answers fine with a real desktop Safari UA. `ingest-echo-gone-wrong` v1 sets that UA explicitly. If another scraper needs this, copy the `BROWSER_UA` constant pattern from that function.
- **KKC (kanepes.lv) investigated and skipped.** The site is a React SPA backed by WordPress; the WP REST API exposes a `pasakumi` post type but the latest event entry is from December 2024 — KKC's events database has been silent for ~5 months. Their React frontend likely reads from Facebook Events now. Re-evaluate if/when kanepes.lv publishes a fresh event again. For now, admin-panel manual seeding is the recommended path for KKC picks.
- **All remaining Riga automated sources fully investigated (May 2026) — none viable:**
  - `naba.lv` (Radio Naba): No RSS feed (`/feed/` → 404). Weekly schedule is on `naba.lsm.lv` which returns HTTP 403. Radio shows are broadcast events, not physical events with venues — wrong data model for WanderAlt.
  - `underfestival.com` (UNDER Festival): 2025 editions (March Liepāja, May Riga) are past; 2026 not announced. No RSS or API.
  - `skanumezs.lv` (Skaņu Mežs festival): Returns HTTP 406; already covered by Hanzas Perons ingest anyway.
  - `lcca.lv` (Latvian Centre for Contemporary Art): Good content (Survival Kit 17, Aug–Sep 2026 in Riga) but JS-rendered pages — no machine-readable feed. Re-evaluate if LCCA adds an RSS feed.
  - `rigamusicweek.lv` (Riga Music Week): November 2026, programme TBD, no RSS/API. Industry conference + showcase, not underground alt-culture.
  - `kamikaza.info/radioshow/` (Ksenia's radio show archive): No schedule data, no feed.
  - The three sources wired this session — `@AfishaRiga` (Telegram), `@hanzasperons` (web), `@echogonewrong` (RSS) — are the practical ceiling for automated Riga ingest until new sources emerge.

**Vilnius — unlocked for internal testing (May 2026):**
Front-end: city plate SVG (`assets/vilnius-overview.svg`), city.js entry (`status: 'live'`), static venue seed in `catalog.js` (offline fallback). The city is now **selectable** in the dropdown so the team can dogfood it. This is an internal-testing unlock, **not a public launch**. Vilnius runs on **WanderAlt's in-house editorial desk** rather than a resident human curator (none exists yet — see item 2 below): Events/Today are populated from the city's source feeds (`@ra_vilnius`, `@afishavilnius`), filtered by the standard `process-staging` Gemini/Groq pass, and **attributed per-feed on the cards** (no fabricated single voice). Today carries an honest umbrella note under the standfirst (`briefing.js` `renderEditorialDeskNote`, gated on `HOUSE_DESK_CITIES`) stating the arrangement plainly and inviting a resident curator. Discover's **Places** mode is also populated (~410 OSM venues). If a city genuinely has 0 picks, Today still falls back to the graceful empty states (Tonight "curators are warming up" line + city-plate This Week card). Revert to `status: 'coming'` if Vilnius needs hiding before a public launch.

**DONE (cloud, May 2026):**
- `ingest-osm` **v11** — Vilnius added to the `CITIES` map (bbox `54.63,25.17,54.74,25.38`, core cultural districts). Backfill run seeded **410 venues** (~138 in the curated `VENUE_KINDS`: Loftas, Kablys, Opium, Tamsta, Smala, Užupis art incubator, Menų spaustuvė, Atletika, Vinyloteka, Skalvija, Pasaka, AV17/Vartai/Prospekto, …). Nightly cron now covers 4 cities.
- `sources` rows inserted: **id 25** `afishavilnius` (telegram, curator `@afishavilnius` "Afisha Vilnius", enabled — picked up by the nightly `ingest-telegram` cron) and **id 26** `ra-vilnius` (web, curator `@ra_vilnius` "Resident Advisor", enabled).
- `ingest-ra` **v1** deployed — pulls Vilnius electronic events from RA's GraphQL (`https://ra.co/graphql`, area **561**, browser-like headers; HTML frontend is Cloudflare-gated but the API answers from a datacenter IP). Validated once: **24 events** staged (Paviljonas, Utopija, Sodas 2123, Vasaros Terasa, …).
- **`process-staging` v35 — Vilnius (and any non-Tallinn/Riga city) was silently mis-classified.** `CITY_CONTEXT` only held `tallinn` + `riga`; Vilnius fell back to the Tallinn context, so the classifier was told it was editing *Tallinn* and rejected every Vilnius post as "not Tallinn". 0 Vilnius picks ever reached the table despite 80+ staged RA/Afisha messages. v35 adds a `vilnius` entry (neighborhoods: Senamiestis, Naujamiestis, Užupis, Šnipiškės, Žvėrynas, Antakalnis). **v36 closes the same gap for Helsinki** (see next bullet) — all four live cities now have an explicit `CITY_CONTEXT` entry. Any new city MUST get one or it silently degrades to the Tallinn context.
- **Migration `drop_dead_world_coord_autopin` — fleet-wide insert breakage fixed.** A leftover `picks_autopin_trigger` (BEFORE INSERT/UPDATE → `wa_pick_autopin()`) still referenced `picks.world_x`/`world_y`, columns dropped in the May 2026 map-world.js sweep. It crashed **every** pick insert with `record "new" has no field "world_x"` — the real reason auto-generated picks stopped landing in all cities. Dropped the trigger + its dead helpers (`wa_pick_autopin`, `wa_pick_world_coords`, the SQL `wa_geocode_picks` — distinct from the live `geocode-picks` *edge function*). The live map uses `picks.lat`/`lng` + `WA.MapTiles.project()`, not world coords.
- **Backfill drained once:** the staged RA/Afisha backlog was requeued (`in_progress`/wrongly-`rejected` → `new`, Vilnius-scoped) and `process-staging` fired once. First batch produced **10 real Vilnius picks** (Sodas 2123, Utopija, Smala, Paviljonas, …). The rest drain on the normal 30-min cron — do not poll.
- **`process-staging` v36 — Helsinki `CITY_CONTEXT` entry added** (Kallio, Töölö, Punavuori, Kruununhaka, Sörnäinen, Kamppi, Ruoholahti, Otaniemi, Espoo). Helsinki had the identical city-blind bug: **~1,900 messages rejected as "not in Tallinn"** (1,464 city-blind rejections + 934 stuck `in_progress`) and only 4 hand-seeded picks. v36 also adds Finnish to the language-handling list. **Backlog NOT mass-drained** (constrained plan — full drain would saturate the shared free LLM quota and grind the cron for days). Instead a bounded **40-message validation slice** (most-recent upcoming, city-blind-rejected) was requeued + drained once to prove the fix. It worked mechanically (6 picks landed with correct neighborhoods — Töölö, Alppiharju), **but surfaced a content-quality problem**: the `@hel_today` Linked Events feed is municipal open data, so the slice produced off-brand picks (*"Summer Break Activities for Kids," "Self-Service Sewing" at a senior centre, "Art Session for Families with Small Children"*). Those 6 were archived immediately (reversible — `archived_at` set), leaving Helsinki at its 4 curated hand-seeded picks. The feed filter was then tightened and the backlog cheaply cleaned (`ingest-hel-linkedevents` v4 + `skip_keywords` + SQL bulk pre-filter) — see the **"Helsinki municipal-noise tuning"** note below for the full write-up. Net: ~3,100 noise rows rejected with zero LLM cost; 773 genuine candidates left for the cron. The city-classification bug itself is fixed; feed-quality is now handled too.

**SETTLED (June 2026 — owner's call: do not re-raise these):**
1. **RA recurring cron — will NOT be scheduled. Closed.** Resident Advisor's ToS prohibits automated collection and no clarification is expected, so the nightly cron is deliberately never added. `ingest-ra` stays a **hand-invoke-only** function (run it manually for a one-off Vilnius backfill if ever needed). Do not add `cron.schedule('wa-ingest-ra', …)`.
2. **Vilnius editorial voice — staying on the in-house desk. Closed.** No resident single-voice curator exists and none is being recruited. Vilnius runs permanently on WanderAlt's in-house editorial desk (feeds `@ra_vilnius` + `@afishavilnius` via `process-staging`, attributed per-feed, with the honest umbrella note on Today). Do not fabricate a handle; if a real scene curator ever volunteers, verify via `t.me/s/<name>` before adding a `sources` row — but this is not an open task.
3. **Public launch** — `city.js` is `'live'` for internal testing; flip to a public launch whenever the owner decides (Events/Today already populate from the in-house desk).

**Other verified sources (researched, NOT yet wired — scrape-only, mirror `ingest-telliskivi`/`ingest-kinobize`):** `echogonewrong.com` (Baltic art press, likely `/feed/` RSS), venue sites `menufabrikas.lt` / `opiumclub.lt` / `cac.lt`, festivals `kinopavasaris.lt` / `sirenos.lt` / `vilniusfestivals.lt` (GAIDA), editorial `vna.lt` / `neakivaizdinisvilnius.lt`. Excluded: **Lizdas** (Kaunas + closing). Not staged: `allevents.lt` (inbound provider feed, mainstream), `vilnius-events.lt` (Go Vilnius tourism, no feed). No public ICS calendars found on any source.

**Pipeline flow:**
`ingest-* → staging_messages → process-staging (every 30m, upsert onConflict id) → picks → enrich-pick-images → geocode-picks → enrich-venues → classify-moods → embed-picks → rotate-tonight (daily 04:05) → archive-stale → wa-dedup-picks (04:30) → wa-purge-archived (04:45)`

**`ingest-osm` v10 (May 2026):** loops over a `CITIES` map (Tallinn, Riga, Helsinki) and ingests venues from each Overpass bounding box in one cron tick. Per-city try/catch so a 504 on one city doesn't abort the others — each city's outcome is reported separately in `ingest_log.detail.cities`. Accepts `{city: "..."}` body for ad-hoc backfills; with no body it runs all three. v10 captures `contact:facebook` / `contact:instagram` (bare handles normalised to full URLs) plus `contact:website`/`website` into the `venues.facebook` / `instagram` / `website` columns, powering the Places social glyphs. Social coverage is sparse (OSM tagging is spotty — ~20 FB / ~12 IG live) and degrades gracefully. Overpass is rate-limited; the cron retries next tick.

**`ingest-hel-linkedevents` v4 (May 2026):** wraps the official **Helsinki Linked Events API** at `api.hel.fi/linkedevents/v1/event/`. Same data source as `tapahtumat.hel.fi`, `myhelsinki.fi/helsinki-event-calendar`, and `helsinki.today` — going to the API directly is more reliable than scraping any of those JS-driven frontends, and the schema is rich (multilingual name + description + location + keywords). Pre-filters at fetch time: `type_id='General'`, `event_status` ∈ {`EventScheduled`,`EventRescheduled`}, next 30 days, English/Finnish name present, then two skip layers — **`SKIP_VENUE_PATTERNS`** (matched against `location.name`: senior/service centre, playground, sports park, `palvelukeskus`/`leikkipuisto`/`liikuntapuisto` — the strongest off-brand signal, since these municipal venue types essentially never host alt-culture) and **`SKIP_PATTERNS`** (matched against name+description: children/family/library-kids/government-bureaucracy + municipal-activity noise — `vauvatuokio`, `vesijumppa`, `yhteislaulu`, `legopaja`, `roskakävely`, `lukukoira`, …). v2 dropped the bare `lapsi` pattern (false-positives on Finnish compounds); v4 added the venue layer + the activity terms after the v36 city fix revealed the feed is municipal open data dominated by this noise (~40% of upcoming events). `ingest_log.detail.reasons` distinguishes `venue:` vs `pattern:` rejections for tuning. Anything passing lands in `staging_messages` tagged `@hel_today` and goes through the standard `process-staging` Gemini/Groq filter.

**Helsinki municipal-noise tuning (May 2026, the `process-staging` v36 follow-up):** two filter layers were tightened so the off-brand backlog never reaches the LLM (constrained plan — every avoided LLM call is saved quota):
- **`pipeline_config.skip_keywords`** grew 11 → 39 terms, adding the same venue/activity noise (`senior centre`, `service centre`, `playground`, `leikkipuisto`, `youth centre`, `nuorisotalo`, `leiri`, `vauvatuokio`, `vesijumppa`, `deep-water workout`, …). `process-staging` checks these **before** the LLM call, so the noise is rejected for free on any city. Terms are noise-phrase or Finnish-specific, so they don't harm Tallinn/Riga/Vilnius.
- **Backlog bulk pre-filter:** the staged Helsinki backlog (~3,900 messages, mostly the city-blind-rejected pile) was filtered **directly in SQL** against `skip_keywords` — `UPDATE … SET status='rejected', rejection='bulk_prefilter: municipal-noise (skip_keyword)'` — clearing ~3,100 noise rows with **zero LLM calls**. The remaining **773 genuinely-ambiguous** messages (art shows at libraries, Pride events, gallery openings mixed with municipal programming the keywords can't safely separate) were reset to `new` so the 30-min cron drains them through the LLM at its own pace (~1.6 days, within Groq free tier). **Do not force-fire** `process-staging` to rush them.

**Adding a new source:** insert a row into `sources` (set `enabled=true`, fill `feed_url`/`channel`/`curator_handle`). The cron picks it up on the next tick. No code change required for telegram/rss/fienta — each ingest function reads the `sources` table on every run.

## LLM model policy (do not deviate)

**Cost rule (June 2026): Groq first, Gemini only when nothing else works.** Groq's free tier covers our volume; Gemini bills per token (and per query when grounded). Every text-generation function is Groq-primary with Gemini as a fallback. The €12/May spend was the *old* `generate-context` running Gemini **+ Google Search grounding** (~$14/1k queries) — grounding has since been removed everywhere and those functions moved to Groq-primary. Verify spend with the per-function provider logging (`gemini_calls` in responses / `provider` in `ingest_log.detail`).

- **Gemini:** standardised on **`gemini-2.5-flash`** (and `gemini-2.5-flash-lite` for the cheap text functions). `gemini-3.5-flash` is NOT deployed (was documented but never shipped); `-pro` and `gemini-2.0-flash` return 404 — never use them. **No Search grounding anywhere** (it was the dominant cost driver). Embeddings stay on `gemini-embedding-001` (do not "upgrade" embeddings to a flash model — it's the one Gemini use with no free Groq equivalent).
  - URL pattern: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`
- **Groq:** primary `meta-llama/llama-4-scout-17b-16e-instruct`, fallback `llama-3.3-70b-versatile`. Primary for `match-pick`, `process-staging`, `generate-context`, `draft-column`.
- Current per-function status:
  - `process-staging` (**v37**) → Groq llama-4-scout primary; Gemini `2.5-flash` fallback **gated behind `pipeline_config.gemini_fallback_enabled`** (default true). Flip that key to `false` in one SQL statement to stop all Gemini spend fleet-wide with no redeploy (rate-limited messages then wait for the next Groq window). In practice Groq handles ~100% of volume — 0 Gemini calls in the last 14 days. JSON via `responseMimeType`. v35/v36 added the Vilnius + Helsinki `CITY_CONTEXT` entries (a missing city silently degrades to the Tallinn context).
  - `generate-context` (**v11**) → Groq llama-4-scout primary, Gemini `2.5-flash-lite` fallback. No grounding. Response includes `gemini_calls` for monitoring. Only processes picks with `context_md IS NULL`.
  - `draft-column` (**v14**) → Groq llama-4-scout primary, Gemini `2.5-flash-lite` fallback. No grounding. Weekly 140-word column; logs `provider` in `ingest_log.detail`.
  - `send-digest` → Gemini `2.5-flash` (weekly email intro, no grounding). Low volume; not yet moved to Groq-primary (candidate if ever needed).
  - `enrich-venues` → **no LLM** — Wikidata + Nominatim + Google Places (venue facts/photos/closure).
  - `embed-picks` / `match-pick` → embeddings on `gemini-embedding-001` (no free equivalent — keep on Gemini); `match-pick` does ranking on Groq only (v8 — always `find_many`, topK=5).
  - **Google Places spend** (separate from Gemini): `enrich-pick-images` (~$0.039/unique venue photo) + `geocode-picks` fallback. Intended spend, but the larger paid line — ~765 pick images/week during the May/June backfill. Dedups by venue. Revisit caps here before scaling cities, not the Gemini path.
  - `geocode-picks` → Nominatim primary, Google Places fallback. Backfills `picks.lat/lng` for any active pick missing coords. Invoke ad-hoc: `POST /functions/v1/geocode-picks {"city":"tallinn","limit":50}`. Inherently location-less picks (`venue ILIKE '%various%'`) should be nulled manually after — they geocode to a meaningless point.

## Cloud-session notes

This repo is designed to run identically locally and in Claude Code on the web:

- No setup script needed — open any `.html` in a browser or run `npm start`.
- `local-secrets.js` is gitignored. Cloud sessions need the same secrets set as **environment variables** in the cloud env settings (not in code).
- `.claude/settings.local.json` is gitignored — its permissions are machine-local and don't transfer.
- Reference assets (wireframes, market-research PDF) live in `docs/archive/` which is gitignored to keep cloud clones light.
