// รับคะแนนความพอใจลูกค้าจากลิงก์ใบส่งมอบงาน (ไม่ต้องล็อกอิน · กันด้วย HMAC token เดียวกับ handover-view)
//   POST /api/handover-rate  body: { id, t, rating(1-5), comment? }  → { ok: true }
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (+ HANDOVER_SHARE_SECRET ถ้าตั้งแยก)
// ⚠️ ห้าม require ไฟล์ api ข้ามกัน — Vercel ไม่ bundle → FUNCTION_INVOCATION_FAILED · inline shareToken เอง
const crypto = require("crypto");
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json", Prefer: "return=minimal" });
const SECRET = () => process.env.HANDOVER_SHARE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
function shareToken(id) {
  return crypto.createHmac("sha256", SECRET()).update("ho:" + String(id)).digest("hex").slice(0, 24);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!SB() || !KEY()) return res.status(503).json({ error: "server not configured" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const id = (body?.id || "").toString();
  const token = (body?.t || "").toString();
  const rating = Math.round(Number(body?.rating) || 0);
  const comment = (body?.comment || "").toString().slice(0, 1000).trim() || null;
  if (!id || !token) return res.status(400).json({ error: "missing id/token" });
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: "rating must be 1-5" });

  // ตรวจ token แบบ constant-time (เหมือน handover-view)
  const want = shareToken(id);
  const ok = token.length === want.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(want));
  if (!ok) return res.status(403).json({ error: "invalid token" });

  try {
    const patch = { cust_rating: rating, cust_comment: comment, cust_rated_at: new Date().toISOString() };
    const r = await fetch(`${SB()}/rest/v1/job_handovers?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: sbH(), body: JSON.stringify(patch),
    });
    if (!r.ok) return res.status(500).json({ error: "save failed: " + (await r.text().catch(() => r.status)) });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "error: " + (e.message || e) });
  }
};
