-- "Report a problem": a coach's short note about something not working, with
-- just enough context to find it (which page, their browser/device, screen
-- size, app version). No screenshots, page content, or anything about
-- players, emails or notes.
--
-- Coaches can only add reports, as themselves. Nobody can read, change or
-- delete them through the app; they're read in the Supabase dashboard (Table
-- Editor or SQL Editor), which isn't subject to row-level security.
--
-- At most 10 reports per coach per hour (checked here, so it can't be
-- bypassed by calling the API directly).
--
-- Run once in Supabase → SQL Editor, after 20261012000000_mail_provider.sql.

begin;

create table public.problem_reports (
  id          uuid primary key default gen_random_uuid(),
  -- Who sent it (kept as null if that coach is later removed).
  staff_id    uuid default auth.uid() references public.staff (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- The page as a pattern, without ids or search terms, e.g. "/events/:id".
  page        text check (char_length(page) <= 200),
  user_agent  text check (char_length(user_agent) <= 500),
  -- Viewport width × height and pixel ratio, e.g. "390x844@3".
  screen      text check (char_length(screen) <= 40),
  -- The deployed commit, as on the Profile tab.
  app_version text check (char_length(app_version) <= 64),
  message     text not null check (char_length(btrim(message)) between 1 and 1000)
);

comment on table public.problem_reports is
  'Coaches'' "Report a problem" notes. Insert-only from the app; read in the Supabase dashboard.';

alter table public.problem_reports enable row level security;

-- A signed-in coach can add a report as themselves, and nothing else: there
-- are deliberately no select, update or delete policies.
create policy "Staff send problem reports as themselves" on public.problem_reports
  for insert to authenticated
  with check (staff_id = (select auth.uid()));

revoke all on public.problem_reports from anon, authenticated;
grant insert on public.problem_reports to authenticated;

-- At most 10 reports per coach in any hour. Security definer so it can count
-- reports the coach can't read.
create function public.problem_reports_rate_limit() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (
    select count(*) from public.problem_reports
    where staff_id = new.staff_id and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'problem_report_rate_limited'
      using errcode = 'P0001', hint = 'At most 10 problem reports per hour.';
  end if;
  return new;
end;
$$;

revoke all on function public.problem_reports_rate_limit() from public, anon, authenticated;

create trigger problem_reports_rate_limit before insert on public.problem_reports
  for each row execute function public.problem_reports_rate_limit();

create index problem_reports_staff_recent on public.problem_reports (staff_id, created_at desc);

commit;
