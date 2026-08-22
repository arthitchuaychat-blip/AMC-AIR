// AI ตรวจ "ใบส่งของ/บิลผู้ขาย" เทียบกับใบสั่งซื้อ (PO) — Claude vision
// office เท่านั้น (ตรวจ JWT) · โหลด PO + po_items ฝั่งเซิร์ฟเวอร์ (ข้อมูลจริง) แล้วให้ AI อ่านรูปเทียบทีละบรรทัด
// คืน { summary, rows:[{name,poQty,poPrice,docQty,docPrice,status,note}], extraInDoc:[], docTotal, poTotal, totalDiff, diag }
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const OFFICE = ["admin", "exec", "finance", "stock"];
const IMG_TYPES = { "image/jpeg": 1, "image/png": 1, "image/gif": 1, "image/webp": 1 };

// แยก JSON จากคำตอบ AI แบบทน: ตัด fence, หา { ... } ตัวนอกสุด, กู้กรณีถูกตัดกลาง
function parseLooseJson(text) {
  if (!text) return null;
  let t = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const s = t.indexOf("{");
  if (s < 0) return null;
  t = t.slice(s);
  try { return JSON.parse(t); } catch {}
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    else if (!inStr) { if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) end = i; } }
  }
  if (end > 0) { try { return JSON.parse(t.slice(0, end + 1)); } catch {} }
  return null;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

