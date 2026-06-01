-- =============================================================================
-- Super organizations: account container for multiple workspace organizations
-- =============================================================================
--
-- Signup creates public.users only (unchanged). Workspaces (organizations) are
-- created via POST /api/org/create and belong to a super_organization row owned
-- by the creator. Invite acceptance adds organization_members only — no new org
-- or super_organization for the invitee.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) super_organizations
-- -----------------------------------------------------------------------------
create table if not exists public.super_organizations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.super_organizations is
  'Billing/account container. One per user who creates workspaces; holds multiple organizations.';

create index if not exists idx_super_organizations_created_by
  on public.super_organizations (created_by);

-- -----------------------------------------------------------------------------
-- 2) organizations → super_organizations, owner_user_id
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists super_organization_id uuid references public.super_organizations(id) on delete restrict;

alter table public.organizations
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

comment on column public.organizations.super_organization_id is
  'Parent super-organization; all workspaces created by the same account owner share one super org.';

comment on column public.organizations.owner_user_id is
  'auth.users id of the workspace owner (set when the org is created via Create Organization flow).';

create index if not exists idx_organizations_super_organization_id
  on public.organizations (super_organization_id)
  where super_organization_id is not null;

create index if not exists idx_organizations_owner_user_id
  on public.organizations (owner_user_id)
  where owner_user_id is not null;

-- -----------------------------------------------------------------------------
-- 3) organization_members.is_owner (creator membership flag)
-- -----------------------------------------------------------------------------
alter table public.organization_members
  add column if not exists is_owner boolean not null default false;

comment on column public.organization_members.is_owner is
  'True for the user who created this workspace (full permissions, not revocable via invite templates).';

-- -----------------------------------------------------------------------------
-- 4) Backfill legacy data
-- -----------------------------------------------------------------------------

-- One super_organization per distinct organizations.created_by (when set).
insert into public.super_organizations (id, created_by, created_at)
select gen_random_uuid(), o.created_by, min(o.created_at)
from public.organizations o
where o.created_by is not null
  and not exists (
    select 1
    from public.super_organizations s
    where s.created_by = o.created_by
  )
group by o.created_by;

-- Orgs with created_by → link to that user's super_organization.
update public.organizations o
set super_organization_id = s.id
from public.super_organizations s
where o.super_organization_id is null
  and o.created_by is not null
  and s.created_by = o.created_by;

-- Remaining orgs (missing created_by): attach to existing or new super_org per resolved owner.
do $$
declare
  r record;
  v_owner_id uuid;
  v_super_id uuid;
begin
  for r in
    select o.id as org_id, o.created_at
    from public.organizations o
    where o.super_organization_id is null
  loop
    select coalesce(
      (select o2.created_by from public.organizations o2 where o2.id = r.org_id),
      (
        select om.user_id
        from public.organization_members om
        where om.organization_id = r.org_id
          and om.status = 'ACTIVE'
        order by
          case when om.role = 'ADMIN' then 0 else 1 end,
          om.created_at asc
        limit 1
      )
    )
    into v_owner_id;

    if v_owner_id is null then
      continue;
    end if;

    select s.id
    into v_super_id
    from public.super_organizations s
    where s.created_by = v_owner_id
    order by s.created_at asc
    limit 1;

    if v_super_id is null then
      insert into public.super_organizations (created_by, created_at)
      values (v_owner_id, r.created_at)
      returning id into v_super_id;
    end if;

    update public.organizations
    set
      super_organization_id = v_super_id,
      owner_user_id = coalesce(owner_user_id, v_owner_id)
    where id = r.org_id;
  end loop;
end $$;

-- owner_user_id from created_by where missing.
update public.organizations o
set owner_user_id = o.created_by
where o.owner_user_id is null
  and o.created_by is not null;

update public.organizations o
set owner_user_id = om.user_id
from public.organization_members om
where o.owner_user_id is null
  and om.organization_id = o.id
  and om.status = 'ACTIVE'
  and om.role = 'ADMIN'
  and om.created_at = (
    select min(om2.created_at)
    from public.organization_members om2
    where om2.organization_id = o.id
      and om2.status = 'ACTIVE'
      and om2.role = 'ADMIN'
  );

-- Creator membership is_owner.
update public.organization_members om
set is_owner = true
from public.organizations o
where om.organization_id = o.id
  and om.user_id = o.owner_user_id
  and o.owner_user_id is not null
  and om.is_owner = false;

-- -----------------------------------------------------------------------------
-- 5) NOT NULL on super_organization_id for new rows (after backfill)
-- -----------------------------------------------------------------------------
alter table public.organizations
  alter column super_organization_id set not null;

-- -----------------------------------------------------------------------------
-- 6) RLS — super_organizations
-- -----------------------------------------------------------------------------
alter table public.super_organizations enable row level security;

drop policy if exists super_organizations_select_member on public.super_organizations;
drop policy if exists super_organizations_insert_creator on public.super_organizations;

create policy super_organizations_select_member
on public.super_organizations
for select
to authenticated
using (
  exists (
    select 1
    from public.organizations org
    join public.organization_members om on om.organization_id = org.id
    where org.super_organization_id = super_organizations.id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  )
  or created_by = auth.uid()
);

create policy super_organizations_insert_creator
on public.super_organizations
for insert
to authenticated
with check (created_by = auth.uid());
