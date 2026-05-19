-- Sprint 3: message AI lineage + explicit feedback action

alter table public.messages
  add column if not exists ai_run_id uuid null references public.ai_runs(id) on delete set null;

create index if not exists idx_messages_ai_run_id
  on public.messages (ai_run_id)
  where ai_run_id is not null;

alter table public.ai_feedback
  add column if not exists action text null
  check (action is null or action in ('accepted', 'rejected', 'edited'));

create index if not exists idx_ai_feedback_org_action_created
  on public.ai_feedback (organization_id, action, created_at desc)
  where action is not null;
