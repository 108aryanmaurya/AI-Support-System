-- Dynamic workspace roles (no ADMIN/AGENT enum). Permission enforcement deferred to
-- organization_members.permissions (application layer).

-- -----------------------------------------------------------------------------
-- 1) Drop legacy role enums
-- -----------------------------------------------------------------------------
alter table public.organization_members
  drop constraint if exists organization_members_role_check;

alter table public.invites
  drop constraint if exists invites_role_check;

comment on column public.organization_members.role is
  'Display label or template role name for the member (not used for server auth gates until permissions JSON is enforced).';

comment on column public.invites.role is
  'Role label stored on the invite (e.g. template name); applied to organization_members.role on accept.';

-- -----------------------------------------------------------------------------
-- 2) RLS — invites: any ACTIVE org member (was ADMIN-only)
-- -----------------------------------------------------------------------------
drop policy if exists invites_select_admin on public.invites;
drop policy if exists invites_insert_admin on public.invites;
drop policy if exists invites_update_admin on public.invites;
drop policy if exists invites_delete_admin on public.invites;

create policy invites_select_member
on public.invites
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
);

create policy invites_insert_member
on public.invites
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
);

create policy invites_update_member
on public.invites
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
);

create policy invites_delete_member
on public.invites
for delete
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = invites.organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
);

-- -----------------------------------------------------------------------------
-- 3) RLS — organizations update: any ACTIVE member (was ADMIN)
-- -----------------------------------------------------------------------------
drop policy if exists organizations_update_admin on public.organizations;

create policy organizations_update_member
on public.organizations
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
);

-- -----------------------------------------------------------------------------
-- 4) RLS — org_teammate_permission_roles: any ACTIVE member
-- -----------------------------------------------------------------------------
drop policy if exists org_teammate_permission_roles_mutate_admin on public.org_teammate_permission_roles;

create policy org_teammate_permission_roles_mutate_member
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
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_teammate_permission_roles.organization_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
);
