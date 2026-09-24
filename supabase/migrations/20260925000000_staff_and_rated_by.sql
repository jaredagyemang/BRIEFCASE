-- Individual staff logins: a staff profile per Supabase Auth user, and each
-- rating records which staff member made it.
-- Run once in Supabase → SQL Editor, after the V1 schema.

-- ---------------------------------------------------------------------------
-- Staff profiles (one per login)
-- ---------------------------------------------------------------------------

create table public.staff (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger staff_set_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

alter table public.staff enable row level security;

create policy "Staff can see all staff" on public.staff
  for select to authenticated using (true);
create policy "Staff can edit their own profile" on public.staff
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Create a staff profile automatically whenever a user is added in
-- Authentication → Users. The name starts as the part of the email before
-- the @; each person can change it on their Account page.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for users that already exist (e.g. the old shared login).
insert into public.staff (id, full_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Who made each rating
-- ---------------------------------------------------------------------------

alter table public.evaluations
  add column rated_by uuid references public.staff (id) on delete set null;

create index evaluations_rated_by_idx on public.evaluations (rated_by);

-- Always stamp the signed-in user, so it can't be skipped or faked.
create function public.set_rated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rated_by := auth.uid();
  return new;
end;
$$;

create trigger evaluations_set_rated_by
  before insert on public.evaluations
  for each row execute function public.set_rated_by();
