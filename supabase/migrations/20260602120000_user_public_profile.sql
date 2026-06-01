-- Public teammate profile fields (view/edit on /org/:orgId/admins/teammate/:memberId).

alter table public.users
  add column if not exists profile jsonb not null default '{}'::jsonb;

comment on column public.users.profile is
  'Public profile: location, department, phone, bio, calendar_url, alias, privacy toggles.';
