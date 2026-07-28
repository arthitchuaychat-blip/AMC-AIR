// Facebook Messenger webhook — verify (GET) + receive messages (POST), store into fb_contacts/fb_messages.
// Env: FB_VERIFY_TOKEN, FB_PAGE_ACCESS_TOKEN, FB_APP_SECRET (optional, for signature check), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import crypto from "crypto";
import { GRAPH, pageToken } from "./_fb.js";

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

async function rawBody(req) {
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  // 1) webhook verification handshake
  if (req.method === "GET") {
    const q = req.query || {};
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === process.env.FB_VERIFY_TOKEN) {
      return res.status(200).send(q["hub.challenge"]);
    }
    return res.status(403).send("forbidden");
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const buf = await rawBody(req);
  // optional signature check
  if (process.env.FB_APP_SECRET) {
    const sig = req.headers["x-hub-signature-256"] || "";
    const expected = "sha256=" + crypto.createHmac("sha256", process.env.FB_APP_SECRET).update(buf).digest("hex");
    if (sig !== expected) return res.status(401).send("bad signature");
  }
  let body = {}; try { body = JSON.parse(buf.toString("utf8") || "{}"); } catch {}
  if (body.object !== "page") return res.status(200).json({ ok: true });

  const token = await pageToken();
  for (const entry of body.entry || []) {
    for (const ev of entry.messaging || []) {
      const psid = ev.sender && ev.sender.id;
      if (!psid || !ev.message || ev.message.is_echo) continue;
      const text = ev.message.text || null;
      const att = (ev.message.attachments || [])[0];
      const imageUrl = att && att.type === "image" ? att.payload?.url : null;
      const preview = text || (imageUrl ? "[รูปภาพ]" : att ? `[${att.type}]` : "[ข้อความ]");

      // ดึงชื่อ+รูปโปรไฟล์จาก Messenger User Profile API (ใช้ first_name+last_name — ฟิลด์ name ไม่คืนค่าสำหรับผู้ใช้ทั่วไป)
      const fetchProfile = async () => {
        if (!token) return { name: null, pic: null };
        try {
          const p = await fetch(`${GRAPH}/${psid}?fields=first_name,last_name,profile_pic&access_token=${token}`).then((r) => r.json());
          return { name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null, pic: p.profile_pic || null };
        } catch { return { name: null, pic: null }; }
      };
      // upsert contact (ดึงชื่อตอนติดต่อครั้งแรก · ถ้าติดต่อเก่ายังไม่มีชื่อ ให้เติมย้อนหลัง)
      const exist = await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(psid)}&select=psid,unread,display_name`, { headers: sbH() }).then((r) => r.ok ? r.json() : []).catch(() => []);
      if (!exist.length) {
        const { name, pic } = await fetchProfile();
        await fetch(`${SB()}/rest/v1/fb_contacts`, { method: "POST", headers: sbH(), body: JSON.stringify({ psid, display_name: name, picture_url: pic, last_message: preview, last_message_at: new Date().toISOString(), unread: 1 }) });
      } else {
        const cur = Number(exist[0].unread || 0) + 1;
        const patch = { last_message: preview, last_message_at: new Date().toISOString(), unread: cur };
        if (!exist[0].display_name) { const { name, pic } = await fetchProfile(); if (name) patch.display_name = name; if (pic) patch.picture_url = pic; }  // เติมชื่อให้ผู้ติดต่อเก่าที่ยังเป็น "ผู้ใช้ Facebook"
        await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(psid)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify(patch) });
      }
      await fetch(`${SB()}/rest/v1/fb_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ psid, direction: "in", type: imageUrl ? "image" : "text", text, image_url: imageUrl, fb_message_id: ev.message.mid || null }) });
    }
  }
  return res.status(200).json({ ok: true });
}
