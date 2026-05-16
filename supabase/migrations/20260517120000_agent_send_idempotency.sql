-- Agent outbound send idempotency (aligns with client metadata.client_request_id)

create table if not exists public.agent_send_idempotency (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_request_id text not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, client_request_id)
);

create index if not exists idx_agent_send_idempotency_message
  on public.agent_send_idempotency (message_id);

comment on table public.agent_send_idempotency is
  'Maps client_request_id to message row for idempotent POST .../messages/send across retries and API replicas.';
