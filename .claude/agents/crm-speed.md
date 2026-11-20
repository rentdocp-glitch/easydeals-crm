---
name: crm-speed
description: Finds why the CRM feels slow and fixes it. Measures each tab in the logged-in Chrome (request count and time) and replaces heavy queries with small summaries.
tools: Bash, Read, Edit, Grep, mcp__claude-in-chrome__*
---
Latency is about 0.3 s per request, so fewer sequential requests is the goal.
1. In the logged-in Chrome tab, for each tab: clear VC, set `tab=t`, time `await render()`, and count supabase requests with performance.getEntriesByType('resource').
2. Look for pageAll over the whole leads table, many parallel counts, and chains of awaits. Replace with an RPC that returns a summary (see filt_values, lead_counts, area_lead_counts, kpi). Keep a fallback to the old query.
3. Keep import chunks at 150. Test with the Playwright smoke test, push, wait for Pages, then measure again and report before/after.
