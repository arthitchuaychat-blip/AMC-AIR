// คืนลิงก์ให้คะแนนของใบงาน (?rate=<job_no>&t=<token>) ให้ออฟฟิศคัดลอก/ส่งในแชต — ESM เท่านั้น
//   GET /api/rate-link?job=<job_no>   headers: Authorization: Bearer <supabase jwt>  → { rateUrl }
import crypto from "crypto";
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = () => process.env.HANDOVER_SHARE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const jobToken = (jobNo) => crypto.createHmac("sha256", SECRET()).update("job:" + String(jobNo)).digest("hex").slice(0, 24);

export default async function handler(req, res) {
  try {
    if (!SECRET() || !SB() || !KEY()) return res.status(503).json({ error: "server not configured" });
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "no auth" });
    const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
    if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
    const job = (req.query.job || "").toString();
    if (!job) return res.status(400).json({ error: "missing job" });
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return res.status(200).json({ rateUrl: `https://${host}/?rate=${encodeURIComponent(job)}&t=${jobToken(job)}` });
  } catch (e) {
    return res.status(500).json({ error: "error: " + (e.message || e) });
  }
}
