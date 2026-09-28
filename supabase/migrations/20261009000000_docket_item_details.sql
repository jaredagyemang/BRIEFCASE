-- Who sent each Docket email, and its subject and date, saved with its Info
-- card so The Docket's search can show and match them without reading Gmail
-- again. Filled in as cards are read; cards read earlier get them the next
-- time they appear in The Docket.
-- Run once in Supabase → SQL Editor, after 20261008000000_team_share_notes.sql.

alter table public.docket_items
  add column sender_name  text,
  add column sender_email text,
  add column subject      text,
  add column email_date   timestamptz;
