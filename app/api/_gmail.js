// ตัวช่วยเชื่อม Gmail API (ใช้ร่วมกันโดย email-sync / email-send)
// อ่าน refresh token จาก secure_config → แลกเป็น access token → เรียก Gmail REST ด้วย fetch ล้วน
export const SB = () => process.env.SUPABASE_URL;
export const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
export const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

export async function sbGet(path) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: sbH() });
  if (!r.ok) throw new Error(`supabase ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

// access token จาก refresh token ที่เก็บไว้ตอนเชื่อมบัญชี (gmail-callback)
export async function gmailAccessToken() {
  const rows = await sbGet("secure_config?key=eq.gmail_refresh_token&select=value");
  const rt = rows[0]?.value;
  if (!rt) throw new Error("ยังไม่ได้เชื่อม Gmail — เปิด /api/gmail-connect ก่อน");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GMAIL_OAUTH_CLIENT_ID, client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET, refresh_token: rt, grant_type: "refresh_token" }),
  });
  const t = await r.json();
  if (!t.access_token) throw new Error("refresh token ใช้ไม่ได้ (อาจถูกถอนสิทธิ์) — เชื่อมใหม่ที่ /api/gmail-connect");
  return t.access_token;
}

export async function gmail(path, token, opts = {}) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...opts, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`gmail ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

// ── ตัวช่วยแกะข้อมูลจากข้อความ Gmail ──
const b64urlDecode = (s) => {
  try { return Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); } catch { return ""; }
};
const stripHtml = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();

// เก็บ HTML ดิบ (ไว้แสดงสวยเหมือน Gmail)
function extractHtml(payload) {
  let html = "";
  const walk = (p) => { if (!p) return; if ((p.mimeType || "") === "text/html" && p.body?.data) html += b64urlDecode(p.body.data); (p.parts || []).forEach(walk); };
  walk(payload);
  return html.slice(0, 400000);
}

// เดินหา part text/plain (ถ้าไม่มีใช้ text/html แล้วถอด tag)
function extractBody(payload) {
  let text = "", html = "";
  const walk = (p) => {
    if (!p) return;
    const mime = p.mimeType || "";
    if (mime === "text/plain" && p.body?.data) text += b64urlDecode(p.body.data);
    else if (mime === "text/html" && p.body?.data) html += b64urlDecode(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return (text.trim() || stripHtml(html)).slice(0, 20000);
}

// เมลตีกลับ (DSN): ดึง "ผู้รับที่ส่งไม่สำเร็จ + รหัส/สาเหตุ" จากส่วน message/delivery-status
function bounceInfo(payload) {
  let dsn = "";
  const walk = (p) => { if (!p) return; if ((p.mimeType || "") === "message/delivery-status" && p.body?.data) dsn += b64urlDecode(p.body.data); (p.parts || []).forEach(walk); };
  walk(payload);
  if (!dsn.trim()) return null;
  const rcpt = dsn.match(/Final-Recipient:\s*[^;]*;\s*([^\s\n]+)/i);
  const diag = dsn.match(/Diagnostic-Code:\s*([^\n]*(?:\n[ \t]+[^\n]*)*)/i);
  const stat = dsn.match(/Status:\s*([0-9.]+)/i);
  const reason = diag ? diag[1].replace(/\s+/g, " ").trim() : (stat ? `สถานะ ${stat[1]}` : "");
  if (!rcpt && !reason) return null;
  return { rcpt: rcpt ? rcpt[1] : "", reason };
}
const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const parseAddr = (raw) => {
  const s = String(raw || "");
  const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/) || s.match(/^\s*([^<>\s]+@[^<>\s]+)\s*$/);
  if (m && m[2]) return { name: (m[1] || "").trim(), email: m[2].trim().toLowerCase() };
  if (m && m[1]) return { name: "", email: m[1].trim().toLowerCase() };
  return { name: "", email: s.trim().toLowerCase() };
};

// อัปโหลดไฟล์เข้า Supabase Storage (bucket photos, public) → คืน public URL
export async function uploadToStorage(path, buffer, mime) {
  const r = await fetch(`${SB()}/storage/v1/object/photos/${path}`, {
    method: "POST", headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": mime || "application/octet-stream", "x-upsert": "true" }, body: buffer,
  });
  if (!r.ok) throw new Error(`storage ${r.status} ${await r.text()}`);
  return `${SB()}/storage/v1/object/public/photos/${path}`;
}

// เก็บ metadata ไฟล์แนบจาก payload (ยังไม่โหลดตัวไฟล์)
export function collectAttachments(payload) {
  const out = [];
  const walk = (p) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) out.push({ filename: p.filename, mimeType: p.mimeType || "application/octet-stream", size: p.body.size || 0, attachmentId: p.body.attachmentId });
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return out;
}

export function parseMessage(msg, selfEmail) {
  const headers = {};
  (msg.payload?.headers || []).forEach((h) => { headers[h.name.toLowerCase()] = h.value; });
  const from = parseAddr(headers["from"]);
  const to = parseAddr(headers["to"]);
  const self = String(selfEmail || "").toLowerCase();
  const direction = from.email === self ? "out" : "in";
  const dateMs = Number(msg.internalDate) || Date.parse(headers["date"] || "") || null;
  let body_text = extractBody(msg.payload);
  let body_html = extractHtml(msg.payload) || null;
  // เมลตีกลับ → แปะสาเหตุไว้บนสุดทั้งข้อความและ HTML (ให้เห็นแน่นอนไม่ว่าจะแสดงแบบไหน)
  const bn = bounceInfo(msg.payload);
  if (bn) {
    const lines = [bn.rcpt ? `ผู้รับที่ส่งไม่สำเร็จ: ${bn.rcpt}` : null, bn.reason ? `สาเหตุ: ${bn.reason}` : null].filter(Boolean);
    body_text = `⚠️ ส่งไม่สำเร็จ (ตีกลับ)\n${lines.join("\n")}\n\n─────────────\n${body_text}`;
    const banner = `<div style="background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;padding:10px 14px;border-radius:8px;margin:0 0 12px;font-family:sans-serif;font-size:14px;line-height:1.6"><b>⚠️ ส่งไม่สำเร็จ (ตีกลับ)</b><br>${lines.map(esc).join("<br>")}</div>`;
    body_html = banner + (body_html || "");
  }
  return {
    id: msg.id,
    thread_id: msg.threadId,
    direction,
    from_email: from.email,
    from_name: from.name,
    to_email: to.email,
    subject: headers["subject"] || "(ไม่มีหัวข้อ)",
    snippet: msg.snippet || "",
    body_text,
    body_html,
    spam: (msg.labelIds || []).includes("SPAM"),
    attachments: collectAttachments(msg.payload),
    message_id_header: headers["message-id"] || null,
    created_at: dateMs ? new Date(dateMs).toISOString() : null,
    // คู่สนทนาภายนอก (ลูกค้า) = ฝั่งที่ไม่ใช่ตัวเรา
    party_email: direction === "in" ? from.email : to.email,
    party_name: direction === "in" ? from.name : to.name,
  };
}
