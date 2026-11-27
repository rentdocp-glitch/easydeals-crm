# AI_HUB_PROGRESS.md

Last update: 27 Nov 2026 (afternoon)

| Item | Status |
| --- | --- |
| Existing CRM audit (repo, Supabase, portals, WhatsApp, auth, hosting) | ✅ Done (read-only) |
| Zero-cost tool discovery | ✅ Done |
| AI Hub architecture | ✅ Done |
| Owner Service AI | ✅ Built and tested |
| Buyer RM AI (classification, property lock, duplicates, unanswered, drafts) | ✅ Built and tested |
| Marketing Monitor AI | ✅ Built and tested (social metrics: DATA NOT AVAILABLE) |
| Founder Daily Report AI | ✅ Built and tested |
| WhatsApp draft system + human approval queue | ✅ Built (draft only, manual send) |
| Activity history, cost monitor, system health, settings, error log | ✅ Built |
| Unit tests (25) + browser smoke test (360 px / 1280 px) | ✅ Pass |
| Anonymised compatibility dry run on real data structure | ✅ Pass (0 property-lock violations) |
| Security review | ✅ Done (fixes for existing system await approval) |
| Docs (8 files) | ✅ Done |
| Pull request #4 (Phase 1) | ✅ Merged and live 25 Nov 2026 (approved) |
| Live admin login test | ⏳ Needs Ashok |
| Live-data update (auto-refresh, 🆕 new leads, newest first, no row cap, stable dedupe, live by default) | ✅ Live 27 Nov 2026 (PR #5, approved on decision card) |
| Server-side queue table (`04_ai_hub_tables.sql`) | ⏳ Proposed, needs approval |

## Live changes made
Only one: `aihub.html` (read-only page, not linked in the team app) published on 25 Nov 2026 with approval. No database write, migration, WhatsApp send, call or publish.

## 27 Nov 2026: no-cross-selling guard + security prep (branch `ai-hub-buyer-guard`, not live)
| Item | Status |
| --- | --- |
| Buyer RM AI flags "buyer asks about other properties" → NEEDS REVIEW, no draft | ✅ Built + tested |
| Team app (index.html, buyers.html) "🏘 More options" template sent 3 OTHER properties to a buyer, and was the default for "Not Interested" buyers. "After visit" offered "show me other options". "No property" text promised "matching options" | ✅ Live 27 Nov 2026, 11:20 AM IST (PR #6, approved) |
| `crm-buyer-assistant` helper prompt told Claude to "match 3-5 properties" | ✅ Fixed (own property only) |
| Security fixes as SQL (`05_security_hardening.sql`) | ✅ Prepared + tested on a local database copy. ⏳ Needs approval to run on live DB |
| `wa-send` Verify JWT ON | ⏳ Needs approval (Edge Function redeploy) |

## 27 Nov 2026: lead-flow check (branch `ai-hub-followups`)
Confirmed flow: portals → website Admin Panel → CRM → AI Hub (reads CRM only). No gaps in reading, growth or duplicates. 3 small gaps fixed on the branch:
| Gap | Status |
| --- | --- |
| Buyer follow-ups due/overdue were not prioritised | ✅ "⏰ Follow-up due" filter; order is new → follow-ups due (most overdue first) → newest |
| Health label said "Portal leads arriving" and watched the intake log | ✅ "New leads reaching CRM", based on the CRM's own buyer leads |
| Docs described the flow as portal → CRM | ✅ portal → Admin Panel → CRM |
| Go live | ⏳ Needs approval |
