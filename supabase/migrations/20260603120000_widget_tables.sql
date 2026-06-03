-- Embeddable messenger widget: installations, visitors, sessions (server-only access via service role).

create table if not exists public.widget_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  widget_key text not null,
  secret_hash text not null,
  secret_encrypted text,
  allowed_domains text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'disabled')),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rotated_at timestamptz
);

create unique index if not exists idx_widget_installations_widget_key
  on public.widget_installations (widget_key);

create index if not exists idx_widget_installations_org
  on public.widget_installations (organization_id);

comment on table public.widget_installations is 'Per-org embeddable widget config; widget_key is public in HTML snippet.';

create table if not exists public.widget_visitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  installation_id uuid not null references public.widget_installations (id) on delete cascade,
  visitor_token text not null,
  customer_id uuid references public.customers (id) on delete set null,
  email text,
  name text,
  metadata jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_ip_hash text
);

create unique index if not exists idx_widget_visitors_installation_token
  on public.widget_visitors (installation_id, visitor_token);

create index if not exists idx_widget_visitors_customer
  on public.widget_visitors (customer_id)
  where customer_id is not null;

create table if not exists public.widget_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.widget_visitors (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_widget_sessions_visitor_expires
  on public.widget_sessions (visitor_id, expires_at desc);

create index if not exists idx_widget_sessions_org_created
  on public.widget_sessions (organization_id, created_at desc);

alter table public.widget_installations enable row level security;
alter table public.widget_visitors enable row level security;
alter table public.widget_sessions enable row level security;

-- No policies: widget data accessed only via service role on API server.
