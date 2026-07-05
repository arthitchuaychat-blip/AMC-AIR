// The Top Mentor — LINE webhook ของ OA Chapter (แยกจาก OA บริษัท): ผูกบัญชีไลน์สมาชิกด้วยการพิมพ์ชื่อเล่น
// Vercel env vars: MENTOR_LINE_ACCESS_TOKEN, MENTOR_LINE_CHANNEL_SECRET (+ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ที่มีอยู่แล้ว)
// Webhook URL (ตั้งใน LINE Developers): https://amc-air.vercel.app/api/mentor-line
// ดีบัก: GET = health check (แอปหน้า ตั้งค่า เรียกดูสถานะ env)
import crypto from "crypto";

export const config = { api: { bodyParser: false } }; // ต้องการ raw body เพื่อเช็กลายเซ็น

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = () => process.env.MENTOR_LINE_CHANNEL_SECRET || "";
const TOKEN = () => process.env.MENTOR_LINE_ACCESS_TOKEN || "";
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

async function reply(replyToken, text) {
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
    });
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "GET") {
    // health check จากหน้า ตั้งค่า ของแอป — บอกแค่ว่า env ถูกตั้งหรือยัง (ไม่เผยค่า)
    return res.status(200).json({ ok: true, env: { token: !!TOKEN(), secret: !!SECRET() } });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const body = await rawBody(req);
  const sig = crypto.createHmac("sha256", SECRET()).update(body).digest("base64");
  if (sig !== (req.headers["x-line-signature"] || "")) return res.status(401).json({ error: "bad signature" });

  let events = [];
  try { events = JSON.parse(body.toString("utf8") || "{}").events || []; } catch {}

  for (const ev of events) {
    const uid = ev.source && ev.source.userId;
    if (!uid) continue;

    if (ev.type === "follow") {
      await reply(ev.replyToken,
        "สวัสดีครับ 🙏 นี่คือระบบติดตาม Mentoring & Happiness Survey ของ Chapter The Top\n\nกรุณาพิมพ์ \"ชื่อเล่น\" ของคุณตามที่ลงทะเบียนกับ Chapter เพื่อเชื่อมบัญชี\nเช่น: พัด");
      continue;
    }
    if (ev.type !== "message" || !ev.message || ev.message.type !== "text") continue;

    const text = (ev.message.text || "").trim();
    if (!text) continue;

    const r = await fetch(`${SB()}/rest/v1/tm_members?select=id,data`, { headers: sbH() });
    const rows = r.ok ? await r.json() : [];
    const q = text.toLowerCase();
    const matches = rows.filter((x) => {
      const d = x.data || {};
      return (d.nick || "").trim().toLowerCase() === q || (d.name || "").trim().toLowerCase() === q;
    });

    if (matches.length === 1) {
      const m = matches[0];
      const data = { ...m.data, lineUserId: uid, lineLinkedAt: new Date().toISOString() };
      await fetch(`${SB()}/rest/v1/tm_members?id=eq.${encodeURIComponent(m.id)}`, {
        method: "PATCH", headers: sbH(), body: JSON.stringify({ data }),
      });
      await reply(ev.replyToken,
        `เชื่อมบัญชีสำเร็จ ✅\nคุณ${data.nick || data.name} (${data.name})\n\nเมื่อถึงกำหนดทำแบบสอบถาม Happiness Survey ระบบจะส่งลิงก์มาให้ทางแชทนี้อัตโนมัติครับ`);
    } else if (matches.length > 1) {
      await reply(ev.replyToken,
        `มีสมาชิกชื่อ "${text}" มากกว่า 1 คน 🙏\nกรุณาพิมพ์ชื่อเต็มภาษาอังกฤษตามทะเบียน Chapter แทน\nเช่น: Pipat Wattanamongkolsiri`);
    } else {
      const already = rows.find((x) => (x.data || {}).lineUserId === uid);
      if (already) {
        await reply(ev.replyToken,
          `บัญชีไลน์นี้เชื่อมกับคุณ${already.data.nick || already.data.name} เรียบร้อยแล้ว ✅\nเมื่อถึงกำหนดแบบสอบถาม ระบบจะส่งให้อัตโนมัติครับ`);
      } else {
        await reply(ev.replyToken,
          `ไม่พบสมาชิกชื่อ "${text}" 🙏\nกรุณาพิมพ์เฉพาะชื่อเล่น หรือชื่อเต็มภาษาอังกฤษตามทะเบียน Chapter\nหรือติดต่อผู้ดูแลระบบครับ`);
      }
    }
  }
  return res.status(200).json({ ok: true });
}
