-- Provider-strategy P1 (Jul 2026): local venue-search index built from the
-- Overture Maps places theme (June 2026 release, CDLA-Permissive/Apache-2.0
-- sources). Replaces the retired Google Places dependency in discover-venues.
-- Applied via MCP 2026-07-02; journal copy. Data load (1,895 rows, 4 cities)
-- was a one-shot via the temporary load-places-index edge fn (now a 410 stub).
create extension if not exists pg_trgm;

create table if not exists public.places_index (
  id          text primary key,          -- Overture GERS id
  city        text not null,
  name        text not null,
  kind        text not null,             -- WanderAlt kind vocabulary
  category    text not null,             -- original Overture primary category
  lat         double precision,
  lng         double precision,
  address     text,
  postcode    text,
  locality    text,
  website     text,
  facebook    text,
  instagram   text,
  confidence  real,
  source      text not null default 'overture/2026-06',
  created_at  timestamptz not null default now()
);

alter table public.places_index enable row level security;
-- No public policies: read/written only by edge functions via service role.

create index if not exists places_index_city_kind on public.places_index (city, kind);
create index if not exists places_index_name_trgm on public.places_index using gin (name gin_trgm_ops);

create or replace function public.wa_search_places_index(
  p_city  text,
  p_q     text,
  p_kinds text[] default '{}',
  p_limit int    default 5
) returns table (
  id text, city text, name text, kind text, category text,
  lat double precision, lng double precision,
  address text, locality text, website text, facebook text, instagram text,
  confidence real, score real
)
language sql stable as $$
  select
    pi.id, pi.city, pi.name, pi.kind, pi.category,
    pi.lat, pi.lng, pi.address, pi.locality,
    pi.website, pi.facebook, pi.instagram, pi.confidence,
    ( greatest(similarity(pi.name, p_q), similarity(replace(pi.category, '_', ' '), p_q))
      + case when cardinality(p_kinds) > 0 and pi.kind = any(p_kinds) then 0.35 else 0 end
      + coalesce(pi.confidence, 0) * 0.1 )::real as score
  from public.places_index pi
  where pi.city = p_city
    and ( (cardinality(p_kinds) > 0 and pi.kind = any(p_kinds))
          or pi.name % p_q
          or pi.name ilike '%' || p_q || '%'
          or similarity(replace(pi.category, '_', ' '), p_q) > 0.3 )
  order by score desc, pi.confidence desc nulls last
  limit greatest(p_limit, 1)
$$;

revoke all on function public.wa_search_places_index(text, text, text[], int) from public, anon, authenticated;
grant execute on function public.wa_search_places_index(text, text, text[], int) to service_role;
