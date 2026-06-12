// LINE Messaging API webhook → เก็บข้อความเข้า Supabase
// ตั้ง Environment Variables ใน Vercel: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Webhook URL ที่ต้องวางในคอนโซล LINE: https://<โดเมนแอป>/api/line-webhook
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SECRET = () => process.env.LINE_CHANNEL_SECRET || "";
const TOKEN = () => process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const sbAdmin = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// verify x-line-signature = base64(HMAC-SHA256(rawBody, channelSecret))
async function verify(raw, signature) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return b64 === signature;
}

async function lineGet(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN()}` } });
  return r.ok ? r : null;
}

async function ensureContact(sb, uid) {
  const { data } = await sb.from("line_contacts").select("line_user_id").eq("line_user_id", uid).maybeSingle();
  if (data) return;
  let prof = null;
  const r = await lineGet(`https://api.line.me/v2/bot/profile/${uid}`);
  if (r) prof = await r.json().catch(() => null);
  await sb.from("line_contacts").insert({ line_user_id: uid, display_name: prof?.displayName || "LINE User", picture_url: prof?.pictureUrl || null });
}

async function saveImage(sb, messageId) {
  const r = await lineGet(`https://api-data.line.me/v2/bot/message/${messageId}/content`);
  if (!r) return null;
  const buf = await r.arrayBuffer();
  const path = `line/${messageId}.jpg`;
  const { error } = await sb.storage.from("photos").upload(path, buf, { contentType: r.headers.get("content-type") || "image/jpeg", upsert: true });
  if (error) return null;
  return sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
}

export default async function handler(req) {
  if (req.method !== "POST") return new Response("ok"); // health check
  const raw = await req.text();
  if (!(await verify(raw, req.headers.get("x-line-signature")))) return new Response("bad signature", { status: 401 });

  let body; try { body = JSON.parse(raw); } catch { return new Response("ok"); }
  const sb = sbAdmin();
  for (const ev of body.events || []) {
    const uid = ev.source?.userId;
    if (!uid) continue;
    await ensureContact(sb, uid);
    if (ev.type === "message") {
      const m = ev.message;
      const row = { line_user_id: uid, direction: "in", type: m.type, line_message_id: m.id };
      if (m.type === "text") row.text = m.text;
      else if (m.type === "image") { row.image_url = await saveImage(sb, m.id); row.text = "[รูปภาพ]"; }
      else if (m.type === "sticker") { row.text = "[สติกเกอร์]"; }
      else { row.text = `[${m.type}]`; }
      await sb.from("line_messages").insert(row);
      await sb.rpc("line_bump_unread", { p_uid: uid, p_msg: row.text || "[ข้อความ]" });
    }
  }
  return new Response("ok");
}
