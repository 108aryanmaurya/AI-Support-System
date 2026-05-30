-- Target team inbox for pending invites (applied on accept → inbox_members).

alter table public.invites
  add column if not exists inbox_id uuid references public.inboxes(id) on delete set null;

comment on column public.invites.inbox_id is
  'Team inbox to add the member to when the invite is accepted; null stored as default at invite time.';

create index if not exists idx_invites_inbox_id
  on public.invites (inbox_id)
  where inbox_id is not null;
