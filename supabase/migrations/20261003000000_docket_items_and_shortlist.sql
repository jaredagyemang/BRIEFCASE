-- The Docket's Info cards and the shared Shortlist.
-- Run once in Supabase → SQL Editor, after 20261002000000_gmail_connections.sql.
-- All-or-nothing: if any step fails, nothing changes.

begin;

-- ---------------------------------------------------------------------------
-- docket_items: one row per coach per email in their Docket. Holds what the
-- AI read from the email (so each email is only read once) and what the coach
-- did with it. The email itself isn't stored. Private to each coach, like the
-- inbox it comes from.
-- ---------------------------------------------------------------------------

create table public.docket_items (
  staff_id          uuid not null references public.staff (id) on delete cascade,
  gmail_message_id  text not null,
  gmail_thread_id   text not null,
  -- The Info card: each field is null (not in the email) or
  -- {"value": "...", "source": "stated" | "inferred"}.
  extraction        jsonb,
  extraction_model  text,
  extracted_at      timestamptz,
  skipped_at        timestamptz,            -- hidden from this coach's feed
  replied_at        timestamptz,
  reply_template    text check (reply_template in ('lets_connect', 'not_interested', 'wrong_position', 'wrong_grad_year')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (staff_id, gmail_message_id)
);

create trigger docket_items_set_updated_at before update on public.docket_items
  for each row execute function public.set_updated_at();

alter table public.docket_items enable row level security;

create policy "Staff manage their own Docket items" on public.docket_items
  for all to authenticated
  using (staff_id = (select auth.uid()))
  with check (staff_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- shortlist: shared by all staff, like Events. Other coaches can't see the
-- inbox a player came from, so shortlisting copies a snapshot: the Info card
-- fields, who sent it, and the video links (so everyone can watch the film).
-- ---------------------------------------------------------------------------

create table public.shortlist (
  id                uuid primary key default gen_random_uuid(),
  -- Where it came from: whose inbox, and which email there.
  source_staff_id   uuid references public.staff (id) on delete set null,
  gmail_message_id  text not null,
  -- Info card snapshot, same shape as docket_items.extraction.
  info              jsonb not null,
  sender_name       text,
  sender_email      text,
  subject           text,
  email_date        timestamptz,
  -- [{"url": "...", "platform": "youtube" | "hudl" | "veo" | "gdoc"}]
  links             jsonb not null default '[]',
  added_by          uuid references public.staff (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  -- The same email can only be shortlisted once.
  unique (source_staff_id, gmail_message_id)
);

create index shortlist_created_idx on public.shortlist (created_at desc);

alter table public.shortlist enable row level security;

create policy "Staff can see the shortlist" on public.shortlist
  for select to authenticated using (true);
create policy "Staff can shortlist from their own Docket" on public.shortlist
  for insert to authenticated
  with check (source_staff_id = (select auth.uid()) and added_by = (select auth.uid()));
create policy "Staff can remove from the shortlist" on public.shortlist
  for delete to authenticated using (true);

commit;
