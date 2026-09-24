-- Only the author of a note (or rating) can change or delete it, enforced by
-- the database itself. Everyone signed in can still read everything and add
-- new notes and ratings.
-- Run once in Supabase → SQL Editor, after the earlier migrations.
--
-- "Author" is evaluations.rated_by, which the database stamps with the
-- signed-in user on insert. Rows with no author (from the old shared login)
-- stay editable by any staff member.

begin;

-- ---------------------------------------------------------------------------
-- evaluations: replace the single "full access" policy with one per action
-- ---------------------------------------------------------------------------

drop policy if exists "Staff full access" on public.evaluations;

create policy "Staff can read evaluations" on public.evaluations
  for select to authenticated
  using (true);

create policy "Staff can add evaluations as themselves" on public.evaluations
  for insert to authenticated
  with check (rated_by = (select auth.uid()));

create policy "Authors can edit their evaluations" on public.evaluations
  for update to authenticated
  using (rated_by = (select auth.uid()) or rated_by is null)
  with check (rated_by = (select auth.uid()) or rated_by is null);

create policy "Authors can delete their evaluations" on public.evaluations
  for delete to authenticated
  using (rated_by = (select auth.uid()) or rated_by is null);

-- The author can never be changed after the fact (e.g. an author clearing
-- it to make their note editable by everyone, or claiming someone else's).
create function public.keep_rated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rated_by := old.rated_by;
  return new;
end;
$$;

create trigger evaluations_keep_rated_by
  before update on public.evaluations
  for each row execute function public.keep_rated_by();

-- ---------------------------------------------------------------------------
-- Voice note files: only the person who uploaded a recording can replace or
-- delete it. Storage records the uploader in owner_id.
-- ---------------------------------------------------------------------------

drop policy if exists "Staff update voice notes" on storage.objects;
drop policy if exists "Staff delete voice notes" on storage.objects;

create policy "Uploaders update their voice notes" on storage.objects
  for update to authenticated
  using (bucket_id = 'voice-notes' and owner_id = (select auth.uid()::text));

create policy "Uploaders delete their voice notes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice-notes' and owner_id = (select auth.uid()::text));

commit;
