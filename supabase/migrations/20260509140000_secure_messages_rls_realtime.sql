-- =============================================================================
-- Secure realtime path: RLS policies that Realtime postgres_changes respects.
--
-- Supabase Realtime (postgres_changes) evaluates SELECT visibility using the
-- same policies as normal queries for role `authenticated`. Always pair:
--   supabase.auth.setSession / realtime.setAuth(access_token)
-- so JWT matches auth.uid() in policies.
--
-- DEBUG TIPS (hosted Supabase):
-- - Dashboard → Logs → Postgres / API / Edge — filter by your project ref.
-- - If subscription connects but no payload rows: row failed SELECT RLS (silent).
-- - Turn on SQL logging briefly (support ticket / settings) for statement traces.
-- - Client: log channel subscribe status; TIMED_OUT often token / network.
-- - Client: never trust filter alone (e.g. organization_id=eq.X); RLS is the gate.
--
-- TEST IDEAS (run as SQL or Supabase SQL editor with JWT set via request):
-- 1) User U in Org A: SELECT * FROM messages WHERE organization_id = '<org_b_uuid>';
--    → 0 rows (cross-tenant blocked).
-- 2) Open two browsers: Agent Org A vs Org B; trigger message in B → A never sees event.
-- 3) Revoke org_members row for U in Org A; realtime for that org stops for U.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- organization_members: allow each user to read their own membership rows.
-- Required when organization_members has RLS enabled; subqueries in other
-- policies must be able to resolve membership for auth.uid().
-- ---------------------------------------------------------------------------
alter table public.organization_members enable row level security;

drop policy if exists organization_members_select_own on public.organization_members;

create policy organization_members_select_own
on public.organization_members
for select
to authenticated
using (user_id = auth.uid());

-- Service role / bypass unchanged for server-side admin client.

-- ---------------------------------------------------------------------------
-- MESSAGES: replace policies — SELECT/INSERT/UPDATE tie to conversations + org.
-- Prevents rows where organization_id is forged without a matching conversation.
-- ---------------------------------------------------------------------------
drop policy if exists messages_select_by_org_membership on public.messages;
drop policy if exists messages_insert_by_org_membership on public.messages;
drop policy if exists messages_update_by_org_membership on public.messages;

-- SELECT: member of org that owns the parent conversation (via join).
create policy messages_select_via_conversation_org_membership
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    inner join public.organization_members om
      on om.organization_id = c.organization_id
     and om.user_id = auth.uid()
    where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
  )
);

-- INSERT: same tenant path for the new row.
create policy messages_insert_via_conversation_org_membership
on public.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    inner join public.organization_members om
      on om.organization_id = c.organization_id
     and om.user_id = auth.uid()
    where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
  )
);

-- UPDATE: existing row must pass SELECT path; new values must pass INSERT path.
create policy messages_update_via_conversation_org_membership
on public.messages
for update
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    inner join public.organization_members om
      on om.organization_id = c.organization_id
     and om.user_id = auth.uid()
    where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    inner join public.organization_members om
      on om.organization_id = c.organization_id
     and om.user_id = auth.uid()
    where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
  )
);

-- ---------------------------------------------------------------------------
-- CONVERSATIONS: unchanged — keep `conversations_select_by_org_membership`
-- from 20260507134500 (member of org may SELECT rows for that organization_id).
-- Realtime respects that policy for conversation postgres_changes.
-- ---------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Manual test matrix (run in SQL editor with `set local role authenticated` +
-- `set request.jwt.claim.sub` / Supabase “run as user” when available):
--
--  T1: Cross-org message invisible
--    set request.jwt.claim.sub = '<user_in_org_a_uuid>';
--    select count(*) from public.messages m
--    where m.organization_id = '<org_b_uuid>';  -- expect 0
--
--  T2: Realtime: two sessions JWT org A vs B; insert message in B; A’s channel
--     must not emit (RLS + filter).
--
--  T3: Remove organization_members row for U+orgA; U should select 0 rows for
--     that org’s conversations/messages.
-- -----------------------------------------------------------------------------
