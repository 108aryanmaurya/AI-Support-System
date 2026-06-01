-- Remove workspace owner flags; creator provenance remains on organizations.created_by.

alter table public.organization_members
  drop column if exists is_owner;

alter table public.organizations
  drop column if exists owner_user_id;

drop index if exists public.idx_organizations_owner_user_id;
