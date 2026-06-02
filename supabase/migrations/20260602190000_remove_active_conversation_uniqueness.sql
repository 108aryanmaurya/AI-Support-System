-- Allow multiple active/open conversations per customer in the same org.
-- This removes legacy uniqueness guards that caused duplicate-key failures
-- when creating parallel threads intentionally.

drop index if exists public.idx_conversations_one_open_per_customer;
drop index if exists public.idx_conversations_one_active_customer;

