-- Jersey numbers for players, filled in by roster scanning or by hand.
-- Stored as text so values like "00" or "7A" keep their exact form.
-- Run once in Supabase → SQL Editor, after the earlier migrations.

alter table public.players
  add column if not exists jersey_number text
  check (char_length(jersey_number) <= 10);
