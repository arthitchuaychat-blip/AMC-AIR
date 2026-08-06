// หน้าให้คะแนนความพอใจผูกกับ "ใบงาน" (ไม่ต้องมีใบส่งมอบ) — ลูกค้าไม่ต้องล็อกอิน · กันด้วย HMAC token
//   GET  /api/rate?job=<job_no>&t=<token>            → { company, job }
//   POST /api/rate  body { job, t, rating(1-5), comment? } → { ok }
// ⚠️ ต้องเป็น ESM (app/package.json "type":"module") — ห้าม require/module.exports
import crypto from "crypto";
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = (extra) => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, ...extra });
const SECRET = () => process.env.HANDOVER_SHARE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// token ต่อใบงาน = HMAC "job:<job_no>"
export function jobToken(jobNo) {
  return crypto.createHmac("sha256", SECRET()).update("job:" + String(jobNo)).digest("hex").slice(0, 24);
}
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
const okToken = (jobNo, token) => {
  const want = jobToken(jobNo);
  return token.length === want.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(want));
};

export default async function handler(req, res) {
  try {
    if (!SECRET() || !SB() || !KEY()) return res.status(503).json({ error: "server not configured" });

    if (req.method === "GET") {
      const job = (req.query.job || "").toString();
      const token = (req.query.t || "").toString();
      if (!job || !token) return res.status(400).json({ error: "missing job/token" });
      if (!okToken(job, token)) return res.status(403).json({ error: "invalid token" });
      const [jr, cr] = await Promise.all([
        fetch(`${SB()}/rest/v1/job_orders?job_no=eq.${encodeURIComponent(job)}&select=job_no,customer_name:customers(name),cust_rating,cust_comment&limit=1`, { headers: sbH() }).catch(() => null),
        fetch(`${SB()}/rest/v1/company_profile?id=in.(1,2)&select=*`, { headers: sbH() }).catch(() => null),
      ]);
      let j = (jr && jr.ok ? await jr.json() : [])[0];
      // fallback ถ้า embed customers ไม่ได้ → ดึงชื่อจากใบงานตรง ๆ (ไม่มีก็ปล่อยว่าง)
      if (!j) { const j2 = await fetch(`${SB()}/rest/v1/job_orders?job_no=eq.${encodeURIComponent(job)}&select=job_no,cust_rating,cust_comment&limit=1`, { headers: sbH() }); j = (j2.ok ? await j2.json() : [])[0]; }
      if (!j) return res.status(404).json({ error: "not found" });
      const rows = (cr && cr.ok ? await cr.json() : []) || [];
      const m = {}; rows.forEach((r) => { m[r.id === 2 ? "novat" : "vat"] = r; });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ company: { vat: m.vat || {}, novat: m.novat || {} },
        job: { job_no: j.job_no, customer_name: j.customer_name?.name || j.customer_name || "", cust_rating: j.cust_rating || 0, cust_comment: j.cust_comment || "" } });
    }

    if (req.method === "POST") {
      const b = await readJson(req);
      const job = (b?.job || "").toString();
      const token = (b?.t || "").toString();
      const rating = Math.round(Number(b?.rating) || 0);
      const comment = (b?.comment || "").toString().slice(0, 1000).trim() || null;
      if (!job || !token) return res.status(400).json({ error: "missing job/token" });
      if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: "rating must be 1-5" });
      if (!okToken(job, token)) return res.status(403).json({ error: "invalid token" });
      const r = await fetch(`${SB()}/rest/v1/job_orders?job_no=eq.${encodeURIComponent(job)}`, {
        method: "PATCH", headers: sbH({ "Content-Type": "application/json", Prefer: "return=minimal" }),
        body: JSON.stringify({ cust_rating: rating, cust_comment: comment, cust_rated_at: new Date().toISOString() }),
      });
      if (!r.ok) return res.status(500).json({ error: "save failed: " + (await r.text().catch(() => r.status)) });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "error: " + (e.message || e) });
  }
}
