-- Orthogonal "who are we waiting on?" field; keeps `status` (e.g. open) as the lifecycle state.

alter table public.conversations
  add column if not exists waiting_status text not null default '';

alter table public.conversations drop constraint if exists conversations_waiting_status_check;

alter table public.conversations
  add constraint conversations_waiting_status_check
  check (waiting_status in ('', 'waiting_agent', 'waiting_customer'));

alter table public.conversations drop constraint if exists conversations_waiting_status_terminal_check;

alter table public.conversations
  add constraint conversations_waiting_status_terminal_check
  check (
    status not in ('resolved', 'closed')
    or waiting_status = ''
  );

comment on column public.conversations.waiting_status is
  'Who must act next: empty | waiting_agent | waiting_customer. Cleared when resolved/closed.';

-- Legacy: status was overloaded as waiting_customer; move to waiting_status and restore open.
update public.conversations
set
  waiting_status = 'waiting_customer',
  status = 'open'
where status = 'waiting_customer';

drop index if exists public.idx_conversations_org_status_last_message_lifecycle;

create index if not exists idx_conversations_org_status_last_message_lifecycle
  on public.conversations (organization_id, status, last_message_at desc)
  where status = 'resolved';

drop index if exists public.idx_conversations_org_waiting_customer_reminder;

create index if not exists idx_conversations_org_waiting_customer_reminder
  on public.conversations (organization_id, last_customer_message_at)
  where waiting_status = 'waiting_customer' and customer_reminder_sent_at is null;

create index if not exists idx_conversations_org_waiting_agent
  on public.conversations (organization_id, last_customer_message_at desc)
  where waiting_status = 'waiting_agent';
