# Live Supabase read-only inspection — 2026-11-24

Project `sfvpslsexobukgerkixi` ("EasyDeals", Postgres 17). Only SELECT queries and the Supabase security advisor were used. **Nothing was changed.** No customer data is copied here.

## Facts that matter for the 3 proposed SQL scripts

| Check | Live result | Effect |
| --- | --- | --- |
| `leads.id` type | bigint | 02 and 03 pre-checks pass |
| `ed_is_admin()` | exists, security definer, checks `profiles.role='admin'` | 01 and 02 work |
| FKs to `leads` | `calls`, `device_calls`: ON DELETE CASCADE. `lead_assignment_log`, `lead_shares`: no FK | Archive (02) captures all 4 before delete. Log/share rows stay after a delete (same as today). |
| Delete triggers on `leads` | none | 02 is the only one |
| Update triggers on `leads` | `b_unique_phone`, `c_status_by` (sets status_by/status_at = last change only), `d_log_assign`, `leads_link_area`, `leads_track_t` | 03 adds full history; runs after these; does not change them |
| Triggers on `profiles` | none | 01 is the only one |
| `profiles` RLS | read: all logged-in; write: **admin only** (`profiles admin edit`) | Self-promotion is **already blocked** by RLS today. 01 is an extra lock in case RLS is ever loosened. |
| Signup trigger `new_user()` | inserts profile with name only; `role` column default = **'telecaller'** | see risk R1 |
| Users | 5 auth users, all with profiles (1 admin, 2 telecaller, 2 FE); last signup 2026-10-28 | no unknown accounts today |

## Risks found (not fixed; each needs Ashok's decision)

- **R1 (High, Ashok's hands, 1 click):** every new sign-up automatically becomes a *telecaller* (column default). If "Allow new users to sign up" is ON in Supabase → Authentication → Sign In / Providers, anyone with the public app key could create an account and read deal-closed leads, all device call logs, team names and use number lookup. Fix: turn sign-ups OFF (admin creates users from the dashboard). Optional DB fix later: default role `pending`.
- **R2 (Medium):** `device_calls` read policy is `true`: every staff member can read every phone call log of the whole team.
- **R3 (Medium):** `kpi()` is security definer with no admin check: any logged-in user can read team KPIs.
- **R4 (Low):** view `emp_props` is SECURITY DEFINER (advisor ERROR). It filters by `auth.uid()`, so anon sees nothing; still better as `security_invoker`.
- **R5 (Low):** 30 security-definer RPCs are executable by `anon`. Checked: the admin/staff ones all check `my_role()` / `ed_is_admin()` / `auth.uid()` inside, so anon calls fail. `caller_id`, `call_missed`, `ingest_lead` need a device/ingest key and must stay anon-callable (Android app, lead ingest). Cleanup = revoke anon execute on the rest.
- **R6 (Low):** "Leaked password protection" is off (Auth settings toggle).
- **R7 (Info):** 13 old backup tables (`*_bak_*`, `bk_*`, `_fn_backup`, `policies_bak_*`) with RLS and no policy: not reachable from the app; they hold old copies of leads. Keep until a fresh full backup exists, then they can be dropped (approval).
- **R8 (Info):** 7 small functions have no fixed `search_path` (advisor WARN). Low risk; one-line fix each.

## Backup coverage

The weekly script and in-app Full backup cover all live tables. Added `blocked_leads` and `lead_ingest_log` to the weekly script. `device_keys` and `ingest_keys` are left out on purpose (they are login keys).
