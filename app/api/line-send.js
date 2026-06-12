// ส่งข้อความตอบลูกค้าผ่าน LINE (push) — เรียกจากหน้าแชตในแอป
// ตรวจสิทธิ์ด้วย Supabase JWT ของผู้ใช้ที่ล็อกอิน (เฉพาะฝ่ายออฟฟิศเท่านั้นที่ส่งได้)
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const OFFICE = ["admin", "sales", "exec", "finance"];

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "no auth" }, 401);

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: { user }, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !user) return json({ error: "unauthorized" }, 401);
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (!OFFICE.includes(prof?.role)) return json({ error: "forbidden" }, 403);

  let payload; try { payload = await req.json(); } catch { return json({ error: "bad body" }, 400); }
  const { to, text } = payload;
  if (!to || !text?.trim()) return json({ error: "missing to/text" }, 400);

  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!r.ok) return json({ error: "line: " + (await r.text().catch(() => r.status)) }, 502);

  await sb.from("line_messages").insert({ line_user_id: to, direction: "out", type: "text", text, sent_by: user.id });
  await sb.from("line_contacts").update({ last_message: text, last_message_at: new Date().toISOString(), unread: 0 }).eq("line_user_id", to);
  return json({ ok: true });
}
