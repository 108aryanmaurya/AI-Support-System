-- Populate public.users.first_name / last_name from Supabase signup metadata (raw_user_meta_data).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

comment on function public.handle_new_user() is
  'Syncs auth.users → public.users (including first_name/last_name from signup metadata). Does NOT create organizations or organization_members.';
