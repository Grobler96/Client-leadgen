# AI by AO client acquisition: status and handoff

Last updated 2026-10-27. No secrets in this file.

## What exists

| Part | Where | State |
|---|---|---|
| CRM | Supabase project N8N_Daniel_Spooner (id aobosyvlhgkxhjxkfzlz), schema `aibyao`, locked to anon and authenticated | Live. Migrations in `crm/` |
| CRM gateway | Edge function `aibyao-crm`, URL https://aobosyvlhgkxhjxkfzlz.supabase.co/functions/v1/aibyao-crm, secret CRM_API_SECRET | Live, tested |
| Lead to drafts workflow | n8n RGEswlwdsvFEJMHh | Updated, tested, PUBLISHED. Webhook rejects calls without the X-Lead-Secret header (403 checked) |
| Inbox logger (read only) | n8n ejRSt4Oeed2kiACJ | Built, tested with simulated Gmail data, PUBLISHED (runs every 2 hours on weekdays 8am to 6pm) |
| Follow up drafts | n8n 0K1teplwCdjXKsCE | Built, untested, NOT published |
| Dashboard | Artifact "Outreach Pipeline" https://claude.ai/artifact/9SVjbTs3ojk2aWS6SDbHmq | Built, live queries through the owner's Supabase connection |
| Lead research agent | `agents/lead-research/` (PR #2) | Not yet deployed to Anthropic |
| Coach agent | `agents/coach/` | Written, not deployed. Needs approval for about $3 per weekly run |

## To get the lead agent running

The n8n side is done. What is left is deploying the agent to the Anthropic account:

1. The environment needs `ANTHROPIC_API_KEY` as a plain environment variable (a header style secret does not reach api.anthropic.com, because that host bypasses the proxy that adds it) and `LEAD_WEBHOOK_SECRET` (same value as the n8n X-Lead-Secret credential).
2. Always `git pull` first. An older clone will not have this file.
3. Deploy `agents/lead-research/` with `ant apply` (build `ant` with `go install` if the release download is blocked) or the Python SDK. Create the vault with the webhook secret restricted to `atamcpi.app.n8n.cloud`, put its ID in `vault_ids`, and create the schedule PAUSED.
4. The budget amount `"500"` is in US cents, so $5 per run. Do not change it to "5".
5. Run one test (capped at $5), check drafts in Gmail and rows in the CRM, show Oliver, and only unpause the weekday schedule after Oliver approves.

## Open items

- Delete the CRM test row "ZZ Test Ltd (delete me)" and the Gmail draft "Test draft, please ignore".
- The n8n instance and the Supabase project belong to ATAM. Separation is by schema and credentials only.
- Hard rules: drafts only, no auto send, no pushes to main, PRs only, UK limited companies only for cold email, no invented claims.
