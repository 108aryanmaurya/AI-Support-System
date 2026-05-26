-- Sprint 0: conversation lifecycle columns + indexes for idle/reminder cron scans.
-- Behavior (reopen, auto-close, reminders) ships in later sprints; schema contract is locked here.

-- ---------------------------------------------------------------------------
-- Lifecycle timestamps & close reason
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_member_id uuid,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_reason text,
  add column if not exists last_customer_message_at timestamptz,
  add column if not exists last_agent_message_at timestamptz,
  add column if not exists customer_reminder_sent_at timestamptz;

alter table public.conversations drop constraint if exists conversations_closed_reason_check;

alter table public.conversations
  add constraint conversations_closed_reason_check
  check (
    closed_reason is null
    or closed_reason in (
      'manual',
      'auto_idle_resolved',
      'auto_no_reply_after_reminder'
    )
  );

alter table public.conversations drop constraint if exists conversations_resolved_by_member_fk;

alter table public.conversations
  add constraint conversations_resolved_by_member_fk
  foreign key (organization_id, resolved_by_member_id)
  references public.organization_members (organization_id, id)
  on delete set null;

comment on column public.conversations.resolved_at is
  'When the conversation was marked resolved (agent or automation).';
comment on column public.conversations.resolved_by_member_id is
  'Org member who marked resolved; null when set by system jobs.';
comment on column public.conversations.closed_at is
  'When the conversation entered closed status.';
comment on column public.conversations.closed_reason is
  'Why closed: manual | auto_idle_resolved | auto_no_reply_after_reminder.';
comment on column public.conversations.last_customer_message_at is
  'Denormalized last inbound customer message time (waiting_customer / idle scans).';
comment on column public.conversations.last_agent_message_at is
  'Denormalized last agent/AI outbound time (waiting_customer policy).';
comment on column public.conversations.customer_reminder_sent_at is
  'When the one-per-cycle customer reminder was sent (idempotency for cron).';

-- ---------------------------------------------------------------------------
-- Cron-friendly indexes (partial: terminal-adjacent statuses only)
-- ---------------------------------------------------------------------------
create index if not exists idx_conversations_org_status_last_message_lifecycle
  on public.conversations (organization_id, status, last_message_at desc)
  where status in ('resolved', 'waiting_customer');

create index if not exists idx_conversations_org_waiting_customer_reminder
  on public.conversations (organization_id, last_customer_message_at)
  where status = 'waiting_customer' and customer_reminder_sent_at is null;
