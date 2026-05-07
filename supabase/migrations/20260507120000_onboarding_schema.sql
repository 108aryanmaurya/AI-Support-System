-- 1. Extensions
create extension if not exists pgcrypto;

-- 2. Organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_size text,
  use_case text,
  created_at timestamptz not null default now()
);

-- 3. Users (linked to auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text,
  last_name text,
  job_title text,
  created_at timestamptz not null default now()
);

-- 4. Organization Members (multi-tenant mapping)
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('admin', 'agent')),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

-- 5. Indexes (IMPORTANT for performance)
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_org_members_org on public.organization_members(organization_id);

-- 6. Auto-create public.users when auth user is created
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
