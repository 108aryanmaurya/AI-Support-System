-- Repair environments where 20260515120000 failed mid-flight: legacy
-- `conversations_status_check` (open|closed|snoozed) still blocked `spam` / `pending`.
-- Also clears assignee on spam rows so `conversations_assignment_member_chk` holds.

-- Duplicate names can appear if a prior partial run recreated constraints.
alter table public.conversations drop constraint if exists conversations_status_check;
alter table public.conversations drop constraint if exists conversations_status_check1;

update public.conversations
set assigned_to_member_id = null,
    assignment_type = 'unassigned'
where status = 'spam'
  and (
    assigned_to_member_id is not null
    or assignment_type is distinct from 'unassigned'
  );

update public.conversations
set status = 'open'
where status not in (
  'open',
  'pending',
  'waiting_customer',
  'resolved',
  'closed',
  'spam'
);

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
