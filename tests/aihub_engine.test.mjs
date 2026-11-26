// AI Hub Phase 1 engine tests. Run: node --test tests/aihub_engine.test.mjs
// Uses only fake data. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../aihub/engine.js');
const M = require('../aihub/mock-data.js');
const NOW = Date.UTC(2026, 10, 25, 6, 30);
const data = () => M.build(NOW);
const byId = (arr, id) => arr.find((x) => x.id === id);

test('buyer: callback request is HOT with callback draft', () => {
  const b = byId(E.buyerAgent(data(), { now: NOW }), 1);
  assert.equal(b.cls, 'HOT'); assert.equal(b.callbackRequest, true); assert.equal(b.draftType, 'callback');
});
test('buyer: visit request detected from history note', () => {
  const b = byId(E.buyerAgent(data(), { now: NOW }), 12);
  assert.equal(b.visitRequest, true); assert.equal(b.cls, 'HOT');
});
test('buyer: site visit scheduled -> visit confirmation draft', () => {
  const b = byId(E.buyerAgent(data(), { now: NOW }), 8);
  assert.equal(b.cls, 'HOT'); assert.equal(b.draftType, 'visit_confirm');
});
test('buyer: NEEDS REVIEW cases have no draft', () => {
  const B = E.buyerAgent(data(), { now: NOW });
  for (const id of [5, 6, 7, 11]) { const b = byId(B, id); assert.equal(b.cls, 'NEEDS REVIEW', 'id ' + id); assert.equal(b.draft, null, 'id ' + id); }
  assert.match(byId(B, 5).reasons[0], /No property/);
  assert.match(byId(B, 6).reasons[0], /Sold/);
  assert.match(byId(B, 7).reasons[0], /Phone/);
  assert.match(byId(B, 11).reasons[0], /STOP/);
});
test('buyer: not interested is COLD and gets no draft', () => {
  const b = byId(E.buyerAgent(data(), { now: NOW }), 10);
  assert.equal(b.cls, 'COLD'); assert.equal(b.draft, null);
});
test('buyer: duplicate (same phone, same property, different format) is held, no draft', () => {
  const B = E.buyerAgent(data(), { now: NOW });
  const d = byId(B, 4); assert.equal(d.dupOf, 3); assert.equal(d.draft, null);
  assert.equal(byId(B, 3).dupOf, null); assert.equal(byId(B, 3).enquiries, 2);
});
test('buyer: property lock, draft names only the enquired property', () => {
  const d = data(); const B = E.buyerAgent(d, { now: NOW });
  const props = d.properties;
  for (const b of B.filter((x) => x.draft)) {
    const own = props.find((p) => p.id === b.propertyId);
    assert.ok(b.draft.includes(own.project), 'draft for ' + b.id + ' must name its own property');
    for (const p of props.filter((p) => p.id !== b.propertyId)) {
      assert.ok(!b.draft.includes(p.project), 'buyer ' + b.id + ' draft mentions other property ' + p.project);
      assert.ok(!b.draft.includes(p.id), 'buyer ' + b.id + ' draft mentions other ED id');
    }
  }
});
test('buyer: injected text in enquiry never reaches the draft', () => {
  const b = byId(E.buyerAgent(data(), { now: NOW }), 13);
  assert.ok(b.draft); assert.ok(!/script|RULES|instead|send to all|ED-T01/i.test(b.draft)); // only the first word of the name field is ever used
  assert.ok(b.draft.includes('Mock Park'));
});
test('buyer: no invented facts, missing price/size is omitted', () => {
  const d = data(); d.properties[0].price = null; d.properties[0].carpet = null;
  const b = byId(E.buyerAgent(d, { now: NOW }), 9); // intro draft for ED-T01
  assert.ok(!/₹|sq ft|price/i.test(b.draft), b.draft);
});
test('buyer: drafts are professional English and include opt-out where promotional', () => {
  const B = E.buyerAgent(data(), { now: NOW }).filter((x) => x.draft && /intro|followup/.test(x.draftType));
  assert.ok(B.length);
  B.forEach((b) => { assert.match(b.draft, /Reply STOP/); assert.match(b.draft, /Easy Deals, Pune/); });
});
test('buyer: phone numbers are masked in output', () => {
  E.buyerAgent(data(), { now: NOW }).forEach((b) => assert.ok(!/\d{10}/.test(JSON.stringify({ ...b, fp: '' })), 'unmasked phone in ' + b.id));
});

