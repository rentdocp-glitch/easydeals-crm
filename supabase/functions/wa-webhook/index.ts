// Meta WhatsApp Cloud API webhook. Deploy with "Verify JWT" OFF.
// Secrets needed: WA_VERIFY_TOKEN (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are automatic).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === Deno.env.get("WA_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
              : new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("ok");
  try {
    const body = await req.json();
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
    if (rows.length) await db.from("wa_messages").insert(rows);
  } catch (_) { /* always 200 so Meta does not retry endlessly */ }
  return new Response("ok");
});
