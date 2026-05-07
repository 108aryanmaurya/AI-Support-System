-- Minimal forward-compatible schema hooks for upcoming AI/integration features.
-- Intentionally small, additive changes only.

-- ---------------------------------------------------------------------------
-- conversations: toggle for future AI automation/workflows
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists ai_enabled boolean not null default true;


-- ---------------------------------------------------------------------------
-- messages: AI provenance + parent linkage for edits/threading
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists is_ai_generated boolean not null default false,
  add column if not exists parent_message_id uuid null;

-- Optional self-reference to support message threading/edit ancestry.
alter table public.messages
  add constraint messages_parent_message_fk
  foreign key (parent_message_id)
  references public.messages(id)
  on delete set null;

-- Helpful index for parent-child lookups when threading is used.
create index if not exists idx_messages_parent_message_id
  on public.messages(parent_message_id);


-- ---------------------------------------------------------------------------
-- customers: source channel for external integrations/import pipelines
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists external_source text null;

-- Keep allowed values minimal and explicit for now.
alter table public.customers
  add constraint customers_external_source_chk
  check (external_source in ('web', 'api', 'import') or external_source is null);
