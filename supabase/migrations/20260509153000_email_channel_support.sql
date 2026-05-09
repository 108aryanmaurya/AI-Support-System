-- Email channel support schema for multi-tenant organizations.
-- Adds generic channels, provider-specific integration config, and
-- email thread mapping to existing customer conversations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- CHANNELS
-- ---------------------------------------------------------------------------
-- One organization can own multiple channels.
-- For now, channel type is constrained to 'email'.
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('email')),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_channels_organization_id
  on public.channels (organization_id);


-- ---------------------------------------------------------------------------
-- CHANNEL INTEGRATIONS
-- ---------------------------------------------------------------------------
-- Stores provider-level credentials and runtime integration metadata per channel.
-- config jsonb can include API key references, domain, sender details, etc.
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
-- EMAIL THREADS
-- ---------------------------------------------------------------------------
-- Maps provider/header-based thread identifiers to a tenant conversation.
-- thread_key should be stable across incoming replies for correct routing.
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  thread_key text not null,
  created_at timestamptz not null default now()
);

-- Required lookup indexes for inbox matching and tenant filtering.
create index if not exists idx_email_threads_organization_id
  on public.email_threads (organization_id);

create index if not exists idx_email_threads_thread_key
  on public.email_threads (thread_key);
