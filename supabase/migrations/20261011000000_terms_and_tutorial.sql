-- First use: each coach accepts the Privacy Policy and Terms of Use (a
-- record per person, per version of the text), then sees a short tutorial
-- once.
-- Run once in Supabase → SQL Editor, after 20261010000000_docket_activity.sql.
-- All-or-nothing: if any step fails, nothing changes.

begin;

-- ---------------------------------------------------------------------------
-- terms_acceptances: a permanent record that a coach agreed, to which version
-- of the text, and when. The email is copied so the record stays readable if
-- the account is later deleted.
-- ---------------------------------------------------------------------------

create table public.terms_acceptances (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid references public.staff (id) on delete set null,
  email        text not null,
  -- Which text was agreed to (e.g. "2026-09-29-draft"); a new version asks
  -- every coach to agree again.
  version      text not null check (char_length(version) between 1 and 100),
  accepted_at  timestamptz not null default now(),
  unique (staff_id, version)
);

alter table public.terms_acceptances enable row level security;

-- Coaches can see their own acceptances. There are no insert, update or
-- delete policies: accepting goes through accept_terms() below, and nobody
-- can change or remove a record from the app.
create policy "Staff can see their own acceptances" on public.terms_acceptances
  for select to authenticated using (staff_id = (select auth.uid()));

-- Records that the signed-in coach agreed to this version, now. Runs with
-- the database owner's rights so the time and email can't be supplied by the
-- app. Agreeing again to the same version keeps the first record.
create function public.accept_terms(terms_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  insert into public.terms_acceptances (staff_id, email, version)
  select me, u.email, terms_version from auth.users u where u.id = me
  on conflict (staff_id, version) do nothing;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- ---------------------------------------------------------------------------
-- When each coach finished (or skipped) the welcome tutorial. Coaches who
-- are already using Briefcase skip it; they only see the terms screen.
-- ---------------------------------------------------------------------------

alter table public.staff add column tutorial_completed_at timestamptz;

update public.staff set tutorial_completed_at = now();

commit;
