-- Role template description for Teammates → Roles UI.

alter table public.org_teammate_permission_roles
  add column if not exists description text not null default '';

comment on column public.org_teammate_permission_roles.description is
  'Human-readable summary of what teammates with this permission role can do.';

alter table public.org_teammate_permission_roles
  drop constraint if exists org_teammate_permission_roles_description_max;

alter table public.org_teammate_permission_roles
  add constraint org_teammate_permission_roles_description_max
  check (length(description) <= 500);
