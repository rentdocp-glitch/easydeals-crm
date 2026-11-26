# Proposed database changes (NOT applied)

Files in this folder have **not** been run on the live Supabase project. Each one needs Ashok's approval first.

How to run one (after approval):
1. Supabase dashboard → project `sfvpslsexobukgerkixi` → SQL Editor → New query.
2. Take a backup first: in the CRM, open the admin menu and tap "💾 Full backup".
3. Paste the file and press Run. Every file can safely be run twice.
4. To undo, run the "ROLLBACK" block at the end of the same file.

| File | What it does | Risk |
| --- | --- | --- |
| `00_schema_export_readonly.sql` | Read-only. Lists tables, columns, RLS policies, functions and triggers so the schema can be saved into the repo (`supabase/schema_snapshot.sql`). Changes nothing. | None |
| `01_profiles_role_guard.sql` | Blocks a non-admin from changing any `profiles.role`, including their own. The admin Team screen keeps working. | Low |
| `02_lead_archive_on_delete.sql` | Before any lead is deleted, copies the lead and its calls, device calls, assignment log and shares into `lead_archive`. Admin-only table. The app does not change. | Low (adds 1 table + 1 trigger) |
| `03_lead_status_history.sql` | Logs every owner-lead status change (old → new, who, when) into `lead_status_log`. Used for reports and history. | Low |
| `04_ai_hub_tables.sql` | AI Hub: stores the draft approval queue and AI activity on the server instead of only in the admin's browser. 2 new admin-only tables. Nothing sends. | Low (adds 2 tables) |
- 05 security hardening (proposed, not applied): blocks logged-out (anon) calls to 16 CRM functions, emp_props runs as caller, fixed search_path on 7 helpers. Local test: tests/test_05.sh (apply twice, anon blocked, staff kept, Android key functions untouched).
