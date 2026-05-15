-- Analytics: support_events, ai_runs, ai_feedback, analytics_daily_rollups

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- support_events (append-only product telemetry)
-- ---------------------------------------------------------------------------
create table if not exists public.support_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  actor_member_id uuid null references public.organization_members(id) on delete set null,
  channel_type text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_events_org_created
  on public.support_events (organization_id, created_at desc);

create index if not exists idx_support_events_org_type_created
  on public.support_events (organization_id, event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- ai_runs (model invocations — Phase 3+)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete set null,
  message_id uuid null references public.messages(id) on delete set null,
  triggered_by_member_id uuid null references public.organization_members(id) on delete set null,
  feature text not null,
  model text not null default 'unknown',
  status text not null default 'success'
    check (status in ('success', 'error', 'timeout', 'blocked_policy')),
  prompt_hash text null,
  input_tokens int null,
  output_tokens int null,
  latency_ms int null,
  retrieval_chunk_ids uuid[] null,
  confidence numeric(5, 4) null,
  error_code text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_runs_org_created
  on public.ai_runs (organization_id, created_at desc);

create index if not exists idx_ai_runs_org_feature_created
  on public.ai_runs (organization_id, feature, created_at desc);

-- ---------------------------------------------------------------------------
-- ai_feedback (agent ratings on AI output)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ai_run_id uuid null references public.ai_runs(id) on delete cascade,
  message_id uuid null references public.messages(id) on delete cascade,
  member_id uuid not null references public.organization_members(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  reason text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_feedback_org_created
  on public.ai_feedback (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- analytics_daily_rollups (pre-aggregated metrics)
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_daily_rollups (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date date not null,
  metric_key text not null,
  dimensions jsonb not null default '{}'::jsonb,
  value_numeric numeric null,
  value_json jsonb null,
  primary key (organization_id, date, metric_key, dimensions)
);

create index if not exists idx_analytics_rollups_org_date
  on public.analytics_daily_rollups (organization_id, date desc);

-- ---------------------------------------------------------------------------
-- RLS (org membership — same pattern as conversations)
-- ---------------------------------------------------------------------------
alter table public.support_events enable row level security;

create policy support_events_select_by_org_membership
on public.support_events
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = support_events.organization_id
  )
);

alter table public.ai_runs enable row level security;

create policy ai_runs_select_by_org_membership
on public.ai_runs
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = ai_runs.organization_id
  )
);

alter table public.ai_feedback enable row level security;

create policy ai_feedback_select_by_org_membership
on public.ai_feedback
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = ai_feedback.organization_id
  )
);

alter table public.analytics_daily_rollups enable row level security;

create policy analytics_rollups_select_by_org_membership
on public.analytics_daily_rollups
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = analytics_daily_rollups.organization_id
  )
);

-- Inserts are server-only (service role); no insert policies for authenticated clients.
