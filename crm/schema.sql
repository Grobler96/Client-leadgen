-- AI by AO outreach CRM schema (Postgres / Supabase).
-- One row per lead. Contains no secrets.
-- Applied to the aibyao schema of the N8N_Daniel_Spooner Supabase project (owner approved).
-- The schema is not exposed via the API and anon/authenticated have no grants.

create schema if not exists aibyao;
revoke all on schema aibyao from anon, authenticated, public;

create table if not exists aibyao.leads (
  id               uuid primary key default gen_random_uuid(),
  company          text not null,
  company_number   text,                -- Companies House number, supports the limited company check
  contact_name     text,
  contact_email    text,
  industry         text,
  source           text,                -- where the lead agent found them
  offer            text,                -- which offer the email led with
  subject_line     text,
  email_body       text,                -- the exact email sent
  email_word_count integer generated always as (
    case when email_body is null then null
         else coalesce(array_length(regexp_split_to_array(trim(email_body), '\s+'), 1), 0) end
  ) stored,
  gmail_thread_id  text unique,         -- links the CRM row to the Gmail thread
  drafted_at       timestamptz,
  sent_at          timestamptz,
  replied_at       timestamptz,
  reply_status     text not null default 'no_reply'
                   check (reply_status in ('no_reply','replied','auto_reply','bounced')),
  reply_summary    text,                -- short summary only, written by the logging agent
  outcome          text not null default 'no_reply'
                   check (outcome in ('no_reply','interested','call_booked','client','not_interested')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists leads_outcome_idx on aibyao.leads (outcome);
create index if not exists leads_industry_idx on aibyao.leads (industry);
create index if not exists leads_sent_at_idx on aibyao.leads (sent_at);

create or replace function aibyao.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists leads_set_updated_at on aibyao.leads;
create trigger leads_set_updated_at before update on aibyao.leads
  for each row execute function aibyao.set_updated_at();

-- Lock the table down. No policies means anon and authenticated roles get nothing;
-- only the service role key (held in an environment secret) can read or write.
alter table aibyao.leads enable row level security;
revoke all on aibyao.leads from anon, authenticated, public;
