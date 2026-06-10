-- ============================================================
-- English-only app (June 2026): picks.title is stored in English
-- at ingest (process-staging v38 compliance guard) and was
-- backfilled by the translate-picks edge function (v2) + one manual
-- pass — 672 active picks taken to 0 Cyrillic titles/quotes.
-- title_original preserves the source-language title for search and
-- audit. Journal entry — applied to production 2026-06-10 via MCP
-- as migration `picks_title_original_english_app`.
-- ============================================================
ALTER TABLE picks ADD COLUMN IF NOT EXISTS title_original text;
COMMENT ON COLUMN picks.title_original IS
  'Source-language title before English translation (NULL when the source title was already English).';
