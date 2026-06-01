-- Reusable permission templates for teammate invites and inbox membership.

create table if not exists public.org_teammate_permission_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_teammate_permission_roles_name_trim check (length(trim(name)) > 0),
  constraint org_teammate_permission_roles_name_max check (length(trim(name)) <= 64)
);

comment on table public.org_teammate_permission_roles is
  'Named permission templates (Roles tab) applied on invite accept to inbox_members.permissions.';

create unique index if not exists idx_org_teammate_permission_roles_org_name_lower
  on public.org_teammate_permission_roles (organization_id, lower(trim(name)));

create index if not exists idx_org_teammate_permission_roles_org_created
  on public.org_teammate_permission_roles (organization_id, created_at desc);

alter table public.org_teammate_permission_roles enable row level security;

drop policy if exists org_teammate_permission_roles_select_member on public.org_teammate_permission_roles;
drop policy if exists org_teammate_permission_roles_mutate_admin on public.org_teammate_permission_roles;

create policy org_teammate_permission_roles_select_member
on public.org_teammate_permission_roles
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_teammate_permission_roles.organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
);

create policy org_teammate_permission_roles_mutate_admin
on public.org_teammate_permission_roles
for all
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_teammate_permission_roles.organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
      and upper(trim(om.role)) = 'ADMIN'
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_teammate_permission_roles.organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
      and upper(trim(om.role)) = 'ADMIN'
  )
);
