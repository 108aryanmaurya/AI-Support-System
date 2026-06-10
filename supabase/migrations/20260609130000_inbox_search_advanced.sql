-- Sprint S3: advanced search — multi-select filters, ranking boosts, facets RPC.

-- Drop prior signature so we can replace with extended parameters.
drop function if exists public.search_inbox_conversations(
  uuid, text, text, text, text, uuid, boolean, uuid[], timestamptz, timestamptz, uuid[], boolean, int, int
);

create or replace function public.search_inbox_conversations(
  p_organization_id uuid,
  p_query text,
  p_status text default null,
  p_priority text default null,
  p_channel text default null,
  p_assignee_member_id uuid default null,
  p_unassigned_only boolean default false,
  p_tag_ids uuid[] default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_inbox_ids uuid[] default null,
  p_view_all_inboxes boolean default true,
  p_offset int default 0,
  p_limit int default 20,
  p_statuses text[] default null,
  p_priorities text[] default null,
  p_channels text[] default null,
  p_assignee_member_ids uuid[] default null,
  p_include_unassigned boolean default false,
  p_boost_member_id uuid default null,
  p_ai_intents text[] default null,
  p_sla_at_risk boolean default false
)
returns table (
  conversation_id uuid,
  subject text,
  status text,
  priority text,
  channel_type text,
  assigned_to_member_id uuid,
  last_message_at timestamptz,
  customer_name text,
  customer_email text,
  rank real,
  snippet text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(nullif(trim(p_query), ''), '')) as tsq
  ),
  filtered as (
    select
      c.id as conversation_id,
      c.subject,
      c.status,
      c.priority,
      c.channel_type,
      c.assigned_to_member_id,
      c.last_message_at,
      cust.name as customer_name,
      cust.email as customer_email,
      (
        ts_rank_cd(c.search_tsv, q.tsq, 32)
        + 0.12 * exp(
          -greatest(0, extract(epoch from (now() - c.last_message_at)) / 86400.0 / 14)
        )
        + case
          when nullif(trim(p_query), '') is not null
            and lower(trim(cust.email)) = lower(trim(p_query))
          then 0.35 else 0
        end
        + case
          when nullif(trim(p_query), '') is not null
            and coalesce(c.subject, '') ilike '%' || trim(p_query) || '%'
          then 0.2 else 0
        end
        + case
          when p_boost_member_id is not null
            and c.assigned_to_member_id = p_boost_member_id
          then 0.15 else 0
        end
      )::real as rank,
      ts_headline(
        'english',
        coalesce(
          nullif(trim(c.subject), ''),
          nullif(trim(cust.email), ''),
          nullif(trim(cust.name), ''),
          ''
        ),
        q.tsq,
        'MaxWords=30, MinWords=6, StartSel=<mark>, StopSel=</mark>'
      ) as snippet,
      count(*) over() as total_count
    from public.conversations c
    inner join public.customers cust
      on cust.id = c.customer_id
      and cust.organization_id = c.organization_id
    cross join q
    where c.organization_id = p_organization_id
      and c.status <> 'spam'
      and c.is_spam = false
      and q.tsq <> ''::tsquery
      and c.search_tsv @@ q.tsq
      and (
        (p_statuses is null or cardinality(p_statuses) = 0 and (p_status is null or c.status = p_status))
        or (p_statuses is not null and cardinality(p_statuses) > 0 and c.status = any(p_statuses))
      )
      and (
        (p_priorities is null or cardinality(p_priorities) = 0 and (p_priority is null or c.priority = p_priority))
        or (p_priorities is not null and cardinality(p_priorities) > 0 and c.priority = any(p_priorities))
      )
      and (
        (p_channels is null or cardinality(p_channels) = 0 and (p_channel is null or c.channel_type = p_channel))
        or (p_channels is not null and cardinality(p_channels) > 0 and c.channel_type = any(p_channels))
      )
      and (
        (
          p_assignee_member_id is null
          and not p_unassigned_only
          and (p_assignee_member_ids is null or cardinality(p_assignee_member_ids) = 0)
          and not coalesce(p_include_unassigned, false)
        )
        or (
          (p_assignee_member_id is not null and c.assigned_to_member_id = p_assignee_member_id)
          or (p_unassigned_only and c.assigned_to_member_id is null)
          or (
            p_assignee_member_ids is not null
            and cardinality(p_assignee_member_ids) > 0
            and c.assigned_to_member_id = any(p_assignee_member_ids)
          )
          or (coalesce(p_include_unassigned, false) and c.assigned_to_member_id is null)
        )
      )
      and (p_date_from is null or c.last_message_at >= p_date_from)
      and (p_date_to is null or c.last_message_at <= p_date_to)
      and (not coalesce(p_sla_at_risk, false) or c.waiting_status = 'waiting_agent')
      and (
        p_ai_intents is null
        or cardinality(p_ai_intents) = 0
        or c.metadata->'ai'->>'intent' = any(p_ai_intents)
      )
      and (
        p_view_all_inboxes
        or c.inbox_id is null
        or c.inbox_id = any(p_inbox_ids)
      )
      and (
        p_tag_ids is null
        or cardinality(p_tag_ids) = 0
        or (
          select count(distinct ct.tag_id)::int
          from public.conversation_tags ct
          where ct.organization_id = p_organization_id
            and ct.conversation_id = c.id
            and ct.tag_id = any(p_tag_ids)
        ) = cardinality(p_tag_ids)
      )
  )
  select *
  from filtered
  order by rank desc, last_message_at desc
  offset greatest(0, coalesce(p_offset, 0))
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

