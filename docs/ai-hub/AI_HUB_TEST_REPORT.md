# AI_HUB_TEST_REPORT.md

Run date: 25 Nov 2026. All tests use **fake data** or an **anonymised read-only copy**. No real buyer or owner was contacted and no lead was changed.

## 1. Unit tests: `node --test tests/aihub_engine.test.mjs` → **21 / 21 pass**

- ✔ buyer: callback request is HOT with callback draft
- ✔ buyer: visit request detected from history note
- ✔ buyer: site visit scheduled -> visit confirmation draft
- ✔ buyer: NEEDS REVIEW cases have no draft
- ✔ buyer: not interested is COLD and gets no draft
- ✔ buyer: duplicate (same phone, same property, different format) is held, no draft
- ✔ buyer: property lock, draft names only the enquired property
- ✔ buyer: injected text in enquiry never reaches the draft
- ✔ buyer: no invented facts, missing price/size is omitted
- ✔ buyer: drafts are professional English and include opt-out where promotional
- ✔ buyer: phone numbers are masked in output
- ✔ owner: only active statuses, sorted by score, meeting today ranks first
- ✔ owner: overdue follow-up, callbacks, stale meeting, summary
- ✔ marketing: low performer flagged, social metrics marked DATA NOT AVAILABLE
- ✔ founder report: numbers match mock data, missing tables -> DATA NOT AVAILABLE
- ✔ founder report: stale portal feed is reported as a problem
- ✔ approval queue: dedupe, decide once, approve never sends
- ✔ cost: auto-send is hard OFF, extra budget is 0
- ✔ safety: AI Hub code has no write, send or call paths
- ✔ safety: mock data has no real-looking phone numbers
- ✔ buyer: old enquiry on a sold property is COLD, no draft, never redirected

## 2. Browser smoke test: `python3 tests/aihub_smoke.py` → **PASS**

- All 9 tabs at 360 px (phone) and 1280 px (desktop): no JS errors, no sideways scroll.
- Buyer tab: open a draft, "Queue all HOT drafts", pressing it twice adds no duplicates.
- Approvals: approve one, reject one, and the statuses are correct. An approved draft has only a Copy button.
- Owner tab: call suggestions open. Report, Marketing and Dashboard render in full.
- Live mode without a login: refuses safely ("Could not load").
- Every request to any host other than localhost is blocked and reported. Mock mode made **no** external requests.

## 3. Compatibility dry run on the real CRM data structure (anonymised, read-only)

- Read with `select` only. Names were replaced by "BuyerN" or "OwnerN", phones by hashed test numbers, and emails and long numbers stripped. The copy stayed outside the repo and was deleted after the run.
- The engine handled every real field format (dates, statuses, sources, property statuses) without errors, in about 80 ms.
- **Property lock: 0 violations across all generated drafts.**
- Detailed counts are in the private copy of this report (project folder), because the repo is public.

## 4. Not tested (honest limits)

- Live mode with a real admin login: needs Ashok to log in. The code path is the same `select` queries the CRM already uses.
- The existing CRM test suite was not re-run. No existing app file was changed (`git diff main --stat` shows only new files plus one line in `supabase/proposed/README.md`).
- Real WhatsApp delivery: deliberately not tested (rule: no real sends).
