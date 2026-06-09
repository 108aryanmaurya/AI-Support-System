-- Sprint S2: PostgreSQL FTS for inbox conversations, messages, and customers.
-- Org scope + structured filters are applied in RPC before ranking.

-- ---------------------------------------------------------------------------
-- 1) search_tsv columns
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists search_tsv tsvector;

alter table public.messages
  add column if not exists search_tsv tsvector;

alter table public.customers
  add column if not exists search_tsv tsvector;

comment on column public.conversations.search_tsv is
  'FTS: subject (A) + customer name/email (B). Maintained by trigger; queried org-scoped in search_inbox_conversations.';

comment on column public.messages.search_tsv is
  'FTS: message content (and internal notes when sender_type = internal_note).';

comment on column public.customers.search_tsv is
  'FTS: name, email, phone, external_id for customer lookup search.';

-- ---------------------------------------------------------------------------
-- 2) Vector builders + triggers
-- ---------------------------------------------------------------------------
create or replace function public.build_conversation_search_tsv(
  p_subject text,
  p_customer_name text,
  p_customer_email text
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('english', coalesce(nullif(trim(p_subject), ''), '')), 'A')
    || setweight(to_tsvector('english', coalesce(nullif(trim(p_customer_name), ''), '')), 'B')
    || setweight(to_tsvector('english', coalesce(nullif(trim(p_customer_email), ''), '')), 'B');
$$;

create or replace function public.build_customer_search_tsv(
  p_name text,
  p_email text,
  p_phone text,
  p_external_id text
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('english', coalesce(nullif(trim(p_name), ''), '')), 'A')
    || setweight(to_tsvector('english', coalesce(nullif(trim(p_email), ''), '')), 'A')
    || setweight(to_tsvector('english', coalesce(nullif(trim(p_phone), ''), '')), 'B')
    || setweight(to_tsvector('english', coalesce(nullif(trim(p_external_id), ''), '')), 'B');
$$;

create or replace function public.conversations_set_search_tsv()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cust record;
begin
  select name, email
  into cust
  from public.customers
  where id = new.customer_id
    and organization_id = new.organization_id;

  new.search_tsv := public.build_conversation_search_tsv(
    new.subject,
    cust.name,
    cust.email
  );
  return new;
end;
$$;

drop trigger if exists trg_conversations_search_tsv on public.conversations;

create trigger trg_conversations_search_tsv
before insert or update of subject, customer_id on public.conversations
for each row
execute function public.conversations_set_search_tsv();

create or replace function public.customers_refresh_conversation_search_tsv()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations c
  set search_tsv = public.build_conversation_search_tsv(c.subject, new.name, new.email)
  where c.customer_id = new.id
    and c.organization_id = new.organization_id;

  new.search_tsv := public.build_customer_search_tsv(
    new.name,
    new.email,
    new.phone,
    new.external_id
  );
  return new;
end;
$$;

drop trigger if exists trg_customers_search_tsv on public.customers;

create trigger trg_customers_search_tsv
before insert or update of name, email, phone, external_id on public.customers
for each row
execute function public.customers_refresh_conversation_search_tsv();

create or replace function public.messages_set_search_tsv()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv := to_tsvector('english', coalesce(new.content, ''));
  return new;
end;
$$;

drop trigger if exists trg_messages_search_tsv on public.messages;

create trigger trg_messages_search_tsv
before insert or update of content on public.messages
for each row
execute function public.messages_set_search_tsv();

-- ---------------------------------------------------------------------------
-- 3) Backfill existing rows
-- ---------------------------------------------------------------------------
update public.customers c
set search_tsv = public.build_customer_search_tsv(c.name, c.email, c.phone, c.external_id)
where c.search_tsv is null;

update public.conversations conv
set search_tsv = public.build_conversation_search_tsv(conv.subject, cust.name, cust.email)
from public.customers cust
where cust.id = conv.customer_id
  and cust.organization_id = conv.organization_id
  and conv.search_tsv is null;

update public.messages m
set search_tsv = to_tsvector('english', coalesce(m.content, ''))
where m.search_tsv is null;

-- ---------------------------------------------------------------------------
-- 4) Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_conversations_search_tsv
  on public.conversations using gin (search_tsv);

create index if not exists idx_conversations_org_status
  on public.conversations (organization_id, status);

create index if not exists idx_conversations_org_priority
  on public.conversations (organization_id, priority);

create index if not exists idx_conversations_org_channel_type
  on public.conversations (organization_id, channel_type);

create index if not exists idx_conversations_org_assigned_member
  on public.conversations (organization_id, assigned_to_member_id)
  where assigned_to_member_id is not null;

create index if not exists idx_messages_search_tsv
  on public.messages using gin (search_tsv);

create index if not exists idx_messages_org_created
  on public.messages (organization_id, created_at desc);

create index if not exists idx_customers_search_tsv
  on public.customers using gin (search_tsv);

