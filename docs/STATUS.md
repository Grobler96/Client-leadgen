# AI by AO client acquisition: status and handoff

Last updated 2026-10-22. No secrets in this file.

## What exists

| Part | Where | State |
|---|---|---|
| CRM | Supabase project N8N_Daniel_Spooner (id aobosyvlhgkxhjxkfzlz), schema `aibyao`, locked to anon and authenticated | Live. Migrations in `crm/` |
| CRM gateway | Edge function `aibyao-crm`, URL https://aobosyvlhgkxhjxkfzlz.supabase.co/functions/v1/aibyao-crm, secret CRM_API_SECRET | Live, tested |
| Lead to drafts workflow | n8n RGEswlwdsvFEJMHh | Updated, tested, NOT published. Needs the X-Lead-Secret Header Auth credential on the webhook node |
| Inbox logger (read only) | n8n ejRSt4Oeed2kiACJ | Built, tested with simulated Gmail data, NOT published |
| Follow up drafts | n8n 0K1teplwCdjXKsCE | Built, untested, NOT published |
| Dashboard | Artifact "Outreach Pipeline" https://claude.ai/artifact/9SVjbTs3ojk2aWS6SDbHmq | Built, live queries through the owner's Supabase connection |
| Lead research agent | `agents/lead-research/` (PR #2) | Not yet deployed to Anthropic |
| Coach agent | `agents/coach/` | Written, not deployed. Needs approval for about $3 per weekly run |

## To get the lead agent running

1. In n8n, create a Header Auth credential on the webhook node (header `X-Lead-Secret`, long random value) and publish the lead workflow, then the logger.
2. Add environment variables ANTHROPIC_API_KEY and LEAD_WEBHOOK_SECRET (same value as step 1) to the Claude Code cloud environment, then start a new session.
3. Deploy `agents/lead-research/` to the Anthropic account (CLI `ant apply` per its README, or the Python SDK if the CLI download is blocked). Create the schedule paused.
4. Run one test run (capped at $5), check drafts in Gmail and rows in the CRM, then unpause the weekday schedule.

## Open items

- Delete the CRM test row "ZZ Test Ltd (delete me)" and the Gmail draft "Test draft, please ignore".
- The n8n instance and the Supabase project belong to ATAM. Separation is by schema and credentials only.
- Hard rules: drafts only, no auto send, no pushes to main, PRs only, UK limited companies only for cold email, no invented claims.
