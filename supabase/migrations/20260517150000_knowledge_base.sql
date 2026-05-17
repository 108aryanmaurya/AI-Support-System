-- Phase 2 Sprint 1: knowledge base schema, chunk FTS hooks, RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- knowledge_sources (ingestion origins — file/manual in Sprint 1 schema only)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null
    check (type in ('manual', 'file')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed', 'retrying', 'archived')),
  source_metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by uuid null references public.organization_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_sources_org_status
  on public.knowledge_sources (organization_id, status)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- knowledge_articles
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid null references public.knowledge_sources(id) on delete set null,
  title text not null,
  slug text not null,
  visibility text not null default 'internal'
    check (visibility in ('public', 'internal', 'restricted')),
  status text not null default 'draft'
    check (status in ('draft', 'review_pending', 'approved', 'published', 'archived')),
  published_version_id uuid null,
  source_metadata jsonb not null default '{}'::jsonb,
  content_hash text null,
  tags text[] not null default '{}'::text[],
  created_by uuid null references public.organization_members(id) on delete set null,
  deleted_at timestamptz null,
  deleted_by uuid null references public.organization_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_articles_title_len check (char_length(title) between 1 and 500),
  constraint knowledge_articles_slug_len check (char_length(slug) between 1 and 200)
);

create unique index if not exists idx_knowledge_articles_org_slug_active
  on public.knowledge_articles (organization_id, slug)
  where deleted_at is null;

create index if not exists idx_knowledge_articles_org_status
  on public.knowledge_articles (organization_id, status)
  where deleted_at is null;

create index if not exists idx_knowledge_articles_org_updated
  on public.knowledge_articles (organization_id, updated_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- article_versions (immutable snapshots)
-- ---------------------------------------------------------------------------
create table if not exists public.article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.knowledge_articles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_number int not null,
  content text not null,
  content_hash text not null,
  created_by uuid null references public.organization_members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint article_versions_content_len check (char_length(content) <= 500000),
  constraint article_versions_version_positive check (version_number > 0),
  unique (article_id, version_number)
);

create index if not exists idx_article_versions_article
  on public.article_versions (article_id, version_number desc);

alter table public.knowledge_articles
  drop constraint if exists knowledge_articles_published_version_id_fkey;

alter table public.knowledge_articles
  add constraint knowledge_articles_published_version_id_fkey
  foreign key (published_version_id) references public.article_versions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- knowledge_chunks (retrieval unit + FTS)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  article_version_id uuid not null references public.article_versions(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  token_count int not null default 0,
  start_offset int not null default 0,
  end_offset int not null default 0,
  checksum text not null,
  metadata jsonb not null default '{}'::jsonb,
  content_tsv tsvector,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_index_nonneg check (chunk_index >= 0),
  constraint knowledge_chunks_content_len check (char_length(content) <= 10000),
  unique (article_version_id, chunk_index)
);

create index if not exists idx_knowledge_chunks_version
  on public.knowledge_chunks (article_version_id, chunk_index);

create index if not exists idx_knowledge_chunks_org
  on public.knowledge_chunks (organization_id);

create index if not exists idx_knowledge_chunks_content_tsv
  on public.knowledge_chunks using gin (content_tsv);

-- Maintain search vector on chunk insert/update.
create or replace function public.knowledge_chunks_set_content_tsv()
returns trigger
language plpgsql
as $$
begin
  new.content_tsv := to_tsvector('english', coalesce(new.content, ''));
  return new;
end;
$$;

drop trigger if exists trg_knowledge_chunks_content_tsv on public.knowledge_chunks;

create trigger trg_knowledge_chunks_content_tsv
before insert or update of content on public.knowledge_chunks
for each row
execute function public.knowledge_chunks_set_content_tsv();

-- ---------------------------------------------------------------------------
-- tag_definitions, conversation_tags, customer_tags (schema for Sprint 2+)
-- ---------------------------------------------------------------------------
create table if not exists public.tag_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  created_at timestamptz not null default now(),
  constraint tag_definitions_name_len check (char_length(name) between 1 and 64),
  unique (organization_id, name)
);

create index if not exists idx_tag_definitions_org
  on public.tag_definitions (organization_id);

create table if not exists public.conversation_tags (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  tag_id uuid not null references public.tag_definitions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, tag_id)
);

create index if not exists idx_conversation_tags_org_tag
  on public.conversation_tags (organization_id, tag_id);

create table if not exists public.customer_tags (
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag_id uuid not null references public.tag_definitions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

create index if not exists idx_customer_tags_org_tag
  on public.customer_tags (organization_id, tag_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.article_versions enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.tag_definitions enable row level security;
alter table public.conversation_tags enable row level security;
alter table public.customer_tags enable row level security;

-- knowledge_sources
create policy knowledge_sources_select_by_org_membership
on public.knowledge_sources for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_sources.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy knowledge_sources_insert_by_org_membership
on public.knowledge_sources for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_sources.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy knowledge_sources_update_by_org_membership
on public.knowledge_sources for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_sources.organization_id
      and om.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_sources.organization_id
      and om.status = 'ACTIVE'
  )
);

-- knowledge_articles
create policy knowledge_articles_select_by_org_membership
on public.knowledge_articles for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_articles.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy knowledge_articles_insert_by_org_membership
on public.knowledge_articles for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_articles.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy knowledge_articles_update_by_org_membership
on public.knowledge_articles for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_articles.organization_id
      and om.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_articles.organization_id
      and om.status = 'ACTIVE'
  )
);

-- article_versions
create policy article_versions_select_by_org_membership
on public.article_versions for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = article_versions.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy article_versions_insert_by_org_membership
on public.article_versions for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = article_versions.organization_id
      and om.status = 'ACTIVE'
  )
);

-- knowledge_chunks
create policy knowledge_chunks_select_by_org_membership
on public.knowledge_chunks for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_chunks.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy knowledge_chunks_insert_by_org_membership
on public.knowledge_chunks for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_chunks.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy knowledge_chunks_delete_by_org_membership
on public.knowledge_chunks for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = knowledge_chunks.organization_id
      and om.status = 'ACTIVE'
  )
);

-- tag_definitions
create policy tag_definitions_select_by_org_membership
on public.tag_definitions for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = tag_definitions.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy tag_definitions_insert_by_org_membership
on public.tag_definitions for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = tag_definitions.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy tag_definitions_update_by_org_membership
on public.tag_definitions for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = tag_definitions.organization_id
      and om.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = tag_definitions.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy tag_definitions_delete_by_org_membership
on public.tag_definitions for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = tag_definitions.organization_id
      and om.status = 'ACTIVE'
  )
);

-- conversation_tags
create policy conversation_tags_select_by_org_membership
on public.conversation_tags for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = conversation_tags.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy conversation_tags_insert_by_org_membership
on public.conversation_tags for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = conversation_tags.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy conversation_tags_delete_by_org_membership
on public.conversation_tags for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = conversation_tags.organization_id
      and om.status = 'ACTIVE'
  )
);

-- customer_tags
create policy customer_tags_select_by_org_membership
on public.customer_tags for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = customer_tags.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy customer_tags_insert_by_org_membership
on public.customer_tags for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = customer_tags.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy customer_tags_delete_by_org_membership
on public.customer_tags for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = customer_tags.organization_id
      and om.status = 'ACTIVE'
  )
);

comment on table public.knowledge_articles is
  'Org-scoped knowledge base articles with versioning and soft delete.';
comment on table public.knowledge_chunks is
  'Chunk-level retrieval units; content_tsv powers FTS (Phase 2 Sprint 2 search).';