create index if not exists idx_customers_org_created
  on public.customers (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) RPC: search_inbox_conversations
-- ---------------------------------------------------------------------------
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
  p_limit int default 20
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
      and (p_status is null or c.status = p_status)
      and (p_priority is null or c.priority = p_priority)
      and (p_channel is null or c.channel_type = p_channel)
      and (
        (not p_unassigned_only and p_assignee_member_id is null)
        or (p_unassigned_only and c.assigned_to_member_id is null)
        or (p_assignee_member_id is not null and c.assigned_to_member_id = p_assignee_member_id)
      )
      and (p_date_from is null or c.last_message_at >= p_date_from)
      and (p_date_to is null or c.last_message_at <= p_date_to)
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

comment on function public.search_inbox_conversations is
  'Org-scoped FTS on conversations with structured filters applied before ranking.';

-- ---------------------------------------------------------------------------
-- 6) RPC: search_inbox_messages
-- ---------------------------------------------------------------------------
create or replace function public.search_inbox_messages(
  p_organization_id uuid,
  p_query text,
  p_inbox_ids uuid[] default null,
  p_view_all_inboxes boolean default true,
  p_include_internal_notes boolean default true,
  p_offset int default 0,
  p_limit int default 20
)
returns table (
  message_id uuid,
  conversation_id uuid,
  content text,
  sender_type text,
  created_at timestamptz,
  conversation_subject text,
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
      m.id as message_id,
      m.conversation_id,
      m.content,
      m.sender_type,
      m.created_at,
      c.subject as conversation_subject,
      cust.name as customer_name,
      cust.email as customer_email,
      (
        ts_rank_cd(m.search_tsv, q.tsq, 32)
        + 0.08 * exp(
          -greatest(0, extract(epoch from (now() - m.created_at)) / 86400.0 / 14)
        )
      )::real as rank,
      ts_headline(
        'english',
        coalesce(m.content, ''),
        q.tsq,
        'MaxWords=35, MinWords=8, StartSel=<mark>, StopSel=</mark>'
      ) as snippet,
      count(*) over() as total_count
    from public.messages m
    inner join public.conversations c
      on c.id = m.conversation_id
      and c.organization_id = m.organization_id
    inner join public.customers cust
      on cust.id = c.customer_id
      and cust.organization_id = c.organization_id
    cross join q
    where m.organization_id = p_organization_id
      and c.status <> 'spam'
      and c.is_spam = false
      and q.tsq <> ''::tsquery
      and m.search_tsv @@ q.tsq
      and (p_include_internal_notes or m.sender_type <> 'internal_note')
      and (
        p_view_all_inboxes
        or c.inbox_id is null
        or c.inbox_id = any(p_inbox_ids)
      )
  )
  select *
  from filtered
  order by rank desc, created_at desc
  offset greatest(0, coalesce(p_offset, 0))
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

comment on function public.search_inbox_messages is
  'Org-scoped FTS on messages; inbox ACL and internal-note policy applied before ranking.';

-- ---------------------------------------------------------------------------
-- 7) RPC: search_inbox_customers
-- ---------------------------------------------------------------------------
create or replace function public.search_inbox_customers(
  p_organization_id uuid,
  p_query text,
  p_offset int default 0,
  p_limit int default 20
)
returns table (
  customer_id uuid,
  name text,
  email text,
  phone text,
  external_id text,
  customer_type text,
  created_at timestamptz,
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
      c.id as customer_id,
      c.name,
      c.email,
      c.phone,
      c.external_id,
      c.customer_type,
      c.created_at,
      ts_rank_cd(c.search_tsv, q.tsq, 32)::real as rank,
      ts_headline(
        'english',
        coalesce(
          nullif(trim(c.name), ''),
          nullif(trim(c.email), ''),
          nullif(trim(c.phone), ''),
          nullif(trim(c.external_id), ''),
          ''
        ),
        q.tsq,
        'MaxWords=25, MinWords=6, StartSel=<mark>, StopSel=</mark>'
      ) as snippet,
      count(*) over() as total_count
    from public.customers c
    cross join q
    where c.organization_id = p_organization_id
      and q.tsq <> ''::tsquery
      and c.search_tsv @@ q.tsq
  )
  select *
  from filtered
  order by rank desc, created_at desc
  offset greatest(0, coalesce(p_offset, 0))
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

comment on function public.search_inbox_customers is
  'Org-scoped FTS on customers (name, email, phone, external_id).';

grant execute on function public.search_inbox_conversations(
  uuid, text, text, text, text, uuid, boolean, uuid[], timestamptz, timestamptz, uuid[], boolean, int, int
) to authenticated, service_role;

grant execute on function public.search_inbox_messages(
  uuid, text, uuid[], boolean, boolean, int, int
) to authenticated, service_role;

grant execute on function public.search_inbox_customers(
  uuid, text, int, int
) to authenticated, service_role;
