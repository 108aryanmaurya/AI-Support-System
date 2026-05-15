-- One “active” thread per customer (open / pending / waiting_customer) + align API ingress RPC.

-- If multiple active rows existed (e.g. legacy data), keep the newest and close the rest.
with ranked as (
  select
    id,
    row_number() over (
      partition by organization_id, customer_id
      order by last_message_at desc nulls last, created_at desc
    ) as rn
  from public.conversations
  where status in ('open', 'pending', 'waiting_customer')
)
update public.conversations c
set status = 'closed'
from ranked r
where c.id = r.id
  and r.rn > 1;

drop index if exists public.idx_conversations_one_open_per_customer;

create unique index if not exists idx_conversations_one_active_customer
  on public.conversations (organization_id, customer_id)
  where status in ('open', 'pending', 'waiting_customer');

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
    and c.status in ('open', 'pending', 'waiting_customer')
  order by c.last_message_at desc
  limit 1;

  if v_conversation_id is null then
    begin
      insert into public.conversations (
        organization_id,
        customer_id,
        status,
        source,
        last_message_at,
        channel_type
      )
      values (
        p_organization_id,
        v_customer_id,
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
          and c.status in ('open', 'pending', 'waiting_customer')
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
