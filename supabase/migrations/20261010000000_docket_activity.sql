-- Team activity on The Docket's home: who shortlisted, shared, removed or
-- turned down which player, and when. Seen by all staff.
--
-- Only the fact of each action is kept: the coach, the action, the player's
-- name from the Info card, the share note (written by the coach) and when.
-- Nothing from the email itself (no subject, sender, text or links). The
-- email's id is kept only so tapping an entry can open the right Info card
-- for the coach whose inbox it's in.
--
-- The database writes these rows itself when a Shortlist, Share or reply
-- happens, so nothing is missed (including removals, which leave nothing
-- else behind). Coaches can read them but can't add, change or delete them.
--
-- Run once in Supabase → SQL Editor, after 20261009000000_docket_item_details.sql.
-- All-or-nothing: if any step fails, nothing changes.

begin;

create table public.docket_activity (
  id                uuid primary key default gen_random_uuid(),
  -- Who did it.
  actor_id          uuid references public.staff (id) on delete set null,
  action            text not null check (action in ('shortlisted', 'unshortlisted', 'shared', 'unshared', 'replied')),
  -- Replies that close a player out only ("Let's Connect" stays open).
  reply_template    text check (reply_template in ('not_interested', 'wrong_position', 'wrong_grad_year')),
  player_name       text,
  -- The optional note when sharing with the team.
  note              text check (char_length(note) <= 500),
  -- Which email, in whose inbox.
  source_staff_id   uuid references public.staff (id) on delete set null,
  gmail_message_id  text not null,
  created_at        timestamptz not null default now(),
  check ((action = 'replied') = (reply_template is not null))
);

create index docket_activity_created_idx on public.docket_activity (created_at desc);
create index docket_activity_email_idx on public.docket_activity (source_staff_id, gmail_message_id);

alter table public.docket_activity enable row level security;

create policy "Staff can see team activity" on public.docket_activity
  for select to authenticated using (true);
-- No insert, update or delete policies: only the functions below write here.

-- ---------------------------------------------------------------------------
-- Recording activity. These run with the database owner's rights (security
-- definer) because coaches can't write to the table themselves.
-- ---------------------------------------------------------------------------

-- Shortlist and "Shared with team": added or removed (by any coach).
create function public.docket_list_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  added text := case when tg_table_name = 'shortlist' then 'shortlisted' else 'shared' end;
  removed text := case when tg_table_name = 'shortlist' then 'unshortlisted' else 'unshared' end;
begin
  if tg_op = 'INSERT' then
    insert into public.docket_activity (actor_id, action, player_name, note, source_staff_id, gmail_message_id, created_at)
    values (
      coalesce(auth.uid(), new.added_by), added, new.info -> 'name' ->> 'value',
      case when tg_table_name = 'team_shares' then to_jsonb(new) ->> 'note' end,
      new.source_staff_id, new.gmail_message_id, new.created_at
    );
    return null;
  end if;
  insert into public.docket_activity (actor_id, action, player_name, source_staff_id, gmail_message_id)
  values (auth.uid(), removed, old.info -> 'name' ->> 'value', old.source_staff_id, old.gmail_message_id);
  return null;
end;
$$;

create trigger shortlist_activity
  after insert or delete on public.shortlist
  for each row execute function public.docket_list_activity();

create trigger team_shares_activity
  after insert or delete on public.team_shares
  for each row execute function public.docket_list_activity();

-- A reply that turns the player down, sent from a coach's Docket.
create function public.docket_reply_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reply_template in ('not_interested', 'wrong_position', 'wrong_grad_year')
     and new.replied_at is not null
     and (tg_op = 'INSERT' or new.replied_at is distinct from old.replied_at) then
    insert into public.docket_activity (actor_id, action, reply_template, player_name, source_staff_id, gmail_message_id, created_at)
    values (new.staff_id, 'replied', new.reply_template, new.extraction -> 'name' ->> 'value',
            new.staff_id, new.gmail_message_id, new.replied_at);
  end if;
  return null;
end;
$$;

create trigger docket_items_reply_activity
  after insert or update of replied_at, reply_template on public.docket_items
  for each row execute function public.docket_reply_activity();

revoke execute on function public.docket_list_activity() from public, anon, authenticated;
revoke execute on function public.docket_reply_activity() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Past activity that can be recovered, at its original time: what's on the
-- Shortlist and "Shared with team" now, and past replies turning a player
-- down. (Past removals left nothing behind, so they can't be.)
-- ---------------------------------------------------------------------------

insert into public.docket_activity (actor_id, action, player_name, source_staff_id, gmail_message_id, created_at)
select added_by, 'shortlisted', info -> 'name' ->> 'value', source_staff_id, gmail_message_id, created_at
  from public.shortlist;

insert into public.docket_activity (actor_id, action, player_name, note, source_staff_id, gmail_message_id, created_at)
select added_by, 'shared', info -> 'name' ->> 'value', note, source_staff_id, gmail_message_id, created_at
  from public.team_shares;

insert into public.docket_activity (actor_id, action, reply_template, player_name, source_staff_id, gmail_message_id, created_at)
select staff_id, 'replied', reply_template, extraction -> 'name' ->> 'value', staff_id, gmail_message_id, replied_at
  from public.docket_items
 where reply_template in ('not_interested', 'wrong_position', 'wrong_grad_year')
   and replied_at is not null;

commit;
