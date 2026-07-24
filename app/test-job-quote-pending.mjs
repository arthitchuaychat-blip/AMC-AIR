// ใบงานสถานะ "รอทำใบเสนอราคา" ต้องปิดงานได้เสมอ
//
// เกิดจริง (เจ้าของแจ้ง): ใบงาน "รอทำใบเสนอราคา" เปลี่ยนเป็น "เสร็จปิดงาน" ไม่ได้เลย
// ต้นเหตุ: ปุ่มปิดงานมีเงื่อนไข jo.quote_no ด้วย — แต่ใบสำรวจที่ช่างกด "📝 เสร็จ รอทำใบเสนอราคา"
//   ยังไม่มีใบเสนอราคาผูก (quote_no เซ็ตได้เฉพาะตอนออฟฟิศเลือกเองในฟอร์ม ไม่มีการผูกอัตโนมัติ)
//   → ปุ่มไม่โผล่ และในฟอร์มก็ไม่มีช่องสถานะระดับใบให้เลือก = ใบค้างตลอดกาล
// และอีกจุด: ใบที่ไม่มีรอบนัด ตอนบันทึกคงไว้เฉพาะ quote_pending → ใบที่ปิดไปแล้วเด้งกลับเป็น "รอจ่ายงาน"
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const jo = fs.readFileSync("src/components/JobOrders.jsx", "utf8");
const api = fs.readFileSync("src/lib/api.js", "utf8");

console.log("\nใบงาน 'รอทำใบเสนอราคา' → 'เสร็จปิดงาน':");

// ---------- ปุ่มปิดงานต้องไม่ผูกกับการมีใบเสนอราคา ----------
const btn = jo.split("\n").find((l) => l.includes('jo.status === "quote_pending"') && l.includes("canEditJob")) || "";
check("ปุ่มปิดงานโผล่ทุกใบที่รอทำใบเสนอราคา (ไม่บังคับต้องมี quote_no)",
  !!btn && !/jo\.quote_no &&/.test(btn),
  "บังคับ quote_no = ใบสำรวจที่ยังไม่มีใบเสนอ ปิดงานไม่ได้ตลอดกาล");
check("ปุ่มเรียก markQuoteDone", /onClick=\{\(\) => markQuoteDone\(jo\)\}/.test(jo));
check("ข้อความปุ่มเปลี่ยนตามว่ามีใบเสนอผูกหรือไม่",
  /jo\.quote_no \? "ใบเสนอราคาเสร็จแล้ว → ปิดงาน" : "ปิดงาน \(เสร็จปิดงาน\)"/.test(jo),
  'ไม่มีใบเสนอผูกแต่เขียนว่า "ใบเสนอราคาเสร็จแล้ว" = ข้อความโกหก');

// ---------- markQuoteDone ต้องเขียนสถานะจริง (ไม่ผ่าน saveJobOrder ที่มีตัวคง quote_pending) ----------
const mqd = jo.slice(jo.indexOf("async function markQuoteDone"), jo.indexOf("async function markQuoteDone") + 320);
check("ปิดงานผ่าน updateJobStatus (ไม่ใช่ saveJobOrder)",
  /updateJobStatus\(jo\.job_no, "done"/.test(mqd),
  "ถ้าไปทาง saveJobOrder จะโดนตัวคง quote_pending ใน api.js ตีกลับ ปิดไม่ติด");

// ---------- ใบไม่มีรอบนัด: บันทึกแล้วต้องไม่ตีสถานะกลับ ----------
const keep = jo.split("\n").find((l) => l.includes("KEEP_HEAD_ST.includes(ed.status)")) || "";
check("ใบไม่มีรอบนัด: คงสถานะระดับใบไว้ (ไม่ตีกลับเป็นรอจ่ายงาน)", !!keep,
  "คงเฉพาะ quote_pending = ใบที่ปิดไปแล้ว พอแก้เบอร์โทรแล้วบันทึก งานเด้งกลับมาเปิดใหม่");
// รันตรรกะจริง
const line = jo.split("\n").find((l) => l.includes("const KEEP_HEAD_ST"));
if (line && keep) {
  const fn = new Function("visitRows", "ed", "deriveJobStatus", line + "\n" + keep + "\n return status;");
  const derive = () => "done";
  check("ไม่มีรอบนัด + สถานะ done → ยังเป็น done", fn([], { status: "done" }, derive) === "done");
  check("ไม่มีรอบนัด + รอทำใบเสนอราคา → ยังเป็น quote_pending", fn([], { status: "quote_pending" }, derive) === "quote_pending");
  check("ไม่มีรอบนัด + สถานะอื่น → รอจ่ายงาน (พฤติกรรมเดิม)", fn([], { status: "scheduled" }, derive) === "pending");
  check("มีรอบนัด → คิดจากรอบตามเดิม", fn([{ status: "done" }], { status: "quote_pending" }, derive) === "done");
}

// ---------- ตัวคง quote_pending ฝั่ง api ยังต้องอยู่ (กันบันทึกฟอร์มแล้วหลุดคิวเอง) ----------
check("api ยังคง quote_pending ไว้ตอนบันทึกฟอร์ม (ไม่ให้ปิดเองอัตโนมัติ)",
  /curHead\?\.status === "quote_pending"\) && vFinal\.every/.test(api),
  "ถอดออก = รอบเสร็จหมดแล้วใบหลุดจากคิวทำใบเสนอราคาเอง");

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
