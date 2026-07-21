// กันย้อนกลับของ 4 บั๊กที่งานกวาดทั้งระบบเจอว่าเป็น regression จากงานวันเดียวกัน
// (ทั้งหมดผ่าน build + เทสต์เดิม เพราะไม่มีอะไรเปิดหน้า/ส่งเอกสาร/ยิงฟอร์มจริง)
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (f) => fs.readFileSync(f, "utf8");
const api = read("src/lib/api.js");

console.log("\nกันย้อนกลับ 4 regression ที่งานกวาดเจอ:");

// ---------- 1) created_by ต้องไม่ถูก upsert ทับตอนแก้ใบเดิม (ทั้ง job order / ใบเสนอ / BOQ) ----------
// ON CONFLICT DO UPDATE เขียนทุกคอลัมน์ที่ส่ง — ส่ง created_by ไป = คนแก้ล่าสุดแย่งเครดิตคนสร้าง
// เดิม cb77341 แก้เฉพาะ job order แล้วเขียน commit ราวกับทั้งระบบตรงกันแล้ว — ที่จริงใบเสนอ/BOQ ยังพัง
const slice = (from, to) => api.slice(api.indexOf(from), api.indexOf(to, api.indexOf(from) + 5));
const jobFn = slice("export async function saveJobOrder", "export async function");
const quoteFn = slice("export async function saveQuotation", "export async function");
const boqFn = slice("export async function saveBoq", "export async function");
check("saveJobOrder ตัด created_by ตอนแก้ใบเดิม", /delete jHead\.created_by/.test(jobFn));
check("saveQuotation ตัด created_by ตอนแก้ใบเดิม", /if \(cur\) delete head\.created_by/.test(quoteFn),
  "ไม่ตัด = แก้ใบเสนอครั้งเดียว 'ผู้ขาย' เปลี่ยนเป็นคนแก้ รายงานยอดขายรายคนเพี้ยน");
check("saveBoq ตัด created_by ตอนแก้ใบเดิม", /if \(curBoq\) delete bHead\.created_by/.test(boqFn),
  "ไม่ตัด = แก้ BOQ ครั้งเดียว 'ผู้ทำ' เปลี่ยนเป็นคนแก้");

// ---------- 2) เตรียมวัสดุจากใบงาน ต้องเก็บหน่วยของบรรทัดใบเสนอ (สินค้า 2 หน่วย) ----------
const mp = read("src/components/MaterialPrep.jsx");
const prefill = mp.slice(mp.indexOf("let items = prefill.items;"), mp.indexOf("onPrefillConsumed && onPrefillConsumed();"));
check("เตรียมวัสดุจากใบงาน: เก็บ unit ของบรรทัดใบเสนอ", /getQuoteItems[\s\S]{0,200}unit: it\.unit/.test(prefill),
  "ทิ้ง unit = สินค้า 2 หน่วยสั่ง/เบิกน้อยกว่าจริง 100 เท่า");
check("เตรียมวัสดุจากใบงาน: ส่ง unit เข้า smartSplit", /smartSplit\(m, Number\(p\.qty\) \|\| 1, u\)/.test(prefill),
  "ไม่ส่งหน่วยเข้า = แบ่งซื้อ/เบิกเทียบสต๊อกหน่วยหลักด้วย factor 1");

// ---------- 3) สำเนาเอกสารที่ส่งลูกค้าทางแชต (DocCapture) ต้องมีหมายเหตุลูกค้าเห็น เท่ากับที่พิมพ์ ----------
const dc = read("src/components/DocCapture.jsx");
const fnBody = (name) => dc.slice(dc.indexOf("function " + name), dc.indexOf("\n}", dc.indexOf("function " + name)));
check("DocCapture quoteSlip ส่ง terms (หมายเหตุ)", /terms=\{q\.note/.test(fnBody("quoteSlip")),
  "ตกไป = ลูกค้าได้สำเนาที่ไม่มีหมายเหตุ ต่างจากที่พิมพ์");
check("DocCapture invoiceSlip ส่ง terms", /terms=\{x\.note/.test(fnBody("invoiceSlip")));
check("DocCapture receiptSlip ส่ง terms", /terms=\{x\.note/.test(fnBody("receiptSlip")));

// ---------- 4) throttle เว็บหน้าร้าน: ต้องนับเวลาหลัง insert สำเร็จ ไม่ใช่ก่อน ----------
const web = read("../company-website/index.html");
const tooSoonFn = web.slice(web.indexOf("const tooSoon ="), web.indexOf("const stampSend ="));
check("tooSoon() อ่านอย่างเดียว ไม่ stamp", !/setItem/.test(tooSoonFn),
  "stamp ใน tooSoon = ส่งล้มเหลวแล้วนับว่าส่งแล้ว ลูกค้ากดใหม่ขึ้น 'ได้รับแล้ว' ทั้งที่ไม่มีในระบบ");
check("มี stampSend แยกต่างหาก", /const stampSend = \(\) =>/.test(web));
// ต้อง stamp เฉพาะหลัง 'if (error) throw error' (คือหลัง insert สำเร็จ) ทั้ง 2 ฟอร์ม
const stampAfterInsert = [...web.matchAll(/if \(error\) throw error;\s*\n\s*stampSend\(\);/g)].length;
check("stamp เฉพาะหลัง insert สำเร็จ (ทั้งฟอร์มสั่งซื้อ + ฟอร์มติดต่อ)", stampAfterInsert === 2,
  `เจอ ${stampAfterInsert} จุด · ต้องได้ 2 (ทั้ง submitOrder และ submitLead)`);

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
