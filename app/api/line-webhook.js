// LINE Messaging API webhook → เก็บข้อความเข้า Supabase (เรียก REST ตรง ไม่พึ่ง supabase-js เพื่อให้รันบน Edge ได้แน่นอน)
// Vercel env vars: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Webhook URL ที่วางในคอนโซล LINE: https://<โดเมนแอป>/api/line-webhook
// ตรวจ env ได้ที่: /api/line-webhook?check=1

export const config = { runtime: "edge" };

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = () => process.env.LINE_CHANNEL_SECRET || "";
const TOKEN = () => process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const sbHeaders = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

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

async function ensureContact(uid) {
  const r = await fetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(uid)}&select=line_user_id`, { headers: sbHeaders() });
  const arr = r.ok ? await r.json() : [];
  if (Array.isArray(arr) && arr.length) return;
  let prof = null;
  const pr = await lineGet(`https://api.line.me/v2/bot/profile/${uid}`);
  if (pr) prof = await pr.json().catch(() => null);
  await fetch(`${SB()}/rest/v1/line_contacts`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ line_user_id: uid, display_name: prof?.displayName || "LINE User", picture_url: prof?.pictureUrl || null }),
  });
}

async function saveImage(messageId) {
  const r = await lineGet(`https://api-data.line.me/v2/bot/message/${messageId}/content`);
  if (!r) return null;
  const buf = await r.arrayBuffer();
  const up = await fetch(`${SB()}/storage/v1/object/photos/line/${messageId}.jpg`, {
    method: "POST",
    headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": r.headers.get("content-type") || "image/jpeg", "x-upsert": "true" },
    body: buf,
  });
  if (!up.ok) return null;
  return `${SB()}/storage/v1/object/public/photos/line/${messageId}.jpg`;
}

export default async function handler(req) {
  const u = new URL(req.url);
  if (req.method !== "POST") {
    if (u.searchParams.get("check") === "1") {
      return json({
        LINE_CHANNEL_SECRET: !!process.env.LINE_CHANNEL_SECRET,
        LINE_CHANNEL_ACCESS_TOKEN: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
    }
    return new Response("ok");
  }
  const raw = await req.text();
  if (!(await verify(raw, req.headers.get("x-line-signature")))) return new Response("bad signature", { status: 401 });
  let body; try { body = JSON.parse(raw); } catch { return new Response("ok"); }
  try {
    for (const ev of body.events || []) {
      const uid = ev.source?.userId;
      if (!uid) continue;
      await ensureContact(uid);
      if (ev.type === "message") {
        const m = ev.message;
        const row = { line_user_id: uid, direction: "in", type: m.type, line_message_id: m.id };
        if (m.type === "text") row.text = m.text;
        else if (m.type === "image") { row.image_url = await saveImage(m.id); row.text = "[รูปภาพ]"; }
        else if (m.type === "sticker") { row.text = "[สติกเกอร์]"; }
        else { row.text = `[${m.type}]`; }
        await fetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbHeaders(), body: JSON.stringify(row) });
        await fetch(`${SB()}/rest/v1/rpc/line_bump_unread`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_uid: uid, p_msg: row.text || "[ข้อความ]" }) });
      }
    }
  } catch (e) {
    console.error("line-webhook error:", e?.message || String(e)); // ดูได้ใน Vercel → Logs · ยังคืน 200 เพื่อไม่ให้ LINE ปิด webhook
  }
  return new Response("ok");
}
