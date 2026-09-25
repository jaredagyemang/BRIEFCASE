-- Events: organize players, ratings, and notes by the showcase where they
-- were seen. A player can be seen at many events; each event keeps its own
-- rating and notes for them. Existing data moves into a closed
-- "Testing Event" event, so nothing is lost.
-- Run once in Supabase → SQL Editor, after the earlier migrations.
-- All-or-nothing: if any step fails, nothing changes.

begin;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create type public.event_status as enum ('active', 'closed');

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 120),
  event_date date not null,
  status     public.event_status not null default 'active',
  closed_at  timestamptz,
  created_by uuid references public.staff (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_status_date_idx on public.events (status, event_date desc);

create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- event_players: who was seen at which event, with what belongs to that
-- appearance (the rating color and jersey number at that event)
-- ---------------------------------------------------------------------------

create table public.event_players (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  player_id     uuid not null references public.players (id) on delete cascade,
  jersey_number text check (char_length(jersey_number) <= 10),
  traffic_light public.traffic_light,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (event_id, player_id)
);

create index event_players_player_id_idx on public.event_players (player_id);

create trigger event_players_set_updated_at before update on public.event_players
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ratings and notes belong to an event; the overall status remembers which
-- event it was last set at
-- ---------------------------------------------------------------------------

alter table public.evaluations
  add column event_id uuid references public.events (id) on delete cascade;

alter table public.players
  add column status_event_id uuid references public.events (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Move existing data into a closed "Testing Event" event
-- ---------------------------------------------------------------------------

do $$
declare
  legacy_id uuid;
begin
  if exists (select 1 from public.players) then
    insert into public.events (name, event_date, status, closed_at, created_by)
    values (
      'Testing Event',
      (select min(created_at)::date from public.players),
      'closed',
      now(),
      null
    )
    returning id into legacy_id;

    -- Every player, with their current rating color and jersey number.
    insert into public.event_players (event_id, player_id, jersey_number, traffic_light)
    select legacy_id, id, jersey_number, traffic_light from public.players;

    -- Every rating and note (typed and voice), keeping who made it and when.
    update public.evaluations set event_id = legacy_id;

    -- Existing statuses are tagged as set before events.
    update public.players set status_event_id = legacy_id;
  end if;
end $$;

alter table public.evaluations alter column event_id set not null;
create index evaluations_event_player_idx on public.evaluations (event_id, player_id, created_at desc);

-- These now live on event_players (copied above).
alter table public.players drop column traffic_light;
alter table public.players drop column jersey_number;

-- ---------------------------------------------------------------------------
-- Row-Level Security: shared staff pool, like players
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.event_players enable row level security;

create policy "Staff can read events" on public.events
  for select to authenticated using (true);
create policy "Staff can create events" on public.events
  for insert to authenticated with check (true);
create policy "Staff can edit events" on public.events
  for update to authenticated using (true) with check (true);

create policy "Staff full access" on public.event_players
  for all to authenticated using (true) with check (true);

commit;
