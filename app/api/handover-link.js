// คืน "ลิงก์สาธารณะ" ของใบส่งมอบงาน (มี HMAC token) ให้ออฟฟิศคัดลอกไปส่งเอง — ไม่ push, ไม่พึ่ง LINE
//   GET /api/handover-link?id=<id>   headers: Authorization: Bearer <supabase jwt>  → { url }
// ⚠️ ห้าม require ไฟล์ api ข้ามกัน (Vercel ไม่ bundle → FUNCTION_INVOCATION_FAILED) — inline shareToken เอง
import crypto from "crypto";
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = () => process.env.HANDOVER_SHARE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
function shareToken(id) {
  return crypto.createHmac("sha256", SECRET()).update("ho:" + String(id)).digest("hex").slice(0, 24);
}

export default async function handler(req, res) {
  try {
    if (!SECRET() || !SB() || !KEY()) return res.status(503).json({ error: "server not configured" });
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "no auth" });
    // ต้องเป็นผู้ใช้ที่ล็อกอินจริง (ลิงก์นี้ให้เจ้าหน้าที่คัดลอกส่งลูกค้า)
    const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
    if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
    const id = (req.query.id || "").toString();
    if (!id) return res.status(400).json({ error: "missing id" });
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const t = shareToken(id), base = `https://${host}/?`;
    // 2 ลิงก์แยกกัน: เอกสารส่งมอบ (?ho=) และ ให้คะแนน (?rate=) — token เดียวกัน
    return res.status(200).json({ url: `${base}ho=${id}&t=${t}`, rateUrl: `${base}rate=${id}&t=${t}` });
  } catch (e) {
    return res.status(500).json({ error: "error: " + (e.message || e) });
  }
};
