// Facebook Messenger webhook — verify (GET) + receive messages (POST), store into fb_contacts/fb_messages.
// Env: FB_VERIFY_TOKEN, FB_PAGE_ACCESS_TOKEN, FB_APP_SECRET (optional, for signature check), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import crypto from "crypto";

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const GRAPH = "https://graph.facebook.com/v19.0";

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

  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  for (const entry of body.entry || []) {
    for (const ev of entry.messaging || []) {
      const psid = ev.sender && ev.sender.id;
      if (!psid || !ev.message || ev.message.is_echo) continue;
      const text = ev.message.text || null;
      const att = (ev.message.attachments || [])[0];
      const imageUrl = att && att.type === "image" ? att.payload?.url : null;
      const preview = text || (imageUrl ? "[รูปภาพ]" : att ? `[${att.type}]` : "[ข้อความ]");

      // upsert contact (fetch profile name on first contact)
      const exist = await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(psid)}&select=psid,unread`, { headers: sbH() }).then((r) => r.ok ? r.json() : []).catch(() => []);
      if (!exist.length) {
        let name = null, pic = null;
        if (token) { try { const p = await fetch(`${GRAPH}/${psid}?fields=name,profile_pic&access_token=${token}`).then((r) => r.json()); name = p.name || null; pic = p.profile_pic || null; } catch {} }
        await fetch(`${SB()}/rest/v1/fb_contacts`, { method: "POST", headers: sbH(), body: JSON.stringify({ psid, display_name: name, picture_url: pic, last_message: preview, last_message_at: new Date().toISOString(), unread: 1 }) });
      } else {
        const cur = Number(exist[0].unread || 0) + 1;
        await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(psid)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ last_message: preview, last_message_at: new Date().toISOString(), unread: cur }) });
      }
      await fetch(`${SB()}/rest/v1/fb_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ psid, direction: "in", type: imageUrl ? "image" : "text", text, image_url: imageUrl, fb_message_id: ev.message.mid || null }) });
    }
  }
  return res.status(200).json({ ok: true });
}
