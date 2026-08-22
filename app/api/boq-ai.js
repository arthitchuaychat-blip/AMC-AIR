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

## วิธีอ่านแบบแอร์ (สำคัญมาก)
- **อ่านทุกอย่างจากแบบให้มากที่สุดก่อน — แบบคือแหล่งข้อมูลหลัก** ผู้ใช้อาจไม่พิมพ์สเปค/บรีฟเพิ่ม ให้ดูจากแบบเป็นหลักเสมอ
- **มองหา "ตาราง AC Schedule / รายการเครื่องปรับอากาศ / Legend"** ในแบบ (มักอยู่มุมหนึ่งหรือหน้าแยก) ที่ระบุแต่ละ FCU: **ชนิด** (Wall/ติดผนัง, Cassette/ฝัง, Single Flow, Ceiling/แขวน) + **ขนาด** (BTU หรือ ตัน · 1 ตัน ≈ 12,000 BTU) + ยี่ห้อ/รุ่น — **อ่านมาใช้ตรง ๆ**
- **FCU** = คอยล์เย็น/เครื่องตัวใน · **CDU** = คอนเดนเซอร์/เครื่องตัวนอก · FCU 1 ตัว = แอร์ 1 ชุด (นับจำนวนจาก FCU)
- **อ่านเลเจนด์/สีของแต่ละตัวเสมอ** แยกสถานะ: เดิมติดอยู่แล้ว (มักส้ม — ไม่คิดเครื่อง) · เดิมย้าย/ติดใหม่ (มักเขียว — คิดค่าติดตั้ง/ย้าย) · ติดตั้งใหม่ (มักฟ้า — คิดทั้งเครื่อง+ติดตั้ง)
- **ค่าเริ่มต้น: เสนอราคาเฉพาะงาน "ใหม่" + "ย้าย/ติดใหม่"** งานเดิมที่อยู่แล้วไม่คิด (เว้นบรีฟสั่งอื่น) · สรุปให้ชัดว่านับตัวไหน
- โน้ตในแบบใช้ประเมิน: "เมนไฟเพิ่ม X จุด" (→ งานเดินไฟ X จุด), "ท่อน้ำทิ้ง/ท่อ 9m/ไม่เกิน 4m" (→ ความยาวท่อ), "ใส่ปั๊มน้ำ" (→ ปั๊มน้ำทิ้ง)
- **ถ้าแบบมี BTU/ขนาดครบแล้ว → ไม่ต้องรอสเปคเพิ่ม เลือกรุ่นได้เลย** (ไม่ต้อง needsCheck เรื่อง BTU) · **เฉพาะกรณีแบบไม่มี BTU/ขนาดจริง ๆ (ทั้งตาราง+ป้าย) และสเปคก็ไม่มี** → ห้ามเดารุ่นเจาะจง ตั้ง code="" name="แอร์ [ตำแหน่ง] — รอระบุ BTU" needsCheck=true + บอกในสรุปว่าต้องขอ BTU

## กติกาสำคัญ (ทำตามเคร่งครัด)
- ใช้ "รหัส (code)" จากแคตตาล็อกที่ให้ไว้เท่านั้น ห้ามแต่งรหัส/ราคาเอง · ไม่มีของตรง → code="" needsCheck=true
- section: "ac"=เครื่องแอร์ · "charged"=วัสดุคิดเงิน · "free"=วัสดุแถม · "service"=ค่าบริการ/ค่าติดตั้ง/ค่าแรง
- เลือกเครื่องแอร์ตาม BTU ที่ระบุ + ยี่ห้อ/เงื่อนไขในบรีฟ (บรีฟไม่ระบุยี่ห้อ → เลือกรุ่นคุ้มค่า needsCheck=true)
- วัสดุติดตั้งมาตรฐานต่อเครื่องใหม่: ท่อทองแดง(คู่)+ฉนวน · ท่อน้ำทิ้ง+ข้อต่อ · สายไฟ/สายคอนโทรล · ขายึด/แท่นวางคอยล์ร้อน · เทปพันท่อ/รางครอบ — ใส่เท่าที่มีในแคตตาล็อก · ปริมาณคูณตามจำนวนเครื่อง
- ประมาณความยาวท่อจากโน้ต/สเกลในแบบ (มี dimension 1:125 ให้ใช้) — ค่าประเมินทุกอย่าง needsCheck=true
- งานพิเศษตามโน้ต: เดินเมนไฟ (ต่อจุด), ปั๊มน้ำทิ้ง, ย้ายเครื่องเดิม, รื้อของเก่า — ใส่เป็น section service ถ้ามีในแคตตาล็อก
- qty ตัวเลขจริง · unit_cost ตามต้นทุนแคตตาล็อก (ระบบ override อีกชั้น) · note=ตำแหน่ง/ที่มาสั้น ๆ (เช่น "FCU-104 ชั้น1")
- เคารพบรีฟ: ยี่ห้อ, ความหนาฉนวน, รวม/ไม่รวมอุปกรณ์ซัพพอร์ต, เดินท่อในฝ้า/ลอย ฯลฯ
- แบบหลายชั้น/หลายรูป: อ่านทุกรูป รวมทุกชั้น · ในสรุปให้แจกแจงต่อชั้น (ชั้น 1 กี่ตัวใหม่/เดิม ฯลฯ)

ตอบเป็น JSON เท่านั้น (ห้ามมีข้อความอื่นนอก JSON):
{"summary":"สรุป: อ่านแบบได้กี่ชั้น กี่ FCU (ใหม่/ย้าย/เดิม) ต่อชั้น + ข้อควรระวัง/สิ่งที่ต้องขอเพิ่ม (เช่น BTU)","lines":[{"section":"ac|charged|free|service","code":"รหัสจากแคตตาล็อก หรือ ''","name":"ชื่อ","unit":"หน่วย","qty":ตัวเลข,"unit_cost":ตัวเลข,"note":"ตำแหน่ง/หมายเหตุ","needsCheck":true|false}]}`;

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
        model: "claude-sonnet-5", max_tokens: 6000, output_config: { effort: "medium" },
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
