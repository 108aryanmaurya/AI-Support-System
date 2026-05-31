-- Per-member inbox capabilities (invite flow + team inbox membership).

alter table public.inbox_members
  add column if not exists permissions jsonb not null default '{}'::jsonb;

comment on column public.inbox_members.permissions is
  'Granular inbox-scoped capabilities (copilot, conversation access, settings, inbox actions, reports, etc.).';

alter table public.invites
  add column if not exists permissions jsonb not null default '{}'::jsonb;

comment on column public.invites.permissions is
  'Permissions to apply to inbox_members when the invite is accepted.';
