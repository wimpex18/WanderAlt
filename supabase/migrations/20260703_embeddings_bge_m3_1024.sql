-- Embeddings provider migration (3 Jul 2026): gemini-embedding-001 (768-dim,
-- key's parent Google Cloud billing account deleted by owner) -> Cloudflare
-- Workers AI @cf/baai/bge-m3 (1024-dim, free 10k neurons/day). Different
-- vector space => full re-embed, so truncate. Applied via MCP 2026-07-03;
-- journal copy (this file was missed in the original apply — repo drift
-- caught during a follow-up audit).
truncate public.pick_embeddings;
drop index if exists public.pick_embeddings_hnsw_idx;
alter table public.pick_embeddings alter column embedding type vector(1024);
create index pick_embeddings_hnsw_idx on public.pick_embeddings
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
