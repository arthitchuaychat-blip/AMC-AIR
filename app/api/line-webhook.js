// LINE Messaging API webhook (Node.js runtime — ต่อ api.line.me ได้เสถียรกว่า Edge + ใช้ supabase REST)
// Vercel env vars: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Webhook URL: https://<โดเมนแอป>/api/line-webhook
// ดีบัก: ?check=1 · ?dbcheck=1 · ?selftest=1 · ?linetest=1 (เช็กว่าต่อ api.line.me ได้ไหม)
import crypto from "crypto";

export const config = { api: { bodyParser: false } }; // ต้องการ raw body เพื่อเช็กลายเซ็น

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = () => process.env.LINE_CHANNEL_SECRET || "";
const TOKEN = () => process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

async function tfetch(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function lineProfile(uid) {
  try {
    const r = await tfetch(`https://api.line.me/v2/bot/profile/${uid}`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// create the contact if new; if it already exists but still has the default name, refresh it from the profile
async function ensureContact(uid) {
  const r = await tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(uid)}&select=display_name`, { headers: sbH() });
  const arr = r.ok ? await r.json() : [];
  const exists = Array.isArray(arr) && arr.length;
  const prof = await lineProfile(uid);
  if (exists) {
    if (prof && (!arr[0].display_name || arr[0].display_name === "LINE User")) {
      await tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(uid)}`, {
        method: "PATCH", headers: sbH(),
        body: JSON.stringify({ display_name: prof.displayName, picture_url: prof.pictureUrl || null }),
      });
    }
    return;
  }
  await tfetch(`${SB()}/rest/v1/line_contacts`, {
    method: "POST", headers: { ...sbH(), Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ line_user_id: uid, display_name: prof?.displayName || "LINE User", picture_url: prof?.pictureUrl || null }),
  });
}

async function saveImage(messageId) {
  try {
    const r = await tfetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, { headers: { Authorization: `Bearer ${TOKEN()}` } }, 10000);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const up = await tfetch(`${SB()}/storage/v1/object/photos/line/${messageId}.jpg`, {
      method: "POST",
      headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": r.headers.get("content-type") || "image/jpeg", "x-upsert": "true" },
      body: buf,
    }, 10000);
    return up.ok ? `${SB()}/storage/v1/object/public/photos/line/${messageId}.jpg` : null;
  } catch { return null; }
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const params = new URLSearchParams((req.url.split("?")[1] || ""));

  if (req.method !== "POST") {
    if (params.get("check") === "1") {
      return res.status(200).json({
        LINE_CHANNEL_SECRET: !!process.env.LINE_CHANNEL_SECRET,
        LINE_CHANNEL_ACCESS_TOKEN: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
    }
    if (params.get("dbcheck") === "1") {
      const out = {};
      for (const t of ["line_contacts", "line_messages"]) {
        try { const r = await tfetch(`${SB()}/rest/v1/${t}?select=*&limit=1`, { headers: sbH() }); out[t] = { status: r.status, body: (await r.text()).slice(0, 180) }; }
        catch (e) { out[t] = { error: e?.message || String(e) }; }
      }
      return res.status(200).json(out);
    }
    if (params.get("linetest") === "1") {
      const t0 = Date.now();
      try { const r = await tfetch(`https://api.line.me/v2/bot/profile/Udummy`, { headers: { Authorization: `Bearer ${TOKEN()}` } }); return res.status(200).json({ reached: true, status: r.status, ms: Date.now() - t0, body: (await r.text()).slice(0, 160) }); }
      catch (e) { return res.status(200).json({ reached: false, ms: Date.now() - t0, error: e?.message || String(e) }); }
    }
    if (params.get("selftest") === "1") {
      const uid = "Uselftest_delete_me"; const steps = [];
      const rec = async (name, p) => { const t0 = Date.now(); try { const r = await p; steps.push({ name, status: r.status, ms: Date.now() - t0 }); } catch (e) { steps.push({ name, error: e?.message || String(e), ms: Date.now() - t0 }); } };
      await rec("insert_contact", tfetch(`${SB()}/rest/v1/line_contacts`, { method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ line_user_id: uid, display_name: "SELFTEST" }) }));
      await rec("insert_message", tfetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ line_user_id: uid, direction: "in", type: "text", text: "selftest" }) }));
      await rec("delete_contact", tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${uid}`, { method: "DELETE", headers: sbH() }));
      return res.status(200).json({ steps });
    }
    return res.status(200).send("ok");
  }

  const raw = await readRaw(req);
  const sig = crypto.createHmac("sha256", SECRET()).update(raw).digest("base64");
  if (sig !== req.headers["x-line-signature"]) return res.status(401).send("bad signature");

  let body; try { body = JSON.parse(raw.toString("utf8")); } catch { return res.status(200).send("ok"); }
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
        await tfetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbH(), body: JSON.stringify(row) });
        await tfetch(`${SB()}/rest/v1/rpc/line_bump_unread`, { method: "POST", headers: sbH(), body: JSON.stringify({ p_uid: uid, p_msg: row.text || "[ข้อความ]" }) });
      }
    }
  } catch (e) {
    console.error("line-webhook error:", e?.message || String(e));
  }
  return res.status(200).send("ok");
}
