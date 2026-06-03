-- Fix channels.type check: initial migration only allowed 'email'; production_channel
-- intended ('email','web','whatsapp','messenger') but CREATE TABLE IF NOT EXISTS skipped it.

alter table public.channels drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check
  check (type in ('email', 'web', 'whatsapp', 'messenger'));

comment on constraint channels_type_check on public.channels is
  'Channel registry types; web used by embeddable messenger widget.';
