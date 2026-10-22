// AI by AO CRM gateway (Supabase Edge Function, name: aibyao-crm).
// Lets n8n and the agents work with the aibyao schema only. It never touches any other schema.
// Auth: header x-crm-secret must equal the CRM_API_SECRET function secret.
// Reads and writes only. It cannot send email.
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
const SECRET = Deno.env.get("CRM_API_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const OUTCOMES = ["no_reply", "interested", "call_booked", "client", "not_interested"];
const lc = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : null);

const actions: Record<string, (p: any) => Promise<unknown>> = {
  // Called by the lead workflow before drafting. Returns only leads that may be drafted.
  async register_leads(p) {
    const accepted: unknown[] = [];
    const rejected: unknown[] = [];
    for (const l of p.leads ?? []) {
      const email = lc(l.email);
      if (!email || !l.business_name || !l.subject || !l.body) { rejected.push({ business_name: l.business_name, reason: "missing_fields" }); continue; }
      const [sup] = await sql`select 1 from aibyao.suppressions where email = ${email} or email = ${email.split("@")[1]}`;
      if (sup) { rejected.push({ business_name: l.business_name, reason: "suppressed" }); continue; }
      const [row] = await sql`
        insert into aibyao.leads (company, contact_name, contact_email, industry, source, offer, subject_line, email_body,
                                  town, website, company_type, opportunity_score, variant, stage)
        values (${l.business_name}, ${l.contact_name ?? null}, ${email}, ${l.sector ?? null}, ${l.source ?? "lead agent"},
                ${l.offer ?? l.best_service_fit ?? null}, ${l.subject}, ${l.body}, ${l.town ?? null}, ${l.website ?? null},
                ${l.company_type ?? null}, ${l.opportunity_score ?? null}, ${l.variant ?? null}, 'registered')
        on conflict (lower(contact_email)) where contact_email is not null do nothing
        returning id`;
      if (!row) { rejected.push({ business_name: l.business_name, reason: "duplicate" }); continue; }
      accepted.push({ ...l, email, lead_id: row.id });
    }
    return { accepted, rejected };
  },

  async set_draft(p) {
    await sql`update aibyao.leads set gmail_draft_id = ${p.draft_id ?? null}, gmail_thread_id = ${p.thread_id ?? null},
              drafted_at = coalesce(drafted_at, now()), stage = 'drafted' where id = ${p.lead_id} and stage = 'registered'`;
    return { ok: true };
  },

  // For the logging agent: every lead still in play.
  async list_open() {
    return await sql`select id, contact_email, subject_line, gmail_draft_id, gmail_thread_id, stage, drafted_at, sent_at, replied_at, followup_count
                     from aibyao.leads where stage in ('drafted','sent','replied') order by drafted_at`;
  },

  async record_sent(p) {
    // sent_at is always recorded. The stage only moves forward from registered or drafted,
    // so a reply that arrived in the same window is never undone.
    await sql`update aibyao.leads set sent_at = coalesce(sent_at, ${p.sent_at ?? new Date().toISOString()}),
              gmail_thread_id = coalesce(gmail_thread_id, ${p.thread_id ?? null}),
              stage = case when stage in ('registered','drafted') then 'sent' else stage end
              where id = ${p.lead_id}`;
    return { ok: true };
  },

  async record_reply(p) {
    const kind = ["reply", "auto_reply", "bounce", "opt_out"].includes(p.kind) ? p.kind : "reply";
    const snippet = typeof p.snippet === "string" ? p.snippet.slice(0, 300) : null;
    await sql`insert into aibyao.reply_events (lead_id, gmail_message_id, received_at, kind, snippet)
              values (${p.lead_id}, ${p.message_id}, ${p.received_at ?? null}, ${kind}, ${snippet})
              on conflict (gmail_message_id) do nothing`;
    if (kind === "reply") {
      await sql`update aibyao.leads set reply_status = 'replied', replied_at = coalesce(replied_at, ${p.received_at ?? new Date().toISOString()}),
                reply_summary = coalesce(${p.summary ?? null}, reply_summary), stage = 'replied',
                outcome = case when outcome = 'no_reply' then coalesce(${OUTCOMES.includes(p.outcome) ? p.outcome : null}, 'interested') else outcome end
                where id = ${p.lead_id}`;
    } else if (kind === "auto_reply") {
      await sql`update aibyao.leads set reply_status = case when reply_status = 'no_reply' then 'auto_reply' else reply_status end where id = ${p.lead_id}`;
    } else if (kind === "bounce") {
      await sql`update aibyao.leads set reply_status = 'bounced', stage = 'closed' where id = ${p.lead_id}`;
    } else if (kind === "opt_out") {
      const [l] = await sql`select contact_email from aibyao.leads where id = ${p.lead_id}`;
      if (l?.contact_email) await sql`insert into aibyao.suppressions (email, reason, source) values (${l.contact_email}, 'opt_out', 'reply') on conflict do nothing`;
      await sql`update aibyao.leads set reply_status = 'replied', replied_at = coalesce(replied_at, now()), outcome = 'not_interested', stage = 'suppressed' where id = ${p.lead_id}`;
    }
    return { ok: true };
  },

  // Oliver (or the coach) can set the outcome by hand.
  async set_outcome(p) {
    if (!OUTCOMES.includes(p.outcome)) throw new Error("bad outcome");
    await sql`update aibyao.leads set outcome = ${p.outcome}, notes = coalesce(${p.notes ?? null}, notes),
              stage = case when ${p.outcome} in ('client','not_interested') then 'closed' else stage end where id = ${p.lead_id}`;
    return { ok: true };
  },

  async add_suppression(p) {
    const e = lc(p.email);
    if (!e) throw new Error("email required");
    await sql`insert into aibyao.suppressions (email, reason, source) values (${e}, ${p.reason ?? "opt_out"}, ${p.source ?? "manual"}) on conflict do nothing`;
    await sql`update aibyao.leads set stage = 'suppressed' where lower(contact_email) = ${e} and stage <> 'closed'`;
    return { ok: true };
  },

  // Sent, no reply, due a follow up draft (5 working days ~ 7 calendar days, max 2 follow ups).
  async followups_due() {
    return await sql`select id, company, contact_email, subject_line, email_body, gmail_thread_id, followup_count, sent_at
                     from aibyao.leads
                     where stage = 'sent' and reply_status = 'no_reply' and followup_count < 2
                       and coalesce(last_followup_at, sent_at) < now() - interval '7 days'
                       and not exists (select 1 from aibyao.suppressions s where s.email = lower(contact_email))
                     order by sent_at limit 25`;
  },
  async mark_followup(p) {
    await sql`update aibyao.leads set followup_count = followup_count + 1, last_followup_at = now() where id = ${p.lead_id}`;
    return { ok: true };
  },

  async stats() {
    const [totals] = await sql`select count(*) leads, count(sent_at) sent, count(*) filter (where reply_status='replied') replies,
                               count(*) filter (where outcome='call_booked') calls, count(*) filter (where outcome='client') clients
                               from aibyao.leads`;
    return { totals, performance: await sql`select * from aibyao.v_performance order by dim, sent desc` };
  },

  // Coach input: sent leads with the exact email and result. No contact emails leave the database.
  async coach_data(p) {
    const days = Math.min(Number(p.days ?? 90), 365);
    return await sql`select company, industry, town, offer, variant, subject_line, email_body, email_word_count, opportunity_score,
                            sent_at, reply_status, outcome, reply_summary, followup_count
                     from aibyao.leads where sent_at > now() - make_interval(days => ${days}) order by sent_at`;
  },
  async save_report(p) {
    await sql`insert into aibyao.coach_reports (week_start, report_md, pr_url) values (${p.week_start}, ${p.report_md}, ${p.pr_url ?? null})
              on conflict (week_start) do update set report_md = excluded.report_md, pr_url = excluded.pr_url`;
    return { ok: true };
  },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!safeEqual(req.headers.get("x-crm-secret") ?? "", SECRET)) return json({ error: "unauthorised" }, 401);
  try {
    const body = await req.json();
    const fn = actions[body.action];
    if (!fn) return json({ error: "unknown action" }, 400);
    return json({ ok: true, data: await fn(body) });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
