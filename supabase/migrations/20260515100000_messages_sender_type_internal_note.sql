-- Extend messages.sender_type with internal_note; keep customer, agent, system, ai.
-- internal_note: same member requirement as agent (team-only note).

alter table public.messages drop constraint if exists messages_sender_type_check;
alter table public.messages drop constraint if exists messages_sender_type_chk;
alter table public.messages drop constraint if exists messages_sender_rules_chk;

alter table public.messages
  add constraint messages_sender_type_chk
  check (
    sender_type in ('customer', 'agent', 'system', 'ai', 'internal_note')
  );

alter table public.messages
  add constraint messages_sender_rules_chk check (
    (sender_type = 'agent' and sender_member_id is not null)
    or (sender_type = 'internal_note' and sender_member_id is not null)
    or (sender_type = 'customer' and sender_member_id is null)
    or (sender_type in ('ai', 'system'))
  );

create or replace function public.validate_message_insert_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_org_id uuid;
begin
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

  -- agent / internal_note -> sender_member_id required and must belong to org
  if new.sender_type in ('agent', 'internal_note') then
    if new.sender_member_id is null then
      raise exception '% messages require sender_member_id', new.sender_type
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
    null;
  else
    raise exception 'Invalid sender_type: %', new.sender_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;
