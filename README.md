# Client leadgen

Client acquisition loop for AI by AO: find leads, draft outreach for review, record what happens, and learn from it.

## Rules

- Agents never contact anyone. Drafts only. Everything is reviewed and sent by a person.
- Changes arrive by pull request only. Nothing is merged automatically.
- No secrets in this repo. Use environment secrets or a vault.
- Cold outreach only to limited companies, with a relevant and honest message.
- Kept separate from ATAM and other client data.

## Layout

- `crm/` database schema for the lead tracker
- `agents/logging/` read only inbox logging agent
- `agents/coach/` weekly coach that proposes changes by pull request
