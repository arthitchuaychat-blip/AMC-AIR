// The Top Mentor — ส่งข้อความแชตจากแอป (แอดมิน) ไปหาสมาชิกทาง LINE + เก็บลง tm_chat
// action (POST {action:'send', token, lineUserId, memberId?, text}) — ตรวจว่าเป็นแอดมินก่อนส่ง
// env: MENTOR_LINE_ACCESS_TOKEN (+ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
import crypto from "crypto";

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN = () => process.env.MENTOR_LINE_ACCESS_TOKEN || "";
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

const unb64u = (s) => Buffer.from(s, "base64url").toString("utf8");
const hmac = (s) => crypto.createHmac("sha256", KEY()).update(s).digest("hex");
function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [pb, sig] = token.split(".");
  let p; try { p = unb64u(pb); } catch { return null; }
  if (hmac(p) !== sig) return null;
  const [username, role] = p.split("|");
  return { username, role };
}
async function isAdmin(token) {
  const auth = verifyToken(token);
  if (!auth || auth.role !== "admin") return false;
  const r = await fetch(`${SB()}/rest/v1/tm_users?username=eq.${encodeURIComponent(auth.username)}&select=username,data`, { headers: sbH() });
  const u = (r.ok ? await r.json() : [])[0];
  return !!u && u.data?.role === "admin";
}
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  if (!KEY() || !TOKEN()) return res.status(200).json({ ok: false, error: "server not configured" });

  const body = await readJson(req);
  if (body.action !== "send") return res.status(200).json({ ok: false, error: "unknown action" });
  if (!(await isAdmin(body.token))) return res.status(200).json({ ok: false, error: "ต้องเป็นแอดมิน" });

  const to = (body.lineUserId || "").trim();
  const text = (body.text || "").trim();
  if (!to || !text) return res.status(200).json({ ok: false, error: "ไม่มีปลายทางหรือข้อความ" });

  const lr = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!lr.ok) return res.status(502).json({ ok: false, error: "ส่ง LINE ไม่สำเร็จ", detail: await lr.text().catch(() => lr.status) });

  const row = { line_user_id: to, member_id: body.memberId || null, dir: "out", text };
  await fetch(`${SB()}/rest/v1/tm_chat`, { method: "POST", headers: { ...sbH(), Prefer: "return=minimal" }, body: JSON.stringify(row) }).catch(() => {});

  return res.status(200).json({ ok: true });
}
