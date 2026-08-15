// ส่งอีเมลตอบกลับจากแอป (ในนาม info@amcair.net "AMC AIR") ผ่าน Gmail API
// สิทธิ์: เฉพาะทีมหลังบ้าน (ตรวจ JWT)
import { SB, KEY, sbH, sbGet, gmailAccessToken, gmail } from "./_gmail.js";

const OFFICE = ["admin", "exec", "finance", "hr", "sales", "field_sales", "graphic"];

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const jwt = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return res.status(401).json({ error: "no auth" });
    const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${jwt}` } });
    if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
    const user = await ur.json();
    const prof = (await sbGet(`profiles?id=eq.${user.id}&select=role`))[0];
    if (!OFFICE.includes(prof?.role)) return res.status(403).json({ error: "forbidden" });

    const { threadId, to, subject, text } = await readJson(req);
    if (!to || !text?.trim()) return res.status(400).json({ error: "missing to/text" });
    const self = process.env.GMAIL_ADDRESS;

    // หา Message-ID ของเมลเข้าล่าสุดในเธรด → ตอบให้ต่อเธรดถูกต้อง
    let inReplyTo = null;
    if (threadId) {
      const rows = await sbGet(`email_messages?thread_id=eq.${encodeURIComponent(threadId)}&direction=eq.in&message_id_header=not.is.null&select=message_id_header,created_at&order=created_at.desc&limit=1`);
      inReplyTo = rows[0]?.message_id_header || null;
    }
    const subj = subject || "ตอบกลับจาก AMC AIR";
    const raw = b64url([
      `From: AMC AIR <${self}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subj, "utf8").toString("base64")}?=`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
      inReplyTo ? `References: ${inReplyTo}` : null,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(text, "utf8").toString("base64"),
    ].filter((x) => x !== null).join("\r\n"));

    const token = await gmailAccessToken();
    const sent = await gmail("messages/send", token, { method: "POST", body: JSON.stringify(threadId ? { raw, threadId } : { raw }) });

    // บันทึกลงฐานข้อมูล + อัปเดตเธรด (ให้โผล่ทันทีไม่ต้องรอ sync)
    const nowIso = new Date().toISOString();
    const tid = sent.threadId || threadId;
    if (tid) {
      await fetch(`${SB()}/rest/v1/email_messages`, { method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ id: sent.id, thread_id: tid, direction: "out", from_email: self, from_name: "AMC AIR", to_email: to, subject: subj, snippet: text.slice(0, 140), body_text: text, sent_by: user.id, created_at: nowIso }) });
      await fetch(`${SB()}/rest/v1/email_threads?thread_id=eq.${encodeURIComponent(tid)}`, { method: "PATCH", headers: sbH(),
        body: JSON.stringify({ snippet: text.slice(0, 140), last_message_at: nowIso, unread: false, last_read_at: nowIso, updated_at: nowIso }) });
    }
    return res.status(200).json({ ok: true, id: sent.id, threadId: tid });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
