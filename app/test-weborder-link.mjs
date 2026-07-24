// การ์ดคำสั่งซื้อจากเว็บ ต้องบอกได้ว่า "ผูกกับลูกค้าคนไหน" ไม่ใช่แค่ "ผูกแล้ว"
//
// เจ้าของแจ้ง (2026-07-24): สร้างลูกค้าจากการ์ดแล้วอยากมีสถานะเชื่อมลูกค้า จะได้เช็กว่าติดต่อไปแล้ว
// ของเดิม: ป้ายเขียนแค่ "✓ ผูกลูกค้าแล้ว" ไม่บอกชื่อ · ผูกได้ทางเดียวคือกด "สร้างลูกค้าจากใบนี้"
//   ⇒ ลูกค้ารายเดิมที่ส่งฟอร์มซ้ำหลายรอบ (เช่นเบอร์เดียวกัน 2 ใบ) จะถูกสร้างเป็นลูกค้าใหม่ทุกใบ
//   ⇒ ผูกผิดรายแล้วแก้ไม่ได้เลย
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const wo = strip(fs.readFileSync("src/components/WebOrders.jsx", "utf8"));
const api = fs.readFileSync("src/lib/api.js", "utf8");

console.log("\nคำสั่งซื้อจากเว็บ — สถานะเชื่อมลูกค้า:");

// ---------- ชั้นข้อมูล: ต้องส่งชื่อลูกค้ามาด้วย ----------
const lw = api.slice(api.indexOf("export async function listWebOrders"), api.indexOf("export async function listCustomersLite"));
check("listWebOrders คืนชื่อลูกค้าที่ผูกไว้ (customerName)", /customerName: o\.customer_id \?/.test(lw),
  "ไม่มีชื่อ = การ์ดบอกได้แค่ 'ผูกแล้ว' เช็กไม่ได้ว่าผูกกับใคร");
check("ดึงชื่อลูกค้าแบบซอยทีละก้อน (กัน .in() ยาวเกิน)", /for \(let i = 0; i < ids\.length; i \+= 300\)/.test(lw),
  "ยิง .in() ทีเดียวด้วย id เป็นพัน = ชื่อหายเงียบบางใบ");

// ---------- เขียนแล้วต้องรู้ว่าเขียนติดจริง ----------
const sw = api.slice(api.indexOf("export async function setWebOrderCustomer"), api.indexOf("export async function setWebOrderBoq"));
check("setWebOrderCustomer เช็กว่ามีแถวเปลี่ยนจริง", /\.select\("id"\)/.test(sw) && /if \(!data\?\.length\) throw/.test(sw),
  "RLS ปฏิเสธ update คืน 0 แถวไม่ใช่ error → การ์ดขึ้นว่าผูกแล้ว พอรีเฟรชป้ายหายเฉย ๆ");
check("setWebOrderCustomer รับ null ได้ (ไว้เลิกผูก)", /customer_id: customerId \?\? null/.test(sw),
  "supabase-js ตัดคีย์ที่เป็น undefined ทิ้ง — ต้องแปลงเป็น null ไม่งั้นเลิกผูกไม่ติดแบบเงียบ ๆ");

// ---------- การ์ด ----------
check("การ์ดแสดงชื่อลูกค้า + รหัสที่ผูกไว้", /ผูกลูกค้าแล้ว · \{o\.customerName/.test(wo) && /custCode\(o\.customer_id\)/.test(wo));
check("ผูกไว้แต่หาชื่อไม่เจอ บอกตรง ๆ ว่าลูกค้าถูกลบ", /ลูกค้าถูกลบไปแล้ว/.test(wo),
  "ปล่อยว่าง = คนอ่านนึกว่าระบบเพี้ยน");
check("มีปุ่มผูกกับลูกค้าที่มีอยู่แล้ว", /ผูกลูกค้าที่มีอยู่/.test(wo) && /setPick\(\{ order: o/.test(wo),
  "มีแต่ปุ่มสร้างใหม่ = ลูกค้าเดิมที่ส่งฟอร์มซ้ำจะถูกสร้างซ้ำทุกใบ");
check("มีปุ่มเลิกผูกบนการ์ด (ผูกผิดราย)", /onClick=\{\(\) => unlink\(o\)\}>✕ เลิกผูก<\/button>/.test(wo) && /await link\(o, null\)/.test(wo),
  "ผูกผิดแล้วแก้ไม่ได้ = ต้องไปแก้ในฐานข้อมูลเอง");
check("เลิกผูกต้องยืนยันก่อน", /confirmDialog\(`ยกเลิกการผูกลูกค้าของใบนี้/.test(wo));

// ---------- ตัวเตือนเบอร์ซ้ำ ----------
check("เตือนเมื่อเบอร์ในใบตรงกับลูกค้าที่มีอยู่",
  /\{byPhone\[phoneKey\(o\.phone\)\] && \(/.test(wo) && /เบอร์นี้มีลูกค้าแล้ว/.test(wo)
  && /onClick=\{\(\) => link\(o, byPhone\[phoneKey\(o\.phone\)\]\.id/.test(wo),
  "เคสจริง: ลูกค้าคนเดียวส่งฟอร์มเข้ามา 2 ใบ กดสร้างทั้งคู่ = ลูกค้าซ้ำ ประวัติงาน/ยอดค้างรับแตกกัน");
check("เทียบเบอร์ด้วย 9 ตัวท้าย (รองรับ 66/ขีดคั่น)", /const phoneKey = .*slice\(-9\)/.test(wo),
  "เทียบสตริงตรง ๆ = 081-234-5678 กับ 0812345678 ไม่ตรงกัน ตัวเตือนไม่ทำงาน");

// ---------- ไม่รายงานสำเร็จปลอมตอนฟอร์มคืนค่าว่าง ----------
check("ฟอร์มคืนรหัสว่าง → ไม่ขึ้นว่าผูกสำเร็จ", /if \(!cid\) return flash\(/.test(wo),
  "เดิมจะยิง setWebOrderCustomer ด้วยค่าว่าง แล้วขึ้น 'ผูกแล้ว ✓' ทั้งที่ไม่ได้ผูก");
check("ผูกเสร็จแล้วดึงชื่อจริงมาแสดง (ไม่เดาจากชื่อในใบ)", /await load\(\);/.test(wo.slice(wo.indexOf("async function onCustSaved"))),
  "ชื่อในฟอร์มลูกค้าแก้ได้ ใช้ชื่อที่ลูกค้ากรอกมาในเว็บ = การ์ดโชว์ชื่อผิด");

// ---------- รายชื่อลูกค้าที่โหลดมาต้องไม่ทำหน้าพัง ----------
check("โหลดรายชื่อลูกค้าล้มแล้วหน้ายังใช้ได้", /listCustomersLite\(\)\.then\(setCusts\)\.catch\(\(\) => setCusts\(\[\]\)\)/.test(wo),
  "ไม่ catch = หน้าขาวทั้งหน้าเพราะตัวช่วยเตือนซ้ำ");
check("listCustomersLite กันเพดาน 1000 แถวทั้ง 3 ตาราง",
  (api.slice(api.indexOf("export async function listCustomersLite"), api.indexOf("export async function setWebOrderCustomer")).match(/_fetchAll/g) || []).length === 3,
  "ฐานลูกค้าเกินพันแล้วตัวเตือนซ้ำจะมองไม่เห็นลูกค้าเก่า");

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
