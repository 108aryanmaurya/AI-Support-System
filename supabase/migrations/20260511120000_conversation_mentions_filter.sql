-- Conversation metadata.mentions: JSON array of user id strings (auth/public.users.id).
-- Used by Mentions inbox filter (no JSONB @> on partial arrays).

create or replace function public.metadata_mentions_includes_user(p_metadata jsonb, p_user_id uuid)
returns boolean
language sql
immutable
parallel safe
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_metadata->'mentions', '[]'::jsonb)) as x(uid)
    where uid = p_user_id::text
  );
$$;

comment on function public.metadata_mentions_includes_user(jsonb, uuid) is
  'True if conversations.metadata->mentions JSON array contains p_user_id as text.';

-- Row ids for conversation list / filter (non-spam only; spam bucket uses separate filter path).
create or replace function public.conversation_ids_mentioning_user(
  p_organization_id uuid,
  p_user_id uuid
)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.conversations c
  where c.organization_id = p_organization_id
    and c.is_spam = false
    and public.metadata_mentions_includes_user(c.metadata, p_user_id);
$$;

comment on function public.conversation_ids_mentioning_user(uuid, uuid) is
  'Conversation ids in org where metadata.mentions includes the user (excludes spam).';

create or replace function public.count_conversations_mentioning_user(
  p_organization_id uuid,
  p_user_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.conversations c
  where c.organization_id = p_organization_id
    and c.is_spam = false
    and public.metadata_mentions_includes_user(c.metadata, p_user_id);
$$;

-- PostgREST only exposes RPCs the JWT role may execute (service_role from the API server).
grant execute on function public.metadata_mentions_includes_user(jsonb, uuid) to anon, authenticated, service_role;
grant execute on function public.conversation_ids_mentioning_user(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.count_conversations_mentioning_user(uuid, uuid) to anon, authenticated, service_role;
