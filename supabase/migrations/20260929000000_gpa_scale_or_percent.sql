-- Store GPA exactly as the roster or coach gives it: a 4.0-scale number or a
-- percentage, never converted between the two. Previously gpa was
-- numeric(3,2) limited to 0-5, which can't hold percentages.
-- Run once in Supabase → SQL Editor, after the earlier migrations.
--
-- Accepted formats (the app tidies input into these before saving):
--   4.0 scale   0-5, up to 2 decimals      "3.6"   "3.85"   "4.2"
--   percentage  0-100%, up to 2 decimals   "85%"   "92.5%"
--   ranges of either kind                  "3.5-3.8"   "80%-90%"
-- Existing values carry over unchanged (e.g. 3.50 becomes "3.50").

begin;

alter table public.players drop constraint if exists players_gpa_check;

alter table public.players alter column gpa type text using gpa::text;

alter table public.players add constraint players_gpa_format check (
  gpa ~ (
    '^('
    || '([0-4](\.[0-9]{1,2})?|5(\.0{1,2})?)(-([0-4](\.[0-9]{1,2})?|5(\.0{1,2})?))?'
    || '|'
    || '(100(\.0{1,2})?|[0-9]{1,2}(\.[0-9]{1,2})?)%(-(100(\.0{1,2})?|[0-9]{1,2}(\.[0-9]{1,2})?)%)?'
    || ')$'
  )
);

commit;