comment on function public.search_inbox_conversations(
  uuid, text, text, text, text, uuid, boolean, uuid[], timestamptz, timestamptz, uuid[], boolean, int, int,
  text[], text[], text[], uuid[], boolean, uuid, text[], boolean
) is
  'Org-scoped FTS with multi-select filters, ranking boosts, and tenant-safe inbox ACL.';

-- Facet counts within the current search scope (org + inbox ACL + active filters + optional FTS).
create or replace function public.search_inbox_facets(
  p_organization_id uuid,
  p_query text default '',
  p_statuses text[] default null,
  p_priorities text[] default null,
  p_channels text[] default null,
  p_assignee_member_ids uuid[] default null,
  p_include_unassigned boolean default false,
  p_tag_ids uuid[] default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_inbox_ids uuid[] default null,
  p_view_all_inboxes boolean default true,
  p_ai_intents text[] default null,
  p_sla_at_risk boolean default false
)
returns table (
  facet_type text,
  facet_value text,
  facet_label text,
  count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(nullif(trim(p_query), ''), '')) as tsq
  ),
  scoped as (
    select
      c.id,
      c.status,
      c.priority,
      c.channel_type,
      c.assigned_to_member_id
    from public.conversations c
    cross join q
    where c.organization_id = p_organization_id
      and c.status <> 'spam'
      and c.is_spam = false
      and (
        q.tsq = ''::tsquery
        or (c.search_tsv is not null and c.search_tsv @@ q.tsq)
      )
      and (p_statuses is null or cardinality(p_statuses) = 0 or c.status = any(p_statuses))
      and (p_priorities is null or cardinality(p_priorities) = 0 or c.priority = any(p_priorities))
      and (p_channels is null or cardinality(p_channels) = 0 or c.channel_type = any(p_channels))
      and (
        (
          (p_assignee_member_ids is null or cardinality(p_assignee_member_ids) = 0)
          and not coalesce(p_include_unassigned, false)
        )
        or (
          (
            p_assignee_member_ids is not null
            and cardinality(p_assignee_member_ids) > 0
            and c.assigned_to_member_id = any(p_assignee_member_ids)
          )
          or (coalesce(p_include_unassigned, false) and c.assigned_to_member_id is null)
        )
      )
      and (p_date_from is null or c.last_message_at >= p_date_from)
      and (p_date_to is null or c.last_message_at <= p_date_to)
      and (not coalesce(p_sla_at_risk, false) or c.waiting_status = 'waiting_agent')
      and (
        p_ai_intents is null
        or cardinality(p_ai_intents) = 0
        or c.metadata->'ai'->>'intent' = any(p_ai_intents)
      )
      and (
        p_view_all_inboxes
        or c.inbox_id is null
        or c.inbox_id = any(p_inbox_ids)
      )
      and (
        p_tag_ids is null
        or cardinality(p_tag_ids) = 0
        or (
          select count(distinct ct.tag_id)::int
          from public.conversation_tags ct
          where ct.organization_id = p_organization_id
            and ct.conversation_id = c.id
            and ct.tag_id = any(p_tag_ids)
        ) = cardinality(p_tag_ids)
      )
  ),
  status_facets as (
    select 'status'::text, s.status, s.status, count(*)::bigint
    from scoped s
    group by s.status
  ),
  priority_facets as (
    select 'priority'::text, s.priority, s.priority, count(*)::bigint
    from scoped s
    where s.priority is not null
    group by s.priority
  ),
  channel_facets as (
    select 'channel'::text, s.channel_type, s.channel_type, count(*)::bigint
    from scoped s
    where s.channel_type is not null
    group by s.channel_type
  ),
  assignee_facets as (
    select
      'assignee'::text,
      coalesce(s.assigned_to_member_id::text, 'unassigned'),
      coalesce(s.assigned_to_member_id::text, 'unassigned'),
      count(*)::bigint
    from scoped s
    group by s.assigned_to_member_id
  ),
  tag_facets as (
    select
      'tag'::text,
      td.id::text,
      td.name,
      count(distinct s.id)::bigint
    from scoped s
    inner join public.conversation_tags ct
      on ct.conversation_id = s.id
      and ct.organization_id = p_organization_id
    inner join public.tag_definitions td
      on td.id = ct.tag_id
      and td.organization_id = p_organization_id
    group by td.id, td.name
  )
  select * from status_facets
  union all select * from priority_facets
  union all select * from channel_facets
  union all select * from assignee_facets
  union all select * from tag_facets
  order by facet_type, count desc, facet_label;
$$;

comment on function public.search_inbox_facets is
  'Facet counts for inbox search within org scope and current filter set.';

grant execute on function public.search_inbox_conversations(
  uuid, text, text, text, text, uuid, boolean, uuid[], timestamptz, timestamptz, uuid[], boolean, int, int,
  text[], text[], text[], uuid[], boolean, uuid, text[], boolean
) to authenticated, service_role;

grant execute on function public.search_inbox_facets(
  uuid, text, text[], text[], text[], uuid[], boolean, uuid[], timestamptz, timestamptz, uuid[], boolean, text[], boolean
) to authenticated, service_role;
