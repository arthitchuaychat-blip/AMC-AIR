// สินค้า 2 หน่วย (ซื้อเป็นม้วน · สต๊อกเป็นเมตร · 1 ม้วน = purchase_qty เมตร)
// กฎบ้าน: transactions.qty / transactions.unit_cost / materials.cost เก็บเป็น "หน่วยหลัก" เสมอ
//          ส่วนบรรทัดบนใบสั่งซื้อถือ "หน่วยของบรรทัด" ซึ่งอาจเป็นหน่วยซื้อ
// เอาสองอย่างนี้มาบวก/ลบ/เขียนทับกันโดยไม่แปลงหน่วยก่อน = เลขเพี้ยนเป็นเท่าตัวแบบเงียบ ๆ
//
// เกิดจริง 2 จุด:
//   · repriceReceivedPo เขียน price ต่อม้วนลงช่อง unit_cost ต่อเมตร → ต้นทุนพอง 100 เท่า
//     แล้วลามเข้าต้นทุนงาน + ราคาทุนตั้งต้นของ BOQ/ใบเสนอทุกใบถัดไป
//   · prefill รับของเอา "สั่ง (ม้วน)" ลบ "รับแล้ว (เมตร)" → 3 − 100 = 0 บรรทัดหายจากตะกร้า
//     ถ้าหายหมดจะเด้งไปเติมเต็มใบ = กดยืนยันแล้วของเข้าซ้ำทั้งใบ
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const api = fs.readFileSync("src/lib/api.js", "utf8");
const mv = fs.readFileSync("src/components/Movements.jsx", "utf8");
const app = fs.readFileSync("src/App.jsx", "utf8");

console.log("\nสินค้า 2 หน่วย — ห้ามเอาหน่วยซื้อไปปนหน่วยหลัก:");

// ---------- 1) ยอดคงค้างตอนรับของ — รันโค้ดจริงจาก Movements.jsx ----------
const i = mv.indexOf("const gotBase = prefill.receivedQty");
const body = mv.slice(i, mv.indexOf(".filter((l) => l.qty > 0.0001);", i) + ".filter((l) => l.qty > 0.0001);".length);
const fn = new Function("prefill", "matMap", body + "\n return mapped;");

// ท่อทองแดง: สต๊อกเป็นเมตร · ซื้อเป็นม้วน · 1 ม้วน = 100 เมตร
const matMap = { CU15: { unit: "เมตร", purchaseUnit: "ม้วน", purchaseQty: 100, cost: 15 } };
// สั่ง 3 ม้วน (=300 เมตร) รับไปแล้ว 100 เมตร → ต้องเหลือ 200 เมตร
const r1 = fn({ poNo: "PO-1", items: [{ code: "CU15", qty: 3, unit: "ม้วน", price: 1500 }], receivedQty: { CU15: 100 } }, matMap);
check("สั่ง 3 ม้วน รับแล้ว 100 เมตร → คงค้าง 200 เมตร",
  r1.length === 1 && Math.abs(r1[0].qty - 200) < 0.001,
  `ได้ ${r1.length ? r1[0].qty : "(บรรทัดหาย)"} — ถ้าลบก่อนแปลงหน่วยจะได้ 3−100 → 0 แล้วบรรทัดหายทั้งบรรทัด`);
check("ราคาถูกแปลงเป็นต่อหน่วยหลัก (1500฿/ม้วน → 15฿/เมตร)",
  r1.length === 1 && Math.abs(r1[0].price - 15) < 0.001, `ได้ ${r1.length ? r1[0].price : "-"}`);

// รับครบแล้ว → ต้องได้ตะกร้าว่าง ไม่ใช่เติมเต็มใบ
const r2 = fn({ poNo: "PO-1", items: [{ code: "CU15", qty: 3, unit: "ม้วน", price: 1500 }], receivedQty: { CU15: 300 } }, matMap);
check("รับครบ 300 เมตรแล้ว → ตะกร้าว่าง (ไม่เติมเต็มใบให้รับซ้ำ)", r2.length === 0,
  `ได้ ${r2.length} บรรทัด — เติมเต็มใบเมื่อรับครบแล้ว = กดยืนยันแล้วของเข้าซ้ำทั้งใบ`);

// สินค้าหน่วยเดียวต้องไม่กระทบ
const r3 = fn({ poNo: "PO-2", items: [{ code: "X", qty: 10, unit: "ชิ้น", price: 50 }], receivedQty: { X: 4 } }, { X: { unit: "ชิ้น", cost: 50 } });
check("สินค้าหน่วยเดียว: สั่ง 10 รับแล้ว 4 → คงค้าง 6", r3.length === 1 && Math.abs(r3[0].qty - 6) < 0.001,
  `ได้ ${r3.length ? r3[0].qty : "(หาย)"}`);

// ---------- 2) App.jsx ต้องไม่หักยอดเอง (ไม่มีตารางสินค้า จึงแปลงหน่วยไม่ได้) ----------
// ⚠️ ต้องหา go("movements") ที่อยู่ "หลัง" onReceive — MyJobs ก็เรียกอันนี้และอยู่ก่อนหน้า สไลซ์จะได้สตริงว่าง
const oStart = app.indexOf("onReceive={async (po) =>");
const onRecv = app.slice(oStart, app.indexOf("go(\"movements\");", oStart));
if (!onRecv) { console.log("  ✗ หา onReceive ใน App.jsx ไม่เจอ"); process.exit(1); }
check("App.jsx ส่งยอดสั่งดิบ ๆ ไม่หัก got เอง",
  !/Number\(it\.qty\)[^\n]*-[^\n]*got\[/.test(onRecv),
  "App.jsx ไม่มีตารางสินค้า จึงไม่รู้ factor — หักตรงนั้นคือเอาม้วนลบเมตร");
check("App.jsx ส่ง receivedQty ไปให้หน้ารับของหักเอง", /receivedQty: got/.test(onRecv));

// ---------- 3) repriceReceivedPo ต้องหารด้วย factor ก่อนเขียนต้นทุน ----------
const rp = api.slice(api.indexOf("export async function repriceReceivedPo"), api.indexOf("export async function", api.indexOf("export async function repriceReceivedPo") + 10));
check("repriceReceivedPo หารด้วย factor ก่อนเขียน unit_cost", /factorOf\(it\)/.test(rp) && /priceOf\[it\.code\]\s*=.*\/\s*factorOf/.test(rp),
  "เขียน it.price ตรง ๆ = ราคาต่อม้วนไปนั่งในช่องต่อเมตร ต้นทุนพองเท่ากับ purchase_qty");
check("repriceReceivedPo อ่าน purchase_unit/purchase_qty มาใช้จริง", /purchase_unit,purchase_qty/.test(rp));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
