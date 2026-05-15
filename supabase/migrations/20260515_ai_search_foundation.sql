-- ============================================================
-- Phase 0: AI search foundation
-- - Enable pgvector for semantic search
-- - pick_embeddings: 768-dim vectors per pick (Google gemini-embedding-001)
-- - match_cache: query-hash keyed cache for LLM responses with SWR
-- - picks.search_vector: BM25 tsvector for hybrid retrieval
-- - picks.pending_review + discovery_source: AI-discovered pick gating
-- - search_picks_hybrid(): RPC that does BM25 + cosine + Reciprocal Rank Fusion
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ---- pick_embeddings -------------------------------------------------------
CREATE TABLE IF NOT EXISTS pick_embeddings (
  pick_id        text PRIMARY KEY REFERENCES picks(id) ON DELETE CASCADE,
  embedding      vector(768) NOT NULL,
  embedded_text  text NOT NULL,
  model          text NOT NULL DEFAULT 'gemini-embedding-001',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pick_embeddings_hnsw_idx
  ON pick_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ALTER TABLE pick_embeddings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pick_embeddings_read ON pick_embeddings;
CREATE POLICY pick_embeddings_read ON pick_embeddings FOR SELECT USING (true);

-- ---- match_cache (LLM response cache, SWR semantics) -----------------------
CREATE TABLE IF NOT EXISTS match_cache (
  query_hash       text PRIMARY KEY,
  query_normalized text NOT NULL,
  city             text NOT NULL,
  response         jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  stale_after      timestamptz NOT NULL,  -- after this: serve + regen async
  expire_after     timestamptz NOT NULL   -- after this: force regen sync
);

CREATE INDEX IF NOT EXISTS match_cache_city_idx   ON match_cache(city);
CREATE INDEX IF NOT EXISTS match_cache_expire_idx ON match_cache(expire_after);

ALTER TABLE match_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS match_cache_read ON match_cache;
CREATE POLICY match_cache_read ON match_cache FOR SELECT USING (true);

-- ---- picks.search_vector + columns -----------------------------------------
ALTER TABLE picks
  ADD COLUMN IF NOT EXISTS pending_review    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discovery_source  text,
  ADD COLUMN IF NOT EXISTS discovery_query   text,
  ADD COLUMN IF NOT EXISTS search_vector     tsvector;

CREATE INDEX IF NOT EXISTS picks_search_vector_idx ON picks USING gin(search_vector);
CREATE INDEX IF NOT EXISTS picks_pending_review_idx ON picks(pending_review) WHERE pending_review = true;

CREATE OR REPLACE FUNCTION picks_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('english', coalesce(NEW.title, '')),        'A')
   || setweight(to_tsvector('english', coalesce(NEW.venue, '')),        'A')
   || setweight(to_tsvector('english', coalesce(NEW.neighborhood, '')), 'B')
   || setweight(to_tsvector('english', coalesce(NEW.kind, '')),         'C')
   || setweight(to_tsvector('english', coalesce(NEW.quote, '')),        'C')
   || setweight(to_tsvector('english', array_to_string(coalesce(NEW.mood_tags, '{}'::text[]), ' ')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS picks_search_vector_trigger ON picks;
CREATE TRIGGER picks_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, venue, neighborhood, kind, quote, mood_tags
  ON picks
  FOR EACH ROW EXECUTE FUNCTION picks_search_vector_update();

-- ---- search_picks_hybrid() RPC ---------------------------------------------
-- Returns top N pick IDs ranked by Reciprocal Rank Fusion of BM25 + cosine.
-- RRF k=60 (Cormack et al. recommended default).
CREATE OR REPLACE FUNCTION search_picks_hybrid(
  query_text       text,
  query_embedding  vector(768),
  target_city      text DEFAULT 'tallinn',
  result_limit     int  DEFAULT 20,
  include_pending  boolean DEFAULT false
)
RETURNS TABLE (
  pick_id    text,
  bm25_rank  int,
  vec_rank   int,
  rrf_score  double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH bm25 AS (
    SELECT
      id,
      row_number() OVER (
        ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', query_text)) DESC
      ) AS rn
    FROM picks
    WHERE city = target_city
      AND archived_at IS NULL
      AND (include_pending OR pending_review = false)
      AND search_vector @@ websearch_to_tsquery('english', query_text)
    LIMIT 50
  ),
  vec AS (
    SELECT
      pe.pick_id AS id,
      row_number() OVER (ORDER BY pe.embedding <=> query_embedding) AS rn
    FROM pick_embeddings pe
    JOIN picks p ON p.id = pe.pick_id
    WHERE p.city = target_city
      AND p.archived_at IS NULL
      AND (include_pending OR p.pending_review = false)
    ORDER BY pe.embedding <=> query_embedding
    LIMIT 50
  ),
  fused AS (
    SELECT
      COALESCE(b.id, v.id) AS id,
      b.rn::int            AS bm25_rn,
      v.rn::int            AS vec_rn,
      (COALESCE(1.0/(60 + b.rn), 0) + COALESCE(1.0/(60 + v.rn), 0))::double precision AS score
    FROM bm25 b
    FULL OUTER JOIN vec v ON b.id = v.id
  )
  SELECT id, bm25_rn, vec_rn, score
  FROM fused
  ORDER BY score DESC
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION search_picks_hybrid(text, vector(768), text, int, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION cleanup_match_cache() RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM match_cache WHERE expire_after < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
