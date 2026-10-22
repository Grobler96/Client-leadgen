-- Stage 2 of the AI by AO CRM: opt outs, reply log, experiments, follow ups, coach reports, stats views.
-- Everything lives in the aibyao schema. No grants to anon or authenticated.

alter table aibyao.leads
  add column if not exists town             text,
  add column if not exists website          text,
  add column if not exists company_type     text,
  add column if not exists contact_route    text not null default 'email',
  add column if not exists opportunity_score integer check (opportunity_score between 1 and 10),
  add column if not exists variant          text,        -- experiment tag set by the lead agent, e.g. "len:short|offer:call|subj:question"
  add column if not exists gmail_draft_id   text,
  add column if not exists followup_count   integer not null default 0,
  add column if not exists last_followup_at timestamptz,
  add column if not exists stage            text not null default 'registered'
    check (stage in ('registered','drafted','sent','replied','closed','suppressed'));

create unique index if not exists leads_email_uniq on aibyao.leads (lower(contact_email)) where contact_email is not null;
create index if not exists leads_stage_idx on aibyao.leads (stage);

-- Anyone here is never drafted for again.
create table if not exists aibyao.suppressions (
  email      text primary key check (email = lower(email)),
  reason     text not null default 'opt_out',
  source     text,
  created_at timestamptz not null default now()
);

-- One row per inbound message, short snippet only (data minimisation).
create table if not exists aibyao.reply_events (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid references aibyao.leads(id) on delete cascade,
  gmail_message_id text not null unique,
  received_at      timestamptz,
  kind             text not null check (kind in ('reply','auto_reply','bounce','opt_out')),
  snippet          text check (char_length(snippet) <= 300),
  created_at       timestamptz not null default now()
);

create table if not exists aibyao.coach_reports (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null unique,
  report_md   text not null,
  pr_url      text,
  created_at  timestamptz not null default now()
);

-- Reply rates by dimension. n is the number of emails SENT; small n means "worth trying", not proven.
create or replace view aibyao.v_performance with (security_invoker = true) as
with sent as (select * from aibyao.leads where sent_at is not null)
select dim, value, count(*) as sent, count(*) filter (where reply_status = 'replied') as replies,
       count(*) filter (where outcome in ('interested','call_booked','client')) as positive,
       round(100.0 * count(*) filter (where reply_status = 'replied') / count(*), 1) as reply_rate_pct
from (
  select 'industry' dim, coalesce(industry,'unknown') value, reply_status, outcome from sent
  union all select 'offer', coalesce(offer,'unknown'), reply_status, outcome from sent
  union all select 'variant', coalesce(variant,'untagged'), reply_status, outcome from sent
  union all select 'length', case when email_word_count < 80 then 'under 80 words'
                                  when email_word_count <= 100 then '80 to 100 words'
                                  else 'over 100 words' end, reply_status, outcome from sent
  union all select 'town', coalesce(town,'unknown'), reply_status, outcome from sent
) s group by dim, value;

alter table aibyao.suppressions  enable row level security;
alter table aibyao.reply_events  enable row level security;
alter table aibyao.coach_reports enable row level security;
revoke all on aibyao.suppressions, aibyao.reply_events, aibyao.coach_reports, aibyao.v_performance from anon, authenticated, public;
