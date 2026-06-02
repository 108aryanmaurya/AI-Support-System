-- Contacts segmentation fields for customer directory UX.
alter table if exists public.customers
  add column if not exists customer_type text not null default 'USER',
  add column if not exists user_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_customer_type_check'
  ) then
    alter table public.customers
      add constraint customers_customer_type_check
      check (customer_type in ('USER', 'LEAD'));
  end if;
end $$;

create unique index if not exists idx_customers_org_user_id_unique
  on public.customers (organization_id, user_id)
  where user_id is not null and btrim(user_id) <> '';

create index if not exists idx_customers_org_type
  on public.customers (organization_id, customer_type);

