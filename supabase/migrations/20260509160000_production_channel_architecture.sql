-- Production-grade channel architecture for multi-tenant support.
-- WHY:
-- 1) A conversation must have exactly one channel, and messages inherit it.
-- 2) Channel routing/analytics should be resolved at conversation-level, not per message.
-- 3) Email threading must be deterministic per tenant to avoid cross-org collisions.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) CONVERSATIONS: enforce one-channel-per-conversation architecture
-- ---------------------------------------------------------------------------
-- Add channel_type + channel_id to model "one conversation = one channel".
alter table public.conversations
  add column if not exists channel_type text,
  add column if not exists channel_id uuid,
  add column if not exists last_message_at timestamptz not null default now();

-- Normalize existing rows so channel_type can be required.
-- WHY: older rows may predate channel_type; we map legacy source values.
update public.conversations
set channel_type = case
  when source = 'email' then 'email'
  when source = 'chat' then 'web'
  else 'web'
end
where channel_type is null;

-- Constrain allowed channel values, then require channel_type.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_channel_type_chk'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_channel_type_chk
      check (channel_type in ('email', 'web', 'whatsapp', 'messenger'));
  end if;
end $$;

alter table public.conversations
  alter column channel_type set not null;

-- Keep requested index for sorted inbox retrieval per organization.
create index if not exists idx_conversations_org_last_message
  on public.conversations (organization_id, last_message_at desc);


-- ---------------------------------------------------------------------------
-- 2) CHANNELS: tenant-scoped channel registry
-- ---------------------------------------------------------------------------
-- A tenant can own multiple channels (email inboxes, web widgets, etc.).
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('email', 'web', 'whatsapp', 'messenger')),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_channels_organization_id
  on public.channels (organization_id);

-- Composite uniqueness supports tenant-safe FK from conversations.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'channels_org_id_id_unique'
      and conrelid = 'public.channels'::regclass
  ) then
    alter table public.channels
      add constraint channels_org_id_id_unique unique (organization_id, id);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3) CHANNEL INTEGRATIONS: provider-specific config/secrets
-- ---------------------------------------------------------------------------
-- Stores channel transport configuration (Resend/SendGrid/SES).
create table if not exists public.channel_integrations (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  provider text not null check (provider in ('resend', 'sendgrid', 'ses')),
  config jsonb not null default '{}'::jsonb,
  webhook_secret text,
  created_at timestamptz not null default now()
);

create index if not exists idx_channel_integrations_channel_id
  on public.channel_integrations (channel_id);


-- ---------------------------------------------------------------------------
-- 4) EMAIL THREADS: deterministic email reply threading
-- ---------------------------------------------------------------------------
-- WHY:
-- - thread_key links provider headers/subjects to a stable conversation.
-- - uniqueness is tenant-scoped to prevent collisions across organizations.
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  thread_key text not null,
  subject text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_threads_org_thread_key
  on public.email_threads (organization_id, thread_key);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_threads_thread_key_organization_unique'
      and conrelid = 'public.email_threads'::regclass
  ) then
    alter table public.email_threads
      add constraint email_threads_thread_key_organization_unique
      unique (thread_key, organization_id);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 5) MESSAGES: ensure normalized sender model + metadata/timestamps
-- ---------------------------------------------------------------------------
-- Messages inherit channel context from their conversation.
-- Enforce sender_type contract and required metadata/timestamp columns.
alter table public.messages
  add column if not exists sender_type text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_sender_type_chk'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_sender_type_chk
      check (sender_type in ('customer', 'agent', 'ai', 'system'));
  end if;
end $$;

alter table public.messages
  alter column sender_type set not null;


-- ---------------------------------------------------------------------------
-- 6) CROSS-TENANT SAFETY CONSTRAINTS
-- ---------------------------------------------------------------------------
-- Ensure conversations always reference a channel from the same organization.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_channel_fk'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_channel_fk
      foreign key (organization_id, channel_id)
      references public.channels (organization_id, id)
      on delete set null;
  end if;
end $$;

-- Existing schema already enforces:
-- - message MUST belong to conversation (messages_conversation_fk)
-- - conversation.organization_id matches customer.organization_id
--   (conversations_customer_fk via composite key).
