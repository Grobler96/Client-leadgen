# Logging agent (read only)

An n8n workflow, **AI by AO: Inbox logger**, runs every 2 hours on weekdays. It reads the AI by AO Gmail account (credential "Olivers GMAIL" only, never the ATAM credentials) and keeps the CRM up to date through the CRM gateway.

## What it may do in Gmail

Only these read operations: list drafts, list and read messages and threads. It must never send, reply, forward, label, archive, mark read or delete. The workflow contains no Gmail node with any other operation, and a reviewer can check that by opening it.

Note for Oliver: the OAuth credential itself carries broad Gmail permissions, so the read only guarantee comes from the workflow design, not from Google. A tighter option is a separate Google OAuth client with only the `gmail.readonly` scope, used for a new credential just for this workflow.

## What each run does

1. Ask the gateway for open leads (`list_open`): drafted, sent or replied.
2. For each lead with a draft ID: if the draft is gone and a message to that address now exists in Sent, call `record_sent` with the sent time and thread ID. (Sent detection reads the Sent folder as well as the inbox. This is the only reason that folder is read.)
3. For each lead with a thread ID: read new inbound messages in the thread and classify each one with simple rules first:
   - sender is `mailer-daemon` or `postmaster`, or the subject starts "Undeliverable": `bounce`
   - headers `Auto-Submitted` or `X-Autoreply`, or subject contains "out of office" or "automatic reply": `auto_reply`
   - body contains "unsubscribe", "remove me", "stop emailing", "do not contact": `opt_out` (the gateway adds the address to the suppression list)
   - anything else: `reply`
4. Call `record_reply` with the first 300 characters only as the snippet. Full bodies are never stored.
5. A real `reply` is stored with outcome `interested` as a starting point. Oliver sets the real outcome (call booked, client, not interested) in the CRM. A short reply summary needs a language model, which costs credits, so it stays switched off until Oliver approves it.

## Follow up drafts

A second workflow, **AI by AO: Follow up drafts**, runs daily. It asks the gateway for leads sent 7 or more days ago with no reply (`followups_due`, maximum 2 follow ups, never for suppressed addresses) and creates a Gmail DRAFT in the same thread with a short, honest nudge. It never sends. Oliver reviews and sends.

## Needs before it can run

- A Header Auth credential in n8n named `AI by AO CRM gateway`, header `x-crm-secret`, whose value equals the `CRM_API_SECRET` function secret in Supabase.
- The gateway URL: `https://aobosyvlhgkxhjxkfzlz.supabase.co/functions/v1/aibyao-crm`
