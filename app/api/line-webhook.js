// LINE Messaging API webhook → เก็บข้อความเข้า Supabase (เรียก REST ตรง ไม่พึ่ง supabase-js เพื่อให้รันบน Edge ได้แน่นอน)
// Vercel env vars: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Webhook URL ที่วางในคอนโซล LINE: https://<โดเมนแอป>/api/line-webhook
// ดีบัก: ?check=1 (เช็ก env) · ?dbcheck=1 (เช็กตาราง) · ?selftest=1 (ทดสอบเขียน DB ทีละสเต็ป)

export const config = { runtime: "edge" };

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = () => process.env.LINE_CHANNEL_SECRET || "";
const TOKEN = () => process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const sbHeaders = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

// fetch with a hard timeout so a slow/hung upstream can never stall the whole function
async function tfetch(url, opts = {}, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// verify x-line-signature = base64(HMAC-SHA256(rawBody, channelSecret))
async function verify(raw, signature) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return b64 === signature;
}

async function lineProfile(uid) {
  try {
    const r = await tfetch(`https://api.line.me/v2/bot/profile/${uid}`, { headers: { Authorization: `Bearer ${TOKEN()}` } }, 4000);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function ensureContact(uid) {
  const r = await tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(uid)}&select=line_user_id`, { headers: sbHeaders() });
  const arr = r.ok ? await r.json() : [];
  if (Array.isArray(arr) && arr.length) return;
  const prof = await lineProfile(uid); // best-effort; won't block (has its own timeout + catch)
  await tfetch(`${SB()}/rest/v1/line_contacts`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ line_user_id: uid, display_name: prof?.displayName || "LINE User", picture_url: prof?.pictureUrl || null }),
  });
}

async function saveImage(messageId) {
  try {
    const r = await tfetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, { headers: { Authorization: `Bearer ${TOKEN()}` } }, 8000);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const up = await tfetch(`${SB()}/storage/v1/object/photos/line/${messageId}.jpg`, {
      method: "POST",
      headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": r.headers.get("content-type") || "image/jpeg", "x-upsert": "true" },
      body: buf,
    }, 8000);
    return up.ok ? `${SB()}/storage/v1/object/public/photos/line/${messageId}.jpg` : null;
  } catch { return null; }
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
    if (u.searchParams.get("dbcheck") === "1") {
      const out = {};
      for (const t of ["line_contacts", "line_messages"]) {
        try {
          const r = await tfetch(`${SB()}/rest/v1/${t}?select=*&limit=1`, { headers: sbHeaders() });
          out[t] = { status: r.status, body: (await r.text()).slice(0, 180) };
        } catch (e) { out[t] = { error: e?.message || String(e) }; }
      }
      return json(out);
    }
    if (u.searchParams.get("selftest") === "1") {
      const uid = "Uselftest_delete_me";
      const steps = [];
      const rec = async (name, p) => { const t0 = Date.now(); try { const r = await p; steps.push({ name, status: r.status, ms: Date.now() - t0, body: (await r.text()).slice(0, 120) }); } catch (e) { steps.push({ name, error: e?.message || String(e), ms: Date.now() - t0 }); } };
      await rec("insert_contact", tfetch(`${SB()}/rest/v1/line_contacts`, { method: "POST", headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ line_user_id: uid, display_name: "SELFTEST" }) }));
      await rec("insert_message", tfetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ line_user_id: uid, direction: "in", type: "text", text: "selftest" }) }));
      await rec("rpc_bump", tfetch(`${SB()}/rest/v1/rpc/line_bump_unread`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_uid: uid, p_msg: "selftest" }) }));
      await rec("line_profile_reach", lineProfile("Udummy").then(() => ({ status: "reachable", text: async () => "" })).catch(() => ({ status: "blocked", text: async () => "" })));
      await rec("delete_contact", tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${uid}`, { method: "DELETE", headers: sbHeaders() }));
      return json({ steps });
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
        await tfetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbHeaders(), body: JSON.stringify(row) });
        await tfetch(`${SB()}/rest/v1/rpc/line_bump_unread`, { method: "POST", headers: sbHeaders(), body: JSON.stringify({ p_uid: uid, p_msg: row.text || "[ข้อความ]" }) });
      }
    }
  } catch (e) {
    console.error("line-webhook error:", e?.message || String(e));
  }
  return new Response("ok");
}
