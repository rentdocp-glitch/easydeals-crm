# AI_HUB_DEPLOYMENT_PLAN.md

Nothing is deployed. Every step below needs Ashok's **explicit approval**.

## Step 0: Review (now)
- Review the pull request `ai-hub-phase1` (new files only, no existing file changed except `supabase/proposed/README.md`, which is docs).
- Open `aihub.html` locally or look at the screenshots. Mock data only.

## Step 1: Publish the read-only Hub (needs approval: "deploy")
- Merge the PR into `main`. GitHub Pages serves `aihub.html` in 1–2 minutes.
- Impact: one new page. The team app (`index.html`), `buyers.html`, `onboard.html`, `sw.js`, the database and WhatsApp are unchanged. The page is not linked from the team menu, so the team does not see it.
- Use: log in to the CRM as admin, then open `/easydeals-crm/aihub.html?live=1`.
- Rollback: revert the merge commit (the page disappears). No data to undo.

## Step 2 (optional): Admin menu link (needs approval: team-app change)
- Add a "🤖 AI Hub" item in the **admin-only** drawer of `index.html`. Bump the `sw.js` cache version.

## Step 3 (optional): Server-side approval queue (needs approval: DB change)
- Take a backup (admin menu → 💾 Full backup).
- Run `supabase/proposed/04_ai_hub_tables.sql` (adds 2 admin-only tables, nothing else). Rollback block is in the file.

## Step 4 (optional, later): Security fixes from the private security report (needs approval each)

## Step 5 (only if you decide to spend): WhatsApp API sending
- Turn the existing `wa-send` master switch on with a low daily cap, after you approve templates and cost. Not part of Phase 1.

## Pre-deploy checklist
- [ ] `node --test tests/aihub_engine.test.mjs` passes
- [ ] `python3 tests/aihub_smoke.py` passes
- [ ] Admin login check on the live page (needs Ashok)
- [ ] Ashok's written OK in the thread
