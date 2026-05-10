-- =============================================================================
-- Legacy users: ADMIN membership + provenance; document signup hook (no auto-org)
-- =============================================================================
--
-- CONTEXT
--   Older deployments created organizations via the API (onboarding / org flows).
--   Some rows may lack organizations.created_by or have AGENT on the creator row.
--   Database signup hook `handle_new_user` ONLY inserts into public.users — it never
--   creates organizations (see ONBOARDING SCHEMA migration).
--
-- GOALS (idempotent — safe to re-run)
--   1) Backfill organizations.created_by where possible.
--   2) Ensure creator has organization_members (ADMIN, ACTIVE).
--   3) Ensure creator row is ADMIN / ACTIVE for every organization they created.
--   4) Document handle_new_user() so operators know it does not create orgs.
--
-- SAFE STEPS (operators)
--   1. Take a backup or run against staging first.
--   2. Apply migrations in order (after multi_organization_saas.sql).
--   3. OPTIONAL verification queries at bottom (run manually in SQL editor).
--
-- LIMITATIONS
--   • Users with no organization_members and no inferable org cannot be fixed here
--     without inventing organizations (skipped by design).
--   • Multi-member orgs without created_by: picks earliest ACTIVE member, preferring ADMIN.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Document signup hook — no automatic organization creation
-- -----------------------------------------------------------------------------
comment on function public.handle_new_user() is
  'Syncs auth.users → public.users only. Does NOT create organizations or organization_members.';

-- -----------------------------------------------------------------------------
-- 2) Backfill organizations.created_by (sole ACTIVE member first — clearest owner)
-- -----------------------------------------------------------------------------
update public.organizations o
set created_by = sub.user_id
from (
  select
    om.organization_id,
    (array_agg(om.user_id order by om.created_at asc nulls last))[1] as user_id
  from public.organization_members om
  where om.status = 'ACTIVE'
  group by om.organization_id
  having count(*) = 1
) sub
where o.created_by is null
  and o.id = sub.organization_id;

-- -----------------------------------------------------------------------------
-- 3) Backfill organizations.created_by (multi-member: prefer ADMIN, then oldest)
-- -----------------------------------------------------------------------------
with ranked as (
  select distinct on (om.organization_id)
    om.organization_id,
    om.user_id
  from public.organization_members om
  where om.status = 'ACTIVE'
  order by
    om.organization_id,
    case when upper(trim(om.role)) = 'ADMIN' then 0 else 1 end,
    om.created_at asc nulls last
)
update public.organizations o
set created_by = ranked.user_id
from ranked
where o.created_by is null
  and o.id = ranked.organization_id;

-- -----------------------------------------------------------------------------
-- 4) Insert missing membership row for documented creator (ADMIN, ACTIVE)
-- -----------------------------------------------------------------------------
insert into public.organization_members (user_id, organization_id, role, status)
select o.created_by, o.id, 'ADMIN', 'ACTIVE'
from public.organizations o
where o.created_by is not null
  and not exists (
    select 1
    from public.organization_members om
    where om.organization_id = o.id
      and om.user_id = o.created_by
  )
on conflict (user_id, organization_id) do nothing;

-- -----------------------------------------------------------------------------
-- 5) Ensure creators are ADMIN + ACTIVE (normalize legacy AGENT / INVITED on creator)
-- -----------------------------------------------------------------------------
update public.organization_members om
set
  role = 'ADMIN',
  status = 'ACTIVE'
from public.organizations o
where om.organization_id = o.id
  and om.user_id = o.created_by
  and o.created_by is not null
  and (
    upper(trim(om.role)) is distinct from 'ADMIN'
    or om.status is distinct from 'ACTIVE'
  );

-- =============================================================================
-- OPTIONAL manual verification (run after migrate)
-- =============================================================================
-- Creators missing ADMIN:
--   select o.id, o.name, o.created_by, om.role, om.status
--   from public.organizations o
--   left join public.organization_members om
--     on om.organization_id = o.id and om.user_id = o.created_by
--   where o.created_by is not null
--     and (om.id is null or upper(trim(om.role)) <> 'ADMIN' or om.status <> 'ACTIVE');
--
-- Orgs still missing created_by:
--   select o.id, o.name from public.organizations o where o.created_by is null;
-- =============================================================================
