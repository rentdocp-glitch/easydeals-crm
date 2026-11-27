# AI_HUB_ARCHITECTURE.md

Easy Deals AI Hub, Phase 1. A separate, admin-only, **read-only** layer on top of the existing CRM. It does not replace or change the CRM.

## Big picture

```
 Portals (99acres / Magicbricks / Housing.com)
        │  (existing, untouched)
        ▼
 Easy Deals website Admin Panel
        │  Admin Panel → CRM transfer (existing, untouched; arrives via ingest_lead)
        ▼
 ┌──────────── Supabase (existing, Free plan) ────────────┐
 │ leads · buyer_leads · properties · buyer_history ·      │
 │ calls · profiles · lead_ingest_log · wa_settings ·      │
 │ wa_messages            (RLS: admin sees all)            │
 └───────────────▲─────────────────────────────────────────┘
                 │  SELECT only, with the admin's own CRM login
 ┌───────────────┴──────── aihub.html (new, GitHub Pages) ─────────────┐
 │ aihub/engine.js  (rule-based agents, runs in the browser, ₹0)        │
 │  ├─ Owner Service AI      → priority, callbacks, meetings, script,   │
 │  │                          summary, WhatsApp draft                  │
 │  ├─ Buyer RM AI           → HOT/WARM/COLD/NEEDS REVIEW, property-    │
 │  │                          locked drafts, duplicates, unanswered    │
 │  ├─ Marketing Monitor AI  → per-listing performance, flags, ideas    │
 │  └─ Founder Daily Report  → daily summary, DATA NOT AVAILABLE rule   │
 │ Approval queue · Activity · Cost & Health · Settings · Error log     │
 │ (stored in the admin's browser: localStorage)                        │
 └──────────────────────────────────────────────────────────────────────┘
                 │  Human copies an APPROVED draft and sends it manually
                 ▼
          Team WhatsApp (no API use, ₹500 wallet untouched)
```

## Files

| File | Purpose |
| --- | --- |
| `aihub.html` | The Hub UI: Dashboard, Owner AI, Buyer RM AI, Marketing, Daily Report, Approvals, Activity, Cost & Health, Settings (with error log). Mobile first. |
| `aihub/engine.js` | All agent logic as pure functions. No network, no writes. Works in browser and Node (for tests). |
| `aihub/mock-data.js` | Fake test data (90000xxxxx numbers, fake names). Default mode. |
| `tests/aihub_engine.test.mjs` | 21 unit tests incl. safety tests (no write/send code paths). |
| `tests/aihub_smoke.py` | Browser test: every tab at 360 px and 1280 px, approval flow, live-mode refusal, blocks external requests. |
| `supabase/proposed/04_ai_hub_tables.sql` | **Not applied.** Optional server-side queue for later. |

## Modes

- **Live, read-only (default from the live-data update):** `aihub.html`. Uses the same Supabase login as the CRM (same site). Refuses unless the user is `admin`. Reads 9 tables with `select` only (calls and ingest log limited to 30 days; WhatsApp log fully, so an old STOP is never missed). `?live=1` still works.
- **Test data:** `aihub.html?mock=1`, fake data, no network at all.

## Why rule-based, not an LLM

Paid AI APIs are cost-blocked. The rules are transparent (each result shows "Why"), fast (about 80 ms for the full CRM size) and cannot make up property facts. See `AI_HUB_ZERO_COST_REPORT.md` for the free options to add language AI later.

## Agent rules (summary)

**Buyer RM AI**
- One case = last 10 digits of phone + property. Later rows are marked duplicate and get no draft.
- NEEDS REVIEW: no property linked, property not found, property not available (recent enquiry), invalid phone, buyer replied STOP.
- COLD: Not Interested / closed, enquiry older than the WARM window with no activity, or old enquiry on a sold property.
- HOT: Site Visit status, visit or callback words, urgency words, buyer replied on WhatsApp, or 2+ enquiries for the same property.
- WARM: Contacted / Follow-up, or enquiry 3 days old or less.
- Drafts (professional English): intro, follow-up, callback, visit confirmation. Built only from the buyer's own property row. Missing facts are left out. Enquiry text is never copied into a draft.

**Owner Service AI**
- Active statuses only. Score 0–100 from status, overdue or due follow-up, meeting today or tomorrow, a meeting date that passed without an update, fresh lead, and price known.
- Flags: pending callback, meeting opportunity, high potential. Gives the next action, call suggestions, a note summary from `remarks`, and a WhatsApp draft.

**Marketing Monitor AI**
- Per available listing: enquiries in 7 days, 30 days and total, visits, not-interested share, days listed, source mix, missing assets (tour, reel, video, photos), service-end warning.
- Low performer = listed more than 14 days with 0 enquiries in 30 days.
- Content ideas and reel ideas are suggestions only. Social and ad metrics show DATA NOT AVAILABLE (not connected).

**Founder Daily Report AI**
- Built on page open. Any metric whose source table is not loaded shows **DATA NOT AVAILABLE**. Copy button only. Nothing is sent.

## Approval workflow

`draft → pending → approved | rejected`. One decision per draft. Approved means "a human may send this manually". There is no code path that sends.

## Live, growing buyer leads (added 26 Nov 2026)

The Hub is a permanent assistant, not a one-time report. Nothing is imported into it and nothing is stored as a fixed number.

| Need | How it works |
| --- | --- |
| Always the latest leads | Every load reads `buyer_leads`, `leads` and the other tables fresh from the CRM database. All counts and HOT/WARM/COLD labels are recalculated from that data. |
| New enquiries appear on their own | Re-reads the CRM every 2 minutes while the page is open, when you come back to the tab after more than 1 minute, and on the ⟳ button. |
| No manual import | Leads flow portal → website Admin Panel → CRM (`buyer_leads`). The Hub reads **only the CRM**: never the portals or the Admin Panel. It never imports or writes leads, so it cannot create duplicates or disturb intake. |
| New-lead detection | Remembers the highest buyer and owner IDs from your last visit on this device. Anything newer gets 🆕, has its own "New" filter, and is counted on the dashboard. |
| No duplicate processing | Same phone (last 10 digits) + same property = one case. A draft key is buyer + message type (owner + status), so later edits to a lead never create the same draft again, whether it was approved or rejected. |
| History | Approval decisions and activity are kept in the admin's browser. A shared server-side history needs `supabase/proposed/04_ai_hub_tables.sql` (approval needed). |
| Priority | Newest enquiries are listed first. Owners are ranked by score, with newer leads first on ties. "Show more" pages through any size of list. |
| Scale | Reads in pages of 1,000 with no 40,000-row cap (stops at 500,000 per table with a logged warning). The engine handles 60,000 buyer + 60,000 owner leads in about 2 s (unit test). |

## Priority order in Buyer RM AI (27 Nov 2026)
1. 🆕 New since your last visit
2. ⏰ Follow-ups due today or overdue (most overdue first; closed / not-interested buyers excluded)
3. All other enquiries, newest first

Health check "New leads reaching CRM" alerts when no buyer lead was added to the CRM for 24 hours. It watches the CRM itself, not the portals.
