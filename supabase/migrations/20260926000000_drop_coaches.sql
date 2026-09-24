-- Remove the coach directory from the database. The app stopped using it
-- when the Coaches feature was removed.
-- Run once in Supabase → SQL Editor, after the earlier migrations.
--
-- Dropping each column also drops its foreign key to coaches and its index.
-- Wrapped in a transaction so it either fully applies or changes nothing.

begin;

alter table public.players     drop column if exists assigned_coach_id;
alter table public.tasks       drop column if exists assigned_coach_id;
alter table public.evaluations drop column if exists coach_id;

-- Also removes the table's Row-Level Security policy and updated_at trigger.
drop table if exists public.coaches;

commit;
