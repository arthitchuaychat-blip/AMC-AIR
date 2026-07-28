// Send a Messenger reply on behalf of the page. Office staff only (Supabase JWT). No-ops if unconfigured.
// Env: FB_PAGE_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { GRAPH, pageToken, pageId } from "./_fb.js";
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const OFFICE = ["admin", "sales", "exec", "finance", "hr"]; // hr ทำงานขายด้วย (v269)

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

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

  const page = await pageToken();
  if (!page) return res.status(200).json({ ok: false, reason: "no-config", msg: "ยังไม่ได้ตั้ง FB_PAGE_ACCESS_TOKEN ใน Vercel" });

  const { to, text, imageUrl } = await readJson(req);
  if (!to || (!text?.trim() && !imageUrl)) return res.status(400).json({ error: "missing to/text" });

  const message = imageUrl
    ? { attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } } }
    : { text };
  const r = await fetch(`${GRAPH}/${pageId() || "me"}/messages?access_token=${page}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: to }, messaging_type: "RESPONSE", message }),
  });
  if (!r.ok) return res.status(502).json({ error: "fb: " + (await r.text().catch(() => r.status)) });
  const out = await r.json().catch(() => ({}));

  await fetch(`${SB()}/rest/v1/fb_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ psid: to, direction: "out", type: imageUrl ? "image" : "text", text: imageUrl ? null : text, image_url: imageUrl || null, fb_message_id: out.message_id || null, sent_by: user.id }) });
  await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(to)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ last_message: imageUrl ? "[รูปภาพ]" : text, last_message_at: new Date().toISOString(), unread: 0 }) });
  return res.status(200).json({ ok: true });
}
