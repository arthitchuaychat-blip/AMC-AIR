// ดึงไฟล์รูป/โบรชัวร์จากลิงก์ภายนอก (เว็บผู้ผลิตแอร์ ฯลฯ) ผ่านฝั่งเซิร์ฟเวอร์ — เลี่ยง CORS ของเบราว์เซอร์
// แอปเรียกแล้วเอาไฟล์ที่ได้ไปอัปโหลดเข้า Supabase storage ของเราเอง (เก็บถาวร ไม่กลัวลิงก์ต้นทางเน่า)
// ตรวจสิทธิ์: ต้องเป็นผู้ใช้ที่ล็อกอิน + ฝ่ายออฟฟิศ (กันโดนใช้เป็น open proxy)

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const OFFICE = ["admin", "sales", "exec", "finance", "hr", "stock", "graphic"];
const MAX_BYTES = 15 * 1024 * 1024; // 15MB พอสำหรับโบรชัวร์ PDF
const OK_TYPES = /^(image\/|application\/pdf|application\/octet-stream|binary\/)/i;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "no auth" });

  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const user = await ur.json();
  const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbH() });
  const prof = (pr.ok ? await pr.json() : [])[0];
  if (!OFFICE.includes(prof?.role)) return res.status(403).json({ error: "forbidden" });

  const url = String(req.query.url || "");
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "url ต้องขึ้นต้นด้วย http(s)://" });

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(url, {
      redirect: "follow", signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AMCAIR-fetch/1.0)", Accept: "image/*,application/pdf,*/*" },
    });
    clearTimeout(timer);
    if (!r.ok) return res.status(502).json({ error: `ต้นทางตอบ ${r.status}` });
    const ct = r.headers.get("content-type") || "application/octet-stream";
    const looksFile = OK_TYPES.test(ct) || /\.(pdf|jpe?g|png|webp|gif)([?#]|$)/i.test(url);
    if (!looksFile) return res.status(415).json({ error: `ชนิดไฟล์ไม่รองรับ (${ct}) — ต้องเป็นรูปภาพหรือ PDF` });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: "ไฟล์ใหญ่เกิน 15MB" });
    if (!buf.length) return res.status(502).json({ error: "ไฟล์ว่าง" });
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: "ดึงไฟล์ไม่สำเร็จ: " + (e?.name === "AbortError" ? "หมดเวลา (25 วิ)" : e?.message || e) });
  }
}
