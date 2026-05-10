-- =============================================================================
-- Multi-organization SaaS schema: organizations, organization_members, invites
-- =============================================================================
--
-- Signup / auth:
--   public.handle_new_user() continues to sync public.users only — it does NOT
--   create organizations or memberships (see 20260507120000_onboarding_schema.sql).
--
-- RLS summary:
--   organizations   — SELECT if member; INSERT if created_by = auth.uid();
--                     UPDATE if ADMIN (ACTIVE) in that org.
--   organization_members — SELECT own rows only (existing policy retained).
--   invites         — ADMIN-only SELECT / INSERT / UPDATE / DELETE for that org.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) organizations: provenance column (nullable for legacy rows)
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists created_by uuid references auth.users(id) on delete set null;

comment on column public.organizations.created_by is
  'auth.users id of the user who created the organization (nullable for data predating this column).';

create index if not exists idx_organizations_created_by
  on public.organizations (created_by)
  where created_by is not null;

-- -----------------------------------------------------------------------------
-- 2) organization_members: ACTIVE | INVITED, ADMIN | AGENT, FK → auth.users
-- -----------------------------------------------------------------------------

-- Status (existing deployments default everyone to ACTIVE).
alter table public.organization_members
  add column if not exists status text;

update public.organization_members
set status = 'ACTIVE'
where status is null;

alter table public.organization_members
  alter column status set default 'ACTIVE';

alter table public.organization_members
  alter column status set not null;

alter table public.organization_members
  drop constraint if exists organization_members_status_check;

alter table public.organization_members
  add constraint organization_members_status_check
  check (status in ('ACTIVE', 'INVITED'));

-- Role enum: must DROP legacy check first — values like 'ADMIN' violate the old
-- (admin|agent) constraint until we normalize row data.
alter table public.organization_members
  drop constraint if exists organization_members_role_check;

update public.organization_members
set role = case lower(trim(role))
  when 'admin' then 'ADMIN'
  when 'agent' then 'AGENT'
  else upper(trim(role))
end
where role is not null;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('ADMIN', 'AGENT'));

-- Point membership.user_id at auth.users (same UUID domain as public.users.id).
alter table public.organization_members
  drop constraint if exists organization_members_user_id_fkey;

alter table public.organization_members
  add constraint organization_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Cover membership lookups by org + role (invites, admin tooling).
create index if not exists idx_organization_members_org_role
  on public.organization_members (organization_id, role)
  where status = 'ACTIVE';

create index if not exists idx_organization_members_org_status
  on public.organization_members (organization_id, status);

-- -----------------------------------------------------------------------------
-- 3) invites
-- -----------------------------------------------------------------------------
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('ADMIN', 'AGENT')),
  token text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'EXPIRED')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invites_token_unique unique (token),
  constraint invites_email_trim check (length(trim(email)) > 0)
);

comment on table public.invites is
  'Organization invitations; acceptance flows should validate token server-side and expire rows deterministically.';

create index if not exists idx_invites_organization_id
  on public.invites (organization_id);

create index if not exists idx_invites_org_status_created
  on public.invites (organization_id, status, created_at desc);

create index if not exists idx_invites_pending_expires
  on public.invites (expires_at)
  where status = 'PENDING';

create index if not exists idx_invites_email_lower
  on public.invites (lower(trim(email)));

-- At most one outstanding pending invite per org + email (case-insensitive).
create unique index if not exists idx_invites_one_pending_email_per_org
  on public.invites (organization_id, lower(trim(email)))
  where status = 'PENDING';

-- -----------------------------------------------------------------------------
-- 4) RLS — organizations (member visibility + creator bootstrap insert)
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;

drop policy if exists organizations_select_member on public.organizations;
drop policy if exists organizations_insert_creator on public.organizations;
drop policy if exists organizations_update_admin on public.organizations;

-- Members can read organizations they belong to.
create policy organizations_select_member
on public.organizations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = auth.uid()
  )
);

-- Authenticated users may create an org row when they record themselves as creator
-- (bootstrap before membership row exists). Server-side flows may still use service_role.
create policy organizations_insert_creator
on public.organizations
for insert
to authenticated
with check (created_by = auth.uid());

-- ADMIN may update tenant-facing fields (e.g. name).
create policy organizations_update_admin
on public.organizations
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = auth.uid()
      and om.role = 'ADMIN'
      and om.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = auth.uid()
      and om.role = 'ADMIN'
      and om.status = 'ACTIVE'
  )
);

-- -----------------------------------------------------------------------------
-- 5) RLS — invites (ADMIN-only)
-- -----------------------------------------------------------------------------
alter table public.invites enable row level security;

drop policy if exists invites_select_admin on public.invites;
drop policy if exists invites_insert_admin on public.invites;
drop policy if exists invites_update_admin on public.invites;
drop policy if exists invites_delete_admin on public.invites;

create policy invites_select_admin
on public.invites
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.role = 'ADMIN'
      and om.status = 'ACTIVE'
  )
);

create policy invites_insert_admin
on public.invites
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.role = 'ADMIN'
      and om.status = 'ACTIVE'
  )
);

create policy invites_update_admin
on public.invites
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.role = 'ADMIN'
      and om.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.role = 'ADMIN'
      and om.status = 'ACTIVE'
  )
);

create policy invites_delete_admin
on public.invites
for delete
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.role = 'ADMIN'
      and om.status = 'ACTIVE'
  )
);
