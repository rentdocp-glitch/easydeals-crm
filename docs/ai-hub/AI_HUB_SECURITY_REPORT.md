# AI_HUB_SECURITY_REPORT.md (public summary)

The detailed findings for the existing system are in the **private** project folder (this repo is public).

## AI Hub safety controls (tested)
- Read-only: AI Hub code contains no insert, update, delete, rpc, Edge Function, fetch, `tel:` or `wa.me` call. A unit test enforces this.
- No sending: approving a draft only marks it, and a human sends it manually.
- Admin only in live mode: an existing CRM login plus `role = admin` are required, and database RLS still applies.
- Property lock and no invented facts: enforced by unit tests and checked on anonymised real-structure data.
- Enquiry text never goes into drafts, and all output is HTML-escaped (tested with script and injection text).
- Phone numbers are masked. Mock data uses only 90000xxxxx test numbers (tested).
- No change was made to any security setting.
