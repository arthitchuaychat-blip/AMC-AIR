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

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const api = fs.readFileSync("src/lib/api.js", "utf8");

console.log("\nหัก ณ ที่จ่ายบนใบเสนอราคา:");

// รันสูตรจริงจาก listQuotations
const line = api.split("\n").find((l) => l.includes("const whtOn = "));
const amt = api.split("\n").find((l) => l.includes("const whtAmt = whtOn"));
check("มีการตรวจประเภทลูกค้าก่อนหัก", !!line && /custType\[qo\.customer_id\] === "company"/.test(line),
  "ยังเชื่อธง wht ที่บันทึกไว้อย่างเดียว");

if (line && amt) {
  const calc = (wht, type) => {
    const custType = { 1: type };
    const qo = { wht, customer_id: 1, wht_rate: 3 };
    const [afterDisc, svcSum, subtotal] = [10000, 10000, 10000];
    return new Function("qo", "custType", "afterDisc", "svcSum", "subtotal",
      line + "\n" + amt + "\n return { whtOn, whtAmt };")(qo, custType, afterDisc, svcSum, subtotal);
  };
  const co = calc(true, "company");
  check("นิติบุคคล + ติ๊กหัก → หัก 3% ตามเดิม", co.whtOn === true && Math.abs(co.whtAmt - 300) < 0.005, JSON.stringify(co));
  const pe = calc(true, "person");
  check("บุคคลธรรมดา แม้ใบเก่าติ๊กหักไว้ → ไม่หัก", pe.whtOn === false && pe.whtAmt === 0, JSON.stringify(pe));
  const off = calc(false, "company");
  check("นิติบุคคลแต่ไม่ติ๊กหัก → ไม่หัก", off.whtOn === false && off.whtAmt === 0, JSON.stringify(off));
  const gone = calc(true, undefined);
  check("อ่านแถวลูกค้าไม่ได้ → ไม่หัก (เหมือนใบแจ้งหนี้)", gone.whtOn === false, JSON.stringify(gone));
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