const money = (v) => (Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน Vercel" });
  if (!SB() || !KEY()) return res.status(503).json({ error: "ขาด SUPABASE env" });
  const jwt = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return res.status(401).json({ error: "no auth" });
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${jwt}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const user = await ur.json();
  const prof = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  if (!OFFICE.includes(prof[0]?.role)) return res.status(403).json({ error: "forbidden" });

  const { poNo } = await readJson(req);
  if (!poNo) return res.status(400).json({ error: "ไม่ระบุเลข PO" });

  // โหลดหัว PO + รายการ ฝั่งเซิร์ฟเวอร์ (ข้อมูลจริง — ไม่เชื่อฝั่ง client)
  const poArr = await fetch(`${SB()}/rest/v1/purchase_orders?po_no=eq.${encodeURIComponent(poNo)}&select=po_no,supplier,vat,price_incl,dn_no,sup_inv_no,attachments`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const po = poArr[0];
  if (!po) return res.status(404).json({ error: `ไม่พบ PO ${poNo}` });
  const items = await fetch(`${SB()}/rest/v1/po_items?po_no=eq.${encodeURIComponent(poNo)}&select=material_code,qty,price,unit&order=id`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  if (!items.length) return res.status(400).json({ error: "PO นี้ไม่มีรายการสินค้า" });

  // ชื่อวัสดุ
  const codes = [...new Set(items.map((x) => x.material_code).filter(Boolean))];
  const nameByCode = {};
  if (codes.length) {
    const inList = codes.map((c) => `"${String(c).replace(/"/g, '\\"')}"`).join(",");
    const mats = await fetch(`${SB()}/rest/v1/materials?code=in.(${encodeURIComponent(inList)})&select=code,name_th,unit`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    mats.forEach((m) => { nameByCode[String(m.code)] = m; });
  }

  // ข้อความรายการ PO ให้ AI เทียบ
  let poTotal = 0;
  const poLines = items.map((it, i) => {
    const m = nameByCode[String(it.material_code)] || {};
    const qty = Number(it.qty) || 0, price = Number(it.price) || 0, line = qty * price;
    poTotal += line;
    return `${i + 1}. ${m.name_th || it.material_code} (รหัส ${it.material_code}) — สั่ง ${qty} ${it.unit || m.unit || ""} × ${money(price)} บาท = ${money(line)} บาท`;
  }).join("\n");

  // แนบรูป/PDF ใบส่งของ → base64
  const media = [];
  const diag = [];
  let totalB64 = 0;
  const atts = Array.isArray(po.attachments) ? po.attachments.slice(0, 6) : [];
  for (const a of atts) {
    const url = typeof a === "string" ? a : a?.url;
    const nm = (typeof a === "object" && a?.name) || decodeURIComponent(String(url || "").split("/").pop().split("?")[0] || "file");
    if (!url) { diag.push(`${nm}: ไม่มี URL`); continue; }
    try {
      const r = await fetch(url);
      if (!r.ok) { diag.push(`${nm}: โหลดไม่ได้ (HTTP ${r.status})`); continue; }
      const ct = (r.headers.get("content-type") || "").split(";")[0].trim();
      const buf = Buffer.from(await r.arrayBuffer());
      const isPdf = ct === "application/pdf" || nm.toLowerCase().endsWith(".pdf");
      const cap = isPdf ? 24 * 1024 * 1024 : 5 * 1024 * 1024;
      if (buf.length > cap) { diag.push(`${nm}: ไฟล์ใหญ่เกิน (${(buf.length / 1048576).toFixed(1)}MB)`); continue; }
      const b64 = buf.toString("base64");
      if (totalB64 + b64.length > 28 * 1024 * 1024) { diag.push(`${nm}: รวมไฟล์เกินลิมิต`); continue; }
      totalB64 += b64.length;
      if (isPdf) media.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
      else media.push({ type: "image", source: { type: "base64", media_type: IMG_TYPES[ct] ? ct : "image/jpeg", data: b64 } });
      diag.push(`${nm}: ✓ ส่งเข้า AI (${(buf.length / 1048576).toFixed(1)}MB${isPdf ? " · PDF" : ""})`);
    } catch (e) { diag.push(`${nm}: error ${e.message || e}`); }
  }
  if (!media.length) return res.status(200).json({ error: null, summary: "❌ ยังไม่มีไฟล์ใบส่งของ/บิลที่อ่านได้แนบใน PO นี้ — แนบรูปก่อนแล้วลองใหม่", rows: [], extraInDoc: [], poTotal, docTotal: null, diag });

  const rules = `คุณคือธุรการตรวจเอกสารของ AMC AIR หน้าที่: อ่าน "ใบส่งของ/ใบแจ้งหนี้/บิลจากผู้ขาย" ในรูปที่แนบ แล้วเทียบกับ "ใบสั่งซื้อ (PO)" ที่ให้เป็นข้อความ เพื่อหาจุดที่ไม่ตรงกัน

## สิ่งที่ต้องทำ
1. อ่านรายการในใบส่งของ/บิล: ชื่อสินค้า, จำนวน, ราคาต่อหน่วย, ยอดรวมแต่ละบรรทัด และยอดรวมทั้งใบ (ถ้ามี)
2. จับคู่แต่ละรายการใน PO กับรายการในใบส่งของ (ชื่ออาจเขียนต่างกันเล็กน้อย/ย่อ — ใช้ดุลยพินิจจับคู่ให้ตรงตัวสินค้า)
3. รายงานสถานะแต่ละบรรทัด:
   - "ok" = จำนวน+ราคาตรงกัน
   - "price_diff" = ราคาต่อหน่วยไม่ตรง (บอกราคาในใบ)
   - "qty_diff" = จำนวนไม่ตรง (บอกจำนวนในใบ)
   - "missing_in_doc" = มีใน PO แต่หาในใบส่งของไม่เจอ
   (ถ้าไม่ตรงทั้งจำนวนและราคา เลือก qty_diff แล้วใส่รายละเอียดราคาใน note ด้วย)
4. รายการที่มีในใบส่งของ "แต่ไม่มีใน PO" → ใส่ใน extraInDoc
5. อ่านยอดรวมทั้งใบ (docTotal) ถ้าเห็น · ระบุเลขที่ใบส่งของ (docNo) ถ้าเห็น

## ข้อควรระวัง
- ราคาใน PO เป็น "ราคาต่อหน่วยที่คีย์" (ปกติราคาก่อน VAT) · ถ้าบิลแสดงรวม VAT แล้ว ให้ทักใน note/summary ว่าเทียบกันคนละฐาน อย่าตัดสินว่าผิดทันที
- ตัวเลขจำนวน/ราคาต้องอ่านให้แม่น · ถ้าอ่านเลขไม่ชัดให้บอกใน note ว่า "อ่านไม่ชัด"
- ถ้าในรูปไม่ใช่ใบส่งของ/บิล (เช่นเป็นรูปสินค้า/แชต) ให้ตั้ง summary บอกว่าไม่พบเอกสารบิลในรูป และ rows เท่าที่ทำได้

ตอบเป็น JSON เท่านั้น (ห้ามมีข้อความอื่นนอก JSON):
{"summary":"สรุปสั้น ๆ ว่าตรง/ไม่ตรงกี่จุด อะไรบ้าง","docNo":"เลขใบส่งของถ้าเห็น หรือ ''","docTotal":ตัวเลขยอดรวมบนใบ หรือ null,"rows":[{"name":"ชื่อสินค้า","status":"ok|price_diff|qty_diff|missing_in_doc","docQty":ตัวเลข|null,"docPrice":ตัวเลข|null,"note":"รายละเอียดสั้น ๆ"}],"extraInDoc":[{"name":"","qty":ตัวเลข,"price":ตัวเลข,"note":""}]}`;

  const userText = `ใบสั่งซื้อ (PO) เลขที่ ${po.po_no} · ผู้ขาย ${po.supplier || "-"} · ${po.vat ? "PO นี้มี VAT 7%" : "PO นี้ไม่มี VAT"}\nรายการที่สั่ง (${items.length} รายการ) ยอดก่อน VAT รวม ${money(poTotal)} บาท:\n${poLines}\n\nโปรดอ่านใบส่งของ/บิลในรูป แล้วเทียบกับรายการข้างบน ตอบเป็น JSON เท่านั้น`;

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5", max_tokens: 8000, output_config: { effort: "low" },
        system: [{ type: "text", text: rules }],
        messages: [{ role: "user", content: [...media, { type: "text", text: userText }] }],
      }),
    });
  } catch (e) { return res.status(502).json({ error: "เรียก AI ไม่สำเร็จ: " + (e.message || e) }); }
  if (!r.ok) { const b = (await r.text()).slice(0, 300); return res.status(502).json({ error: `AI ${r.status}: ${b}` }); }
  const data = await r.json();
  if (data.stop_reason === "refusal") return res.status(200).json({ summary: "AI ปฏิเสธการตอบ", rows: [], extraInDoc: [], poTotal, docTotal: null, diag });
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const parsed = parseLooseJson(text);
  if (!parsed) return res.status(200).json({ summary: "AI ตอบไม่เป็น JSON — ลองใหม่อีกครั้ง", rows: [], extraInDoc: [], poTotal, docTotal: null, raw: text.slice(0, 1000), diag });

  // ประกอบผล: ผูกค่า PO จริงกลับเข้าแต่ละแถว (กัน AI แต่งตัวเลข PO เอง) จับคู่ตามลำดับ/ชื่อ
  const okStatus = { ok: 1, price_diff: 1, qty_diff: 1, missing_in_doc: 1 };
  const aiRows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const rows = items.map((it, i) => {
    const m = nameByCode[String(it.material_code)] || {};
    const nm = m.name_th || it.material_code;
    // จับคู่แถวจาก AI: ตามลำดับก่อน ถ้าชื่อใกล้กัน
    const ai = aiRows[i] && normName(aiRows[i].name) && looseMatch(aiRows[i].name, nm) ? aiRows[i]
      : aiRows.find((x) => looseMatch(x.name, nm)) || aiRows[i] || {};
    const st = okStatus[ai.status] ? ai.status : "ok";
    return {
      name: nm, code: it.material_code,
      poQty: Number(it.qty) || 0, poPrice: Number(it.price) || 0,
      docQty: ai.docQty == null ? null : Number(ai.docQty),
      docPrice: ai.docPrice == null ? null : Number(ai.docPrice),
      status: st, note: ai.note || "",
    };
  });
  const extraInDoc = (Array.isArray(parsed.extraInDoc) ? parsed.extraInDoc : []).map((x) => ({
    name: x.name || "(ไม่ระบุ)", qty: x.qty == null ? null : Number(x.qty), price: x.price == null ? null : Number(x.price), note: x.note || "",
  }));
  const docTotal = parsed.docTotal == null ? null : Number(parsed.docTotal);
  const diffCount = rows.filter((x) => x.status !== "ok").length + extraInDoc.length;
  return res.status(200).json({
    po_no: po.po_no, supplier: po.supplier || "", vat: !!po.vat, dnNo: po.dn_no || parsed.docNo || "",
    summary: parsed.summary || "", rows, extraInDoc,
    poTotal, docTotal, totalDiff: docTotal == null ? null : docTotal - poTotal,
    diffCount, diag,
  });
}

function normName(s) { return String(s == null ? "" : s).replace(/\s+/g, "").toLowerCase(); }
function looseMatch(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length < y.length ? x : y, long = x.length < y.length ? y : x;
  return short.length >= 3 && long.includes(short);
}
