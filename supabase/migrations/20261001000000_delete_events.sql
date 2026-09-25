-- Deleting an event: removes the event and everything tied to it (its
-- ratings, notes and jersey numbers). Players who were only ever seen at this
-- event are removed entirely; players also seen at other events stay, and keep
-- their ratings and notes from those other events.
-- Run once in Supabase → SQL Editor, after 20260930000000_events.sql.
-- All-or-nothing: if any step fails, nothing changes.

begin;

-- ---------------------------------------------------------------------------
-- Staff can delete events. Deleting an event row cascades to its
-- event_players rows (jersey numbers, rating colors) and its evaluations
-- (ratings and notes, including other staff members' notes), and clears the
-- "status set at" tag on any player whose status was set at this event.
-- ---------------------------------------------------------------------------

create policy "Staff can delete events" on public.events
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- delete_event: does the whole deletion in one step so it can't half-finish.
-- Returns the Storage paths of the voice notes that were deleted, so the app
-- can remove those audio files too.
-- ---------------------------------------------------------------------------

create function public.delete_event(target_event_id uuid)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  audio_paths text[];
begin
  select coalesce(array_agg(raw_audio_url), '{}')
    into audio_paths
    from public.evaluations
   where event_id = target_event_id
     and raw_audio_url is not null;

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

  return audio_paths;
end;
$$;

revoke execute on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Voice note files: normally only the uploader can delete a recording. Once
-- its note no longer exists (for example, its event was deleted), any staff
-- member may clean up the leftover file.
-- ---------------------------------------------------------------------------

create policy "Staff delete orphaned voice notes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'voice-notes'
    and not exists (select 1 from public.evaluations e where e.raw_audio_url = objects.name)
  );

commit;