test('owner: only active statuses, sorted by score, meeting today ranks first', () => {
  const O = E.ownerAgent(data(), { now: NOW });
  assert.ok(!O.some((o) => ['deal_closed', 'not_interested', 'not_available'].includes(o.status)));
  for (let i = 1; i < O.length; i++) assert.ok(O[i - 1].score >= O[i].score);
  assert.equal(O[0].id, 1);
});
test('owner: overdue follow-up, callbacks, stale meeting, summary', () => {
  const O = E.ownerAgent(data(), { now: NOW });
  assert.match(byId(O, 3).nextAction, /overdue 4d/);
  assert.equal(byId(O, 4).pendingCallback, true);
  assert.match(byId(O, 7).nextAction, /meeting result/);
  assert.match(byId(O, 2).summary, /Premium plan/);
  assert.ok(byId(O, 2).highPotential);
  O.forEach((o) => assert.ok(!/\d{10}/.test(o.phoneMasked)));
});

test('marketing: low performer flagged, social metrics marked DATA NOT AVAILABLE', () => {
  const m = E.marketingAgent(data(), { now: NOW });
  assert.deepEqual(m.low.map((p) => p.id), ['ED-T05']);
  assert.ok(!m.properties.some((p) => p.id === 'ED-T03'), 'sold property excluded');
  assert.equal(m.social.instagram, E.DNA);
  assert.equal(Object.keys(m.dailyLeads).length, 14);
});

test('founder report: numbers match mock data, missing tables -> DATA NOT AVAILABLE', () => {
  const r = E.founderReport(data(), { now: NOW });
  assert.equal(r.meetingsPending, 1); assert.equal(r.meetingsScheduled, 1); assert.equal(r.deals7, 1);
  const d = data(); delete d.calls; delete d.leads;
  const r2 = E.founderReport(d, { now: NOW });
  assert.equal(r2.team, E.DNA); assert.equal(r2.followToday, E.DNA); assert.equal(r2.meetingsPending, E.DNA);
  assert.match(E.reportText(r2), /DATA NOT AVAILABLE/);
});
test('founder report: stale portal feed is reported as a problem', () => {
  const d = data(); d.lead_ingest_log = [{ at: new Date(NOW - 3 * 864e5).toISOString(), outcome: 'ok' }];
  assert.ok(E.founderReport(d, { now: NOW }).problems.some((p) => /portal/.test(p)));
});

test('approval queue: dedupe, decide once, approve never sends', () => {
  const S = {};
  const item = { agent: 'Buyer RM AI', title: 't', text: 'hello', fp: 'buyer:1:intro:x' };
  assert.equal(E.enqueue(S, item).added, true);
  assert.equal(E.enqueue(S, item).added, false);
  const id = S.queue[0].id;
  const q = E.decide(S, id, 'approved');
  assert.equal(q.status, 'approved');
  assert.throws(() => E.decide(S, id, 'rejected'), /already/);
  assert.throws(() => E.decide(S, id, 'send'), /bad decision/);
  assert.equal(E.enqueue(S, { ...item, fp: 'x2', text: '' }).added, false);
});

test('cost: auto-send is hard OFF, extra budget is 0', () => {
  const c = E.costStatus(data(), {});
  assert.equal(c.autoSend, false); assert.equal(c.additionalBudget, 0); assert.equal(c.walletInr, 500);
  assert.equal(c.waMasterSwitch, false);
});

