-- Phase 1 automation infrastructure: durable job queue + org settings

alter table public.organizations
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.organizations.settings is
  'Org config JSON: automation toggles, SLA minutes, future AI settings.';

-- ---------------------------------------------------------------------------
-- automation_jobs
-- ---------------------------------------------------------------------------
create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'dead')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  idempotency_key text null,
  locked_at timestamptz null,
  locked_by text null,
  last_error text null,
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_automation_jobs_idempotency
  on public.automation_jobs (organization_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_automation_jobs_poll
  on public.automation_jobs (status, run_at)
  where status = 'pending';

create index if not exists idx_automation_jobs_org_created
  on public.automation_jobs (organization_id, created_at desc);

-- Claim pending jobs (service role / worker only)
create or replace function public.claim_automation_jobs(
  p_worker_id text,
  p_limit int default 10
)
returns setof public.automation_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.automation_jobs j
  set
    status = 'processing',
    locked_at = now(),
    locked_by = p_worker_id,
    attempts = j.attempts + 1
  where j.id in (
    select sub.id
    from public.automation_jobs sub
    where sub.status = 'pending'
      and sub.run_at <= now()
    order by sub.run_at asc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning j.*;
end;
$$;

revoke all on function public.claim_automation_jobs(text, int) from public;
grant execute on function public.claim_automation_jobs(text, int) to service_role;

alter table public.automation_jobs enable row level security;

create policy automation_jobs_select_by_org_membership
on public.automation_jobs
for select
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = automation_jobs.organization_id
  )
);

-- Inserts/updates via service role only (API worker)
