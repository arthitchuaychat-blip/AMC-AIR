// v850 — หน้าใบแจ้งหนี้โหลดเฉพาะช่วงวันที่ (since) จากเซิร์ฟเวอร์ แทนที่จะดึงทุกใบทั้งบริษัทแล้วซ่อนในเบราว์เซอร์
// ตรวจแบบอ่านโค้ด (static) ว่า
//   (1) api.js มี listInvoiceTotals แบบบาง + _loadInvoices รองรับ since และกรองตารางลูกตามใบที่ได้จริง
//   (2) Invoices.jsx ใช้ "ชุดสรุปทุกใบ" (totals) สำหรับทุกอย่างที่ต้องนับจากทุกใบ — ยอดวางบิล / งวดที่ / ใบที่ซ่อน / จำนวนใบ
//       ถ้าเผลอนับจาก list (แค่ช่วงที่โหลด) ใบเสนอที่วางบิลครบเมื่อปีก่อนจะโผล่ให้วางบิลซ้ำ และงวดจะนับผิด
//   (3) กติกาโหลดใหม่: ช่วงวันที่ขยับไปเก่ากว่าที่โหลด (หรือขอดูทั้งหมด) → โหลดใหม่ · มีตัวกันผลรอบเก่าทับรอบใหม่
import fs from "node:fs";
import assert from "node:assert/strict";

const norm = (s) => s.replace(/\r\n/g, "\n");
const API = norm(fs.readFileSync("src/lib/api.js", "utf8"));
const INV = norm(fs.readFileSync("src/components/Invoices.jsx", "utf8"));

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + e.message); fail++; } };
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, "ไม่เจอ " + a); const j = src.indexOf(b, i); assert.ok(j > i, "ไม่เจอจุดจบ " + b); return src.slice(i, j); };

console.log("\napi.js — listInvoiceTotals + _loadInvoices(since):");
check("มี listInvoiceTotals แบบบาง 5 คอลัมน์ ผ่านแคชสั้น และดึงครบทุกหน้า (_fetchAll กันเพดาน 1000 แถว)", () => {
  const fn = between(API, "export function listInvoiceTotals()", "\n}");
  assert.ok(fn.includes('_cached("listInvoiceTotals"'), "ไม่ผ่าน _cached");
  assert.ok(fn.includes("_SHORT_TTL"), "ต้องใช้แคชสั้น (ล้างทันทีเมื่อมีการเขียน)");
  assert.ok(fn.includes("_fetchAll("), "ต้อง _fetchAll");
  assert.ok(fn.includes('select("invoice_no,quote_no,total,status,issue_date"'), "คอลัมน์ต้องบาง: invoice_no,quote_no,total,status,issue_date");
});
check("listInvoiceTotals อยู่หลัง billedByQuote (test-scoped-loads ตัดโค้ดถึง 'export function billedByQuote')", () => {
  assert.ok(API.indexOf("export function billedByQuote") < API.indexOf("export function listInvoiceTotals"));
});
const loadInv = between(API, "async function _loadInvoices(", "\nexport function billedByQuote");
check("_loadInvoices อ่าน since ด้วย _sinceOf และกรองหัวใบด้วย _orSince(issue_date, created_at)", () => {
  assert.ok(loadInv.includes("const since = _sinceOf(opts)"));
  assert.ok(loadInv.includes('_orSince(_onlyNos(supabase.from("invoices")'), "ต้องครอบ query หัวใบด้วย _orSince");
  assert.ok(loadInv.includes('["issue_date", "created_at"], since)'));
});
check("since → รอหัวใบก่อน แล้วกรองตารางลูกตามใบที่ได้จริง (ผ่าน _capNos กัน URL ยาว)", () => {
  assert.ok(loadInv.includes("const scoped = !!(nos || since)"));
  assert.ok(loadInv.includes("const iv = scoped ? await ivP"));
  assert.ok(loadInv.includes('const ivNos = nos || (since ? _capNos(_idsOf(iv.data, "invoice_no")) : null)'));
  assert.ok(loadInv.includes("const cScope = scoped ? _capNos(cids) : null"));
  assert.ok(loadInv.includes('"invoice_no", ivNos)'), "ใบเสร็จต้องกรองด้วย ivNos");
  assert.ok(loadInv.includes('(ivNos ? q.overlaps("invoice_nos", ivNos) : q)'), "ใบวางบิลต้องกรองด้วย ivNos");
  assert.ok(loadInv.includes("_creators(scoped ?"), "ผู้สร้างต้องกรองเมื่อ scoped");
  assert.ok(!/nos && cids|nos && sids/.test(loadInv), "ยังเหลือการกรองแบบเก่าที่ดูแค่ nos");
});

