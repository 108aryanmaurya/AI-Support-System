-- Teammate permission templates (invite + Roles) stored on org membership, not per-inbox rows.

alter table public.organization_members
  add column if not exists permissions jsonb not null default '{}'::jsonb;

comment on column public.organization_members.permissions is
  'Granular teammate capabilities (copilot, conversation access, settings, inbox actions, reports). Applied from invites and custom roles.';
