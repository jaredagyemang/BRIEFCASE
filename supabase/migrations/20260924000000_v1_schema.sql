-- Briefcase V1 schema: coaches, players, evaluations, tasks.
-- Run once in Supabase → SQL Editor (or with `supabase db push`).
--
-- Access model (V1): one shared staff login. Any signed-in user can read and
-- write everything; logged-out visitors can read nothing.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.lifecycle_status as enum (
  'unscreened',
  'watch_again',          -- Watch Again / Needs Film
  'needs_staff_review',
  'to_be_contacted',
  'in_communication',
  'campus_visit_offered', -- Campus Visit / Offered
  'committed',
  'no_longer_pursuing',
  'archived'              -- Archived / Pass
);

create type public.traffic_light as enum ('green', 'yellow', 'red');

create type public.task_type as enum (
  'outreach',       -- Green → "Queue for Outreach"
  'watch_again',    -- Yellow → "Watch Again"
  'request_film',   -- Yellow → "Request Film & Info"
  'follow_up',
  'other'
);

create type public.task_status as enum ('open', 'done', 'cancelled');

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- College coach contacts (and staff, via players.assigned_coach_id).
create table public.coaches (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text not null,
  title        text,
  email        text,
  cell_phone   text,
  office_phone text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.players (
  id                uuid primary key default gen_random_uuid(),
  first_name        text not null,
  last_name         text not null,
  grad_year         smallint check (grad_year between 2000 and 2100),
  position          text,
  club_team         text,
  gpa               numeric(3, 2) check (gpa between 0 and 5),
  phone             text,
  email             text,
  traffic_light     public.traffic_light,
  lifecycle_status  public.lifecycle_status not null default 'unscreened',
  assigned_coach_id uuid references public.coaches (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.evaluations (
  id                   uuid primary key default gen_random_uuid(),
  player_id            uuid not null references public.players (id) on delete cascade,
  coach_id             uuid references public.coaches (id) on delete set null,
  traffic_light_rating public.traffic_light,
  -- Path of the recording inside the private "voice-notes" storage bucket.
  raw_audio_url        text,
  transcript_text      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references public.players (id) on delete cascade,
  assigned_coach_id uuid references public.coaches (id) on delete set null,
  task_type         public.task_type not null,
  due_date          date,
  status            public.task_status not null default 'open',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index players_lifecycle_status_idx on public.players (lifecycle_status);
create index players_last_name_idx on public.players (last_name, first_name);
create index players_assigned_coach_id_idx on public.players (assigned_coach_id);
create index evaluations_player_id_idx on public.evaluations (player_id, created_at desc);
create index evaluations_coach_id_idx on public.evaluations (coach_id);
create index tasks_player_id_idx on public.tasks (player_id);
create index tasks_assigned_coach_id_idx on public.tasks (assigned_coach_id);
create index tasks_open_due_idx on public.tasks (due_date) where status = 'open';

create trigger coaches_set_updated_at before update on public.coaches
  for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on public.players
  for each row execute function public.set_updated_at();
create trigger evaluations_set_updated_at before update on public.evaluations
  for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security: signed-in staff get full access, everyone else nothing
-- ---------------------------------------------------------------------------

alter table public.coaches     enable row level security;
alter table public.players     enable row level security;
alter table public.evaluations enable row level security;
alter table public.tasks       enable row level security;

create policy "Staff full access" on public.coaches
  for all to authenticated using (true) with check (true);
create policy "Staff full access" on public.players
  for all to authenticated using (true) with check (true);
create policy "Staff full access" on public.evaluations
  for all to authenticated using (true) with check (true);
create policy "Staff full access" on public.tasks
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Storage: private bucket for voice notes
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

create policy "Staff read voice notes" on storage.objects
  for select to authenticated using (bucket_id = 'voice-notes');
create policy "Staff upload voice notes" on storage.objects
  for insert to authenticated with check (bucket_id = 'voice-notes');
create policy "Staff update voice notes" on storage.objects
  for update to authenticated using (bucket_id = 'voice-notes');
create policy "Staff delete voice notes" on storage.objects
  for delete to authenticated using (bucket_id = 'voice-notes');
