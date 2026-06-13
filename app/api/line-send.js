// ส่งข้อความตอบลูกค้าผ่าน LINE (push) — เรียกจากหน้าแชตในแอป (Node.js runtime — ต่อ api.line.me ได้เสถียร)
// ตรวจสิทธิ์ด้วย Supabase JWT ของผู้ใช้ที่ล็อกอิน (เฉพาะฝ่ายออฟฟิศเท่านั้นที่ส่งได้)

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const OFFICE = ["admin", "sales", "exec", "finance"];

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "no auth" });

  // identify the caller from their Supabase JWT
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const user = await ur.json();
  const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbH() });
  const prof = (pr.ok ? await pr.json() : [])[0];
  if (!OFFICE.includes(prof?.role)) return res.status(403).json({ error: "forbidden" });

  const { to, text } = await readJson(req);
  if (!to || !text?.trim()) return res.status(400).json({ error: "missing to/text" });

  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!r.ok) return res.status(502).json({ error: "line: " + (await r.text().catch(() => r.status)) });

  await fetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ line_user_id: to, direction: "out", type: "text", text, sent_by: user.id }) });
  await fetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(to)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ last_message: text, last_message_at: new Date().toISOString(), unread: 0 }) });
  return res.status(200).json({ ok: true });
}
