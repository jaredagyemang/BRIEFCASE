-- Outlook / Microsoft 365 alongside Gmail. A coach connects one mailbox at a
-- time (Gmail or Outlook); this says which. Existing connections are Gmail.
--
-- The rest of the table is shared by both: google_email holds the
-- connected address for either provider, and the tokens are encrypted the
-- same way (with GMAIL_TOKEN_KEY). The Docket's gmail_message_id and
-- gmail_thread_id columns (docket_items, shortlist, team_shares,
-- docket_activity) likewise hold Outlook's message and conversation ids.
--
-- Run once in Supabase → SQL Editor, after 20261011000000_terms_and_tutorial.sql.

alter table public.gmail_connections
  add column provider text not null default 'google' check (provider in ('google', 'microsoft'));

comment on column public.gmail_connections.google_email is 'The connected email address (Gmail or Outlook).';
comment on column public.gmail_connections.provider is 'google (Gmail) or microsoft (Outlook / Microsoft 365).';
