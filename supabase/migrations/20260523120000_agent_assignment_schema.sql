-- Sprint 1: intelligent assignment — agent profiles, skills, presence, audit log

-- ---------------------------------------------------------------------------
-- agent_profiles — per-member routing attributes (distinct from organization_members.status)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_profiles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.organization_members(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  max_concurrency int not null default 5
    check (max_concurrency >= 1 and max_concurrency <= 50),
  shift_start time null,
  shift_end time null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id),
  unique (organization_id, member_id)
);

create index if not exists idx_agent_profiles_org_status
  on public.agent_profiles (organization_id, status);

comment on table public.agent_profiles is
  'Per-agent routing config for intelligent assignment (Sprint 1+).';
comment on column public.agent_profiles.status is
  'Routing eligibility: active | inactive (not organization_members.status).';

-- ---------------------------------------------------------------------------
-- agent_skills
-- ---------------------------------------------------------------------------
create table if not exists public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.organization_members(id) on delete cascade,
  skill text not null,
  proficiency smallint not null default 50
    check (proficiency >= 1 and proficiency <= 100),
  created_at timestamptz not null default now(),
  constraint agent_skills_member_skill_unique unique (member_id, skill),
  constraint agent_skills_skill_len check (char_length(skill) >= 1 and char_length(skill) <= 64)
);

create index if not exists idx_agent_skills_org_member
  on public.agent_skills (organization_id, member_id);

-- ---------------------------------------------------------------------------
-- agent_presence — DB source of truth (Redis hot path in Sprint 2)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_presence (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.organization_members(id) on delete cascade,
  presence text not null default 'offline'
    check (presence in ('online', 'available', 'away', 'busy', 'offline')),
  last_seen timestamptz not null default now(),
  primary key (member_id)
);

create index if not exists idx_agent_presence_org_presence
  on public.agent_presence (organization_id, presence);

-- ---------------------------------------------------------------------------
-- assignment_logs — immutable audit trail (append-only via API)
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  assigned_from uuid null references public.organization_members(id) on delete set null,
  assigned_to uuid null references public.organization_members(id) on delete set null,
  assignment_type text null,
  reason text not null,
  strategy text null,
  score_snapshot jsonb null,
  actor_member_id uuid null references public.organization_members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint assignment_logs_reason_len check (char_length(reason) >= 1 and char_length(reason) <= 64)
);

create index if not exists idx_assignment_logs_org_conv_created
  on public.assignment_logs (organization_id, conversation_id, created_at desc);

create index if not exists idx_assignment_logs_org_member_created
  on public.assignment_logs (organization_id, assigned_to, created_at desc)
  where assigned_to is not null;

comment on table public.assignment_logs is
  'Append-only assignment audit; no message bodies or customer PII.';

-- ---------------------------------------------------------------------------
-- RLS (authenticated read; writes via service role on API)
-- ---------------------------------------------------------------------------
alter table public.agent_profiles enable row level security;
alter table public.agent_skills enable row level security;
alter table public.agent_presence enable row level security;
alter table public.assignment_logs enable row level security;

create policy agent_profiles_select_by_org_membership
on public.agent_profiles for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = agent_profiles.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy agent_skills_select_by_org_membership
on public.agent_skills for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = agent_skills.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy agent_presence_select_by_org_membership
on public.agent_presence for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = agent_presence.organization_id
      and om.status = 'ACTIVE'
  )
);

create policy assignment_logs_select_by_org_membership
on public.assignment_logs for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = assignment_logs.organization_id
      and om.status = 'ACTIVE'
  )
);
