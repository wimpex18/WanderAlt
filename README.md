# WanderAlt

What's on tonight in Tallinn, for travellers, expats and locals who want independent culture rather than the mainstream: gigs, club nights, arthouse film, contemporary art and dance, talks, markets. Every listing shows a time, a walking distance and the venue or channel it came from.

Status: Tallinn only, not launched. Version in `package.json`.

## How it works

1. **Pipeline** (`pipeline/`). Every six hours a GitHub Actions job reads the Tallinn sources in `pipeline/sources.tallinn.json`: the Fienta events API, venue sites with schema.org markup, venue programme pages and public Telegram channels. Structured sources are parsed directly; prose is read by a free model (Cloudflare Workers AI, falling back to OpenRouter's free models). Each event is classified for fit, given an English title and summary, tied to a geocoded venue, and published, held for review, or rejected.
2. **Database**. Supabase Postgres: sources, raw items, places, events and their provenance.
3. **Site**. Static HTML, CSS and vanilla JS on Cloudflare Pages at [wanderalt.app](https://wanderalt.app), reading Supabase with the public anon key. MapLibre GL over OpenFreeMap tiles for the map.

## Running it

```bash
npm install          # Node 24
npm start            # the site, http://localhost:5173
npm run pipeline:dry # read every source now, write nothing
npm test
```

A full pipeline run needs `SUPABASE_SERVICE_ROLE_KEY`, plus `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Workers AI, free) to read prose and classify; `OPENROUTER_API_KEY` adds a free fallback. Set them in a local `.env`, or as repository secrets for the scheduled job.

## Docs

- [`AGENTS.md`](AGENTS.md): conventions for anyone (or any agent) changing the code.
- [`docs/data.md`](docs/data.md): schema, pipeline, sources, security.
- [`docs/models.md`](docs/models.md): which models, why, and how to re-check them.
- [`docs/frontend.md`](docs/frontend.md): the current site's design system and patterns.
- [`docs/design-brief.md`](docs/design-brief.md): the brief for the redesign in Claude Design.

## Deploying

The site deploys on every push to `main` (Cloudflare Pages, no build step, output `/`). Edge functions deploy separately through Supabase. The pipeline needs no deploy: the workflow runs whatever is on `main`.
