-- Team inbox assignment (queue ownership) separate from conversation routing inbox_id.

alter table public.conversations
  add column if not exists team_inbox_id uuid references public.inboxes(id) on delete set null;

comment on column public.conversations.team_inbox_id is
  'Team inbox queue this conversation is assigned to; unassigned when both assignee and team_inbox_id are null.';

create index if not exists idx_conversations_team_inbox_id
  on public.conversations (team_inbox_id)
  where team_inbox_id is not null;

create index if not exists idx_conversations_org_unassigned_queue
  on public.conversations (organization_id, status)
  where assigned_to_member_id is null and team_inbox_id is null;
