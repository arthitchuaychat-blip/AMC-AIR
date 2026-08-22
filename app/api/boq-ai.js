// ช่วยร่าง BOQ จากแบบ/รูป (Claude vision) — อ่านแปลน + สเปค + บรีฟ แล้วร่างรายการวัสดุจากแคตตาล็อกจริง
// office เท่านั้น (ตรวจ JWT) · คืน { lines:[{section,code,name,unit,qty,unit_cost,note,needsCheck}], summary }
// ⚠️ ใช้ "cost" (ต้นทุน) เหมือน BOQ · ห้ามหลุด sale_price/สต๊อก
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const OFFICE = ["admin", "exec", "sales", "field_sales", "finance", "hr"];
const IMG_TYPES = { "image/jpeg": 1, "image/png": 1, "image/gif": 1, "image/webp": 1 };

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

// โหลดแคตตาล็อกจริง (active) — แยกดึงตามหมวดกัน limit เบียด (บทเรียนแอร์ 855 รุ่น)
async function loadCatalog() {
  const page = async (kind, fields, order, limit) => {
    let rows = [], off = 0;
    for (;;) {
      const r = await fetch(`${SB()}/rest/v1/materials?select=${fields}&active=eq.true&kind=eq.${kind}&order=${order}&limit=${limit}&offset=${off}`, { headers: sbH() });
      if (!r.ok) break;
      const p = await r.json(); rows = rows.concat(p);
      if (p.length < limit || off > 20000) break;
      off += p.length;
    }
    return rows;
  };
  const [ac, svc, mat] = await Promise.all([
    page("ac", "code,name_th,brand,series,btu,ac_type,unit,cost,seer,energy_label", "brand.asc,btu.asc", 1000),
    page("service", "code,name_th,unit,cost,btu_min,btu_max,description", "name_th.asc", 500),
    page("material", "code,name_th,unit,cost,category,description", "name_th.asc", 1000),
  ]);
  return { ac, svc, mat };
}

