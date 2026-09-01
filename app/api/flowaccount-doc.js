// Create a document in FlowAccount (tax invoice / receipt) from a normalized payload.
// Office staff only. Gets a client_credentials token, POSTs to /{env}/<docPath>, returns the raw
// FlowAccount response so we can tune field mappings against the sandbox.
// Env: FLOWACCOUNT_CLIENT_ID, FLOWACCOUNT_CLIENT_SECRET, FLOWACCOUNT_ENV (sandbox="test", prod="v1")
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const OFFICE = ["admin", "exec", "finance", "sales", "hr"];
const DOC_PATH = { "tax-invoice": "tax-invoices", "receipt": "receipts", "invoice": "invoices", "quotation": "quotations" };

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const tok = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!tok) return res.status(401).json({ error: "no auth" });
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${tok}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const user = await ur.json();
  const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}` } });
  const role = ((pr.ok ? await pr.json() : [])[0] || {}).role;
  if (!OFFICE.includes(role)) return res.status(403).json({ error: "forbidden" });

  const id = process.env.FLOWACCOUNT_CLIENT_ID, secret = process.env.FLOWACCOUNT_CLIENT_SECRET;
  const env = process.env.FLOWACCOUNT_ENV || "test";
  if (!id || !secret) return res.status(200).json({ ok: false, reason: "no-creds", msg: "ยังไม่ได้ตั้ง FLOWACCOUNT_CLIENT_ID / SECRET ใน Vercel" });

  const input = await readJson(req);
  const path = DOC_PATH[input.docType] || "tax-invoices";

  // 1) token
  let access;
  try {
    const tr = await fetch(`https://openapi.flowaccount.com/${env}/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "flowaccount-api", client_id: id, client_secret: secret }).toString(),
    });
    const tj = await tr.json().catch(() => ({}));
    if (!tr.ok || !tj.access_token) return res.status(200).json({ ok: false, reason: "token-failed", status: tr.status, msg: JSON.stringify(tj).slice(0, 300) });
    access = tj.access_token;
  } catch (e) { return res.status(200).json({ ok: false, reason: "network", msg: String(e) }); }

  // 2) build the FlowAccount SimpleDocument payload from our normalized input
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const isVat = !!input.isVat;
  // FlowAccount item type: 1=service, 3=non-inventory, 5=inventory(stock). Inline stock (5) is not
  // supported → use 1 for service lines, 3 for everything else so no stock record is created.
  const items = (input.items || []).map((it) => {
    const qty = Number(it.quantity) || 1, price = Number(it.pricePerUnit) || 0;
    const total = it.total != null ? r2(it.total) : r2(qty * price);
    // no sku → FlowAccount treats each line as a standalone item (no product-master create/match,
    // avoids "ProductCodeDuplicate" when the same code is sent across documents)
    return { type: it.kind === "service" ? 1 : 3, sku: "", name: it.name || "-", quantity: qty,
      unitName: it.unitName || "หน่วย", pricePerUnit: price, total, discount: 0, discountPercentage: 0, vatRate: isVat ? 7 : 0 };
  });
  // compute the document totals so FlowAccount's subtotal/VAT/grand are consistent with the lines
  const subTotal = r2(items.reduce((a, i) => a + i.total, 0));
  const discountAmount = r2(input.discountAmount);
  const totalAfterDiscount = r2(subTotal - discountAmount);
  const vatAmount = isVat ? r2(totalAfterDiscount * 7 / 100) : 0;
  const grandTotal = r2(totalAfterDiscount + vatAmount);
  // ใบกำกับภาษีต้องมี VAT จริง — ตรวจจาก "ยอด VAT ที่คำนวณได้" ไม่ใช่แค่ธง isVat ที่ client ส่งมา
  // (client ปัจจุบันส่ง isVat:true เสมอ — ถ้าตรวจแค่ธงจะเป็น dead code · เผื่อ caller ใหม่/ยอดเพี้ยนหลุดมา)
  if (input.docType === "tax-invoice" && !(vatAmount > 0)) {
    return res.status(200).json({ ok: false, reason: "not-vat", msg: "ใบกำกับภาษีต้องมี VAT — ยอด VAT ที่คำนวณได้เป็น 0 จึงส่งเข้า FlowAccount ไม่ได้" });
  }
  const doc = {
    recordId: 0,
    contactCode: input.contactCode || "", contactName: input.contactName || "-",
    contactAddress: input.contactAddress || "", contactTaxId: input.contactTaxId || "",
    contactBranch: input.contactBranch || "สำนักงานใหญ่", contactNumber: input.contactNumber || "",
    publishedOn: input.publishedOn, creditType: 3, creditDays: 0, dueDate: input.dueDate || input.publishedOn,
    isManualVat: false, isVat, isVatInclusive: !!input.isVatInclusive,
    subTotal, discountAmount, totalAfterDiscount, vatAmount, grandTotal,
    remarks: input.remarks || "", items,
  };

  // 3) create the document — ถ้ารหัสผู้ติดต่อชนกับที่มีใน FlowAccount (CONTACT_CODE_DUPLICATE)
  //    ให้ลองใหม่โดยไม่ส่ง contactCode (ปล่อยให้ FlowAccount จับคู่/สร้างผู้ติดต่อเอง)
  async function create(payload) {
    const dr = await fetch(`https://openapi.flowaccount.com/${env}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
      body: JSON.stringify(payload),
    });
    const txt = await dr.text();
    let j = {}; try { j = JSON.parse(txt); } catch {}
    return { ok: dr.ok, status: dr.status, txt, j };
  }
  try {
    let r = await create(doc);
    if (!r.ok && /CONTACT_CODE_DUPLICATE/i.test(r.txt || "")) {
      r = await create({ ...doc, contactCode: "" });   // รหัสชน → ส่งใหม่ไม่ระบุรหัส
    }
    if (!r.ok) return res.status(200).json({ ok: false, reason: "create-failed", status: r.status, msg: (r.txt || "").slice(0, 600) });
    const data = r.j.data || r.j;
    return res.status(200).json({ ok: true, env, docPath: path, id: data.recordId || data.id || null, serial: data.documentSerial || data.documentNumber || null, raw: r.j });
  } catch (e) { return res.status(200).json({ ok: false, reason: "network", msg: String(e) }); }
}
