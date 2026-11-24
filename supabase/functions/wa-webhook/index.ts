// Meta WhatsApp Cloud API webhook. Deploy with "Verify JWT" OFF.
// Secrets needed: WA_VERIFY_TOKEN and WA_APP_SECRET (Meta App > Settings > Basic > App secret).
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are automatic.
// Every POST must carry Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the app secret).
// Unsigned or wrongly signed requests are rejected, so nobody can insert a fake "STOP" or fake message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const enc = new TextEncoder();
async function validSignature(raw: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7).toLowerCase();
  if (got.length !== hex.length) return false;
  let diff = 0; // constant-time compare
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === Deno.env.get("WA_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
              : new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("ok");
  const secret = Deno.env.get("WA_APP_SECRET");
  if (!secret) {
    console.error("wa-webhook: WA_APP_SECRET is not set; refusing unsigned webhook data");
    return new Response("server not configured", { status: 500 });
  }
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256"), secret))) {
    return new Response("invalid signature", { status: 401 });
  }
  try {
    const body = JSON.parse(raw);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const rows: Record<string, unknown>[] = [];
    for (const e of body.entry ?? []) for (const c of e.changes ?? []) {
      const v = c.value ?? {};
      for (const m of v.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? `[${m.type}]`;
        rows.push({ direction: "in", wa_phone: String(m.from ?? "").slice(-10), body: text, wa_msg_id: m.id, raw: m });
      }
      for (const s of v.statuses ?? []) {
        rows.push({ direction: "status", wa_phone: String(s.recipient_id ?? "").slice(-10), status: s.status, wa_msg_id: s.id, raw: s });
      }
    }
    if (rows.length) {
      const { error } = await db.from("wa_messages").insert(rows);
      if (error) console.error("wa-webhook insert failed:", error.message);
    }
  } catch (e) { console.error("wa-webhook bad payload:", (e as Error).message); /* 200 so Meta does not retry endlessly */ }
  return new Response("ok");
});
