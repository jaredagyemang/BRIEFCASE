-- Handwritten notes: a coach photographs notes (one player's, or pages
-- covering many players), Claude types them up, and each note is saved with
-- the photo of the handwriting it came from.
-- Run once in Supabase → SQL Editor, after 20261003000000_docket_items_and_shortlist.sql.
-- All-or-nothing: if any step fails, nothing changes.

begin;

-- ---------------------------------------------------------------------------
-- 1. The photo a note was typed up from: a path inside the private
--    "note-photos" storage bucket. One page often covers several players, so
--    several notes can share the same photo. Null for typed and voice notes.
-- ---------------------------------------------------------------------------

alter table public.evaluations add column note_image_url text;

create index evaluations_note_image_url_idx on public.evaluations (note_image_url)
  where note_image_url is not null;

-- ---------------------------------------------------------------------------
-- 2. The "note-photos" bucket. Like voice notes: all staff can view, anyone
--    can upload, only the uploader can delete; once no note uses a photo any
--    staff member may clean it up.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('note-photos', 'note-photos', false)
on conflict (id) do nothing;

create policy "Staff read note photos" on storage.objects
  for select to authenticated using (bucket_id = 'note-photos');

create policy "Staff upload note photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'note-photos');

create policy "Uploaders delete their note photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-photos' and owner_id = (select auth.uid()::text));

create policy "Staff delete unused note photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-photos'
    and not exists (select 1 from public.evaluations e where e.note_image_url = objects.name)
  );

-- ---------------------------------------------------------------------------
-- 3. delete_event also returns the handwriting photos to clean up. It now
--    returns (bucket, path) rows instead of a list of voice note paths, so the
--    function is replaced. Otherwise it works exactly as before.
-- ---------------------------------------------------------------------------

drop function public.delete_event(uuid);

create function public.delete_event(target_event_id uuid)
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

  -- Photos used only by this event's notes.
  select coalesce(array_agg(distinct e.note_image_url), '{}')
    into photo_paths
    from public.evaluations e
   where e.event_id = target_event_id
     and e.note_image_url is not null
     and not exists (
           select 1 from public.evaluations o
            where o.note_image_url = e.note_image_url and o.event_id <> target_event_id);

  -- Players seen only at this event. Deleting them also removes their tasks.
  delete from public.players p
   where exists (
           select 1 from public.event_players ep
            where ep.player_id = p.id and ep.event_id = target_event_id)
     and not exists (
           select 1 from public.event_players ep
            where ep.player_id = p.id and ep.event_id <> target_event_id);

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

revoke execute on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;

commit;
