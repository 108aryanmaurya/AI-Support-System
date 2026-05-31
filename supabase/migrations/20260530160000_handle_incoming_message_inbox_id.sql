-- Require conversations.inbox_id on web ingress RPC (matches NOT NULL from multiple_inboxes migration).

create or replace function public.pick_inbox_id_for_new_conversation(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select i.id
  from public.inboxes i
  where i.organization_id = p_organization_id
    and i.status = 'active'
  order by i.is_default desc, i.created_at asc
  limit 1;
$$;

comment on function public.pick_inbox_id_for_new_conversation(uuid) is
  'Deterministic active inbox for new conversations when routing is not applied in SQL (default first, else oldest).';

create or replace function public.handle_incoming_message(
  p_organization_id uuid,
  p_email text,
  p_message text,
  p_idempotency_key text default null
)
returns table (conversation_id uuid, message_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_inbox_id uuid;
  v_email text;
  v_message text;
  v_now timestamptz := now();
begin
  if p_organization_id is null then
    raise exception 'INVALID_ORGANIZATION_ID';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
  ) then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'INVALID_CUSTOMER_EMAIL';
  end if;

  v_message := trim(coalesce(p_message, ''));
  if v_message = '' then
    raise exception 'INVALID_MESSAGE';
  end if;

  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    select imi.conversation_id, imi.message_id
    into v_conversation_id, v_message_id
    from public.incoming_message_idempotency imi
    where imi.organization_id = p_organization_id
      and imi.idempotency_key = trim(p_idempotency_key)
    limit 1;

    if v_conversation_id is not null and v_message_id is not null then
      return query select v_conversation_id, v_message_id;
      return;
    end if;
  end if;

  insert into public.customers (organization_id, email)
  values (p_organization_id, v_email)
  on conflict (organization_id, email)
  do update set email = excluded.email
  returning id into v_customer_id;

  select c.id
  into v_conversation_id
  from public.conversations c
  where c.organization_id = p_organization_id
    and c.customer_id = v_customer_id
    and c.status in ('open', 'pending')
  order by c.last_message_at desc
  limit 1;

  if v_conversation_id is null then
    v_inbox_id := public.pick_inbox_id_for_new_conversation(p_organization_id);
    if v_inbox_id is null then
      raise exception 'NO_ACTIVE_INBOX';
    end if;

    begin
      insert into public.conversations (
        organization_id,
        customer_id,
        inbox_id,
        status,
        source,
        last_message_at,
        channel_type
      )
      values (
        p_organization_id,
        v_customer_id,
        v_inbox_id,
        'open',
        'api',
        v_now,
        'web'
      )
      returning id into v_conversation_id;
    exception
      when unique_violation then
        select c.id
        into v_conversation_id
        from public.conversations c
        where c.organization_id = p_organization_id
          and c.customer_id = v_customer_id
          and c.status in ('open', 'pending')
        order by c.last_message_at desc
        limit 1;
    end;
  end if;

  insert into public.messages (
    organization_id,
    conversation_id,
    sender_type,
    sender_member_id,
    content
  )
  values (
    p_organization_id,
    v_conversation_id,
    'customer',
    null,
    v_message
  )
  returning id into v_message_id;

  update public.conversations
  set last_message_at = v_now
  where id = v_conversation_id
    and organization_id = p_organization_id;

  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    insert into public.incoming_message_idempotency (
      organization_id,
      idempotency_key,
      conversation_id,
      message_id
    )
    values (
      p_organization_id,
      trim(p_idempotency_key),
      v_conversation_id,
      v_message_id
    )
    on conflict (organization_id, idempotency_key)
    do update set
      conversation_id = incoming_message_idempotency.conversation_id,
      message_id = incoming_message_idempotency.message_id;
  end if;

  return query select v_conversation_id, v_message_id;
end;
$$;
