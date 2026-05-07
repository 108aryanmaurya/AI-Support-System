-- Core conversation system tables for multi-tenant support platform.
-- Design principles:
-- 1) users.id is global identity
-- 2) organization_members.id is org-scoped operational identity
-- 3) assignment and agent sending use organization_members
-- 4) organization_id is present on every tenant table

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
-- Represents end customers contacting support. Supports anonymous contacts
-- (email nullable) and future integration mapping via external_id.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text,
  email text,
  name text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Needed for composite FK enforcement in child tables.
alter table public.customers
  add constraint customers_org_id_id_unique unique (organization_id, id);

-- Query patterns: customer lookup in org by email.
create index if not exists idx_customers_org_email
  on public.customers (organization_id, email);

-- Optional helper index for external customer mapping per org.
create index if not exists idx_customers_org_external_id
  on public.customers (organization_id, external_id);


-- ---------------------------------------------------------------------------
-- CONVERSATIONS
-- ---------------------------------------------------------------------------
-- Core support thread. Contains assignment and lifecycle/status metadata.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  assigned_to_member_id uuid,
  status text not null default 'open' check (status in ('open', 'closed', 'snoozed')),
  priority text,
  source text not null check (source in ('chat', 'email', 'api')),
  last_message_at timestamptz not null default now(),
  created_by_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- Enforce customer tenant match with conversation tenant.
  constraint conversations_customer_fk
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id)
    on delete restrict
);

-- Needed so messages can enforce conversation tenant match with composite FK.
alter table public.conversations
  add constraint conversations_org_id_id_unique unique (organization_id, id);

-- Ensure assignment member belongs to same organization.
-- (organization_members must expose (organization_id, id) uniqueness)
alter table public.organization_members
  add constraint organization_members_org_id_id_unique unique (organization_id, id);

alter table public.conversations
  add constraint conversations_assigned_member_fk
  foreign key (organization_id, assigned_to_member_id)
  references public.organization_members (organization_id, id)
  on delete set null;

create index if not exists idx_conversations_org_last_message
  on public.conversations (organization_id, last_message_at desc);

create index if not exists idx_conversations_assigned_member
  on public.conversations (assigned_to_member_id);

create index if not exists idx_conversations_customer
  on public.conversations (customer_id);


-- ---------------------------------------------------------------------------
-- MESSAGES
-- ---------------------------------------------------------------------------
-- Every message in a conversation. Sender model supports customer, agent, ai,
-- and system messages. Tenant consistency is enforced by composite FK.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  sender_type text not null check (sender_type in ('customer', 'agent', 'ai', 'system')),
  sender_user_id uuid references public.users(id) on delete set null,
  sender_member_id uuid,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- Enforce conversation and message tenant alignment.
  constraint messages_conversation_fk
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id)
    on delete cascade,

  -- Ensure agent/member identity belongs to same org when present.
  constraint messages_sender_member_fk
    foreign key (organization_id, sender_member_id)
    references public.organization_members (organization_id, id)
    on delete set null,

  -- Sender contract:
  -- - agent: sender_member_id required
  -- - customer: sender_member_id must be null
  -- - ai/system: sender_user_id and sender_member_id optional; typically null
  constraint messages_sender_rules_chk check (
    (sender_type = 'agent' and sender_member_id is not null)
    or (sender_type = 'customer' and sender_member_id is null)
    or (sender_type in ('ai', 'system'))
  )
);

create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at);

create index if not exists idx_messages_organization
  on public.messages (organization_id);


-- ---------------------------------------------------------------------------
-- MAINTENANCE TRIGGER: keep conversations.last_message_at in sync
-- ---------------------------------------------------------------------------
create or replace function public.touch_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
  where id = new.conversation_id
    and organization_id = new.organization_id;
  return new;
end;
$$;

drop trigger if exists trg_messages_touch_conversation_last_message_at on public.messages;

create trigger trg_messages_touch_conversation_last_message_at
after insert on public.messages
for each row
execute procedure public.touch_conversation_last_message_at();
