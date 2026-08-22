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

  const { to, text, imageUrl, fileUrl, fileName, replyToMid } = await readJson(req);
  if (!to || (!text?.trim() && !imageUrl && !fileUrl)) return res.status(400).json({ error: "missing to/text" });

  const endpoint = `${GRAPH}/${pageId() || "me"}/messages?access_token=${page}`;
  const attUrl = imageUrl || fileUrl || null;
  let r;
  if (attUrl) {
    // ส่งไฟล์แนบแบบ "อัปโหลดตรง" (multipart) — เซิร์ฟเวอร์ดึงไฟล์เองแล้วส่ง bytes เข้า FB
    // เดิมส่ง payload.url ให้ FB ไปดึงเอง → FB โหลด URL เราไม่ได้บ่อย ๆ = #100 "อัพโหลดไม่สำเร็จ" (subcode 2018007)
    let buf, ct;
    try {
      const f = await fetch(attUrl);
      if (!f.ok) return res.status(502).json({ error: `โหลดไฟล์แนบไม่ได้ (HTTP ${f.status})` });
      ct = (f.headers.get("content-type") || "").split(";")[0].trim();
      buf = Buffer.from(await f.arrayBuffer());
      if (!buf.length) return res.status(502).json({ error: "ไฟล์แนบว่างเปล่า" });
    } catch (e) { return res.status(502).json({ error: "ดึงไฟล์แนบไม่สำเร็จ: " + (e.message || e) }); }
    const isImage = imageUrl ? (!ct || /^image\//.test(ct)) : /^image\//.test(ct || "");
    if (!ct) ct = isImage ? "image/jpeg" : "application/octet-stream";
    const fname = fileName || decodeURIComponent(String(attUrl).split("/").pop().split("?")[0] || "") || (isImage ? "image.jpg" : "file.bin");
    const fd = new FormData();
    fd.append("recipient", JSON.stringify({ id: to }));
    fd.append("messaging_type", "RESPONSE");
    fd.append("message", JSON.stringify({ attachment: { type: isImage ? "image" : "file", payload: { is_reusable: true } } }));
    fd.append("filedata", new Blob([buf], { type: ct }), fname);
    r = await fetch(endpoint, { method: "POST", body: fd });   // อย่าตั้ง Content-Type เอง — ให้ multipart boundary อัตโนมัติ
  } else {
    // ตอบกลับอ้างข้อความ (FB reply) — ได้ผลเฉพาะในกรอบ 24 ชม. · นอกกรอบ API จะปฏิเสธ reply แต่ข้อความปกติยังส่งได้
    const replyField = replyToMid ? { reply_to: { mid: String(replyToMid) } } : {};
    r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: to }, messaging_type: "RESPONSE", message: { text }, ...replyField }) });
    if (!r.ok && replyToMid) {   // reply ถูกปฏิเสธ (นอกกรอบ 24 ชม.) → ส่งแบบไม่อ้างอิงแทน
      r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: to }, messaging_type: "RESPONSE", message: { text } }) });
    }
  }
  if (!r.ok) return res.status(502).json({ error: "fb: " + (await r.text().catch(() => r.status)) });
  const out = await r.json().catch(() => ({}));

  const kind = imageUrl ? "image" : fileUrl ? "file" : "text";
  await fetch(`${SB()}/rest/v1/fb_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ psid: to, direction: "out", type: kind, text: (imageUrl || fileUrl) ? null : text, image_url: imageUrl || null, file_url: fileUrl || null, file_name: fileUrl ? (fileName || null) : null, fb_message_id: out.message_id || null, quoted_message_id: replyToMid || null, sent_by: user.id }) });
  await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(to)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ last_message: imageUrl ? "[รูปภาพ]" : fileUrl ? "[ไฟล์]" : text, last_message_at: new Date().toISOString(), unread: 0 }) });
  return res.status(200).json({ ok: true });
}
