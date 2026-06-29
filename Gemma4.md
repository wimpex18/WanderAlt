# Analysis of Project Structure and Documentation

## Overview
WanderAlt is a human-curated static site for underground/alternative culture in European cities. The project emphasizes a "curator voice" and strictly adheres to vanilla web standards (no frameworks, no build steps).

## Documentation Summary
- **README.md**: Product overview and deployment instructions.
- **HANDOFF.md**: Engineering reference and per-page specifications.
- **ROADMAP.md**: Audit history, frontend findings, and the "Reading lately" weekly synthesis.
- **docs/backend-and-pipeline.md**: Detailed Supabase pipeline, source matrix, and "Discover" internals.
- **brand/BRAND.md**: Visual identity including logo, palette (Petrol/Lime), and typography.
- **docs/reconcile-enforce-runbook.md**: Operational manual for data ingestion and reconciliation.

## Technical Constraints
- **Stack:** Static HTML/CSS/Vanilla JS (No frameworks, no bundlers).
- **Backend:** Supabase (REST + Edge Functions + pg_cron).
- **Hosting:** Cloudflare Pages.
- **Design System:** Two-tone brand (Petrol/Lime), specific spacing grid (`--s-*`), and strict typography rules.
- **LLM Policy:** Groq first, Gemini as a gated fallback (specific model versions only).

## Key Findings
- The project is currently live in Tallinn, with Vilnius in internal testing.
- Helsinki and Riga are the next targets for expansion.
- The "curator voice" is a primary design and content requirement across all screens.

## Next Steps
- Refer to `ROADMAP.md` for upcoming feature priorities.
- Use `HANDOFF.md` for specific page implementation details.
