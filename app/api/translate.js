// แปลภาษาสำหรับแชตทีม (ไทย ↔ พม่า ↔ อังกฤษ) — ตรวจภาษาต้นทางอัตโนมัติ
// · ตั้ง GOOGLE_TRANSLATE_API_KEY ใน Vercel = ใช้ Google Cloud Translation ทางการ (เสถียร/มีค่าใช้จ่ายเล็กน้อย)
// · ไม่ตั้ง = ใช้ endpoint ฟรีของ Google (gtx) — พอสำหรับใช้ภายในทีม ถ้าโดนจำกัดค่อยตั้ง key
const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  // เฉพาะผู้ใช้ที่ล็อกอินในระบบ (กันคนนอกยืมใช้)
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "no auth" });
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });

  const { text, target } = req.body || {};
  const t = String(text || "").slice(0, 2000);
  const tgt = ["th", "my", "en"].includes(target) ? target : "th";
  if (!t.trim()) return res.status(400).json({ error: "no text" });

  try {
    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (key) {
      const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: t, target: tgt, format: "text" }),
      });
      const j = await r.json();
      const out = j?.data?.translations?.[0];
      if (!out) throw new Error(j?.error?.message || "แปลไม่สำเร็จ");
      return res.status(200).json({ text: out.translatedText, from: out.detectedSourceLanguage || "" });
    }
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tgt}&dt=t&q=${encodeURIComponent(t)}`);
    if (!r.ok) throw new Error("แปลไม่สำเร็จ (HTTP " + r.status + ")");
    const j = await r.json();
    const out = (j?.[0] || []).map((x) => x?.[0] || "").join("");
    if (!out) throw new Error("แปลไม่สำเร็จ");
    return res.status(200).json({ text: out, from: j?.[2] || "" });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
