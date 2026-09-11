// หัก ณ ที่จ่าย หักได้เฉพาะลูกค้า "นิติบุคคล" — บุคคลธรรมดาห้ามหัก
// ใบแจ้งหนี้/ใบเสร็จอ่านประเภทลูกค้า "สด" จากฐานข้อมูลอยู่แล้ว แต่ใบเสนอราคาเชื่อธง wht ที่บันทึกไว้ในใบ
//
// เกิดจริง: ออกใบเสนอตอนลูกค้าเป็นนิติบุคคล → ภายหลังแก้ประเภทลูกค้าเป็นบุคคลธรรมดา
// ใบเสนอใบเดิมยังพิมพ์ "หัก ณ ที่จ่าย 3%" กับ "ยอดชำระสุทธิ" ที่ต่ำกว่าจริงต่อไป
// แต่พอออกใบแจ้งหนี้จริง ระบบไม่หักให้ (เพราะอ่านประเภทสด) → ยอดที่เสนอกับยอดที่เรียกเก็บไม่ตรงกัน
//
// ⚠️ ห้ามเขียนทับฟิลด์ wht ในแถวที่ listQuotations คืนออกไป — ฟอร์มแก้ใบอ่านค่านั้นเข้าไปแล้วบันทึกกลับ
//    จะกลายเป็นแก้ค่าในฐานข้อมูลเงียบ ๆ ตอนคนแค่เปิดใบเก่ามาบันทึก จึงต้องเพิ่มฟิลด์ใหม่ whtOn แทน
import fs from "node:fs";
import { calculateSalesWht } from "./src/lib/salesWht.js";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const api = fs.readFileSync("src/lib/api.js", "utf8");

console.log("\nหัก ณ ที่จ่ายบนใบเสนอราคา:");

// รันสูตรจริงจาก listQuotations
const line = api.split("\n").find((l) => l.includes("const whtOn = "));
check("ใช้สูตรกลางเดียวกับใบแจ้งหนี้/ใบเสร็จ", api.includes("calculateSalesWht({"));
for (const [type, enabled, expected] of [['company',true,300],['person',true,0],['company',false,0],[undefined,true,0]]) {
  const result = calculateSalesWht({items:[{kind:'service',amount:10000}],base:10000,total:10700,customerType:type,enabled,rate:3});
  check(`ประเภท ${type}, เปิด ${enabled}`, result.amount === expected);
}

check("ส่ง whtOn ออกไปให้หน้าพิมพ์ใช้", /grand, whtOn, whtAmt/.test(api),
  "ไม่ส่งออกไป หน้าพิมพ์จะยังใช้ธงดิบ แล้วโชว์ 'หัก ณ ที่จ่าย 3% − 0.00'");

// ห้ามเขียนทับ wht ในแถวที่คืนออกไป (จะทำให้ฟอร์มบันทึกกลับแล้วแก้ DB เงียบ ๆ)
const ret = api.split("\n").find((l) => l.includes("items: itemsX, subtotal, discount")) || "";
check("ไม่เขียนทับฟิลด์ wht ในแถวที่คืนออกไป", !/\bwht: whtOn\b/.test(ret) && !/\bwht: /.test(ret),
  "เขียนทับ = เปิดใบเก่ามาบันทึกแล้วค่าในฐานข้อมูลเปลี่ยนเงียบ ๆ");

// หน้าพิมพ์กับพรีวิวต้องใช้ธงที่คำนวณแล้ว ไม่ใช่ธงดิบ
for (const [th, f, v] of [["หน้าพิมพ์ใบเสนอ", "src/components/Quotation.jsx", "printQ"], ["พรีวิว/แคปเจอร์", "src/components/DocCapture.jsx", "q"]]) {
  const s = fs.readFileSync(f, "utf8");
  // เฉพาะบรรทัดที่พิมพ์ยอดของ "ใบเสนอราคา" (อ่าน whtAmt/netPay ที่ listQuotations คำนวณมา)
  // ไม่รวมสรุปยอดในฟอร์ม (ใช้ canWht ถูกอยู่แล้ว) และไม่รวมใบแจ้งหนี้/ใบเสร็จที่ใช้ wht_amt ของตัวเอง
  const lines = s.split("\n").filter((l) => new RegExp(`${v}\\.(whtAmt|netPay)\\)`).test(l));
  check(`${th}: ใช้ whtOn ไม่ใช่ธงดิบ`, lines.length > 0 && lines.every((l) => l.includes(`${v}.whtOn`)),
    lines.length === 0 ? "หาบรรทัดพิมพ์ไม่เจอ — โครงไฟล์เปลี่ยน" : "ยังใช้ธงดิบ จะโชว์บรรทัดหัก 0.00 บนใบของบุคคลธรรมดา");
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
