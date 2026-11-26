# AI_HUB_DEPLOYMENT_PLAN.md

Step 1 is done (live since 25 Nov 2026). Every step below needs Ashok's **explicit approval**.

## Step 0: Review (now)
- Review the pull request `ai-hub-phase1` (new files only, no existing file changed except `supabase/proposed/README.md`, which is docs).
- Open `aihub.html` locally or look at the screenshots. Mock data only.

## Step 1: Publish the read-only Hub (needs approval: "deploy")
- Merge the PR into `main`. GitHub Pages serves `aihub.html` in 1–2 minutes.
- Impact: one new page. The team app (`index.html`), `buyers.html`, `onboard.html`, `sw.js`, the database and WhatsApp are unchanged. The page is not linked from the team menu, so the team does not see it.
- Use: log in to the CRM as admin, then open `/easydeals-crm/aihub.html?live=1`.
- Rollback: revert the merge commit (the page disappears). No data to undo.

## Step 1b: Live-data update (needs approval: "deploy")
- Merge the `ai-hub-live-data` pull request. Only `aihub.html`, `aihub/engine.js` and the tests change. After this, `aihub.html` opens on live data by default (`?mock=1` for test data).
- Rollback: revert that merge commit.

## Step 2 (optional): Admin menu link (needs approval: team-app change)
- Add a "🤖 AI Hub" item in the **admin-only** drawer of `index.html`. Bump the `sw.js` cache version.

## Step 3 (optional): Server-side approval queue (needs approval: DB change)
- Take a backup (admin menu → 💾 Full backup).
- Run `supabase/proposed/04_ai_hub_tables.sql` (adds 2 admin-only tables, nothing else). Rollback block is in the file.

## Step 4: Security fixes (needs approval each)
- 4a. Run `supabase/proposed/05_security_hardening.sql` in the SQL editor (permissions only; rollback block inside). Then run the CHECK query in the file: it must list only `call_missed, caller_id, ingest_lead`.
- 4b. Redeploy Edge Function `wa-send` with Verify JWT ON (same code). The CRM already sends the login token, so nothing else changes.

## Step 1c: No-cross-selling fix for the team app (needs approval: team-app change)
- Merge the `ai-hub-buyer-guard` pull request. Changes the buyer WhatsApp template list in `index.html` and `buyers.html` ("🏘 More options" → "🙏 Not interested (thank you)"), bumps `sw.js` to v31 so phones get it.

## Step 5 (only if you decide to spend): WhatsApp API sending
- Turn the existing `wa-send` master switch on with a low daily cap, after you approve templates and cost. Not part of Phase 1.

## Pre-deploy checklist
- [ ] `node --test tests/aihub_engine.test.mjs` passes
- [ ] `python3 tests/aihub_smoke.py` passes
- [ ] Admin login check on the live page (needs Ashok)
- [ ] Ashok's written OK in the thread
