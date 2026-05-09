-- Reply routing data for email conversations.
-- WHY:
-- - Outbound replies need a stable RFC subject line and threading key without
--   re-scanning messages or guessing from the latest inbound payload.
-- - channel_type / channel_id / last_message_at already exist from prior
--   migrations; this adds subject + thread_key on the conversation row for
--   email channel, plus last_message_id on email_threads for optional sync.

-- ---------------------------------------------------------------------------
-- CONVERSATIONS: canonical email subject + thread key for sends
-- ---------------------------------------------------------------------------
-- subject on the conversation is the single source of truth for "Re: ..." /
-- reply subject reuse. Storing it here (not only on messages) means:
-- - Agents and automations can send without loading the full message history.
-- - Subject stays tied to the thread identity of the ticket, even if MIME
--   payloads differ between provider webhooks.

alter table public.conversations
  add column if not exists subject text,
  add column if not exists thread_key text;

comment on column public.conversations.subject is 'Email/RFC-style subject line for this thread; required when channel_type = email.';
comment on column public.conversations.thread_key is 'Stable thread identifier (Message-ID branch or normalized subject); required when channel_type = email.';


-- ---------------------------------------------------------------------------
-- EMAIL_THREADS: optional pointer to latest message for bookkeeping
-- ---------------------------------------------------------------------------
alter table public.email_threads
  add column if not exists subject text;

alter table public.email_threads
  add column if not exists last_message_id uuid;

-- FK added only if messages table exists with standard PK (it does).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_threads_last_message_id_fkey'
      and conrelid = 'public.email_threads'::regclass
  ) then
    alter table public.email_threads
      add constraint email_threads_last_message_id_fkey
      foreign key (last_message_id)
      references public.messages(id)
      on delete set null;
  end if;
end $$;

comment on column public.email_threads.last_message_id is 'Optional: last linked inbox message for this thread row.';


-- ---------------------------------------------------------------------------
-- Backfill from email_threads into conversations (email rows only)
-- ---------------------------------------------------------------------------
update public.conversations c
set
  subject = coalesce(nullif(btrim(c.subject), ''), nullif(btrim(et.subject), '')),
  thread_key = coalesce(nullif(btrim(c.thread_key), ''), nullif(btrim(et.thread_key), ''))
from public.email_threads et
where et.conversation_id = c.id
  and c.channel_type = 'email'
  and (
    c.subject is null
    or c.thread_key is null
    or btrim(c.subject) = ''
    or btrim(c.thread_key) = ''
  );

-- If still missing thread_key for email, use latest customer message external id from metadata.
update public.conversations c
set thread_key = coalesce(
  nullif(btrim(c.thread_key), ''),
  (
    select m.metadata->>'external_message_id'
    from public.messages m
    where m.conversation_id = c.id
      and m.organization_id = c.organization_id
      and m.sender_type = 'customer'
      and m.metadata ? 'external_message_id'
    order by m.created_at desc
    limit 1
  )
)
where c.channel_type = 'email'
  and (c.thread_key is null or btrim(c.thread_key) = '');

-- Minimal subject fallback for enforcement (existing bad data only).
update public.conversations
set subject = '(no subject)'
where channel_type = 'email'
  and (subject is null or btrim(subject) = '');

-- Minimal thread_key fallback (should be rare).
update public.conversations
set thread_key = gen_random_uuid()::text
where channel_type = 'email'
  and (thread_key is null or btrim(thread_key) = '');


-- ---------------------------------------------------------------------------
-- Constraints: email conversations must carry routing fields
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_email_subject_thread_chk'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_email_subject_thread_chk
      check (
        channel_type <> 'email'
        or (
          subject is not null
          and btrim(subject) <> ''
          and thread_key is not null
          and btrim(thread_key) <> ''
        )
      );
  end if;
end $$;

-- EMAIL_THREADS.subject: align with conversation (required for thread records).
update public.email_threads et
set subject = coalesce(
  nullif(btrim(et.subject), ''),
  nullif(btrim(c.subject), ''),
  '(no subject)'
)
from public.conversations c
where c.id = et.conversation_id;

update public.email_threads
set subject = '(no subject)'
where subject is null
  or btrim(subject) = '';

alter table public.email_threads
  alter column subject set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_threads_subject_nonempty_chk'
      and conrelid = 'public.email_threads'::regclass
  ) then
    alter table public.email_threads
      add constraint email_threads_subject_nonempty_chk
      check (btrim(subject) <> '');
  end if;
end $$;


-- Lookup by thread key within org from conversations (reply + admin tools).
create index if not exists idx_conversations_org_thread_key_email
  on public.conversations (organization_id, thread_key)
  where channel_type = 'email';
