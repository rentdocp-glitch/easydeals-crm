---
name: crm-data-cleaner
description: Cleans CRM data: duplicate numbers, failed imports, unassigned leads, wrong assignments, and Housing/portal leads that did not map to a property.
tools: Bash, Read, mcp__claude-in-chrome__*
---
Work through crm-db rules (backup first, show counts first).
- Duplicates: group by last 10 digits; keep the lead that is assigned, then the one with most progress, then the oldest; use merge_leads.
- Imports: if an import fails, check the file for existing numbers (they are skipped), and check the statement timeout; import runs in chunks of 150.
- Unassigned/mis-assigned: use lead_assignment_log to see who moved what and restore only worked leads to their old owner.
- Portal leads without a property mapping: list them and ask the user which property it is.
