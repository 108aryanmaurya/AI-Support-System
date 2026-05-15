-- Conversation workspace: extended status, priority enum, assignment_type vs member rules.

-- ---------------------------------------------------------------------------
-- 1) assignment_type (queue semantics)
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists assignment_type text not null default 'unassigned';

update public.conversations
set assignment_type = case
  when assigned_to_member_id is null then 'unassigned'
  else 'assigned_to_agent'
end;

-- ---------------------------------------------------------------------------
-- 2) Drop old CHECK constraints BEFORE changing status/priority values
--    (legacy status only allowed open|closed|snoozed — pending/spam would fail)
-- ---------------------------------------------------------------------------
alter table public.conversations drop constraint if exists conversations_status_check;
alter table public.conversations drop constraint if exists conversations_priority_check;
alter table public.conversations drop constraint if exists conversations_assignment_type_check;
alter table public.conversations drop constraint if exists conversations_assignment_member_chk;

-- ---------------------------------------------------------------------------
-- 3) Migrate legacy status / priority (safe now that old checks are gone)
-- ---------------------------------------------------------------------------
update public.conversations
set status = 'pending'
where status = 'snoozed';

update public.conversations
set priority = 'medium'
where priority is null or trim(coalesce(priority, '')) in ('', 'normal');

update public.conversations
set priority = 'medium'
where priority not in ('low', 'medium', 'high', 'urgent');

update public.conversations
set status = 'spam'
where is_spam = true and status is distinct from 'spam';

-- ---------------------------------------------------------------------------
-- 4) New CHECK constraints
-- ---------------------------------------------------------------------------
alter table public.conversations
  add constraint conversations_status_check
  check (
    status in (
      'open',
      'pending',
      'waiting_customer',
      'resolved',
      'closed',
      'spam'
    )
  );

alter table public.conversations
  add constraint conversations_priority_check
  check (priority is null or priority in ('low', 'medium', 'high', 'urgent'));

alter table public.conversations
  add constraint conversations_assignment_type_check
  check (
    assignment_type in (
      'unassigned',
      'assigned_to_agent',
      'assigned_to_team',
      'assigned_to_ai'
    )
  );

alter table public.conversations
  add constraint conversations_assignment_member_chk check (
    (assignment_type in ('unassigned', 'assigned_to_ai') and assigned_to_member_id is null)
    or (assignment_type = 'assigned_to_agent' and assigned_to_member_id is not null)
    or (assignment_type = 'assigned_to_team')
  );

alter table public.conversations
  alter column priority set default 'medium';

comment on column public.conversations.assignment_type is
  'Routing queue: unassigned | human agent | team queue | AI-owned; pairs with assigned_to_member_id rules.';

comment on column public.conversations.status is
  'Conversation lifecycle: open, pending, waiting_customer, resolved, closed, spam.';

-- ---------------------------------------------------------------------------
-- 5) Mentions RPC: exclude spam status explicitly
-- ---------------------------------------------------------------------------
create or replace function public.conversation_ids_mentioning_user(
  p_organization_id uuid,
  p_user_id uuid
)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.conversations c
  where c.organization_id = p_organization_id
    and c.is_spam = false
    and c.status is distinct from 'spam'
    and public.metadata_mentions_includes_user(c.metadata, p_user_id);
$$;

create or replace function public.count_conversations_mentioning_user(
  p_organization_id uuid,
  p_user_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.conversation_ids_mentioning_user(p_organization_id, p_user_id) x;
$$;

grant execute on function public.conversation_ids_mentioning_user(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.count_conversations_mentioning_user(uuid, uuid) to anon, authenticated, service_role;
