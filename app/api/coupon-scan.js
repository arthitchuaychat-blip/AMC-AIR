// AI อ่านรหัสคูปองจากรูปที่ลูกค้าส่งในแชต (Claude vision) — เฉพาะทีมหลังบ้าน (ตรวจ JWT)
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const IMG = { "image/jpeg": 1, "image/png": 1, "image/gif": 1, "image/webp": 1 };
const OFFICE = ["admin", "exec", "finance", "hr", "sales", "field_sales", "graphic", "stock"];

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const jwt = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return res.status(401).json({ error: "no auth" });
    const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${jwt}` } });
    if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
    const user = await ur.json();
    const prof = (await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])))[0];
    if (!OFFICE.includes(prof?.role)) return res.status(403).json({ error: "forbidden" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "no ANTHROPIC_API_KEY" });

    const { imageUrl } = await readJson(req);
    if (!imageUrl) return res.status(400).json({ error: "no image" });
    const ir = await fetch(imageUrl);
    if (!ir.ok) return res.status(400).json({ error: "โหลดรูปไม่สำเร็จ" });
    const ct = (ir.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const buf = Buffer.from(await ir.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ error: "รูปใหญ่เกิน 6MB" });
    const media = { type: "image", source: { type: "base64", media_type: IMG[ct] ? ct : "image/jpeg", data: buf.toString("base64") } };

    const prompt = `รูปนี้อาจเป็นคูปองส่วนลด/บัตรกำนัล อ่าน "รหัสคูปอง/โค้ด" ทั้งหมดที่เห็นในรูป (มักเป็นตัวอักษรพิมพ์ใหญ่+ตัวเลขผสมกัน มีขีดกลาง เช่น CLN750-A2B4C6 หรือ CLEAN-XY7K9Q)
คืน JSON เท่านั้น: {"codes":["...","..."]} — ถ้าไม่พบโค้ดคืน {"codes":[]} · ห้ามมีข้อความอื่นนอก JSON`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 400, output_config: { effort: "low" }, messages: [{ role: "user", content: [media, { type: "text", text: prompt }] }] }),
    });
    if (!r.ok) return res.status(502).json({ error: `anthropic ${r.status}`, detail: (await r.text()).slice(0, 200) });
    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    let codes = [];
    try { const m = text.match(/\{[\s\S]*\}/); codes = JSON.parse(m ? m[0] : text).codes || []; } catch { codes = []; }
    codes = [...new Set(codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
    return res.status(200).json({ codes });
  } catch (e) { return res.status(500).json({ error: String(e?.message || e) }); }
}
