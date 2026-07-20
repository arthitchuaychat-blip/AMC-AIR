// รอบเงินเดือนที่จ่ายแล้ว = ประวัติ อ่านจากสลิปที่บันทึกไว้ ไม่คำนวณใหม่ (frozen)
// แต่ค่าที่ frozen() "กู้คืนไม่ได้" ห้ามใส่ 0 ตายตัวแล้วเอาไปพิมพ์เป็นยอดจริง
//
// เกิดจริง: frozen() คืน ded: 0 → สลิปพิมพ์ "รวมรายการหัก −฿0.00"
// ทั้งที่บรรทัดหักมาสาย/ขาดงาน/ลาเกิน/ประกันสังคม/ภาษี/เบิกล่วงหน้า ด้านบนมีตัวเลขจริงจากสลิปเดียวกัน
// สลิปเลยอ่านว่า "รวมรายได้ X − รวมรายการหัก 0 = สุทธิ (X ลบอะไรบางอย่าง)" ซึ่งบวกไม่ลง
// และปุ่มส่งสลิปเข้าไลน์ทำงานเฉพาะรอบที่จ่ายแล้ว = ทุกใบที่ส่งถึงมือพนักงานถือเลข 0 นี้
//
// กฎ: gross − ded ต้องเท่ากับ net เสมอสำหรับสลิปที่บันทึกครบ
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };

const hr = fs.readFileSync("src/components/HR.jsx", "utf8");
const pr = fs.readFileSync("src/lib/payroll.js", "utf8");
const i = pr.indexOf("export function frozenPayslip(s) {");
// frozenPayslip เป็นฟังก์ชันสุดท้ายของไฟล์ — ตัดถึงท้ายไฟล์ แล้วกันไว้ว่าถ้ามีใครเพิ่ม export ต่อท้าย ต้องรู้ตัว
if (pr.indexOf("export ", i + 10) !== -1) { console.log("  ✗ มี export ตัวอื่นต่อท้าย frozenPayslip — แก้วิธีตัดโค้ดในเทสต์นี้ก่อน"); process.exit(1); }
const body = pr.slice(i).replace("export function frozenPayslip(s) {", "").trimEnd().replace(/\}$/, "");
const frozen = new Function("s", body);

console.log("\nสลิปเงินเดือนรอบที่จ่ายแล้ว (frozen) — ตัวเลขต้องบวกลง:");

// สลิปตัวอย่าง: ฐาน 15,000 + OT 1,200 + วันหยุด 800 + โบนัส 500 = รายได้รวม 17,500
// หัก: สาย 150 + ขาด 500 + ลาเกิน 300 + สปส. 750 + ภาษี 200 + เบิกล่วงหน้า 1,000 + อื่น ๆ 100 = 3,000
// สุทธิ = 14,500
const slip = {
  status: "paid", pay_type: "monthly", base: 15000, ot_min: 120, ot_pay: 1200, hol_pay: 800, bonus: 500,
  d_late: 150, d_absent: 500, d_leave: 300, d_sso: 750, d_tax: 200, d_advance: 1000, other_deduct: 100,
  net: 14500,
};
const c = frozen(slip);

check("รวมรายได้ = 17,500", Math.abs(c.gross - 17500) < 0.005, `ได้ ${c.gross}`);
check("รวมรายการหัก = 3,000 (ไม่ใช่ 0)", Math.abs(c.ded - 3000) < 0.005,
  `ได้ ${c.ded} — ถ้าเป็น 0 แปลว่ากลับไปใส่เลขตายตัวอีกแล้ว สลิปจะพิมพ์ "รวมรายการหัก −฿0.00"`);
check("รายได้ − รายการหัก = ยอดสุทธิที่บันทึกไว้", Math.abs(c.gross - c.ded - c.net) < 0.005,
  `${c.gross} − ${c.ded} = ${c.gross - c.ded} แต่สลิปบันทึกสุทธิไว้ ${c.net} — เลขบนกระดาษบวกไม่ลง`);

// ค่าที่กู้คืนจากสลิปไม่ได้ ต้องไม่ถูกพิมพ์เป็นเลขจริง
check("ติดธง _frozen ไว้ให้จอซ่อนค่าที่กู้ไม่ได้", c._frozen === true);
const hidden = /c\._frozen \? "" :/.test(hr) || /c\._frozen \? "ค่าทำงานวันหยุด"/.test(hr);
check("ชั่วโมงทำงานวันหยุดไม่ถูกพิมพ์เป็น (0 ชม.) บนสลิปที่จ่ายแล้ว", hidden,
  "frozen() กู้ holNormHours/holOtHours ไม่ได้ (เป็น 0 ตายตัว) — ต้องซ่อนวงเล็บชั่วโมงเมื่อ _frozen ไม่ใช่พิมพ์ 0");

// ทั้ง 2 หน้าที่โชว์เงินเดือน ต้องใช้ frozenPayslip ตัวเดียวกัน — เดิมหน้าพนักงานคำนวณสดเสมอ
// HR แก้เวลาเข้างานย้อนหลังทีเดียว พนักงานจะเห็น "จ่ายแล้ว ยอดตามสลิป X" คู่กับสุทธิอีกตัวในโมดัลเดียวกัน
const att = fs.readFileSync("src/components/Attendance.jsx", "utf8");
check("หน้า HR ใช้ frozenPayslip", /frozenPayslip\(r\.slip\)/.test(hr));
check("หน้า เข้างาน/ลา (เงินเดือนของฉัน) ใช้ frozenPayslip เมื่อรอบจ่ายแล้ว",
  /slip\?\.status === "paid"[\s\S]{0,80}frozenPayslip\(slip\)/.test(att),
  "ยังคำนวณสดทุกครั้ง → ตัวเลขในโมดัลขัดกับยอดสลิปที่เขียนอยู่บรรทัดบน (เงินที่ไม่เคยโอนจริง)");
check("สูตร frozen อยู่ที่เดียวใน lib/payroll.js ไม่ก๊อปไว้ในคอมโพเนนต์",
  !/const frozen = \(s\) => \(\{/.test(hr) && !/const frozen = \(s\) => \(\{/.test(att),
  "มีสำเนาสูตรในคอมโพเนนต์ — เดี๋ยวสองหน้าจะคิดคนละแบบอีก");

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
