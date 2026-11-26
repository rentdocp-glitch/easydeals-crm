# Easy Deals CRM: operations, backup, restore and rollback

Plain steps for the owner and for any developer. No passwords, keys or customer data belong in this repo (it is public).

## 1. What runs where
| Part | Where | How it changes |
|---|---|---|
| Team app (`index.html`), Properties & Buyers (`buyers.html`), Onboarding (`onboard.html`), AI Hub (`aihub.html`) | GitHub Pages, served from `main` | A merge or push to `main` goes live in 1–2 minutes |
| Database, logins, security rules | Supabase (free plan) | Only through SQL that the owner approves |
| WhatsApp send / receive | Supabase edge functions `wa-send`, `wa-webhook` | Only through a deploy the owner approves |
| Android app | APK built by `.github/workflows/android.yml` | Manual "Run workflow"; it needs the signing secrets |
| Weekly backup | Google Apps Script in the owner's Google account | Runs every Sunday about 2 AM IST |

## 2. Backups
- **Weekly automatic:** JSON (exact copy, for restore) and Excel (for reading) in the owner's private Drive folder "EasyDeals CRM Backups (private)". The last 8 weeks are kept. If a run fails, an email is sent. Code: `tools/weekly-backup/` (on the `sql-fixes-validated` branch).
- **Any time, by hand:** Admin menu → 💾 Full backup. Same two files, downloaded to the phone or laptop. It covers every CRM table, including `lead_archive`, `lead_status_log`, `blocked_leads` and `lead_ingest_log`. Login key tables (`device_keys`, `ingest_keys`) are left out on purpose.
- **Before a lead is deleted:** the app downloads a safety copy, and the database also copies the lead and its calls into `lead_archive` (admin-only).

## 3. Restore (only with the owner's approval)
1. **One deleted lead:** an admin reads its row in `lead_archive` (`lead` column = the full lead, `related` = calls and logs) and inserts it back into `leads`. Check that the phone number is not already in use, because the duplicate guard will refuse it.
2. **Many rows / a whole table:** take a fresh Full backup first. Then load the needed table from the JSON backup with a script that **inserts missing rows only** (never truncates). Test it on a copy first.
3. Never restore `profiles` roles from an old backup without checking each person's role, because that can give someone admin rights again.

## 4. Rollback
| What went wrong | How to undo |
|---|---|
| A website change (any merged PR) | GitHub → the PR → **Revert** → merge the revert PR. Live again in 1–2 minutes. |
| `wa-send` / `wa-webhook` deploy | Redeploy the previous version from git (`supabase/functions/...` at the earlier commit). Fastest safety step first: Admin → 🤖 AI RM → untick "AI RM chalu" → Save. |
| SQL 01 / 02 / 03 / 05 | Each file in `supabase/proposed/` ends with its own rollback block. Run it only for that file. |
| Wrong property locked or unlocked for AI | Admin → AI draft popup → "AI RM is property par chalu" tick. The 5 properties locked in code (ED-003, ED-008, ED-010, ED-014, ED-015) can only be unlocked with a code change and redeploy. |

## 5. AI RM / WhatsApp safety switches (all must pass before any message goes)
Master switch ON · daily limit (50) not reached · 9 AM–8 PM IST · user is admin or the buyer's RM · buyer is not Closed / Not Interested · buyer's own property only, status "Available…" · property not AI-locked · valid 10-digit number · buyer has not replied STOP · not already messaged today. Messages use Meta-approved templates only, and are sent only when a person taps Send.

## 6. Release checklist (every change)
1. Work on a branch, open a PR. Never push straight to `main`.
2. Run the tests in `tests/README.md` (mocked database) and say which ones ran.
3. The owner approves the merge.
4. After the merge: open the CRM on a phone, hard refresh, and check login, Calling tab, a status save and a note.
5. Database or edge-function changes: separate approval, take a backup first, run the file, then run its CHECK query.
