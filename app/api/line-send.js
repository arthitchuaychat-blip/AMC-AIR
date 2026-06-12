// ส่งข้อความตอบลูกค้าผ่าน LINE (push) — เรียกจากหน้าแชตในแอป
// ตรวจสิทธิ์ด้วย Supabase JWT ของผู้ใช้ที่ล็อกอิน (เฉพาะฝ่ายออฟฟิศเท่านั้นที่ส่งได้)
// เรียก Supabase REST ตรง (ไม่พึ่ง supabase-js) เพื่อให้รันบน Edge ได้แน่นอน

export const config = { runtime: "edge" };

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const OFFICE = ["admin", "sales", "exec", "finance"];

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "no auth" }, 401);

  // identify the caller from their Supabase JWT
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
  if (!ur.ok) return json({ error: "unauthorized" }, 401);
  const user = await ur.json();
  const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbHeaders() });
  const prof = (pr.ok ? await pr.json() : [])[0];
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

  await fetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ line_user_id: to, direction: "out", type: "text", text, sent_by: user.id }) });
  await fetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(to)}`, { method: "PATCH", headers: sbHeaders(), body: JSON.stringify({ last_message: text, last_message_at: new Date().toISOString(), unread: 0 }) });
  return json({ ok: true });
}
