-- =============================================================================
-- Multiple customer-facing inboxes: inboxes, inbox_members, conversations.inbox_id
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) inboxes
-- -----------------------------------------------------------------------------
create table if not exists public.inboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_default boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inboxes_name_trim check (length(trim(name)) > 0),
  constraint inboxes_slug_trim check (length(trim(slug)) > 0),
  constraint inboxes_org_slug_unique unique (organization_id, slug)
);

comment on table public.inboxes is
  'Customer-facing communication queues per organization (Support, Sales, etc.).';

create index if not exists idx_inboxes_organization_id
  on public.inboxes (organization_id);

create index if not exists idx_inboxes_org_status
  on public.inboxes (organization_id, status);

-- At most one default inbox per org.
create unique index if not exists idx_inboxes_one_default_per_org
  on public.inboxes (organization_id)
  where is_default = true;

-- -----------------------------------------------------------------------------
-- 2) inbox_members
-- -----------------------------------------------------------------------------
create table if not exists public.inbox_members (
  inbox_id uuid not null references public.inboxes(id) on delete cascade,
  organization_member_id uuid not null references public.organization_members(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'lead')),
  created_at timestamptz not null default now(),
  primary key (inbox_id, organization_member_id)
);

comment on table public.inbox_members is
  'Agents who can access conversations in an inbox.';

create index if not exists idx_inbox_members_member
  on public.inbox_members (organization_member_id);

-- -----------------------------------------------------------------------------
-- 3) conversations.inbox_id
-- -----------------------------------------------------------------------------
alter table public.conversations
  add column if not exists inbox_id uuid references public.inboxes(id) on delete restrict;

comment on column public.conversations.inbox_id is
  'Customer-facing inbox queue owning this conversation (exactly one per thread).';

-- Backfill: default inbox per org, then assign all conversations.
insert into public.inboxes (organization_id, name, slug, status, is_default, settings)
select o.id, 'General', 'general', 'active', true, '{}'::jsonb
from public.organizations o
where not exists (
  select 1 from public.inboxes i where i.organization_id = o.id and i.is_default = true
);

update public.conversations c
set inbox_id = i.id
from public.inboxes i
where c.inbox_id is null
  and i.organization_id = c.organization_id
  and i.is_default = true;

alter table public.conversations
  alter column inbox_id set not null;

create index if not exists idx_conversations_org_inbox_last_message
  on public.conversations (organization_id, inbox_id, last_message_at desc nulls last);

create index if not exists idx_conversations_inbox_status
  on public.conversations (inbox_id, status);

-- -----------------------------------------------------------------------------
-- 4) RLS
-- -----------------------------------------------------------------------------
alter table public.inboxes enable row level security;
alter table public.inbox_members enable row level security;

-- inboxes: org members can read; ADMIN can write (server uses service role for mutations).
create policy inboxes_select_by_org_membership
on public.inboxes
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = inboxes.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy inbox_members_select_by_org_membership
on public.inbox_members
for select
to authenticated
using (
  exists (
    select 1
    from public.inboxes ib
    join public.organization_members om on om.organization_id = ib.organization_id
    where ib.id = inbox_members.inbox_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
);

-- -----------------------------------------------------------------------------
-- 5) updated_at trigger for inboxes
-- -----------------------------------------------------------------------------
create or replace function public.set_inboxes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inboxes_updated_at on public.inboxes;
create trigger trg_inboxes_updated_at
  before update on public.inboxes
  for each row execute function public.set_inboxes_updated_at();
