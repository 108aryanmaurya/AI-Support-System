-- Row Level Security for core conversation tables.
-- Access model: a signed-in user can only access rows where they are a member
-- of the same organization via public.organization_members.

-- ---------------------------------------------------------------------------
-- CUSTOMERS RLS
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;

-- SELECT: user can read customers only in orgs they belong to.
create policy customers_select_by_org_membership
on public.customers
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = customers.organization_id
  )
);

-- INSERT: user can create customers only in orgs they belong to.
create policy customers_insert_by_org_membership
on public.customers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = customers.organization_id
  )
);

-- UPDATE: user can modify customers only in orgs they belong to.
create policy customers_update_by_org_membership
on public.customers
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = customers.organization_id
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = customers.organization_id
  )
);

-- DELETE intentionally not granted (no delete policy) for safer defaults.


-- ---------------------------------------------------------------------------
-- CONVERSATIONS RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;

-- SELECT: user can read conversations only in orgs they belong to.
create policy conversations_select_by_org_membership
on public.conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = conversations.organization_id
  )
);

-- INSERT: user can create conversations only in orgs they belong to.
-- This blocks creating conversations for another org.
create policy conversations_insert_by_org_membership
on public.conversations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = conversations.organization_id
  )
);

-- UPDATE: user can update conversations only in orgs they belong to.
create policy conversations_update_by_org_membership
on public.conversations
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = conversations.organization_id
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = conversations.organization_id
  )
);

-- DELETE intentionally not granted.


-- ---------------------------------------------------------------------------
-- MESSAGES RLS
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;

-- SELECT: user can read messages only in orgs they belong to.
create policy messages_select_by_org_membership
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = messages.organization_id
  )
);

-- INSERT: user can create messages only in orgs they belong to.
-- Combined with schema FK constraints, this prevents cross-org message inserts.
create policy messages_insert_by_org_membership
on public.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = messages.organization_id
  )
);

-- UPDATE: user can update messages only in orgs they belong to.
create policy messages_update_by_org_membership
on public.messages
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = messages.organization_id
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = messages.organization_id
  )
);

-- DELETE intentionally not granted.
