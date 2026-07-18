// ✨ ร่าง "คุณสมบัติเบื้องต้น" ของรุ่นแอร์ด้วย AI (Claude) — ใช้ในหน้า จัดการรูป & คุณสมบัติแอร์
// รับ brand/series + สเปคจริงของทุกขนาดในรุ่น → ให้ AI เรียบเรียงเป็น bullet ภาษาไทย
// ผลลัพธ์เป็นแค่ "ร่าง" — ผู้ใช้ตรวจ/แก้ในฟอร์มก่อนบันทึกเสมอ ไม่บันทึกอัตโนมัติ
// ตรวจสิทธิ์แบบเดียวกับ fetch-file.js: ต้องล็อกอิน + เป็นฝ่ายออฟฟิศ

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const OFFICE = ["admin", "sales", "exec", "finance", "hr", "stock", "graphic"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ยังไม่ได้ตั้ง ANTHROPIC_API_KEY บน Vercel" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "no auth" });
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const user = await ur.json();
  const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbH() });
  const prof = (pr.ok ? await pr.json() : [])[0];
  if (!OFFICE.includes(prof?.role)) return res.status(403).json({ error: "forbidden" });

  const { brand, series, items } = req.body || {};
  if (!brand && !series) return res.status(400).json({ error: "ต้องระบุ brand/series" });
  const specLines = (Array.isArray(items) ? items : []).slice(0, 30).map((it) =>
    [
      it.btu ? `${it.btu} BTU` : null, it.ac_type, it.seer ? `SEER ${it.seer}` : null,
      it.refrigerant, it.voltage, it.energy_label, it.warranty ? `รับประกัน ${it.warranty}` : null,
    ].filter(Boolean).join(" · ")
  ).filter(Boolean).join("\n");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        system:
          "คุณเขียน \"คุณสมบัติเบื้องต้น\" ของรุ่นเครื่องปรับอากาศ สำหรับโชว์บนเว็บร้านขายแอร์ในไทย\n" +
          "กติกาเข้มงวด:\n" +
          "- ตอบเป็น bullet ขึ้นต้นด้วย • บรรทัดละข้อ 4-7 ข้อ ภาษาไทย สั้น กระชับ เท่านั้น ห้ามมีข้อความอื่นนำหน้า/ต่อท้าย\n" +
          "- ใช้ข้อมูลสเปคที่ให้มา + ความรู้ทั่วไปของรุ่น/ยี่ห้อนั้นที่มั่นใจจริงเท่านั้น\n" +
          "- ห้ามเดาสเปคตัวเลขที่ไม่ได้ให้มา ห้ามพูดถึงราคา ห้ามอ้างโปรโมชั่น\n" +
          "- ถ้าข้อมูลบอกว่าเป็น Inverter/Fixed Speed ให้ระบุ ถ้าไม่แน่ใจอย่าใส่\n" +
          "- คุณสมบัติที่ปลอดภัยเสมอ: ชนิดน้ำยา, ฉลากประหยัดไฟ, ระบบไฟ, การรับประกัน (ตามข้อมูลที่ให้)",
        messages: [{
          role: "user",
          content: `ยี่ห้อ: ${brand || "-"}\nรุ่น/ซีรีส์: ${series || "-"}\nขนาดและสเปคที่มีขายในร้าน:\n${specLines || "(ไม่มีข้อมูลสเปคเพิ่มเติม)"}`,
        }],
      }),
    });
    if (!r.ok) { const body = (await r.text()).slice(0, 250); return res.status(502).json({ error: `anthropic ${r.status}: ${body}` }); }
    const j = await r.json();
    const text = (j.content || []).map((c) => c.text || "").join("").trim();
    if (!text) return res.status(502).json({ error: "AI ไม่ตอบข้อความ" });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: "เรียก AI ไม่สำเร็จ: " + (e?.message || e) });
  }
}
