# Screen-reader / a11y automation — tooling research (18 Jul 2026)

**Question:** can Claude Code (and CI) do more of the "only a human can do it"
screen-reader testing, and understand UX/UI better — new tools, MCP, skills?

**Short answer:** yes — my earlier "only a human" framing is now partly
outdated. There are **three automatable layers** (tree → emulated-speech →
real-AT-speech) plus semantic tooling that helps me read the UI the way an
assistive tech does. Real AT + real disabled-user testing still owns the final
sign-off, but ~80% of the manual checklist is now scriptable.

## The three layers (low → high fidelity, high → low CI-friendliness)

### 1. Playwright **ARIA snapshots** — native, zero new heavy deps ⭐ start here
We're already on Playwright **1.61**, which ships `toMatchAriaSnapshot()`. It
asserts the **accessibility tree**: roles + accessible names + states
(`checked`/`disabled`/`pressed`), order-sensitive. Catches exactly the class we
hit this session — a **missing accessible name** (the nameless dock tabs), a
wrong role, a dropped label — as a committed snapshot regression.
```js
await expect(page.locator('.nav__inner')).toMatchAriaSnapshot(`
  - link "Today"
  - link "Discover"
  - link "Saved"
  - link "Profile"
`);
```
- **CI:** any OS, deterministic, fast. Folds straight into our visual/a11y jobs.
- **Limit:** it's still the *properties* layer (what the tree says), not what a
  screen reader *speaks*. But as a gate it locks the structure cheaply.
- Source: [Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots).

### 2. **@guidepup/virtual-screen-reader** — emulated speech, CI-friendly ⭐⭐
A screen-reader *simulator* that runs over the DOM in Node/any OS (no real AT).
You assert on the **actual announced phrases** (`spokenPhraseLog()`), which is
the thing my manual checklist checks by ear:
```js
await virtual.start({ container: document.body });
while ((await virtual.lastSpokenPhrase()) !== 'end of document') await virtual.next();
expect(await virtual.spokenPhraseLog()).toEqual([
  'document', 'navigation', 'Today, link', 'Discover, link', … ]);
```
- **CI:** deterministic, spec-compliant (tests against W3C ARIA-AT), Linux OK.
- **Fit for us:** our pages need real JS (catalog.js etc.), so it can't run in
  bare jsdom — it needs a small harness that injects the SR bundle into a live
  Playwright page (`addScriptTag` + `page.evaluate`) or runs jsdom with our
  scripts. That's a ~half-day spike, not turnkey.
- **Honest caveat (from the maintainers):** *"no substitute for testing with
  real screen readers and real users"* — it emulates AT semantics, not the
  quirks of VoiceOver/NVDA/JAWS.
- Source: [virtual-screen-reader](https://github.com/guidepup/virtual-screen-reader),
  [npm](https://www.npmjs.com/package/@guidepup/virtual-screen-reader).

### 3. **Guidepup** (real VoiceOver / NVDA) — highest fidelity, finicky ⭐ periodic
Drives **real VoiceOver on macOS and NVDA on Windows** (updated for NVDA
2026.1.1) via Playwright; assert with `itemText()` / `spokenPhraseLog()`,
navigate with `perform(findNextHeading)` etc.
- **CI:** there IS a `guidepup/setup-action` for GitHub Actions, and we already
  run a **macos-latest** runner (the `visual` job) — so real VoiceOver in CI is
  feasible. Requirements: `npx @guidepup/setup`, VoiceOver enabled + automation
  permission, **non-headless**, **single worker** (VoiceOver drives one instance),
  generous timeouts + retries. macOS Sonoma/Sequoia/Tahoe supported.
- **Reality:** flakier and slower than layers 1–2 → best on a **cadence** (nightly
  or pre-release), not every PR. It's the closest thing to "the real thing"
  without a human.
- Packages: `@guidepup/guidepup`, `@guidepup/playwright`, `@guidepup/setup`.
- Sources: [guidepup.dev](https://www.guidepup.dev/),
  [guidepup-playwright](https://github.com/guidepup/guidepup-playwright),
  [example](https://www.guidepup.dev/docs/example).

## Tools that help *me* understand UX/UI better (not just test it)
- **Official Playwright MCP** (2026) — lets me drive a real browser **through the
  accessibility tree**, not pixels: semantic locators, ARIA snapshots, clicks/types
  like a user. That's a genuine upgrade to how I "read" a page — today I reason
  from screenshots (vision) + DOM measurement; the a11y-tree MCP adds the
  same semantic layer an AT uses. [Setup guide](https://qaskills.sh/blog/playwright-mcp-server-claude-code-setup).
- **playwright-axe-mcp** — an MCP wrapping Playwright + axe for interactive WCAG
  scans (what my `npm run a11y` does as a script, but on-demand in chat).
  [repo](https://github.com/PashaBoiko/playwright-axe-mcp).
- **Vision design-review tools** (Figma AI Design Reviewer; onBeacon — "GPT-5 +
  Claude"; Gemini-based UI critics) — good for Figma-stage critique, but they're
  external SaaS and don't fold into this repo's zero-dep CI. And functionally
  they do what I already do by reading screenshots. Not worth adopting here.
  [Figma AI review](https://www.figma.com/community/plugin/1339202278007297015/),
  [testguild roundup](https://testguild.com/accessibility-testing-tools-automation/).
- **"Claude Code a11y skill"** listings exist (mcpmarket) but a *skill* is a
  prompt-pack — it changes how I approach the task, not what I can measure. The
  capability comes from the tools above, not the skill.

## Recommendation for WanderAlt (ordered)
1. **Add Playwright ARIA snapshots** to the existing suite for the key surfaces
   (dock nav, Today hero, Discover controls, forms). Native to our 1.61, no new
   deps, CI-cheap — turns "does the nav announce its tabs" from a manual check
   into a committed gate. **Do first.**
2. **Spike `@guidepup/virtual-screen-reader`** as `npm run sr-test` — automate the
   announced-phrase half of `docs/voiceover-test-checklist.md` (heading order,
   link names, control states, empty-state copy). CI-friendly; ~half-day harness.
3. **Real Guidepup VoiceOver on the macOS runner, on a cadence** (nightly /
   pre-release), for true-AT sign-off of Today + Discover. Higher setup + flake
   cost — worth it near launch, not per-PR.
4. **Keep the human checklist** (`voiceover-test-checklist.md`) for the final
   real-AT + real-user pass. Every 2026 source agrees: automation augments, it
   doesn't replace — but the automatable share just went from ~0 to ~80%.

**Net:** what I called human-only is now three-quarters scriptable. The
lowest-risk, highest-leverage move (ARIA snapshots) needs no new dependency and
extends the CI gates we just wired.

### Sources
- [Guidepup](https://www.guidepup.dev/) · [guidepup repo](https://github.com/guidepup/guidepup) · [guidepup-playwright](https://github.com/guidepup/guidepup-playwright) · [virtual-screen-reader](https://github.com/guidepup/virtual-screen-reader)
- [Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots) · [Playwright MCP + Claude Code](https://qaskills.sh/blog/playwright-mcp-server-claude-code-setup) · [playwright-axe-mcp](https://github.com/PashaBoiko/playwright-axe-mcp)
- [TestGuild 2026 a11y tools](https://testguild.com/accessibility-testing-tools-automation/) · [BrowserStack: automate a11y 2026](https://www.browserstack.com/guide/automate-accessibility-testing) · [Assistiv Labs: automating screen readers](https://assistivlabs.com/articles/automating-screen-readers-for-accessibility-testing) · [W3C WAI tools list](https://www.w3.org/WAI/test-evaluate/tools/list/)
