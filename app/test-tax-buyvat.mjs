// ภาษีซื้อในรายงานภาษี ต้องรับรู้ตอน "ได้รับของ" ไม่ใช่ตอน "สั่งซื้อ"
//
// เดิม: นับใบสั่งซื้อทุกใบที่ติ๊ก VAT และไม่ยกเลิก โดยไม่ดูว่ารับของหรือยัง แล้วลงเดือนตามวันที่ออกใบ
//   · ใบที่สั่งค้างไว้ไม่เคยรับของเลย ก็ยังนับเป็นภาษีซื้อไปตลอด
//   · สั่งปลายเดือนแต่ของมาเดือนหน้า → ลงผิดเดือน ทั้งที่ใบกำกับภาษีซื้อจริงลงเดือนที่ได้รับ
//
// ⚠️ วันที่: timestamptz เก็บเป็น UTC — slice(0,10) ดื้อ ๆ จะร่นไปวันก่อนหน้าสำหรับเวลาหัวค่ำของไทย
//    (เวลาไทย 20 ก.ค. 01:00 = UTC 19 ก.ค. 18:00 → ถ้าไม่แปลงโซนจะกลายเป็นภาษีซื้อของวันที่ 19)
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const s = fs.readFileSync("src/components/TaxReport.jsx", "utf8");

console.log("\nภาษีซื้อในรายงานภาษี:");

// 1) ตัวกรอง — รันเงื่อนไขจริงจากไฟล์
const filt = s.split("\n").find((l) => l.includes("setPos(p.filter(")) || "";
check("มีเงื่อนไขว่าต้องรับของ/จ่ายแล้ว", /x\.status === "received"/.test(filt) && /x\.paid_at/.test(filt),
  "นับทุกใบที่ติ๊ก VAT ตั้งแต่วันสั่ง = ใบที่ไม่เคยรับของก็ยังนับเป็นภาษีซื้อ");
if (filt) {
  const fn = new Function("p", filt.replace("setPos(", "return (") + "");
  const rows = fn([
    { po_no: "A", status: "received", vat: true },
    { po_no: "B", status: "open", vat: true },                    // สั่งแล้วยังไม่รับของ
    { po_no: "C", status: "open", vat: true, paid_at: "2026-07-01T00:00:00Z" },  // จ่ายแล้ว = มีบิลแล้ว
    { po_no: "D", status: "cancelled", vat: true },
    { po_no: "E", status: "received", vat: false },               // ไม่มี VAT
  ]).map((x) => x.po_no).join(",");
  check("รับของแล้ว = นับ · ยังไม่รับของ = ไม่นับ · จ่ายแล้ว = นับ · ยกเลิก/ไม่มี VAT = ไม่นับ",
    rows === "A,C", `ได้ ${rows} · ควรได้ A,C`);
}

// 2) วันที่ลงเดือน — รันโค้ดจริง
const bkk = s.split("\n").find((l) => l.includes("const bkkDay =")) || "";
const pod = s.split("\n").find((l) => l.includes("const poDate =")) || "";
check("มีตัวแปลงวันที่เป็นเวลาไทย", !!bkk && /Asia\/Bangkok/.test(bkk),
  "slice(0,10) บน timestamptz ตรง ๆ จะร่นวันสำหรับเวลาหัวค่ำของไทย");
if (bkk && pod) {
  const poDate = new Function(bkk + "\n" + pod + "\n return poDate;")();
  check("ลงเดือนตามวันรับของ ไม่ใช่วันสั่ง",
    poDate({ issue_date: "2026-06-28", received_at: "2026-07-02T03:00:00Z" }) === "2026-07-02",
    `ได้ ${poDate({ issue_date: "2026-06-28", received_at: "2026-07-02T03:00:00Z" })}`);
  check("ไม่มีวันรับของ → ใช้วันจ่ายเงิน",
    poDate({ issue_date: "2026-06-28", paid_at: "2026-07-05T03:00:00Z" }) === "2026-07-05");
  check("ไม่มีทั้งคู่ → ถอยไปวันที่ออกใบ", poDate({ issue_date: "2026-06-28" }) === "2026-06-28");
  check("เวลาหัวค่ำไทยไม่ร่นไปวันก่อนหน้า",
    poDate({ received_at: "2026-07-19T18:00:00Z" }) === "2026-07-20",
    `ได้ ${poDate({ received_at: "2026-07-19T18:00:00Z" })} · UTC 19 18:00 = ไทย 20 ก.ค. 01:00`);
}

// 3) จอต้องบอกตรงกับที่นับจริง
check("ป้ายบนการ์ดบอกว่านับเฉพาะใบที่รับของแล้ว", /ภาษีซื้อ \(PO รับของแล้ว/.test(s));
check("หมายเหตุท้ายหน้าบอกว่ายังไม่รวมบิลหน้างานที่ไม่ผ่าน PO", /ยังไม่รวมบิลหน้างาน/.test(s),
  "ถ้าไม่บอก คนอ่านจะคิดว่าตัวเลขนี้ครบแล้ว");

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
