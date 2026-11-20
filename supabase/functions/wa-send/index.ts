// WhatsApp sender for the Easy Deals AI RM. Deploy with "Verify JWT" ON (called from the CRM with the user's session).
// Secrets: WA_TOKEN (permanent Meta access token). SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY are automatic.
// Every send passes ALL safety checks below. If any fails, nothing is sent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: CORS });

const TEMPLATES: Record<string, { n: number; text: string }> = {
  ed_welcome: { n: 2, text: "Namaste {{1}} ji, Easy Deals se. Aapne {{2}} ke baare me poochha tha. Kya aap is hafte site visit karna chahenge? Apna suitable time bata dijiye. Band karne ke liye STOP likhein." },
  ed_followup: { n: 2, text: "Namaste {{1}} ji, Easy Deals se. {{2}} ke baare me aapka kya vichar hai? Site visit ke liye bas time bata dijiye, hum arrange kar denge. Band karne ke liye STOP likhein." },
  ed_visit_slots: { n: 4, text: "Namaste {{1}} ji, {{2}} ki site visit ke liye ye 2 samay available hain: {{3}} ya {{4}}. Aapko kaun sa suit karega? 1 ya 2 reply kijiye." },
  ed_visit_reminder: { n: 4, text: "Namaste {{1}} ji, yaad dilana: {{2}} ki site visit {{3}} ko hai. Hamare {{4}} aapse wahan milenge." },
};
const STOP_RE = /\b(stop|unsubscribe|band\s*kar(o|do)?|band\s*kr(o|do)?)\b/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J({ ok: false, reason: "POST only" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const userDb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userDb.auth.getUser();
    if (!u?.user) return J({ ok: false, reason: "login required" }, 401);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const buyerId = Number(body.buyer_id);
    const tpl = String(body.template || "");
    const extra: string[] = Array.isArray(body.extra) ? body.extra.map(String) : [];
    const T = TEMPLATES[tpl];
    if (!buyerId || !T) return J({ ok: false, reason: "bad request (buyer_id/template)" }, 400);

    // 1) master switch + daily cap
    const { data: st } = await db.from("wa_settings").select("*").eq("id", 1).single();
    if (!st?.enabled) return J({ ok: false, reason: "AI RM master switch is OFF" });
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const dayStartUtc = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600 * 1000).toISOString();
    const { count: sentToday } = await db.from("wa_messages").select("id", { count: "exact", head: true }).eq("direction", "out").gte("created_at", dayStartUtc);
    if ((sentToday ?? 0) >= st.daily_cap) return J({ ok: false, reason: `daily limit reached (${sentToday}/${st.daily_cap})` });

    // 2) time window 9:00-20:00 IST
    const h = ist.getUTCHours();
    if (h < 9 || h >= 20) return J({ ok: false, reason: "outside 9 AM-8 PM IST" });

    // 3) buyer + permission (admin or the assigned RM)
    const { data: b } = await db.from("buyer_leads").select("*").eq("id", buyerId).single();
    if (!b) return J({ ok: false, reason: "buyer not found" });
    const { data: isAdmin } = await userDb.rpc("ed_is_admin");
    if (!isAdmin && b.assigned_to !== u.user.id) return J({ ok: false, reason: "not allowed for this buyer" }, 403);
    if (/closed|not interested/i.test(b.status || "")) return J({ ok: false, reason: `buyer status is ${b.status}` });

    // 4) property lock: only the buyer's original, available property
    if (!b.property_id) return J({ ok: false, reason: "buyer has no property" });
    const { data: p } = await db.from("properties").select("*").eq("id", b.property_id).single();
    if (!p) return J({ ok: false, reason: "property not found" });
    if (p.status && p.status !== "Available") return J({ ok: false, reason: `property is ${p.status}` });

    // 5) phone, opt-out, one message per buyer per day
    const digits = String(b.buyer_phone || "").replace(/\D/g, "");
    const ten = digits.slice(-10);
    if (ten.length !== 10) return J({ ok: false, reason: "invalid phone" });
    const { data: ins } = await db.from("wa_messages").select("body").eq("direction", "in").eq("wa_phone", ten).limit(200);
    if ((ins ?? []).some((m) => STOP_RE.test(m.body || ""))) return J({ ok: false, reason: "buyer opted out" });
    const { count: today } = await db.from("wa_messages").select("id", { count: "exact", head: true }).eq("direction", "out").eq("wa_phone", ten).gte("created_at", dayStartUtc);
    if ((today ?? 0) >= 1) return J({ ok: false, reason: "already messaged this buyer today" });

    // 6) build parameters from CRM only (never from the caller)
    const first = String(b.buyer_name || "Sir/Madam").trim().split(/\s+/)[0];
    const prop = [p.project, p.locality ? "(" + p.locality + ")" : "", p.bhk].filter(Boolean).join(" ").trim() || p.id;
    const params = [first, prop, ...extra].slice(0, T.n);
    if (params.length < T.n || params.some((x) => !x)) return J({ ok: false, reason: "missing template values" });
    const rendered = T.text.replace(/\{\{(\d)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");

    // 7) send
    const token = Deno.env.get("WA_TOKEN");
    if (!token) return J({ ok: false, reason: "WA_TOKEN secret not set yet" });
    const r = await fetch(`https://graph.facebook.com/v21.0/${st.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: "91" + ten, type: "template",
        template: { name: tpl, language: { code: "en" }, components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }] },
      }),
    });
    const out = await r.json();
    const ok = r.ok && out?.messages?.[0]?.id;
    await db.from("wa_messages").insert({
      direction: "out", wa_phone: ten, lead_kind: "buyer", lead_id: String(buyerId), body: rendered,
      status: ok ? "sent" : "failed", wa_msg_id: ok ? out.messages[0].id : null, raw: { template: tpl, by: u.user.id, response: out },
    });
    return ok ? J({ ok: true, sent: rendered }) : J({ ok: false, reason: out?.error?.message || "Meta rejected the message" });
  } catch (e) {
    return J({ ok: false, reason: "server error: " + (e as Error).message }, 500);
  }
});
