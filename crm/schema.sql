-- AI by AO outreach CRM schema (Postgres / Supabase).
-- One row per lead. Contains no secrets. Apply to a dedicated AI by AO project only,
-- never to any ATAM or client project.

create table if not exists public.leads (
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

create index if not exists leads_outcome_idx on public.leads (outcome);
create index if not exists leads_industry_idx on public.leads (industry);
create index if not exists leads_sent_at_idx on public.leads (sent_at);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- Lock the table down. No policies means anon and authenticated roles get nothing;
-- only the service role key (held in an environment secret) can read or write.
alter table public.leads enable row level security;