console.log("\nInvoices.jsx — ใช้ totals สำหรับสิ่งที่ต้องนับจากทุกใบ:");
check("import listInvoiceTotals และมี state totals / loadedSince / loadSeq", () => {
  assert.ok(/import \{[^}]*\blistInvoiceTotals\b[^}]*\} from "\.\.\/lib\/api"/.test(INV));
  assert.ok(INV.includes("const [totals, setTotals] = React.useState([])"));
  assert.ok(INV.includes("const [loadedSince, setLoadedSince] = React.useState(undefined)"));
  assert.ok(INV.includes("const loadSeq = React.useRef(0)"));
});
const load = between(INV, "async function load(sinceArg)", "\n  }");
check("load(): ส่ง since ให้ listInvoices เฉพาะเมื่อมี · ดึง listInvoiceTotals คู่กัน · ปุ่มลองใหม่ (ส่ง event) ใช้ช่วงปัจจุบัน", () => {
  assert.ok(load.includes('const since = typeof sinceArg === "string" ? sinceArg : (dateR.from || "")'));
  assert.ok(load.includes("listInvoices(since ? { since } : {})"));
  assert.ok(load.includes("listInvoiceTotals()"));
  assert.ok(load.includes("setTotals(tot)") && load.includes("setLoadedSince(since)"));
});
check("load(): กันผลรอบเก่าทับรอบใหม่ (เปลี่ยนช่วงระหว่างโหลด) ทั้งทาง success และ error", () => {
  assert.ok(load.includes("const my = ++loadSeq.current"));
  assert.equal((load.match(/if \(my !== loadSeq\.current\) return;/g) || []).length, 2, "ต้องเช็กทั้งใน try และ catch");
  assert.ok(load.includes("if (my === loadSeq.current) setLoading(false)"));
});
check("effect โหลดใหม่เมื่อช่วงเก่ากว่าที่โหลดไว้ หรือขอดูทั้งหมด — และไม่มี effect โหลดตอน mount ซ้ำอีกตัว", () => {
  assert.ok(INV.includes('const needFrom = dateR.from || ""'));
  assert.ok(INV.includes("if (loadedSince === undefined || (loadedSince && (!needFrom || needFrom < loadedSince))) load(needFrom);"));
  assert.ok(INV.includes("}, [needFrom]);"));
  assert.ok(!INV.includes("React.useEffect(() => { load(); }, []);"), "effect เดิมตอน mount ต้องถูกแทนที่ ไม่งั้นโหลด 2 รอบ");
});
check("ยอดวางบิลสะสม (billed) นับจาก totals ไม่ใช่ list", () => {
  assert.ok(INV.includes("const billed = React.useMemo(() => billedByQuote(totals), [totals])"));
  assert.ok(!INV.includes("billedByQuote(list)"));
});
check("ใบเสนอที่ออกใบแล้ว (งานฟรีออกได้ใบเดียว) นับจาก totals", () => {
  assert.ok(INV.includes("const invoicedQuotes = React.useMemo(() => new Set((totals || [])"));
});
check("เลขงวด (installment) นับจาก totals", () => {
  assert.ok(INV.includes("const installment = totals.filter((x) => x.quote_no === selQ.quote_no"));
  assert.ok(!INV.includes("const installment = list.filter("));
});
check("จำนวนใบที่ซ่อนนอกช่วง (dateHidden) และจำนวนใบบนหัวหน้า นับจาก totals", () => {
  assert.ok(INV.includes("const dateHidden = React.useMemo(() => (totals || []).filter((x) => !inDateRange(x.issue_date, dateR)).length, [totals, dateR])"));
  assert.ok(INV.includes("{totals.length} ใบ ·"));
  assert.ok(INV.includes('{totals.length === 0 ? "ยังไม่มีใบส่งของ/ใบแจ้งหนี้"'));
});
check("เปิดเจาะจงใบจากลิงก์ (focus) ยังล้างช่วงวันที่ → needFrom ว่าง → โหลดทุกใบ ใบเก่าไม่ขึ้นว่าไม่พบ", () => {
  assert.ok(INV.includes('if (focus) { setEd(null); setDateR({ from: "", to: "" });'));
});
check("หน้าอื่นที่โหลดใบแจ้งหนี้เต็มยังเรียก listInvoices() แบบไม่มี since (ไม่กระทบ ใบเสร็จ/ลูกหนี้/รายงาน)", () => {
  for (const f of ["Receipts.jsx", "Receivables.jsx", "BillingNotes.jsx", "ExecReports.jsx"]) {
    const s = norm(fs.readFileSync("src/components/" + f, "utf8"));
    assert.ok(s.includes("listInvoices()"), f + " ต้องยังเรียก listInvoices() เต็ม");
  }
});

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
if (fail) process.exit(1);
