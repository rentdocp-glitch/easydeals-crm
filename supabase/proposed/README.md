# Proposed database changes (NOT applied)

> **Applied to live on 2026-11-24/25 (IST)** with Ashok's approval: 01 (run by Ashok), 02 and 03 (run by Claude in the SQL editor). Backup tables `bk_leads_20261124`, `bk_profiles_20261124` taken first. Verified after each: triggers/functions present, RLS on, anon cannot read, users cannot write the new tables, role guard blocks self-promotion (rolled-back test).

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

## Validation (local test DB, 2026-11-24)

Run on a throwaway local PostgreSQL 16 with a fake Supabase layer (`auth.uid()` same body as Supabase, `anon` / `authenticated` roles, Supabase default grants, RLS). **No live data was used.** Re-run: `PGHOST=... PGPORT=... supabase/proposed/tests/run_all.sh`.

| # | Test | Result |
| --- | --- | --- |
| – | Apply 01, 02, 03 twice in a row | PASS (no errors, second run is a no-op) |
| T1 | Telecaller sets own role to admin (with a weak "update own row" policy in place) | PASS: blocked, "Only an admin can change a role" |
| T2 | Telecaller renames self | PASS: allowed |
| T3 | Non-admin inserts a profile with role admin | PASS: blocked |
| T4 | Admin changes FE → telecaller (Team screen path) | PASS: allowed |
| T5 | SQL editor (no login) changes a role | PASS: allowed |
| T6 | Telecaller changes own lead status; then edits only remarks | PASS: 1 log row (new → callback, by = telecaller); remarks edit adds none |
| T7 | Telecaller reads log of a lead not theirs / writes a fake log row | PASS: sees 0 rows / permission denied |
| T8 | Admin deletes a lead with 2 calls, 1 device call, 1 assignment, 1 share | PASS: archive row has lead + 2/1/1/1 related, deleted_by = admin |
| T9 | Telecaller reads / writes archive | PASS: 0 rows / permission denied |
| T10 | Restore deleted lead + its calls from archive | PASS: lead back with same id, 2 calls |
| T11 | Anonymous key reads archive / status log | PASS: permission denied |
| – | Run all 3 rollback blocks | PASS: triggers gone, leads untouched |
| – | Pre-check on a DB where `leads.id` is uuid | PASS: script stops, nothing created |

## Must confirm on live DB before running

**Checked on the live DB on 2026-11-24 (read-only): all 5 points OK.** See `supabase/live_inspection_2026-11-24.md`. Note: live `profiles` RLS already allows only admins to edit, so 01 is an extra lock, not an urgent fix.


1. `leads.id` is bigint/integer (scripts 02 and 03 stop by themselves if not).
2. `public.ed_is_admin()` exists (from `phase2_1_setup_tables.sql`).
3. FKs from `calls`, `device_calls`, `lead_assignment_log`, `lead_shares` to `leads`: cascade or not. The archive works either way; it only matters for what a delete removes.
4. Other triggers on `profiles` / `leads` (names starting `a_` run first, `z_` last). Make sure none of them changes `role`.
5. How new profiles are created (signup trigger). If a signup trigger copies `role` from user metadata, that is a separate hole the guard cannot see (`auth.uid()` is null there) and must be fixed in that trigger.

## Backup before running (required)

1. CRM admin menu → "💾 Full backup" (JSON + Excel) and keep the files.
2. Optional extra: Supabase dashboard → Database → Backups, note the latest daily backup time.
3. Run one file at a time in order 01 → 02 → 03, and test the app (login, status save, Team screen) after each.

## Rollback

Each file ends with a ROLLBACK block. It drops only the trigger and function. The new tables (`lead_archive`, `lead_status_log`) are kept on purpose because they hold data; drop them only after a backup and with approval.
