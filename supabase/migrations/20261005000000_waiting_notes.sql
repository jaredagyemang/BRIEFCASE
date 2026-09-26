-- Notes waiting for a player: handwritten notes about someone who isn't in
-- the event yet. They're kept with the event until the coach assigns them
-- to a player (added later) or discards them.
-- Run once in Supabase → SQL Editor, after 20261004000000_handwritten_notes.sql.
-- All-or-nothing: if any step fails, nothing changes.

begin;

-- ---------------------------------------------------------------------------
-- 1. The waiting notes. All staff can see them; only the coach who wrote one
--    can edit, assign or discard it (assigning makes it their note).
-- ---------------------------------------------------------------------------

create table public.waiting_notes (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  note_text      text not null check (char_length(note_text) between 1 and 5000),
  -- The page photo it was typed up from (in the "note-photos" bucket).
  note_image_url text,
  -- What identified the player on the page, e.g. "#99 Jordan".
  written_as     text check (char_length(written_as) <= 200),
  written_by     uuid default auth.uid() references public.staff (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index waiting_notes_event_idx on public.waiting_notes (event_id, created_at);
create index waiting_notes_note_image_url_idx on public.waiting_notes (note_image_url)
  where note_image_url is not null;

alter table public.waiting_notes enable row level security;

create policy "Staff can read waiting notes" on public.waiting_notes
  for select to authenticated using (true);

create policy "Staff can add waiting notes as themselves" on public.waiting_notes
  for insert to authenticated
  with check (written_by = (select auth.uid()));

-- (No author = the writer's account was removed; any staff member may then
-- take care of the note.)
create policy "Writers can edit their waiting notes" on public.waiting_notes
  for update to authenticated
  using (written_by = (select auth.uid()) or written_by is null)
  with check (written_by = (select auth.uid()) or written_by is null);

create policy "Writers can delete their waiting notes" on public.waiting_notes
  for delete to authenticated
  using (written_by = (select auth.uid()) or written_by is null);

-- ---------------------------------------------------------------------------
-- 2. assign_waiting_note: turns a waiting note into a regular note on a
--    player at the event, keeping its photo and original time, in one step.
-- ---------------------------------------------------------------------------

create function public.assign_waiting_note(target_note_id uuid, target_player_id uuid, final_text text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  note public.waiting_notes;
  new_id uuid;
begin
  select * into note from public.waiting_notes where id = target_note_id;
  if not found then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;
  if note.written_by is not null and note.written_by <> auth.uid() then
    raise exception 'Only the person who wrote this note can assign it' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.event_players
     where event_id = note.event_id and player_id = target_player_id
  ) then
    raise exception 'That player isn''t at this event' using errcode = '23503';
  end if;

  insert into public.evaluations (event_id, player_id, transcript_text, note_image_url, created_at)
  values (note.event_id, target_player_id, coalesce(nullif(btrim(final_text), ''), note.note_text),
          note.note_image_url, note.created_at)
  returning id into new_id;

  delete from public.waiting_notes where id = target_note_id;
  if not found then
    raise exception 'Only the person who wrote this note can assign it' using errcode = '42501';
  end if;

  return new_id;
end;
$$;

revoke execute on function public.assign_waiting_note(uuid, uuid, text) from public, anon;
grant execute on function public.assign_waiting_note(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Note photos are "in use" while a waiting note has them too.
-- ---------------------------------------------------------------------------

drop policy "Staff delete unused note photos" on storage.objects;

create policy "Staff delete unused note photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-photos'
    and not exists (select 1 from public.evaluations e where e.note_image_url = objects.name)
    and not exists (select 1 from public.waiting_notes w where w.note_image_url = objects.name)
  );

-- ---------------------------------------------------------------------------
-- 4. delete_event: an event's waiting notes go with it (on delete cascade),
--    so their photos are returned for cleanup too. Otherwise unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.delete_event(target_event_id uuid)
returns table (bucket text, path text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  audio_paths text[];
  photo_paths text[];
begin
  select coalesce(array_agg(raw_audio_url), '{}')
    into audio_paths
    from public.evaluations
   where event_id = target_event_id
     and raw_audio_url is not null;

  -- Photos used only by this event's notes (saved or waiting).
  select coalesce(array_agg(distinct p.url), '{}')
    into photo_paths
    from (
      select note_image_url as url from public.evaluations
       where event_id = target_event_id and note_image_url is not null
      union
      select note_image_url from public.waiting_notes
       where event_id = target_event_id and note_image_url is not null
    ) p
   where not exists (
           select 1 from public.evaluations o
            where o.note_image_url = p.url and o.event_id <> target_event_id)
     and not exists (
           select 1 from public.waiting_notes o
            where o.note_image_url = p.url and o.event_id <> target_event_id);

  -- Players seen only at this event. Deleting them also removes their tasks.
  delete from public.players pl
   where exists (
           select 1 from public.event_players ep
            where ep.player_id = pl.id and ep.event_id = target_event_id)
     and not exists (
           select 1 from public.event_players ep
            where ep.player_id = pl.id and ep.event_id <> target_event_id);

  delete from public.events where id = target_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  return query
    select 'voice-notes', unnest(audio_paths)
    union all
    select 'note-photos', unnest(photo_paths);
end;
$$;

commit;
