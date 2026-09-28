-- "Last edited" for events and for each player in an event, so both lists
-- can be sorted by it. The database keeps them current itself, so no edit
-- is missed, including deletions (which leave nothing else behind).
-- Run once in Supabase → SQL Editor, after 20261005000000_waiting_notes.sql.
-- All-or-nothing: if any step fails, nothing changes.

begin;

-- ---------------------------------------------------------------------------
-- 1. The columns, filled in from the latest time already known for each row
--    (adds, edits, notes and ratings; past deletions can't be recovered).
-- ---------------------------------------------------------------------------

alter table public.event_players add column last_edited_at timestamptz;
alter table public.events add column last_edited_at timestamptz;

update public.event_players ep
   set last_edited_at = greatest(
         ep.created_at,
         ep.updated_at,
         (select max(greatest(e.created_at, e.updated_at)) from public.evaluations e
           where e.event_id = ep.event_id and e.player_id = ep.player_id));

update public.events ev
   set last_edited_at = greatest(
         ev.created_at,
         ev.updated_at,
         (select max(ep.last_edited_at) from public.event_players ep where ep.event_id = ev.id),
         (select max(w.created_at) from public.waiting_notes w where w.event_id = ev.id));

alter table public.event_players
  alter column last_edited_at set default now(),
  alter column last_edited_at set not null;
alter table public.events
  alter column last_edited_at set default now(),
  alter column last_edited_at set not null;

create index event_players_event_last_edited_idx on public.event_players (event_id, last_edited_at desc);
create index events_last_edited_idx on public.events (last_edited_at desc);

-- ---------------------------------------------------------------------------
-- 2. Marking things edited. These run with the database owner's rights
--    (security definer) because a coach can't normally change rows they
--    didn't write (e.g. someone else's note's event); they only ever set
--    these two timestamps.
-- ---------------------------------------------------------------------------

create function public.touch_event(target_event_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.events set last_edited_at = now()
   where id = target_event_id and last_edited_at < now();
$$;

-- Also used by the app when a player's details are edited inside an event
-- (details are shared by every event the player is in, so only the app
-- knows which event the edit was made in).
create function public.touch_event_player(target_event_id uuid, target_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.event_players set last_edited_at = now()
   where event_id = target_event_id and player_id = target_player_id and last_edited_at < now();
  perform public.touch_event(target_event_id);
end;
$$;

revoke execute on function public.touch_event(uuid) from public, anon, authenticated;
revoke execute on function public.touch_event_player(uuid, uuid) from public, anon;
grant execute on function public.touch_event_player(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. What counts as an edit
-- ---------------------------------------------------------------------------

-- A note or rating added, edited or deleted (typed, voice or handwritten).
create function public.evaluations_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.touch_event_player(old.event_id, old.player_id);
  else
    perform public.touch_event_player(new.event_id, new.player_id);
  end if;
  return null;
end;
$$;

create trigger evaluations_touch
  after insert or update or delete on public.evaluations
  for each row execute function public.evaluations_touch();

-- A player added to or removed from an event (including a deleted player),
-- or their jersey number or rating color at this event changed.
create function public.event_players_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.touch_event(old.event_id);
  elsif tg_op = 'INSERT' then
    perform public.touch_event(new.event_id);
  else
    perform public.touch_event_player(new.event_id, new.player_id);
  end if;
  return null;
end;
$$;

create trigger event_players_touch_insert_delete
  after insert or delete on public.event_players
  for each row execute function public.event_players_touch();

create trigger event_players_touch_update
  after update of jersey_number, traffic_light on public.event_players
  for each row
  when (old.jersey_number is distinct from new.jersey_number or old.traffic_light is distinct from new.traffic_light)
  execute function public.event_players_touch();

-- A player's overall status set at an event (the status picker, rating
-- follow-ups, Queue for Outreach): these always record that event.
create function public.players_status_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status_event_id is not null then
    perform public.touch_event_player(new.status_event_id, new.id);
  end if;
  return null;
end;
$$;

create trigger players_status_touch
  after update of lifecycle_status, status_event_id on public.players
  for each row
  when (old.lifecycle_status is distinct from new.lifecycle_status
        or old.status_event_id is distinct from new.status_event_id)
  execute function public.players_status_touch();

-- Notes waiting for a player: added, edited, assigned or discarded.
create function public.waiting_notes_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.touch_event(old.event_id);
  else
    perform public.touch_event(new.event_id);
  end if;
  return null;
end;
$$;

create trigger waiting_notes_touch
  after insert or update or delete on public.waiting_notes
  for each row execute function public.waiting_notes_touch();

-- The event itself: name, date, closing or reopening.
create function public.events_touch_self()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.name, old.event_date, old.status, old.closed_at)
     is distinct from (new.name, new.event_date, new.status, new.closed_at) then
    new.last_edited_at := now();
  end if;
  return new;
end;
$$;

create trigger events_touch_self
  before update on public.events
  for each row execute function public.events_touch_self();

commit;
