/* Easy Deals AI Hub, Phase 1 engine.
 * Pure functions only: no network, no database writes, no sending.
 * Rule-based "AI" (no paid model). Works in the browser (window.AIHUB) and in Node (module.exports).
 * Every output is a SUGGESTION or a DRAFT for a human to approve.
 */
(function (root) {
  'use strict';
  const DNA = 'DATA NOT AVAILABLE';
  const DAY = 86400000;

  /* ---------- small helpers ---------- */
  const ph10 = (s) => String(s || '').replace(/\D/g, '').slice(-10);
  const validPhone = (s) => /^[6-9]\d{9}$/.test(ph10(s));
  const mask = (s) => { const p = ph10(s); return p.length === 10 ? p.slice(0, 2) + 'xxxxxx' + p.slice(-2) : '—'; };
  const istDay = (d) => { const t = new Date(new Date(d).getTime() + 5.5 * 3600000); return t.toISOString().slice(0, 10); };
  const toDate = (x) => (x ? new Date(String(x).length === 10 ? x + 'T00:00:00+05:30' : x) : null);
  const daysAgo = (x, now) => { const d = toDate(x); return d ? Math.floor((now - d) / DAY) : null; };
  const firstName = (n) => { const f = String(n || '').trim().split(/\s+/)[0] || ''; return /^[a-z][a-z.'-]{1,}$/i.test(f) ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : ''; };
  const lakh = (v) => { const n = Number(v); if (!n || !isFinite(n)) return ''; if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr'; if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' Lakh'; return ''; };
  const STOP_RE = /\b(stop|unsubscribe|band\s*kar(o|do)?|band\s*kr(o|do)?)\b/i;
  const VISIT_RE = /\b(site\s*visit|visit|dekhn[ae]|see\s+the\s+(flat|property)|viewing|inspect)\b/i;
  const CALLBACK_RE = /\b(call\s*(me|back)|callback|call\s*karo|phone\s*karo|contact\s*me|please\s*call)\b/i;
  // Buyer asking about a DIFFERENT property: never auto-handled, always a human decision (no cross-selling).
  const OTHER_PROP_RE = /\b(other|more|different|another|similar|alternative)\s+(options?|propert(y|ies)|flats?|projects?|listings?|homes?)\b|\b(aur|dusr[aie]|doosr[aie])\s+(options?|propert(y|ies)|flats?|ghar)\b|\bshow\s+me\s+other\b/i;
  const URGENT_RE = /\b(urgent|immediately|asap|ready\s*to\s*(buy|move)|loan\s*(approved|sanctioned)|token)\b/i;
  const OWNER_ACTIVE = ['new', 'ringing', 'callback', 'followup', 'prospect', 'meeting_assigned', 'meeting_done', 'online_meet_done'];
  const ST_LABEL = { new: 'New', callback: 'Call Back', ringing: 'Ringing', followup: 'Follow Up', prospect: 'Prospect', meeting_assigned: 'Meeting Assigned', meeting_done: 'Meeting Done', online_meet_done: 'Online Meet Done', not_interested: 'Not Interested', deal_closed: 'Deal Closed', not_available: 'Not Available' };

  function propAvailable(p) { return !!p && (!p.status || /^available\b/i.test(String(p.status).trim())); }

  /* Only facts that exist in the CRM row. Never invent. */
  function propertyLabel(p) {
    if (!p) return '';
    let nm = String(p.project || '').trim();
    const bk = String(p.bhk || '').trim();
    if (bk && !nm.toLowerCase().replace(/\s/g, '').includes(bk.toLowerCase().replace(/\s/g, ''))) nm = (bk + (nm ? ' at ' + nm : ' flat')).trim();
    if (p.locality) nm = (nm ? nm + ', ' : '') + String(p.locality).trim();
    return nm.trim();
  }

  /* ---------- AGENT 2: BUYER RM AI ---------- */
  function buyerAgent(data, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const props = new Map((data.properties || []).map((p) => [String(p.id), p]));
    const hist = new Map();
    (data.buyer_history || []).forEach((h) => { const k = String(h.buyer_id); if (!hist.has(k)) hist.set(k, []); hist.get(k).push(h); });
    const inbound = new Map();
    (data.wa_messages || []).filter((m) => m.direction === 'in').forEach((m) => { const k = ph10(m.wa_phone); if (!inbound.has(k)) inbound.set(k, []); inbound.get(k).push(m); });

    // Duplicate prevention: one buyer phone + one property = one case. Earliest row is primary.
    const rows = (data.buyer_leads || []).slice().sort((a, b) => String(a.created_at || a.lead_date).localeCompare(String(b.created_at || b.lead_date)) || a.id - b.id);
    const firstOf = new Map(), repeats = new Map();
    rows.forEach((b) => { const k = ph10(b.buyer_phone) + '|' + (b.property_id || '-'); if (!firstOf.has(k)) firstOf.set(k, b.id); else repeats.set(k, (repeats.get(k) || 1) + 1); });

    const out = rows.map((b) => {
      const key = ph10(b.buyer_phone) + '|' + (b.property_id || '-');
      const dupOf = firstOf.get(key) !== b.id ? firstOf.get(key) : null;
      const enquiries = repeats.get(key) || 1;
      const p = b.property_id ? props.get(String(b.property_id)) : null;
      const h = (hist.get(String(b.id)) || []).sort((x, y) => String(y.at).localeCompare(String(x.at)));
      const ins = inbound.get(ph10(b.buyer_phone)) || [];
      const text = [b.requirement, b.remarks, ...h.map((x) => x.note), ...ins.map((m) => m.body)].join(' \n ');
      const age = daysAgo(b.created_at || b.lead_date, now);
      const lastTouch = h.length ? daysAgo(h[0].at, now) : null;
      const status = String(b.status || 'New');
      const optedOut = ins.some((m) => STOP_RE.test(m.body || ''));
      // Only the buyer's own words and team notes, not portal boilerplate in `requirement`.
      const askedOther = OTHER_PROP_RE.test([b.remarks, ...h.map((x) => x.note), ...ins.map((m) => m.body)].join(' \n '));
      const visitReq = VISIT_RE.test(text) || /site visit/i.test(status);
      const callbackReq = CALLBACK_RE.test(text);
      const contacted = h.length > 0 || !/^new$/i.test(status);
      const unanswered = !contacted && age !== null && age >= 1;
      const reasons = [];
      let cls;
      const review = [];
      if (!b.property_id) review.push('No property linked to this enquiry');
      else if (!p) review.push('Property ' + b.property_id + ' not found in CRM');
      else if (!propAvailable(p)) review.push('Property is ' + p.status);
      if (!validPhone(b.buyer_phone)) review.push('Phone number missing or invalid');
      if (optedOut) review.push('Buyer replied STOP (opted out)');
      if (askedOther) review.push('Buyer asked about other properties: human decides (no automatic cross-selling)');
      const soldOnly = review.length === 1 && p && !propAvailable(p);
      if (soldOnly && age !== null && age > 14) { cls = 'COLD'; reasons.push('Property is ' + p.status + ' (old enquiry)'); }
      else if (review.length) { cls = 'NEEDS REVIEW'; reasons.push(...review); }
      else if (/not interested|deal closed|closed/i.test(status)) { cls = 'COLD'; reasons.push('Status: ' + status); }
      else if (/site visit/i.test(status) || visitReq || callbackReq || URGENT_RE.test(text) || ins.length || enquiries >= 2) {
        cls = 'HOT';
        if (/site visit/i.test(status)) reasons.push('Status: ' + status);
        if (visitReq && !/site visit/i.test(status)) reasons.push('Mentions a site visit');
        if (callbackReq) reasons.push('Asked for a call back');
        if (URGENT_RE.test(text)) reasons.push('Urgency words in enquiry');
        if (ins.length) reasons.push('Buyer replied on WhatsApp');
        if (enquiries >= 2) reasons.push('Enquired ' + enquiries + ' times for this property');
      } else if (/contacted|follow/i.test(status) || (age !== null && age <= 3)) {
        cls = 'WARM'; reasons.push(age !== null && age <= 3 ? 'Fresh enquiry (' + age + ' day' + (age === 1 ? '' : 's') + ' old)' : 'Status: ' + status);
      } else { cls = 'COLD'; reasons.push('No activity, enquiry ' + age + ' days old'); }

      const nextFu = b.next_fu ? daysAgo(b.next_fu, now) : null; // >0 overdue, 0 today
      const closedSt = /not interested|closed/i.test(status);
      const fuDue = nextFu !== null && nextFu >= 0 && !closedSt;
      let next;
      if (dupOf) next = 'Duplicate of buyer #' + dupOf + ' for the same property. Handle there.';
      else if (askedOther && !optedOut) next = 'Human to decide. Answer only about ' + (b.property_id || 'the enquired property') + '. Do not offer other listings automatically.';
      else if (soldOnly) next = 'Property is ' + p.status + '. Inform the buyer politely if they ask. Do not offer other listings.';
      else if (cls === 'NEEDS REVIEW') next = 'Admin to review: ' + review[0] + '.';
      else if (optedOut) next = 'Do not message.';
      else if (callbackReq) next = 'Call back today. Buyer asked for a call.';
      else if (visitReq && !/site visit/i.test(status)) next = 'Call and fix a site visit slot for ' + (p.id) + '.';
      else if (/site visit scheduled/i.test(status)) next = 'Confirm the visit a day before. Inform the field executive.';
      else if (unanswered) next = 'First contact pending for ' + age + ' days. Call now, then send the intro draft.';
      else if (nextFu !== null && nextFu > 0) next = 'Follow-up overdue by ' + nextFu + ' days. Call today.';
      else if (nextFu === 0) next = 'Follow-up due today.';
      else if (cls === 'COLD') next = 'Low priority. One polite follow-up, then close if no reply.';
      else next = 'Call and ask if they want to visit.';

      // Draft: strictly the buyer's own property, only CRM facts.
      let draft = null, draftType = null, draftBlocked = null;
      const label = propertyLabel(p);
      if (dupOf) draftBlocked = 'Duplicate enquiry';
      else if (review.length) draftBlocked = review[0];
      else if (/not interested|closed/i.test(status)) draftBlocked = 'Buyer is ' + status;
      else if (!label) draftBlocked = 'Property has no name/locality in CRM';
      else {
        const hi = 'Hello' + (firstName(b.buyer_name) ? ' ' + firstName(b.buyer_name) : '') + ',';
        const price = lakh(p.price || p.final_price);
        const facts = [p.bhk && !label.toLowerCase().includes(String(p.bhk).toLowerCase()) && String(p.bhk), p.carpet ? p.carpet + ' sq ft carpet' : (p.sqft ? p.sqft + ' sq ft' : ''), price ? 'asking price ' + price : ''].filter(Boolean).join(', ');
        if (/site visit scheduled/i.test(status) && b.visit_at) {
          draftType = 'visit_confirm';
          const vt = new Date(b.visit_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          draft = hi + '\n\nThis is Easy Deals, Pune. This is to confirm your site visit for ' + label + ' on ' + vt + '.\n\nPlease reply if you need to change the time.\n\nRegards,\nEasy Deals, Pune';
        } else if (callbackReq) {
          draftType = 'callback';
          draft = hi + '\n\nThis is Easy Deals, Pune, regarding your enquiry for ' + label + '. We noted that you asked for a call back. Please share a convenient time and our team will call you.\n\nRegards,\nEasy Deals, Pune';
        } else if (contacted) {
          draftType = 'followup';
          draft = hi + '\n\nThis is Easy Deals, Pune, following up on your enquiry for ' + label + '. Would you like to visit the property? Please share a convenient day and time.\n\nReply STOP if you do not wish to receive further messages.\n\nRegards,\nEasy Deals, Pune';
        } else {
          draftType = 'intro';
          draft = hi + '\n\nThis is Easy Deals, Pune. Thank you for your enquiry about ' + label + (facts ? ' (' + facts + ')' : '') + '. We are the team handling this property.\n\nWould you like to schedule a site visit? Please share a convenient day and time.\n\nReply STOP if you do not wish to receive further messages.\n\nRegards,\nEasy Deals, Pune';
        }
      }
      return {
        id: b.id, code: b.code || ('#' + b.id), name: b.buyer_name || '', phoneMasked: mask(b.buyer_phone), source: b.source || '', status,
        propertyId: b.property_id || null, propertyLabel: label, cls, reasons, visitRequest: visitReq, callbackRequest: callbackReq,
        askedOther, fuDue, fuOverdueDays: fuDue ? nextFu : null, unanswered, ageDays: age, lastTouchDays: lastTouch, dupOf, enquiries, optedOut, nextAction: next, draft, draftType, draftBlocked,
        fp: 'buyer:' + b.id + ':' + (draftType || '-'),
        isNew: opts.lastSeenBuyerId != null && b.id > opts.lastSeenBuyerId,
        createdAt: b.created_at || b.lead_date || '',
      };
    });
    // Priority order: new since last visit, then follow-ups due today/overdue (most overdue first), then newest enquiries.
    const rank = (x) => (x.dupOf ? 3 : x.isNew ? 0 : x.fuDue ? 1 : 2);
    return out.sort((x, y) => rank(x) - rank(y) || (rank(x) === 1 ? y.fuOverdueDays - x.fuOverdueDays : 0) || String(y.createdAt).localeCompare(String(x.createdAt)) || y.id - x.id);
  }

  /* ---------- AGENT 1: OWNER SERVICE AI ---------- */
  const OWNER_BASE = { meeting_assigned: 40, meeting_done: 35, prospect: 35, online_meet_done: 30, callback: 30, followup: 25, ringing: 10, new: 5 };
  function parseNotes(remarks) {
    return String(remarks || '').split(/\n+|\s*\|\|\s*/).map((s) => s.trim()).filter((s) => s && !/^resale(;.*)?$/i.test(s));
  }
  function ownerAgent(data, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const today = istDay(now);
    const people = new Map((data.profiles || []).map((p) => [p.id, p.name]));
    const callsBy = new Map();
    (data.calls || []).forEach((c) => { if (c.lead_id == null) return; const k = String(c.lead_id); if (!callsBy.has(k)) callsBy.set(k, []); callsBy.get(k).push(c); });
    return (data.leads || []).filter((l) => OWNER_ACTIVE.includes(l.status)).map((l) => {
      let score = OWNER_BASE[l.status] || 0;
      const why = [];
      const fd = l.follow_date ? daysAgo(l.follow_date, now) : null;
      const md = l.meeting_date ? daysAgo(l.meeting_date, now) : null;
      const age = daysAgo(l.created_at, now);
      const calls = (callsBy.get(String(l.id)) || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const lastCall = calls[0] ? daysAgo(calls[0].created_at, now) : null;
      if (fd !== null && fd > 0) { score += 20 + Math.min(15, fd); why.push('Follow-up overdue ' + fd + 'd'); }
      if (fd === 0) { score += 15; why.push('Follow-up due today'); }
      if (md !== null && md <= 0 && md >= -1 && l.status === 'meeting_assigned') { score += 25; why.push(md === 0 ? 'Meeting today' : 'Meeting tomorrow'); }
      if (md !== null && md > 0 && l.status === 'meeting_assigned') { score += 15; why.push('Meeting date passed, status not updated'); }
      if (l.status === 'new' && age !== null && age <= 2) { score += 10; why.push('Fresh lead'); }
      if (l.price_l) score += 5;
      if (l.status === 'prospect' || l.status === 'meeting_done' || l.status === 'online_meet_done') why.push(ST_LABEL[l.status] + ': close to deal');
      if (l.status === 'callback') why.push('Owner asked for call back');
      score = Math.min(100, score);
      const pendingCallback = l.status === 'callback' || (fd !== null && fd >= 0 && ['followup', 'callback', 'ringing'].includes(l.status));
      const meetingOpportunity = ['prospect', 'followup', 'callback'].includes(l.status) && !l.meeting_date;
      const highPotential = score >= 60 || ['prospect', 'meeting_done', 'online_meet_done'].includes(l.status);
      let next;
      if (l.status === 'meeting_assigned' && md !== null && md > 0) next = 'Ask the field executive for the meeting result and update the status.';
      else if (l.status === 'meeting_assigned') next = 'Confirm the meeting with the owner' + (l.meeting_time ? ' (' + String(l.meeting_time).slice(0, 5) + ')' : '') + '.';
      else if (['meeting_done', 'online_meet_done', 'prospect'].includes(l.status)) next = 'Push for closure: share plan options and the down-payment amount discussed.';
      else if (pendingCallback || (fd !== null && fd > 0)) next = 'Call back' + (fd > 0 ? ' (overdue ' + fd + 'd)' : ' today') + (meetingOpportunity ? ' and try to fix a meeting' : '') + '.';
      else if (meetingOpportunity) next = 'Owner is engaged. Try to fix a meeting.';
      else if (l.status === 'ringing') next = 'Retry the call at a different time of day.';
      else next = 'First call: introduce Easy Deals resale marketing.';
      const script = [];
      script.push('Greet ' + (firstName(l.name) || 'the owner') + ' and mention their property' + (l.property ? ' (' + l.property + ')' : '') + (l.locality ? ' in ' + l.locality : '') + '.');
      if (l.status === 'new' || l.status === 'ringing') script.push('Ask if the property is still for sale and the expected price.');
      if (l.price_l) script.push('Confirm the expected price of about ₹' + l.price_l + ' Lakh.');
      if (meetingOpportunity || l.status === 'new') script.push('Offer a short meeting with our field executive to explain the marketing plan.');
      if (l.status === 'meeting_done' || l.status === 'prospect') script.push('Answer doubts about the plan, then ask for a decision date.');
      script.push('Agree on the next step and update the CRM.');
      const nm = firstName(l.name);
      const draft = 'Hello' + (nm ? ' ' + nm : '') + ',\n\nThis is Easy Deals, Pune' + (l.property || l.locality ? ', regarding your property' + (l.property ? ' at ' + l.property : '') + (l.locality ? ', ' + l.locality : '') : '') + '. ' +
        (l.status === 'meeting_assigned' && l.meeting_date ? 'This is to confirm our meeting on ' + l.meeting_date + (l.meeting_time ? ' at ' + String(l.meeting_time).slice(0, 5) : '') + '.' :
          ['meeting_done', 'online_meet_done', 'prospect'].includes(l.status) ? 'Thank you for your time. Please let us know if you have any questions about our marketing plan.' :
            'We help owners sell resale properties faster through professional marketing. May we call you at a convenient time?') +
        '\n\nRegards,\nEasy Deals, Pune';
      const notes = parseNotes(l.remarks);
      return {
        id: l.id, name: l.name || '', phoneMasked: mask(l.phone), property: l.property || '', locality: l.locality || '', status: l.status, statusLabel: ST_LABEL[l.status] || l.status,
        telecaller: people.get(l.tc_id) || '', fe: people.get(l.fe_id) || '', score, why, pendingCallback, meetingOpportunity, highPotential,
        followDate: l.follow_date || null, meetingDate: l.meeting_date || null, calls: calls.length, lastCallDays: lastCall,
        summary: notes.length ? notes.slice(-3).join(' · ') : 'No notes yet.', nextAction: next, callScript: script, draft,
        fp: 'owner:' + l.id + ':' + l.status,
        isNew: opts.lastSeenLeadId != null && l.id > opts.lastSeenLeadId,
      };
    }).sort((a, b) => b.score - a.score || b.id - a.id);
  }

  /* ---------- AGENT 3: MARKETING MONITOR AI ---------- */
  function marketingAgent(data, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const buyers = data.buyer_leads || [];
    const by = new Map();
    buyers.forEach((b) => { if (!b.property_id) return; const k = String(b.property_id); if (!by.has(k)) by.set(k, []); by.get(k).push(b); });
    const props = (data.properties || []).filter(propAvailable).map((p) => {
      const L = by.get(String(p.id)) || [];
      const d = (b) => daysAgo(b.created_at || b.lead_date, now);
      const l7 = L.filter((b) => d(b) <= 7).length, l30 = L.filter((b) => d(b) <= 30).length;
      const visits = L.filter((b) => /site visit/i.test(b.status || '')).length;
      const notInt = L.filter((b) => /not interested/i.test(b.status || '')).length;
      const listed = daysAgo(p.date_added || p.created_at, now);
      const src = {}; L.forEach((b) => { src[b.source || 'Other'] = (src[b.source || 'Other'] || 0) + 1; });
      const det = p.details || {};
      const missing = [];
      if (!p.tour_url) missing.push('360 tour');
      if (!p.reel_url) missing.push('Instagram reel');
      if (!p.video_url) missing.push('video');
      if (!(p.photos && p.photos.length) && !p.photos_url) missing.push('photos');
      const flags = [], ideas = [];
      if (listed !== null && listed > 14 && l30 === 0) { flags.push('No enquiries in 30 days'); ideas.push('Review the asking price and the portal listing title/photos.'); }
      else if (listed !== null && listed > 14 && l7 === 0) { flags.push('No enquiries this week'); ideas.push('Refresh the portal listing (new cover photo, updated description).'); }
      if (L.length >= 10 && visits === 0) { flags.push('Many enquiries, no visits'); ideas.push('Call recent enquirers with a fixed weekend visit slot.'); }
      if (notInt >= 3 && notInt / Math.max(1, L.length) > 0.3) { flags.push('High "not interested" share'); ideas.push('Collect buyer feedback on price and share it with the owner.'); }
      if (missing.length) { flags.push('Missing: ' + missing.join(', ')); ideas.push('Create the missing ' + missing.join(', ') + ' (free: phone video + Instagram).'); }
      if (p.service_till && daysAgo(p.service_till, now) >= -15) flags.push('Service period ends ' + p.service_till);
      const lbl = propertyLabel(p) || p.id;
      const reel = 'Reel idea: 20-second walkthrough of ' + lbl + (p.bhk ? ' highlighting the ' + p.bhk + ' layout' : '') + ', ending with "DM for a site visit".';
      return { id: p.id, label: lbl, total: L.length, last7: l7, last30: l30, visits, notInterested: notInt, listedDays: listed, sources: src, flags, ideas, reel, low: flags.some((f) => /No enquiries in 30/.test(f)), plan: p.plan || '', serviceTill: p.service_till || det.service_till || null };
    }).sort((a, b) => a.last30 - b.last30 || b.listedDays - a.listedDays);
    const daily = {};
    for (let i = 13; i >= 0; i--) daily[istDay(now - i * DAY)] = 0;
    buyers.forEach((b) => { const k = istDay(b.created_at || (b.lead_date + 'T06:00:00Z')); if (k in daily) daily[k]++; });
    const srcAll = {}; buyers.filter((b) => daysAgo(b.created_at || b.lead_date, now) <= 30).forEach((b) => { srcAll[b.source || 'Other'] = (srcAll[b.source || 'Other'] || 0) + 1; });
    const ideas = [];
    const top = props.slice().sort((a, b) => b.last30 - a.last30)[0];
    if (top && top.last30) ideas.push('Post a "most enquired this month" reel for ' + top.label + ' (' + top.last30 + ' enquiries).');
    const low = props.filter((p) => p.low);
    if (low.length) ideas.push(low.length + ' listing(s) got no enquiries recently. Prioritise fresh photos and a price review for them.');
    ideas.push('Weekly carousel: "New resale homes this week" with the newest listings (Instagram, free).');
    ideas.push('Share a short tip reel: "Documents to check before buying a resale flat in Pune".');
    return {
      properties: props, dailyLeads: daily, sources30: srcAll, low, ideas,
      social: { instagram: DNA, facebook: DNA, youtube: DNA, adSpend: DNA },
    };
  }

  /* ---------- AGENT 4: FOUNDER DAILY REPORT AI ---------- */
  function founderReport(data, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const today = istDay(now);
    const B = buyerAgent(data, opts), O = ownerAgent(data, opts), M = marketingAgent(data, opts);
    const has = (k) => Array.isArray(data[k]);
    const v = (k, f) => (has(k) ? f() : DNA);
    const leads = data.leads || [], buyers = data.buyer_leads || [];
    const primary = B.filter((b) => !b.dupOf);
    const people = new Map((data.profiles || []).map((p) => [p.id, p.name]));
    const callsToday = (data.calls || []).filter((c) => istDay(c.created_at) === today);
    const team = {}; callsToday.forEach((c) => { const n = people.get(c.by_id) || 'Unknown'; team[n] = (team[n] || 0) + 1; });
    const problems = [];
    {
      // Leads reach the CRM from the website Admin Panel (portal -> Admin Panel -> CRM). Watch the CRM itself.
      const last = buyers.map((x) => x.created_at || '').sort().pop();
      const hrs = last ? (now - new Date(last)) / 3600000 : null;
      if (has('buyer_leads') && (hrs === null || hrs > 24)) problems.push('No new buyer lead reached the CRM in the last 24 hours. Check the Admin Panel to CRM transfer.');
      const bad = (data.lead_ingest_log || []).filter((x) => x.outcome && x.outcome !== 'ok' && daysAgo(x.at, now) <= 1).length;
      if (bad) problems.push(bad + ' lead(s) failed to reach the CRM in the last day.');
    }
    const noProp = primary.filter((b) => !b.propertyId).length;
    if (noProp) problems.push(noProp + ' buyer enquiries are not linked to any property.');
    const waFail = (data.wa_messages || []).filter((m) => m.direction === 'out' && m.status === 'failed' && daysAgo(m.created_at, now) <= 7).length;
    if (waFail) problems.push(waFail + ' WhatsApp message(s) failed in the last 7 days.');
    const meetPending = leads.filter((l) => l.status === 'meeting_assigned' && l.meeting_date && l.meeting_date < today);
    const r = {
      date: today,
      newBuyers: v('buyer_leads', () => buyers.filter((b) => istDay(b.created_at || b.lead_date) === today).length),
      newBuyers7: v('buyer_leads', () => buyers.filter((b) => daysAgo(b.created_at || b.lead_date, now) <= 7).length),
      hotBuyers: v('buyer_leads', () => primary.filter((b) => b.cls === 'HOT').length),
      notContacted: v('buyer_leads', () => primary.filter((b) => b.unanswered && b.cls !== 'NEEDS REVIEW').length),
      followToday: v('leads', () => leads.filter((l) => l.follow_date === today).length + buyers.filter((b) => b.next_fu === today).length),
      followOverdue: v('leads', () => leads.filter((l) => l.follow_date && l.follow_date < today && ['followup', 'callback', 'prospect', 'ringing'].includes(l.status)).length + buyers.filter((b) => b.next_fu && b.next_fu < today && !/not interested|closed/i.test(b.status || '')).length),
      ownerAttention: v('leads', () => O.filter((o) => o.score >= 60).length),
      meetingsScheduled: v('leads', () => leads.filter((l) => l.status === 'meeting_assigned' && l.meeting_date && l.meeting_date >= today).length),
      meetingsPending: v('leads', () => meetPending.length),
      visitRequests: v('buyer_leads', () => primary.filter((b) => b.visitRequest && b.cls !== 'NEEDS REVIEW').length),
      deals7: v('leads', () => leads.filter((l) => l.status === 'deal_closed' && daysAgo(l.status_at || l.deal_at, now) <= 7).length),
      team: has('calls') && (data.calls || []).length ? (Object.keys(team).length ? team : 'No calls logged today') : DNA,
      marketing: has('properties') ? { lowListings: M.low.length, enquiries7: M.properties.reduce((s, p) => s + p.last7, 0), social: DNA } : DNA,
      newSinceLastVisit: opts.lastSeenBuyerId != null ? primary.filter((b) => b.isNew).length : DNA,
      latestEnquiryAt: (data.buyer_leads || []).reduce((m, b) => (String(b.created_at || '') > m ? String(b.created_at) : m), '') || DNA,
      problems, opportunities: [], actions: [],
    };
    const topOwners = O.filter((o) => o.highPotential).slice(0, 3);
    topOwners.forEach((o) => r.opportunities.push('Owner ' + (o.name || '#' + o.id) + ' (' + o.statusLabel + ', score ' + o.score + ')'));
    const hot = primary.filter((b) => b.cls === 'HOT').slice(0, 3);
    hot.forEach((b) => r.opportunities.push('HOT buyer ' + (b.name || b.code) + ' for ' + (b.propertyLabel || b.propertyId)));
    if (typeof r.notContacted === 'number' && r.notContacted) r.actions.push('Get ' + r.notContacted + ' uncontacted buyer enquiries called (oldest first).');
    if (typeof r.meetingsPending === 'number' && r.meetingsPending) r.actions.push('Ask the field team to update ' + r.meetingsPending + ' meetings whose date has passed.');
    if (typeof r.followOverdue === 'number' && r.followOverdue) r.actions.push('Clear ' + r.followOverdue + ' overdue follow-ups.');
    if (M.low.length) r.actions.push('Review ' + M.low.length + ' listing(s) with no recent enquiries.');
    if (noProp) r.actions.push('Link ' + noProp + ' buyer enquiries to their property.');
    if (!r.actions.length) r.actions.push('No urgent action. Keep follow-ups on time.');
    return r;
  }

  function reportText(r) {
    const n = (x) => (typeof x === 'number' ? String(x) : x);
    const L = [];
    L.push('EASY DEALS — DAILY REPORT (' + r.date + ')', '');
    L.push('Buyers: ' + n(r.newBuyers) + ' new today, ' + n(r.newBuyers7) + ' in 7 days');
    L.push('HOT buyers: ' + n(r.hotBuyers));
    L.push('Buyers not contacted: ' + n(r.notContacted));
    L.push('Property visit requests: ' + n(r.visitRequests));
    L.push('Follow-ups due today: ' + n(r.followToday) + ' | Overdue: ' + n(r.followOverdue));
    L.push('Owner leads needing attention: ' + n(r.ownerAttention));
    L.push('Meetings scheduled: ' + n(r.meetingsScheduled) + ' | Pending update: ' + n(r.meetingsPending));
    L.push('Deals closed (7 days): ' + n(r.deals7));
    L.push('Team calls today: ' + (typeof r.team === 'object' ? Object.entries(r.team).map(([k, v]) => k + ' ' + v).join(', ') : r.team));
    L.push('Marketing: ' + (typeof r.marketing === 'object' ? r.marketing.enquiries7 + ' enquiries in 7 days, ' + r.marketing.lowListings + ' low-performing listings, social media ' + r.marketing.social : r.marketing));
    L.push('', 'Problems:'); (r.problems.length ? r.problems : ['None found']).forEach((x) => L.push('- ' + x));
    L.push('', 'Opportunities:'); (r.opportunities.length ? r.opportunities : ['None found']).forEach((x) => L.push('- ' + x));
    L.push('', 'Recommended actions:'); r.actions.forEach((x, i) => L.push(i + 1 + '. ' + x));
    return L.join('\n');
  }

  /* ---------- Cost + health ---------- */
  function costStatus(data, settings) {
    settings = settings || {};
    const out = (data.wa_messages || []).filter((m) => m.direction === 'out');
    return {
      additionalBudget: 0,
      walletInr: settings.walletInr != null ? settings.walletInr : 500,
      walletSource: 'Entered manually (the Meta wallet cannot be read without the paid/API route)',
      waOutTotal: out.length, waOutSent: out.filter((m) => m.status === 'sent').length, waOutFailed: out.filter((m) => m.status === 'failed').length,
      waMasterSwitch: data.wa_settings && data.wa_settings[0] ? !!data.wa_settings[0].enabled : DNA,
      autoSend: false, // hard-coded. No code path can turn it on in Phase 1.
      services: [
        { name: 'Supabase', plan: 'Free', cost: 0 }, { name: 'GitHub Pages', plan: 'Free', cost: 0 },
        { name: 'AI agents', plan: 'Rule-based, runs in the browser', cost: 0 }, { name: 'Paid AI model API', plan: 'OFF (cost blocked)', cost: 0 },
        { name: 'WhatsApp auto-send', plan: 'OFF (draft only)', cost: 0 }, { name: 'Calling automation', plan: 'OFF', cost: 0 },
      ],
    };
  }

  function health(data, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const out = [];
    const tables = ['leads', 'buyer_leads', 'properties', 'buyer_history', 'calls', 'profiles', 'lead_ingest_log', 'wa_messages', 'wa_settings'];
    tables.forEach((t) => out.push({ check: 'Read ' + t, ok: Array.isArray(data[t]), detail: Array.isArray(data[t]) ? data[t].length + ' rows' : (data._errors && data._errors[t]) || 'not loaded' }));
    if (Array.isArray(data.buyer_leads)) {
      const last = data.buyer_leads.map((x) => x.created_at || '').sort().pop();
      const hrs = last ? Math.round((now - new Date(last)) / 3600000) : null;
      out.push({ check: 'New leads reaching CRM', ok: hrs !== null && hrs <= 24, detail: last ? 'Last buyer lead added to CRM ' + hrs + ' h ago' : 'No buyer leads' });
    }
    out.push({ check: 'WhatsApp auto-send', ok: true, detail: 'OFF (locked in Phase 1)' });
    return out;
  }

  /* ---------- Approval queue (pure state transitions) ---------- */
  function enqueue(state, item) {
    state.queue = state.queue || []; state.processed = state.processed || {};
    if (state.processed[item.fp]) return { added: false, reason: 'duplicate' };
    if (!item.text) return { added: false, reason: 'empty draft' };
    const q = { id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), status: 'pending', createdAt: new Date().toISOString(), ...item };
    state.queue.unshift(q); state.processed[item.fp] = q.id;
    log(state, 'Draft queued: ' + item.title);
    return { added: true, item: q };
  }
  function decide(state, id, decision, by) {
    if (!['approved', 'rejected'].includes(decision)) throw new Error('bad decision');
    const q = (state.queue || []).find((x) => x.id === id);
    if (!q) throw new Error('not found');
    if (q.status !== 'pending') throw new Error('already ' + q.status);
    q.status = decision; q.decidedAt = new Date().toISOString(); q.decidedBy = by || 'admin';
    log(state, (decision === 'approved' ? 'Approved (manual send only): ' : 'Rejected: ') + q.title);
    return q;
  }
  function log(state, msg, kind) { state.activity = state.activity || []; state.activity.unshift({ at: new Date().toISOString(), kind: kind || 'info', msg }); if (state.activity.length > 500) state.activity.length = 500; }

  const API = { DNA, ph10, mask, validPhone, istDay, propertyLabel, propAvailable, buyerAgent, ownerAgent, marketingAgent, founderReport, reportText, costStatus, health, enqueue, decide, log, ST_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.AIHUB = API;
})(typeof window !== 'undefined' ? window : globalThis);
