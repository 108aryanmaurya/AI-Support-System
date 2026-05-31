-- Multiple target inboxes per invite; empty array = all active org inboxes on accept.

alter table public.invites
  add column if not exists inbox_ids jsonb not null default '[]'::jsonb;

comment on column public.invites.inbox_ids is
  'Target inbox UUIDs (JSON array of strings). Empty array = member is added to all active org inboxes on accept.';

-- Backfill legacy single inbox_id into inbox_ids
update public.invites
set inbox_ids = jsonb_build_array(inbox_id::text)
where inbox_id is not null
  and (
    inbox_ids is null
    or inbox_ids = '[]'::jsonb
    or jsonb_array_length(inbox_ids) = 0
  );
