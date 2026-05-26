-- Per-organization Resend custom domain (platform-managed multi-tenant email).

create table if not exists public.organization_email_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resend_domain_id text not null,
  subdomain text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'failed')),
  capabilities jsonb not null default '{}'::jsonb,
  dns_records jsonb not null default '[]'::jsonb,
  outbound_from_email text,
  inbound_address text,
  channel_id uuid references public.channels(id) on delete set null,
  resend_api_key_id text,
  resend_api_key_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_email_domains_org_unique unique (organization_id),
  constraint organization_email_domains_subdomain_unique unique (subdomain)
);

create index if not exists idx_organization_email_domains_resend_domain_id
  on public.organization_email_domains (resend_domain_id);

comment on table public.organization_email_domains is
  'Resend domain onboarding per org (DNS verification, send/receive addresses).';