test('safety: AI Hub code has no write, send or call paths', () => {
  const src = ['aihub.html', 'aihub/engine.js', 'aihub/mock-data.js'].map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
  for (const bad of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/, /\.rpc\(/, /functions\.invoke/, /wa-send/, /graph\.facebook\.com/, /fetch\(/, /tel:/, /wa\.me/, /api\.whatsapp/, /anthropic|openai/i]) {
    assert.ok(!bad.test(src), 'forbidden pattern found: ' + bad);
  }
});
test('safety: mock data has no real-looking phone numbers', () => {
  const d = data();
  [...d.buyer_leads.map((b) => b.buyer_phone), ...d.leads.map((l) => l.phone)].forEach((p) => {
    const t = E.ph10(p); if (t.length === 10) assert.ok(t.startsWith('90000'), 'non-test phone ' + p);
  });
});
test('buyer: old enquiry on a sold property is COLD, no draft, never redirected', () => {
  const d = data(); d.buyer_leads.push({ id: 99, buyer_name: 'Late Buyer', buyer_phone: '9000000099', property_id: 'ED-T03', status: 'New', created_at: new Date(NOW - 40 * 864e5).toISOString() });
  const b = byId(E.buyerAgent(d, { now: NOW }), 99);
  assert.equal(b.cls, 'COLD'); assert.equal(b.draft, null); assert.match(b.nextAction, /Do not offer other listings/);
});

/* ---- Live, growing data (added 26 Nov 2026) ---- */
test('growing data: new enquiries are flagged as new since last visit and listed first', () => {
  const d = data();
  d.buyer_leads.push({ id: 500, buyer_name: 'Fresh Lead', buyer_phone: '9000000500', property_id: 'ED-T01', status: 'New', created_at: new Date(NOW - 60000).toISOString() });
  const B = E.buyerAgent(d, { now: NOW, lastSeenBuyerId: 13 });
  assert.equal(B[0].id, 500, 'newest enquiry must be first');
  assert.deepEqual(B.filter((b) => b.isNew).map((b) => b.id), [500]);
  for (let i = 1; i < B.length; i++) assert.ok(String(B[i - 1].createdAt) >= String(B[i].createdAt));
  const r = E.founderReport(d, { now: NOW, lastSeenBuyerId: 13 });
  assert.equal(r.newSinceLastVisit, 1);
  assert.equal(E.founderReport(d, { now: NOW }).newSinceLastVisit, E.DNA, 'first visit: unknown, not zero');
});
test('growing data: a later edit to a lead does not create a second draft for the same message', () => {
  const S = {};
  const d = data();
  const b1 = E.buyerAgent(d, { now: NOW }).find((x) => x.id === 1);
  assert.equal(E.enqueue(S, { title: 't', text: b1.draft, fp: b1.fp }).added, true);
  d.buyer_leads.find((x) => x.id === 1).updated_at = new Date(NOW).toISOString();
  const b2 = E.buyerAgent(d, { now: NOW }).find((x) => x.id === 1);
  assert.equal(b2.fp, b1.fp);
  assert.equal(E.enqueue(S, { title: 't', text: b2.draft, fp: b2.fp }).added, false);
});
test('growing data: a STOP reply of any age blocks drafts (no date window)', () => {
  const d = data();
  d.wa_messages.push({ direction: 'in', wa_phone: '9000000001', body: 'stop', created_at: new Date(NOW - 200 * 864e5).toISOString() });
  const b = E.buyerAgent(d, { now: NOW }).find((x) => x.id === 1);
  assert.equal(b.cls, 'NEEDS REVIEW'); assert.equal(b.draft, null);
});
test('scale: 60,000 buyer leads and 60,000 owner leads run in under 5 seconds', () => {
  const d = data();
  const t = new Date(NOW).getTime();
  for (let i = 0; i < 60000; i++) {
    d.buyer_leads.push({ id: 1000 + i, buyer_name: 'Load ' + i, buyer_phone: '9' + String(100000000 + (i % 40000)), property_id: ['ED-T01', 'ED-T02', 'ED-T04', null][i % 4], status: ['New', 'Contacted', 'Follow-up'][i % 3], created_at: new Date(t - (i % 400) * 3600000).toISOString() });
    d.leads.push({ id: 1000 + i, name: 'Load ' + i, phone: '9' + String(200000000 + i), status: ['new', 'followup', 'callback', 'prospect', 'ringing'][i % 5], follow_date: E.istDay(t - (i % 9) * 864e5), created_at: new Date(t - (i % 300) * 864e5).toISOString() });
  }
  const t0 = Date.now();
  const B = E.buyerAgent(d, { now: NOW }), O = E.ownerAgent(d, { now: NOW }); E.marketingAgent(d, { now: NOW }); E.founderReport(d, { now: NOW });
  const ms = Date.now() - t0;
  assert.ok(B.length > 60000 && O.length > 60000);
  assert.ok(B.some((b) => b.dupOf), 'repeat phones must be detected as duplicates');
  assert.ok(ms < 5000, 'took ' + ms + ' ms');
});
