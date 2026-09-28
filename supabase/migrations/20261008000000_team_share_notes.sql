-- An optional note for the team when sharing a Docket Info card
-- ("Coach, look at #7"), shown on the "Shared with team" list.
-- Run once in Supabase → SQL Editor, after 20261007000000_team_shares.sql.

alter table public.team_shares
  add column note text check (char_length(note) <= 500);
