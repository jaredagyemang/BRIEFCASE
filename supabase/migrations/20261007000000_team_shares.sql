-- "Shared with team": Docket Info cards a coach shares for all staff to see,
-- separate from the Shortlist (an email can be on either, both, or neither).
-- Same shape and rules as the shortlist table: other coaches can't see the
-- inbox it came from, so sharing copies a snapshot: the Info card fields,
-- who sent it, and the video links.
-- Run once in Supabase → SQL Editor, after 20261006000000_last_edited.sql.
-- All-or-nothing: if any step fails, nothing changes.

begin;

create table public.team_shares (
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
  -- Who shared it.
  added_by          uuid references public.staff (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  -- The same email can only be shared once.
  unique (source_staff_id, gmail_message_id)
);

create index team_shares_created_idx on public.team_shares (created_at desc);

alter table public.team_shares enable row level security;

create policy "Staff can see what's shared with the team" on public.team_shares
  for select to authenticated using (true);
create policy "Staff can share from their own Docket" on public.team_shares
  for insert to authenticated
  with check (source_staff_id = (select auth.uid()) and added_by = (select auth.uid()));
create policy "Staff can remove shared items" on public.team_shares
  for delete to authenticated using (true);

commit;
