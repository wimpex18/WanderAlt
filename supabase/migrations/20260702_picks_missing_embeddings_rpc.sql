-- embed-picks fix (Jul 2026): the function used to diff embedded ids
-- client-side and pass them back as a giant id=not.in.(...) URL filter;
-- past ~500 embeddings the URL exceeded the HTTP/2 header limit and the
-- fetch threw (500 on every cron tick ~12 Jun - 2 Jul). This RPC does the
-- anti-join where it belongs. Applied via MCP 2026-07-02; journal copy.
create or replace function public.wa_picks_missing_embeddings(
  p_city  text,
  p_limit int default 100
) returns table (
  id text, title text, venue text, neighborhood text, kind text,
  quote text, mood_tags text[]
)
language sql stable as $$
  select p.id, p.title, p.venue, p.neighborhood, p.kind, p.quote, p.mood_tags
  from public.picks p
  where p.city = p_city
    and p.archived_at is null
    and not exists (select 1 from public.pick_embeddings e where e.pick_id = p.id)
  order by p.created_at desc nulls last
  limit greatest(p_limit, 1)
$$;

revoke all on function public.wa_picks_missing_embeddings(text, int) from public, anon, authenticated;
grant execute on function public.wa_picks_missing_embeddings(text, int) to service_role;
