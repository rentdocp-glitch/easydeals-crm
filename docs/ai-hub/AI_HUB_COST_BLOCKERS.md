# AI_HUB_COST_BLOCKERS.md

Features that would cost money. All are **OFF**. The free alternative is already in use, or listed below.

| # | Feature | Why it costs money | Estimate | Free alternative (status) | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | WhatsApp auto-send / API sending of templates | Meta charges per delivered template message, paid from the ₹500 wallet | Per-message INR rate from Meta's rate card (not verified here; India marketing rate went up on 1 Jan 2026) | Draft → approve → copy → manual send from the team's WhatsApp app (**built**) | COST BLOCKED |
| 2 | LLM-written replies and summaries (Claude / OpenAI API) | Pay-per-token API billing | Not estimated: needs a billing account | Rule-based engine (**built**). Optional: paste a lead into this Claude project and ask for a draft, which uses your existing plan with no API cost | COST BLOCKED |
| 3 | Automatic daily report delivery (SMS, email or WhatsApp push) | WhatsApp template or SMS gateway cost | Per message | Report is built every time the Hub opens, with a copy button (**built**). Option: a Claude scheduled task in this project could prepare it each morning. Needs your OK. | COST BLOCKED (push only) |
| 4 | Social media / ad analytics (Instagram, Facebook, YouTube, Meta Ads) | Third-party analytics connectors usually need paid plans; Meta Ads spend | Not verified | Marked DATA NOT AVAILABLE. Free option later: Meta Business Suite insights export (CSV) uploaded by you | COST BLOCKED (unverified) |
| 5 | Calling automation / auto-dialer / call recording AI | Telephony provider per-minute cost | Per minute | Call suggestions and scripts in Owner AI; calls stay manual from the phone (**built**) | COST BLOCKED |
| 6 | Server-side scheduled jobs (pg_cron + pg_net) | Free on Supabase, but they would run against the live DB | ₹0 | Not needed in Phase 1 | Not a cost blocker: needs your OK (live change) |
| 7 | Leaked-password protection (Supabase Auth) | May be a paid-plan feature (verify) | Unknown | Strong passwords for the 5 users | Needs a check |
