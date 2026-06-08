# Skills & plugins (Claude Code) — WanderAlt

How AI design/UX/frontend capability is configured for this repo, named
properly, and activated. Config lives in committed **`.claude/settings.json`**
(plugins) and **`.claude/skills/`** (project skills).

## Installed plugins (declared in `.claude/settings.json` → `enabledPlugins`)

| Plugin id | Marketplace (repo) | Skills / commands it adds | Why |
|---|---|---|---|
| `design@knowledge-work-plugins` | `anthropics/knowledge-work-plugins` (Anthropic, "Anthropic & Partners", v1.2.0) | `/design-critique`, `/design-system`, `/design-handoff`, `/accessibility-review` (WCAG 2.1 AA), `/user-research`, `/research-synthesis` | End-to-end product-design workflow: critique, design-system mgmt, UX writing, accessibility audits, research synthesis, dev handoff. |
| `frontend-design@claude-plugins-official` | `claude-plugins-official` (Anthropic, verified, built-in) | frontend-design skill | "Production-grade frontends that avoid generic AI aesthetics." |
| `ui-ux-pro-max@ui-ux-pro-max-skill` | `nextlevelbuilder/ui-ux-pro-max-skill` (third-party) | UI/UX design-intelligence skill (161 reasoning rules, 67 UI styles; optional `uipro` Python CLI) | Broader UI-style intelligence. **Third-party — executes code; vetted/added at owner request.** |

Non-official marketplaces are registered under `extraKnownMarketplaces`
(object form: `"<marketplace-name>": { "source": { "source": "github",
"repo": "owner/repo" } }`). The `<marketplace-name>` key must equal the
marketplace's own `name` (from its `.claude-plugin/marketplace.json`), and
`enabledPlugins` uses `plugin@marketplace-name`. All ids here were verified
against the live manifests.

## Project skill (in `.claude/skills/`)

| Skill | Path | Invocation |
|---|---|---|
| `wanderalt-design` | `.claude/skills/wanderalt-design/SKILL.md` | Auto-loaded when doing design/UI/CSS/frontend work; or type `/wanderalt-design` |

It **seeds the design system** — points Claude (and the design/frontend
plugin skills) at WanderAlt's brand tokens, conventions, and quality bars
so output is on-brand instead of generic. This is the "seed the design
system" best practice (see `docs/ai-workflow-and-ideas-2026-06.md`).

## Requirements / prerequisites

- **Network:** cloud sessions install marketplace plugins at session start,
  so the environment's network policy must allow **GitHub**
  (`github.com` / `raw.githubusercontent.com`) to reach
  `anthropics/knowledge-work-plugins` and `nextlevelbuilder/ui-ux-pro-max-skill`.
  If a cloud session reports a marketplace fetch failure, widen the env's
  network allowlist (Settings → environment → network).
- **Python 3.x** is present in the cloud image (only needed if the
  `ui-ux-pro-max` `uipro` CLI is used; the plugin itself is skill-based).
- **Trust:** plugins execute arbitrary code. `design` + `frontend-design`
  are Anthropic-verified; `ui-ux-pro-max` is third-party.

## Activating

- **New cloud session:** plugins auto-install at startup from the declared
  marketplaces; the `wanderalt-design` project skill loads from
  `.claude/skills/`.
- **Current session:** project-skill edits hot-reload, but a *newly created*
  `.claude/skills/` directory may need a restart (or `/reload-skills` /
  `/reload-plugins`) to be picked up. Marketplace plugins generally install
  at session start, so a fresh session is the reliable path for those.
- **Locally:** the interactive `/plugin` manager works in the local CLI
  (the web/cloud session does not expose it — that's why `/plugin` reports
  "not available in this environment").
