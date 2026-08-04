// Facebook comment actions — reply / hide / unhide / private-reply / mark done. Office staff only (Supabase JWT).
//   POST /api/fb-comment  body: { action, comment_id, text }
//   action: "reply" (ตอบใต้คอมเมนต์) | "hide" | "unhide" | "private" (ตอบเป็น DM ส่วนตัว) | "done"
// ต้องมีสิทธิ์ Meta: reply/hide/unhide → pages_manage_engagement · private → pages_messaging
// Env: FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { GRAPH, pageToken, pageId } from "./_fb.js";
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const OFFICE = ["admin", "sales", "exec", "finance", "hr"];

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
const patchComment = (cid, patch) =>
  fetch(`${SB()}/rest/v1/fb_comments?comment_id=eq.${encodeURIComponent(cid)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify(patch) }).catch(() => {});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "no auth" });
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const user = await ur.json();
  const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbH() });
  const role = ((pr.ok ? await pr.json() : [])[0] || {}).role;
  if (!OFFICE.includes(role)) return res.status(403).json({ error: "forbidden" });

  const { action, comment_id, text } = await readJson(req);
  if (!action || !comment_id) return res.status(400).json({ error: "missing action/comment_id" });

  // "done" ไม่ต้องเรียก FB — แค่ปิดงานในระบบ
  if (action === "done") { await patchComment(comment_id, { status: "done", assigned_to: user.id }); return res.status(200).json({ ok: true }); }

  const page = await pageToken();
  if (!page) return res.status(200).json({ ok: false, reason: "no-config", msg: "ยังไม่ได้ตั้ง FB_PAGE_ACCESS_TOKEN ใน Vercel" });

  try {
    if (action === "reply") {
      if (!text?.trim()) return res.status(400).json({ error: "missing text" });
      const r = await fetch(`${GRAPH}/${encodeURIComponent(comment_id)}/comments?access_token=${page}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }),
      });
      if (!r.ok) return res.status(502).json({ error: "fb: " + (await r.text().catch(() => r.status)) });
      await patchComment(comment_id, { replied: true, status: "done", assigned_to: user.id });
      return res.status(200).json({ ok: true });
    }
    if (action === "hide" || action === "unhide") {
      const hide = action === "hide";
      const r = await fetch(`${GRAPH}/${encodeURIComponent(comment_id)}?is_hidden=${hide}&access_token=${page}`, { method: "POST" });
      if (!r.ok) return res.status(502).json({ error: "fb: " + (await r.text().catch(() => r.status)) });
      await patchComment(comment_id, { is_hidden: hide, status: hide ? "hidden" : "open", assigned_to: user.id });
      return res.status(200).json({ ok: true });
    }
    if (action === "private") {
      if (!text?.trim()) return res.status(400).json({ error: "missing text" });
      // ตอบเป็นข้อความส่วนตัว (private reply) — recipient = comment_id · ได้ครั้งเดียวต่อคอมเมนต์ ภายใน 7 วัน
      const r = await fetch(`${GRAPH}/${pageId() || "me"}/messages?access_token=${page}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { comment_id }, message: { text } }),
      });
      if (!r.ok) return res.status(502).json({ error: "fb: " + (await r.text().catch(() => r.status)) });
      await patchComment(comment_id, { replied: true, status: "done", assigned_to: user.id });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "error: " + (e.message || e) });
  }
}
