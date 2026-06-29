# The Ultimate Guide: Local LLM Agent Setup (Claude Code + LM Studio on Apple M5)

This guide walks you through configuring LM Studio with optimized hardware engines for the M5 chip, and linking it flawlessly with Anthropic’s Claude Code CLI for entirely offline, on-device agentic development.

---

## Part 1: Optimizing LM Studio for Apple M5

To leverage the maximum speed of the M5's Fusion Architecture and unified memory, you need to use the advanced engine channels.

### 1. Enable Beta & Developer Channels
*   Open **LM Studio**.
*   Go to **Settings** (Gear icon in the bottom-left corner).
*   Under the Update Channel or Application Settings section, toggle your preferences to **Beta / Canary** to unlock advanced backend configurations.
*   Under the Extension Packs / Download Channel, select **Beta** to fetch the newest compiler layers.

### 2. Configure the Hardware & Engine Matrix
Navigate to your Developer Mode Settings (or the Server/Model Configuration sidebar panel) and apply these rules:
*   **Enable Local LLM Service:** Ensure this main master switch is toggled **ON**.
*   **Engine Protocol:** Select *Use LM Studio Engine Protocol*.
*   **Inference Engine Selection:** Select **Apple MLX Engine** (Optimized for mlx v1.9.0+ / Apple M5 natively) for standard deployment.
*   **Alternative:** For GGUF weights, ensure **Metal llama.cpp acceleration** is fully active with max layers offloaded to your unified GPU memory pool.
*   **Format & Token Tracking:** Ensure **Harmony 0.3.5+ parsing** is turned on (crucial for structural JSON and tool-call translations).

### 3. Context Size Tuning
Before launching your model, navigate to the **Context Window / Memory** settings card:
*   For developer tasks involving medium repos, bump the context up to **32,768 (32k)** or **65,536 (64k)** tokens.
*   **Tip:** Thanks to the M5's high-bandwidth memory layout, your token prefill processing speeds will remain blazing fast even at high limits!

---

## Part 2: Hooking Up Claude Code CLI

Claude Code has strict internal security rules that usually reject plaintext local HTTP proxies. This custom terminal alias bypasses the cloud checks, strips duplicate credential conflicts, and silences non-essential background pings.

### 1. Wipe Old File Conflicts
Open your Mac's Terminal and run this to delete old profile variables:
```bash
rm -f ~/.claude/settings.json
```

### 2. Create the Clean Master Alias
Open your user profile script using Nano:
```bash
nano ~/.zshrc
```

Scroll to the very bottom line and paste this complete shortcut execution string:
```bash
alias wa-local='export ANTHROPIC_BASE_URL="http://127.0.0.1:1234" ANTHROPIC_AUTH_TOKEN="lmstudio" CLAUDE_CODE_ATTRIBUTION_HEADER="0" CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1" ANTHROPIC_DEFAULT_SONNET_MODEL="mlx-community/gemma-4-12B-it-OptiQ-4bit" ANTHROPIC_DEFAULT_HAIKU_MODEL="mlx-community/gemma-4-12B-it-OptiQ-4bit" ANTHROPIC_DEFAULT_OPUS_MODEL="mlx-community/gemma-4-12B-it-OptiQ-4bit" && claude --model mlx-community/gemma-4-12B-it-OptiQ-4bit'
```

*(Note: If you are using a different model identifier than the Gemma-4 snapshot, simply swap out the model string portions above to match your exact loaded engine text!)*

Save and exit (**Control + O**, **Enter**, **Control + X**).

### 3. Apply and Launch
Reload your active shell environment terminal layer:
```bash
source ~/.zshrc
```

Now, load your target weights inside **LM Studio** on port **1234**, change directories into your project folder, and run:
```bash
wa-local
```

### 🎯 What Happens Next:
The CLI client will bypass cloud checks instantly, verify the unencrypted link cleanly, and stream your model's code reasoning straight to your on-screen terminal shell window without dropping frames or triggering API usage charges!
