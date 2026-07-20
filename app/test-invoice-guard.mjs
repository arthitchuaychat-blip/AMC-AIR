// การ์ดกันวางบิลเกินยอดใบเสนอราคา (saveInvoice) ต้อง "ปิดสนิท" — อ่านข้อมูลไม่สำเร็จต้องหยุด ไม่ใช่ปล่อยผ่าน
//
// ของเดิม: _quoteGrand คืน null ทั้งตอน "ไม่พบใบ" และตอน "อ่านไม่สำเร็จ" แล้ว saveInvoice เขียน `if (qg) {...}`
// → เน็ตสะดุด/RLS ปฏิเสธ = การ์ดถูกข้ามเงียบ ๆ วางบิลทะลุ 100% ของใบเสนอได้โดยไม่มีอะไรเตือน
// แถมมีคอมเมนต์เขียนกำกับว่า "fail-closed ... คืน null เฉพาะกรณีไม่พบใบจริง ๆ" ซึ่งไม่จริง
// (บทเรียนซ้ำรอยเดิม: คอมเมนต์/ข้อความ commit ที่อ้างว่าปลอดภัย ไม่ใช่หลักฐานว่าปลอดภัย)
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const api = fs.readFileSync("src/lib/api.js", "utf8");

console.log("\nการ์ดกันวางบิลเกินยอดใบเสนอราคา:");

// ดึงโค้ดจริง: _quoteGrand + ส่วนหัวของ saveInvoice ที่เป็นตัวการ์ด
const src = api.slice(api.indexOf("async function _quoteGrand"), api.indexOf("const { error } = await supabase.from(\"invoices\").upsert("))
  .replace("export async function saveInvoice", "async function saveInvoice") + "\n  return \"ผ่านการ์ด\";\n}";

// supabase ปลอม: คุมได้ว่าแต่ละตารางจะตอบอะไร
const mk = (resp) => ({
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: (table) => {
    const r = resp[table];
    const o = {
      select: () => o, eq: () => o, neq: () => o,
      maybeSingle: () => Promise.resolve(r),
      then: (res) => Promise.resolve(r).then(res),
    };
    return o;
  },
});
const run = (resp, inv) => {
  const fn = new Function("supabase", src + "\n return saveInvoice;")(mk(resp));
  return fn(inv);
};
const QUOTE_OK = { data: { discount_type: "amount", discount_value: 0, vat: false, pay_method: "cash", status: "approved" }, error: null };
const ITEMS_100 = { data: [{ qty: 1, unit_price: 100, discount: 0 }], error: null };
const INV = { invoice_no: "INV-2", quote_no: "QT-1", total: 50 };

// 1) อ่านใบเสนอไม่สำเร็จ (RLS/เน็ต) → ต้องหยุด
await run({ quotations: { data: null, error: { message: "permission denied" } } }, INV)
  .then((r) => check("อ่านใบเสนอไม่สำเร็จ → หยุด", false, `ผ่านการ์ดไปได้ (${r}) = วางบิลทะลุ 100% ได้ตอนเน็ตสะดุด`))
  .catch((e) => check("อ่านใบเสนอไม่สำเร็จ → หยุด", /permission denied/.test(e.message || ""), e.message));

// 2) อ่านรายการในใบเสนอไม่สำเร็จ → ต้องหยุด
await run({ quotations: QUOTE_OK, quotation_items: { data: null, error: { message: "items read failed" } } }, INV)
  .then((r) => check("อ่านรายการในใบเสนอไม่สำเร็จ → หยุด", false, `ผ่านการ์ดไปได้ (${r})`))
  .catch((e) => check("อ่านรายการในใบเสนอไม่สำเร็จ → หยุด", /items read failed/.test(e.message || ""), e.message));

// 3) ไม่พบใบเสนอเลขนั้น → ต้องหยุด (ใบแจ้งหนี้อ้างใบที่ไม่มีอยู่ ไม่มีอะไรให้เทียบยอด)
await run({ quotations: { data: null, error: null } }, INV)
  .then((r) => check("ไม่พบใบเสนอราคา → หยุด", false, `ผ่านการ์ดไปได้ (${r})`))
  .catch((e) => check("ไม่พบใบเสนอราคา → หยุด", /ไม่พบใบเสนอราคา/.test(e.message), e.message));

// 4) ใบเสนอยังไม่อนุมัติ → หยุด
await run({ quotations: { data: { ...QUOTE_OK.data, status: "draft" }, error: null }, quotation_items: ITEMS_100 }, INV)
  .then(() => check("ใบเสนอยังไม่อนุมัติ → หยุด", false))
  .catch((e) => check("ใบเสนอยังไม่อนุมัติ → หยุด", /อนุมัติ/.test(e.message), e.message));

// 5) วางบิลรวมเกินยอด → หยุด (ยอดใบเสนอ 100 · วางไปแล้ว 80 · งวดนี้ 50)
await run({ quotations: QUOTE_OK, quotation_items: ITEMS_100, invoices: { data: [{ invoice_no: "INV-1", total: 80, status: "unpaid" }], error: null } }, INV)
  .then(() => check("วางบิลรวมเกินยอดใบเสนอ → หยุด", false, "ปล่อยผ่าน = วางบิลเกิน 100%"))
  .catch((e) => check("วางบิลรวมเกินยอดใบเสนอ → หยุด", /เกินยอดใบเสนอราคา/.test(e.message), e.message));

// 6) ใบที่ยกเลิกแล้วไม่นับเข้ายอดสะสม (วางไปแล้ว 80 แต่ยกเลิก → งวดนี้ 50 ต้องผ่าน)
await run({ quotations: QUOTE_OK, quotation_items: ITEMS_100, invoices: { data: [{ invoice_no: "INV-1", total: 80, status: "cancelled" }], error: null } }, INV)
  .then((r) => check("ใบที่ยกเลิกแล้วไม่นับเข้ายอดสะสม", r === "ผ่านการ์ด"))
  .catch((e) => check("ใบที่ยกเลิกแล้วไม่นับเข้ายอดสะสม", false, "ถูกบล็อกทั้งที่ควรผ่าน: " + e.message));

// 7) ยอดพอดี ต้องผ่าน (ไม่ใช่บล็อกเพราะปัดเศษ)
await run({ quotations: QUOTE_OK, quotation_items: ITEMS_100, invoices: { data: [{ invoice_no: "INV-1", total: 50, status: "unpaid" }], error: null } }, INV)
  .then((r) => check("ยอดรวมพอดี 100% ต้องผ่าน", r === "ผ่านการ์ด"))
  .catch((e) => check("ยอดรวมพอดี 100% ต้องผ่าน", false, e.message));

// 8) คอมเมนต์ต้องไม่โกหกอีก
check("ไม่มีคอมเมนต์อ้างว่า _quoteGrand คืน null เฉพาะตอนไม่พบใบ",
  !/คืน null เฉพาะกรณีไม่พบใบ/.test(api),
  "คอมเมนต์แบบนั้นเคยเขียนไว้ทั้งที่โค้ดคืน null ตอนอ่านพลาดด้วย");

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
