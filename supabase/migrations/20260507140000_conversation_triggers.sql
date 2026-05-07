-- Trigger-based validation and consistency rules for conversation system.
-- These complement declarative constraints with explicit domain errors.

-- ---------------------------------------------------------------------------
-- 1) CONVERSATIONS: assignment/org validation before insert or update
-- ---------------------------------------------------------------------------
create or replace function public.validate_conversation_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ensure customer belongs to same organization as conversation.
  if not exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and c.organization_id = new.organization_id
  ) then
    raise exception 'Customer does not belong to conversation organization'
      using errcode = '23514';
  end if;

  -- If assigned member is present, ensure member belongs to same organization.
  if new.assigned_to_member_id is not null then
    if not exists (
      select 1
      from public.organization_members om
      where om.id = new.assigned_to_member_id
        and om.organization_id = new.organization_id
    ) then
      raise exception 'Assigned member does not belong to conversation organization'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_conversation_assignment on public.conversations;

create trigger trg_validate_conversation_assignment
before insert or update on public.conversations
for each row
execute procedure public.validate_conversation_assignment();


-- ---------------------------------------------------------------------------
-- 2) MESSAGES: org consistency + sender validation before insert or update
-- ---------------------------------------------------------------------------
create or replace function public.validate_message_insert_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_org_id uuid;
begin
  -- Enforce conversation.organization_id == message.organization_id
  select c.organization_id
    into conv_org_id
  from public.conversations c
  where c.id = new.conversation_id;

  if conv_org_id is null then
    raise exception 'Conversation not found for message'
      using errcode = '23503';
  end if;

  if conv_org_id <> new.organization_id then
    raise exception 'Message organization_id must match conversation organization_id'
      using errcode = '23514';
  end if;

  -- Sender validation rules:
  -- agent    -> sender_member_id required and must match organization
  -- customer -> sender_member_id must be null
  -- ai/system-> member/user may be null
  if new.sender_type = 'agent' then
    if new.sender_member_id is null then
      raise exception 'Agent messages require sender_member_id'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.organization_members om
      where om.id = new.sender_member_id
        and om.organization_id = new.organization_id
    ) then
      raise exception 'sender_member_id does not belong to message organization'
        using errcode = '23514';
    end if;
  elsif new.sender_type = 'customer' then
    if new.sender_member_id is not null then
      raise exception 'Customer messages must not include sender_member_id'
        using errcode = '23514';
    end if;
  elsif new.sender_type in ('ai', 'system') then
    -- both nullable; no extra checks required
    null;
  else
    raise exception 'Invalid sender_type: %', new.sender_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_message_insert_update on public.messages;

create trigger trg_validate_message_insert_update
before insert or update on public.messages
for each row
execute procedure public.validate_message_insert_update();


-- ---------------------------------------------------------------------------
-- 3) MESSAGES: update conversations.last_message_at after insert
-- ---------------------------------------------------------------------------
create or replace function public.sync_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
  where id = new.conversation_id
    and organization_id = new.organization_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_conversation_last_message_at on public.messages;

create trigger trg_sync_conversation_last_message_at
after insert on public.messages
for each row
execute procedure public.sync_conversation_last_message_at();
