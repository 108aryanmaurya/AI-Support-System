-- =============================================================================
-- Repair: invites.inbox_id + invites.permissions (Supabase SQL Editor)
-- =============================================================================
-- Run this if batch invites fail with:
--   "Could not find the 'inbox_id' column of 'invites' in the schema cache"
--
-- Prerequisites: `public.inboxes` must exist. If not, run first:
--   supabase/migrations/20260530100000_multiple_inboxes.sql
-- =============================================================================

alter table public.invites
  add column if not exists inbox_id uuid references public.inboxes(id) on delete set null;

comment on column public.invites.inbox_id is
  'Team inbox to add the member to when the invite is accepted.';

create index if not exists idx_invites_inbox_id
  on public.invites (inbox_id)
  where inbox_id is not null;

alter table public.invites
  add column if not exists permissions jsonb not null default '{}'::jsonb;

comment on column public.invites.permissions is
  'Permissions to apply to inbox_members when the invite is accepted.';

alter table public.inbox_members
  add column if not exists permissions jsonb not null default '{}'::jsonb;

comment on column public.inbox_members.permissions is
  'Granular inbox-scoped capabilities for this member.';

alter table public.invites
  add column if not exists inbox_ids jsonb not null default '[]'::jsonb;

comment on column public.invites.inbox_ids is
  'Target inbox UUIDs; invitees are added only to these inboxes on accept.';

update public.invites
set inbox_ids = jsonb_build_array(inbox_id::text)
where inbox_id is not null
  and (inbox_ids is null or inbox_ids = '[]'::jsonb or jsonb_array_length(inbox_ids) = 0);

-- Refresh PostgREST schema cache (Supabase API)
notify pgrst, 'reload schema';
