-- Intercom-style forwarding + optional sending-domain DNS (Resend hybrid).

alter table public.organization_email_domains
  alter column resend_domain_id drop not null,
  alter column subdomain drop not null;

alter table public.organization_email_domains
  add column if not exists setup_mode text not null default 'forwarding'
    check (setup_mode in ('forwarding', 'dns')),
  add column if not exists display_support_email text,
  add column if not exists forwarding_verified_at timestamptz;

update public.organization_email_domains
set setup_mode = 'dns'
where resend_domain_id is not null;

comment on column public.organization_email_domains.setup_mode is
  'forwarding: inbound via platform address + customer mail forward; dns: customer subdomain MX on Resend.';