function catalogText({ ac, svc, mat }) {
  const money = (v) => (Number(v) > 0 ? Number(v).toLocaleString("en-US") : "0");
  const clip = (t, n) => { const d = (t == null ? "" : String(t)).replace(/\s+/g, " ").trim(); return d ? d.slice(0, n) : ""; };
  const acL = (m) => `${m.code} | ${[m.brand, m.series, m.name_th].filter(Boolean).join(" ")} | ${m.ac_type || ""} | ${m.btu || "?"} BTU | ${m.energy_label || ""} ${m.seer ? "SEER " + m.seer : ""} | ต้นทุน ${money(m.cost)}/${m.unit || "เครื่อง"}`;
  const svcL = (m) => `${m.code} | ${m.name_th} | ${(m.btu_min || m.btu_max) ? `แอร์ ${m.btu_min || ""}-${m.btu_max || ""} BTU` : ""} | ต้นทุน ${money(m.cost)}/${m.unit || "งาน"} | ${clip(m.description, 60)}`;
  const matL = (m) => `${m.code} | ${m.name_th}${m.category ? " (" + m.category + ")" : ""} | ต้นทุน ${money(m.cost)}/${m.unit || "หน่วย"} | ${clip(m.description, 60)}`;
  return [
    "## เครื่องปรับอากาศ (section=ac) [รหัส | ยี่ห้อ/รุ่น | ประเภท | BTU | ฉลาก | ต้นทุน/หน่วย]",
    ac.map(acL).join("\n"),
    "\n## วัสดุ (section=charged คิดเงิน / free แถม) [รหัส | ชื่อ (หมวด) | ต้นทุน/หน่วย | รายละเอียด]",
    mat.map(matL).join("\n"),
    "\n## ค่าบริการ (section=service) [รหัส | ชื่อ | ช่วง BTU | ต้นทุน/หน่วย | รายละเอียด]",
    svc.map(svcL).join("\n"),
  ].join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน Vercel" });
  if (!SB() || !KEY()) return res.status(503).json({ error: "ขาด SUPABASE env" });
  // auth: office JWT เท่านั้น
  const jwt = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return res.status(401).json({ error: "no auth" });
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${jwt}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const user = await ur.json();
  const prof = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  if (!OFFICE.includes(prof[0]?.role)) return res.status(403).json({ error: "forbidden" });

  const { imageUrls = [], spec = "", brief = "" } = await readJson(req);
  if (!imageUrls.length && !spec.trim()) return res.status(400).json({ error: "ต้องมีรูปแบบ หรือ รายการสเปคอย่างน้อยอย่างใดอย่างหนึ่ง" });

  // ดึงรูป/PDF มาแปลง base64 เป็น content block (vision) — สูงสุด 6 ไฟล์
  const media = [];
  for (const u of imageUrls.slice(0, 6)) {
    try {
      const r = await fetch(u); if (!r.ok) continue;
      const ct = (r.headers.get("content-type") || "").split(";")[0].trim();
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 5 * 1024 * 1024) continue;   // เกิน 5MB ข้าม
      const b64 = buf.toString("base64");
      if (ct === "application/pdf") media.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
      else media.push({ type: "image", source: { type: "base64", media_type: IMG_TYPES[ct] ? ct : "image/jpeg", data: b64 } });
    } catch { /* ข้ามไฟล์ที่โหลดไม่ได้ */ }
  }

  const catalog = catalogText(await loadCatalog());
  const rules = `คุณคือวิศวกรประเมินราคางานติดตั้งแอร์ของ AMC AIR ช่วยร่าง BOQ (ปริมาณวัสดุ) จากแบบ/แปลน + รายการสเปค + บรีฟที่ให้มา

กติกาสำคัญ (ทำตามเคร่งครัด):
- ใช้ "รหัส (code)" จากแคตตาล็อกที่ให้ไว้เท่านั้น ห้ามแต่งรหัส/ราคาเอง · ถ้าไม่มีของที่ตรงในแคตตาล็อก ให้ตั้ง code="" แล้ว needsCheck=true
- แต่ละบรรทัดจัดเข้า section: "ac"=เครื่องแอร์ · "charged"=วัสดุคิดเงิน · "free"=วัสดุแถม · "service"=ค่าบริการ/ค่าติดตั้ง
- เลือกเครื่องแอร์ให้ตรง BTU ที่แบบระบุ + ยี่ห้อ/เงื่อนไขในบรีฟ (ถ้าบรีฟไม่ระบุยี่ห้อ ให้เลือกรุ่นที่คุ้มค่า แล้ว needsCheck=true)
- วัสดุติดตั้งมาตรฐานต่อเครื่อง: ท่อทองแดง(คู่) + ฉนวน + ท่อน้ำทิ้ง + สายไฟ + ขายึด/แท่นวาง + เทปพันท่อ ฯลฯ — ใส่ตามที่มีในแคตตาล็อก
- ประมาณความยาวท่อ/สายจากแปลน (ถ้าบอกสเกลได้) — งานประเมินทุกอย่างที่ "ไม่แน่นอน" ให้ needsCheck=true เสมอ
- qty ต้องเป็นตัวเลขจริง · unit_cost ใส่ตามต้นทุนในแคตตาล็อก (ระบบจะ override ให้ตรงอีกชั้น) · note=เหตุผล/ที่มาสั้น ๆ
- เคารพบรีฟ: ยี่ห้อ, ความหนาฉนวน, รวม/ไม่รวมอุปกรณ์ซัพพอร์ต, เดินท่อในฝ้า/ลอย ฯลฯ

ตอบเป็น JSON เท่านั้น (ห้ามมีข้อความอื่นนอก JSON):
{"summary":"สรุปสั้น ๆ ว่าอ่านแบบได้อะไร (กี่ห้อง/กี่เครื่อง/ข้อควรระวัง)","lines":[{"section":"ac|charged|free|service","code":"รหัสจากแคตตาล็อก หรือ ''","name":"ชื่อ","unit":"หน่วย","qty":ตัวเลข,"unit_cost":ตัวเลข,"note":"หมายเหตุ","needsCheck":true|false}]}`;

  const userContent = [
    ...media,
    { type: "text", text: `รายการสเปค/ข้อความจากลูกค้า:\n${spec || "(ไม่มี — ใช้ข้อมูลจากแบบ)"}\n\nบรีฟเพิ่มเติม:\n${brief || "(ไม่มี)"}\n\nโปรดร่าง BOQ ตามกติกา ตอบเป็น JSON เท่านั้น` },
  ];

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5", max_tokens: 4000, output_config: { effort: "medium" },
        system: [
          { type: "text", text: rules },
          { type: "text", text: "แคตตาล็อกวัสดุ/แอร์/บริการ (ต้นทุนจริง — ใช้รหัสจากนี้เท่านั้น):\n" + catalog, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (e) { return res.status(502).json({ error: "เรียก AI ไม่สำเร็จ: " + (e.message || e) }); }
  if (!r.ok) { const b = (await r.text()).slice(0, 300); return res.status(502).json({ error: `AI ${r.status}: ${b}` }); }
  const data = await r.json();
  if (data.stop_reason === "refusal") return res.status(200).json({ lines: [], summary: "AI ปฏิเสธการตอบ" });
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  let parsed;
  try { parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()); }
  catch { return res.status(200).json({ lines: [], summary: "AI ตอบไม่เป็น JSON — ลองใหม่/เพิ่มรายละเอียด", raw: text.slice(0, 500) }); }

  // ตรวจ + จับคู่แคตตาล็อกจริง (override ชื่อ/หน่วย/ต้นทุน ตามรหัส) — กัน AI มั่วราคา
  const cat = await loadCatalog();
  const byCode = {}; [...cat.ac, ...cat.svc, ...cat.mat].forEach((m) => { byCode[String(m.code)] = m; });
  const okSec = { ac: 1, charged: 1, free: 1, service: 1 };
  const lines = (parsed.lines || []).map((x) => {
    const m = x.code ? byCode[String(x.code)] : null;
    let section = okSec[x.section] ? x.section : "charged";
    if (m) section = m.kind === "ac" ? "ac" : m.kind === "service" ? "service" : (section === "free" ? "free" : "charged");
    return {
      section,
      code: m ? m.code : "",
      name: m ? m.name_th : (x.name || "(ไม่ระบุ)"),
      unit: m ? (m.unit || "") : (x.unit || ""),
      qty: Math.max(0, Number(x.qty) || 0),
      unit_cost: m ? (Number(m.cost) || 0) : (Number(x.unit_cost) || 0),
      description: [x.note, (!m || x.needsCheck) ? "⚠️ ตรวจสอบ" : ""].filter(Boolean).join(" · "),
    };
  }).filter((x) => x.name && x.qty > 0);

  return res.status(200).json({ summary: parsed.summary || "", lines, count: lines.length });
}
