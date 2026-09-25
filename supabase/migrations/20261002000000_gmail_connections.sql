-- Gmail connections for The Docket: one per staff member, so the app can
-- read that coach's recent emails (read-only) without asking again each time.
-- The tokens are encrypted by the app (with GMAIL_TOKEN_KEY, which only the
-- server has) before they're stored, so this table only ever holds ciphertext.
-- Run once in Supabase → SQL Editor, after the earlier migrations.
-- All-or-nothing: if any step fails, nothing changes.

begin;

create table public.gmail_connections (
  staff_id                uuid primary key references public.staff (id) on delete cascade,
  google_email            text not null,
  refresh_token           text not null,   -- encrypted
  access_token            text,            -- encrypted
  access_token_expires_at timestamptz,
  scopes                  text not null,
  connected_at            timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger gmail_connections_set_updated_at before update on public.gmail_connections
  for each row execute function public.set_updated_at();

-- Only you can see or change your own connection; other staff can't even see
-- whether you've connected.
alter table public.gmail_connections enable row level security;

create policy "Staff manage their own Gmail connection" on public.gmail_connections
  for all to authenticated
  using (staff_id = (select auth.uid()))
  with check (staff_id = (select auth.uid()));

commit;
