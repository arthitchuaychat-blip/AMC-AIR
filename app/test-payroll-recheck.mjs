// 3 บั๊กเงินเดือนที่งานกวาดเจอ — ทั้งหมดกระทบเงินพนักงานโดยตรง
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const hr = fs.readFileSync("src/components/HR.jsx", "utf8");
const at = fs.readFileSync("src/components/Attendance.jsx", "utf8");
const pd = fs.readFileSync("src/components/PayDetail.jsx", "utf8");
const pr = fs.readFileSync("src/lib/payroll.js", "utf8");

console.log("\nเงินเดือน (3 จุดจากงานกวาด):");

// ---------- #4 OT: สลิปต้องโชว์ชั่วโมง OT = ที่จ่ายจริง (ปัดครึ่ง ชม.) ----------
// เก็บ ot_min ที่จ่ายจริง แล้ว frozenPayslip อ่านกลับ ต้องได้ ชม.เดียวกับที่คิดเงิน
const stored = hr.split("\n").find((l) => l.includes("ot_min:") && l.includes("Math.round")) || "";
check("เก็บ ot_min ที่จ่ายจริง (c.otHours×60) ไม่ใช่นาทีดิบ", /ot_min: Math\.round\(\(c\.otHours \|\| 0\) \* 60\)/.test(stored),
  "เก็บนาทีดิบ = สลิปโชว์ชั่วโมงมากกว่าที่จ่าย ชม.×เรต ไม่เท่ายอดที่จ่าย");
// รันสูตร frozenPayslip จริง: จ่าย 2.5 ชม. (เรต 60 = 150) → ot_min เก็บ 150 → อ่านกลับต้องได้ 2.5 ชม. ไม่ใช่ 3.33
const i = pr.indexOf("export function frozenPayslip(s) {");
const body = pr.slice(i).replace("export function frozenPayslip(s) {", "").trimEnd().replace(/\}$/, "");
const frozen = new Function("s", body);
const otHours = 2.5, otRate = 60, otPay = Math.round(otHours * otRate); // 150
const storedMin = Math.round(otHours * 60); // สูตรใหม่: 150
const f = frozen({ ot_min: storedMin, ot_pay: otPay, base: 0, net: 0 });
check("frozenPayslip: ชม.OT ที่อ่านกลับ = ที่จ่ายจริง", Math.abs(f.otHours - 2.5) < 0.001,
  `ได้ ${f.otHours} ชม. — ${f.otHours}×${otRate}=${(f.otHours*otRate).toFixed(0)} ต้องเท่า otPay ${otPay}`);
check("frozenPayslip: ชม.×เรต = ยอดที่จ่าย (บวกลง)", Math.abs(f.otHours * otRate - otPay) < 0.01);

// ---------- #6 โควตาลารายคน ต้องใช้ตอนคิดหักลาเกิน ----------
check("HR: ดึงโควตารายคน (getLeaveQuotas) ในรอบเงินเดือน", /getLeaveQuotas\(ym\.slice\(0, 4\)\)/.test(hr));
check("HR: หักลาเกินใช้โควตารายคนก่อน default", /qOver\[p\.id\]\?\.\[t\] \?\? quota\[t\]/.test(hr),
  "ใช้แต่ default = จอบอกเหลือ 2 วันแต่หักเงินเหมือนเกินโควตา");
check("Attendance: เงินเดือนของฉันดึงโควตารายคนปีนั้น", /getMyLeaveQuota\(Number\(payYm\.slice\(0, 4\)\)\)/.test(at));
check("Attendance: หักลาเกินใช้โควตารายคนก่อน default", /myQ\?\.\[t\] \?\? q0\[t\]/.test(at));

// ---------- #5 PayDetail ต้องมีบรรทัดภาษีหัก ณ ที่จ่าย ----------
check("PayDetail: มีบรรทัดภาษีหัก ณ ที่จ่าย (ยอดย่อยบวกได้ยอดรวม)", /amount=\{c\.dTax\}/.test(pd) && /ภ\.ง\.ด\.1/.test(pd),
  "ยอดรวมหักมีภาษีแต่ไม่โชว์บรรทัด = พนักงานเห็นเงินหายไปโดยไม่มีคำอธิบาย");

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
