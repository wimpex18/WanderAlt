# Hybrid dev: Claude (cloud) by default, local Gemma on demand

Goal: keep the **Claude Pro subscription** as the everyday default, and hand small tasks/bug-fixes to a **local model** (LM Studio, MLX, Apple M5) only when you choose — without editing files each time.

Verified setup (June 2026): **LM Studio 0.4.17**, MLX engine v1.9.0 (M5), model `mlx-community/gemma-4-12B-it-OptiQ-4bit`. LM Studio ≥ 0.4.1 exposes a native **Anthropic-compatible `/v1/messages`** endpoint, so Claude Code talks to it **directly — no router/proxy needed**.

## How Claude Code picks a backend (the one fact that drives everything)

Claude Code speaks the **Anthropic Messages API** and chooses its endpoint from env vars, read **once at launch** (a running session never re-reads them). Precedence, highest first:

1. Shell env exported before `claude` starts
2. project `.claude/settings.local.json` → `env` (gitignored)
3. project `.claude/settings.json` → `env` (committed)
4. user `~/.claude/settings.json` → `env`

Key vars: `ANTHROPIC_BASE_URL` (where requests go), `ANTHROPIC_AUTH_TOKEN` (the key sent), `ANTHROPIC_MODEL` (model id sent; or pass `--model`).

**Implication for "cloud by default":** do **not** put `ANTHROPIC_BASE_URL` in any settings file — a settings `env` override applies to *every* session in the repo, which would silently send your flagship/cloud work to the local model (the opposite of what you want). Leave settings clean so plain `claude` = your Pro subscription, and trigger local **per-session** via a shell alias (highest precedence, scoped to that one launch).

## Recommended architecture

**Default (cloud / Pro):** just run `claude`. Nothing set, nothing to toggle.

**Local handoff (one command):** add a shell alias that exports the three vars for that invocation only. In `~/.zshrc`:

```sh
# Hand a task to the local model (LM Studio must be running — see below).
alias wa-local='ANTHROPIC_BASE_URL=http://localhost:1234 \
  ANTHROPIC_AUTH_TOKEN=lmstudio \
  claude --model mlx-community/gemma-4-12B-it-OptiQ-4bit'
```

- `wa-local` → local Gemma for that session. `claude` → cloud Pro. No files change; nothing leaks into the other mode.
- The `--model` value must match the id LM Studio reports (`lms ls` or `curl localhost:1234/v1/models`) — use whatever it lists for the loaded model, even if it differs slightly from the name above.
- You can't switch cloud↔local mid-session (env is read at launch); quit and relaunch with the other command. `/model` inside a session only swaps the alias *within the current backend*.

## Start LM Studio's server (headless)

```sh
lms server start --port 1234            # OpenAI- + Anthropic-compatible, binds 127.0.0.1
# load the model with a generous context (Claude Code's system prompt is large):
lms load mlx-community/gemma-4-12B-it-OptiQ-4bit --context-length 32768
```

- LM Studio's default port is **1234**. Endpoints: `/v1/messages` (Anthropic, what Claude Code uses), plus `/v1/chat/completions` etc. (OpenAI).
- LM Studio's docs recommend **≥ 25K context** for Claude Code; 32K gives headroom for this repo's CLAUDE.md + tool schemas.
- Keep the bind on `127.0.0.1` (loopback). Only use `--host 0.0.0.0` behind an authenticated reverse proxy.

### ⚠️ Port note — do NOT use 8080
You mentioned 8080, but **`npm run admin` already serves the WanderAlt admin panel on `:8080`** (and `npm start` is on `:5173`). Running LM Studio on 8080 will collide the moment you open the admin panel. **Keep LM Studio on 1234** (the default, and what the alias above assumes). If you have a hard reason to move it, pick a free port like `11434`/`1234` and update `ANTHROPIC_BASE_URL` to match — just never 5173 or 8080.

## What to actually hand to the local model

A 12B 4-bit model is great for small, well-scoped work but is **not** a flagship substitute:

- ✅ Good local-tier tasks: single-file edits, copy/wording tweaks, small CSS/markup fixes, "explain this function", regex, commit messages.
- ⚠️ Keep on cloud: multi-file refactors, the layout/design-system reviews, anything touching the Supabase pipeline or edge functions, large-context reasoning, and **anything that must honour the contracts in `CLAUDE.md`** (a small model follows long instruction files less reliably — spot-check its diffs against `npm run verify`).
- Either way, `npm run verify` + `npm run e2e` are the safety net: run them after a local-model change before trusting it.

## Quick reference

| | Cloud (default) | Local handoff |
|---|---|---|
| Launch | `claude` | `wa-local` |
| Backend | Anthropic / Pro subscription | LM Studio `:1234` `/v1/messages` |
| Model | flagship | `mlx-community/gemma-4-12B-it-OptiQ-4bit` |
| Config touched | none | shell env (per-session only) |
| Switch | quit + relaunch with the other command | |

Sources: LM Studio "Use your LM Studio Models in Claude Code" (blog) + LM Studio server docs (`lmstudio.ai/docs/developer/core/server`); Claude Code model-config docs (`code.claude.com/docs/en/model-config`).
