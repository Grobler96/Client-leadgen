# Logging agent (read only)

An n8n workflow, **AI by AO: Inbox logger**, runs every 2 hours on weekdays. It reads the AI by AO Gmail account (credential "Olivers GMAIL" only, never the ATAM credentials) and keeps the CRM up to date through the CRM gateway.

## What it may do in Gmail

Only these read operations: list drafts, list and read messages and threads. It must never send, reply, forward, label, archive, mark read or delete. The workflow contains no Gmail node with any other operation, and a reviewer can check that by opening it.

Note for Oliver: the OAuth credential itself carries broad Gmail permissions, so the read only guarantee comes from the workflow design, not from Google. A tighter option is a separate Google OAuth client with only the `gmail.readonly` scope, used for a new credential just for this workflow.

## What each run does

1. Ask the gateway for open leads (`list_open`): drafted, sent or replied.
2. Read the latest 200 inbox messages and the latest 200 sent messages (Gmail "get many", read only). Gmail's own search filters proved unreliable through n8n, so matching is done inside n8n instead.
3. A Code step matches messages to open leads by sender or recipient address. Anything that is not from or to an open lead is dropped inside n8n and never sent anywhere. Messages from before a lead's draft are ignored.
4. Matched inbound mail is classified with simple rules:
   - from `mailer-daemon` or `postmaster`, or subject like "undeliverable": `bounce`
   - "out of office" or "automatic reply": `auto_reply`
   - "unsubscribe", "remove me", "stop emailing", "do not contact": `opt_out` (the address goes on the suppression list)
   - anything else: `reply`
5. Matched sent mail records `sent_at` for drafts Oliver has now sent.
6. Only the matched events go to the gateway (`record_reply`, `record_sent`), with a snippet capped at 300 characters. Full bodies are never stored.
7. A real reply starts with outcome `interested`. Oliver sets the real outcome (call booked, client, not interested) in the CRM. Reply summaries need a language model, which costs credits, so they stay off until Oliver approves.

## Follow up drafts

A second workflow, **AI by AO: Follow up drafts**, runs daily. It asks the gateway for leads sent 7 or more days ago with no reply (`followups_due`, maximum 2 follow ups, never for suppressed addresses) and creates a Gmail DRAFT in the same thread with a short, honest nudge. It never sends. Oliver reviews and sends.

## Needs before it can run

- A Header Auth credential in n8n named `AI by AO CRM gateway`, header `x-crm-secret`, whose value equals the `CRM_API_SECRET` function secret in Supabase.
- The gateway URL: `https://aobosyvlhgkxhjxkfzlz.supabase.co/functions/v1/aibyao-crm`
