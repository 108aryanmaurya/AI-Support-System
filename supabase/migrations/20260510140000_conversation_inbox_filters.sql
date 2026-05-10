-- Advanced inbox filtering: creator org membership, spam flag, priority default,
-- metadata query support, and conversation list indexes.
--
-- Notes:
-- - Assignment remains organization-scoped via assigned_to_member_id (indexed).
-- - Status check constraint already allows open | closed | snoozed (unchanged).
-- - Renames legacy created_by_user_id → created_by and enforces org membership.

-- Referenced by conversations_created_by_org_member_fk (same pair as UNIQUE user_id, different column order).
create unique index if not exists idx_organization_members_org_user_unique
  on public.organization_members (organization_id, user_id);

-- Spam flag for inbox filters.
alter table public.conversations
  add column if not exists is_spam boolean not null default false;

-- Priority: backfill nulls and align default with product expectation.
update public.conversations
set priority = 'normal'
where priority is null;

alter table public.conversations
  alter column priority set default 'normal';

-- Legacy column → canonical name (FK to users replaced by org-member composite FK below).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'created_by_user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'created_by'
  ) then
    alter table public.conversations drop constraint if exists conversations_created_by_user_id_fkey;

    update public.conversations c
    set created_by_user_id = null
    where created_by_user_id is not null
      and not exists (
        select 1
        from public.organization_members om
        where om.organization_id = c.organization_id
          and om.user_id = c.created_by_user_id
      );

    alter table public.conversations rename column created_by_user_id to created_by;
  end if;
end $$;

-- Org-valid creator: (organization_id, created_by) must match a row in organization_members.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_created_by_org_member_fk'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_created_by_org_member_fk
      foreign key (organization_id, created_by)
      references public.organization_members (organization_id, user_id)
      on delete set null;
  end if;
end $$;

-- Indexes for filter/sort paths (assigned_to_member_id already has idx_conversations_assigned_member).
create index if not exists idx_conversations_created_by
  on public.conversations (created_by);

create index if not exists idx_conversations_is_spam
  on public.conversations (is_spam);

create index if not exists idx_conversations_org_status_assigned_member
  on public.conversations (organization_id, status, assigned_to_member_id);

-- Optional JSON filters (tags / classification stored under metadata).
create index if not exists idx_conversations_metadata_gin
  on public.conversations using gin (metadata);

comment on column public.conversations.created_by is
  'User who created the conversation; must reference organization_members for organization_id (nullable).';

comment on column public.conversations.is_spam is
  'Spam classification flag for inbox filtering.';

comment on column public.conversations.priority is
  'Human or automated routing priority; defaults to normal.';

comment on column public.conversations.metadata is
  'JSON metadata for AI tags, classification, and integration-specific fields.';
