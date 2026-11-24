# Weekly CRM backup to private Google Drive

Status: **ready to set up, not running yet.** Needs Ashok's Google login and the Supabase key (only Ashok adds it).

## Kya karta hai (what it does)

Every Sunday ~2 AM (India time), in Ashok's own Google account:

1. Reads every row of all CRM tables (leads, calls, buyers, properties, team, WhatsApp logs …) and checks the row count is exact.
2. Saves **`EasyDeals_Backup_<date>.json`**: the full restore file. Same format as the CRM's own "💾 Full backup", so one restore method works for both.
3. Saves **`EasyDeals_Backup_<date>.xlsx`**: readable Excel, one sheet per table (formulas in lead text are neutralised).
4. Keeps the last **8 weeks**. Older backup files go to Drive Trash (recoverable for 30 more days). Only `EasyDeals_Backup_*` files are touched.
5. If anything fails, it emails Ashok. The mail never contains the key or customer data.
6. Refuses to save if the backup folder is shared with anyone.

## Setup (≈10 minutes, on a laptop)

1. Go to https://script.google.com → **New project**. Name it "EasyDeals CRM Backup".
2. Paste `Code.gs` into the editor (replace everything).
3. Project Settings (⚙️) → tick "Show appsscript.json" → paste `appsscript.json`.
4. Project Settings → **Script properties** → add:
   - `SUPABASE_URL` = `https://sfvpslsexobukgerkixi.supabase.co`
   - `SUPABASE_KEY` = the **service_role** key (Supabase dashboard → Project Settings → API). Paste it only here. Never in chat, WhatsApp, GitHub or a file.
   - optional `ALERT_EMAIL` (a second person for failure mails), `KEEP_WEEKS` (default 8).
5. Select function **`setup`** → Run → allow the Google permissions (Drive, Sheets, send mail, external request).
6. Select **`weeklyBackup`** → Run once. Check Drive folder "EasyDeals CRM Backups (private)" has a .json and a .xlsx, and open the Excel.

## Security notes

- The service_role key can read **and change** everything in Supabase. It stays in Script properties of a private script in Ashok's Google account. Protect that account with 2-step verification. Do not share the script project with anyone.
- If the key ever leaks: Supabase dashboard → API → roll (regenerate) the service_role key, then update Script properties. (The CRM app does not use this key, so rolling it does not break the app. The edge functions get it automatically.)
- Safer later option (needs a small DB change + approval): a read-only database role used only by this script.
- Keep the folder private. The script checks this every run.

## Limits

- Apps Script runs max 6 minutes. With today's data size this should be fine; the run time shows in Executions. If it grows close to the limit, the Excel part is the first thing to slim down (JSON stays complete).
- Very large tables are left out of the Excel only if the sheet would pass 4 million cells; they are always in the JSON. The success log says which.

## Restore (only with approval, admin, SQL editor)

The JSON has one key per table, e.g. `"leads": [ {...}, ... ]`. To bring back one lead or table, an admin pastes the rows into the Supabase SQL editor using `jsonb_populate_recordset` (same method as in `supabase/proposed/02_lead_archive_on_delete.sql`). Always take a fresh backup before any restore.

## Test

`node tests/mock_test.js Code.gs` runs the script against fake Google + fake Supabase (2,503 leads over 3 pages, a missing table, a table without `id`, a formula in lead text, a shared folder, a missing key). Last run: all checks passed. Real Google/Supabase run: **UNTESTED** until step 6 above.
