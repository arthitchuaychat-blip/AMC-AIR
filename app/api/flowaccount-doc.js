// Create a document in FlowAccount (tax invoice / receipt) from a normalized payload.
// Office staff only. Gets a client_credentials token, POSTs to /{env}/<docPath>, returns the raw
// FlowAccount response so we can tune field mappings against the sandbox.
// Env: FLOWACCOUNT_CLIENT_ID, FLOWACCOUNT_CLIENT_SECRET, FLOWACCOUNT_ENV (sandbox="test", prod="v1")
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const OFFICE = ["admin", "exec", "finance"];
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
  // FlowAccount item type: 1=service, 3=non-inventory, 5=inventory(stock). Inline stock (5) is not
  // supported → use 1 for service lines, 3 for everything else so no stock record is created.
  const items = (input.items || []).map((it) => ({
    type: it.kind === "service" ? 1 : 3, sku: it.sku || "", name: it.name || "-", quantity: Number(it.quantity) || 1,
    unitName: it.unitName || "หน่วย", pricePerUnit: Number(it.pricePerUnit) || 0,
    total: Number(it.total) || 0, discount: Number(it.discount) || 0, discountPercentage: 0,
  }));
  const doc = {
    recordId: 0,
    contactCode: input.contactCode || "", contactName: input.contactName || "-",
    contactAddress: input.contactAddress || "", contactTaxId: input.contactTaxId || "",
    contactBranch: input.contactBranch || "สำนักงานใหญ่", contactNumber: input.contactNumber || "",
    publishedOn: input.publishedOn, creditType: 3, creditDays: 0, dueDate: input.dueDate || input.publishedOn,
    isVat: !!input.isVat, isVatInclusive: !!input.isVatInclusive,
    grandTotal: Number(input.grandTotal) || 0, remarks: input.remarks || "", items,
  };

  // 3) create the document
  try {
    const dr = await fetch(`https://openapi.flowaccount.com/${env}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
      body: JSON.stringify(doc),
    });
    const txt = await dr.text();
    let j = {}; try { j = JSON.parse(txt); } catch {}
    if (!dr.ok) return res.status(200).json({ ok: false, reason: "create-failed", status: dr.status, msg: txt.slice(0, 600) });
    const data = j.data || j;
    return res.status(200).json({ ok: true, env, docPath: path, id: data.recordId || data.id || null, serial: data.documentSerial || data.documentNumber || null, raw: j });
  } catch (e) { return res.status(200).json({ ok: false, reason: "network", msg: String(e) }); }
}
