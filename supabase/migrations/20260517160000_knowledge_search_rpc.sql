-- Phase 2 Sprint 2: ranked FTS over knowledge_chunks (published articles only).

create or replace function public.search_knowledge_chunks(
  p_organization_id uuid,
  p_query text,
  p_limit int default 20
)
returns table (
  chunk_id uuid,
  chunk_index int,
  content text,
  rank real,
  article_id uuid,
  article_title text,
  article_slug text,
  article_visibility text,
  article_status text,
  article_updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select plainto_tsquery('english', coalesce(nullif(trim(p_query), ''), '')) as tsq
  ),
  limited as (
    select
      c.id as chunk_id,
      c.chunk_index,
      c.content,
      (
        ts_rank(c.content_tsv, q.tsq)
        + case when a.title ilike '%' || trim(p_query) || '%' then 0.25 else 0 end
        + case when a.status = 'published' then 0.1 else 0 end
      )::real as rank,
      a.id as article_id,
      a.title as article_title,
      a.slug as article_slug,
      a.visibility as article_visibility,
      a.status as article_status,
      a.updated_at as article_updated_at
    from public.knowledge_chunks c
    inner join public.article_versions v on v.id = c.article_version_id
    inner join public.knowledge_articles a on a.id = v.article_id
    cross join q
    where c.organization_id = p_organization_id
      and a.organization_id = p_organization_id
      and a.deleted_at is null
      and a.status = 'published'
      and a.published_version_id = v.id
      and q.tsq <> ''::tsquery
      and c.content_tsv @@ q.tsq
    order by rank desc, a.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  )
  select * from limited;
$$;

comment on function public.search_knowledge_chunks is
  'Org-scoped FTS on published knowledge chunks with title/status ranking boosts.';

grant execute on function public.search_knowledge_chunks(uuid, text, int) to authenticated;
grant execute on function public.search_knowledge_chunks(uuid, text, int) to service_role;
