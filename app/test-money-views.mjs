// เกราะเมนูเงิน "ลูกหนี้ (Receivables)" และ "เจ้าหนี้ (Payables)" — สองเมนูเงินที่เคยไม่มี test เลย
//
// ตรวจ 3 เรื่องที่พลาดแล้วเจ็บจริง:
//   (1) กดซ้ำ: ตัดหนี้สูญ/ทวงลูกค้า ต้องมี busy guard ทั้งใน handler (กันเรียกซ้อน) และที่ปุ่ม (disabled)
//       — server กันตัดหนี้สูญซ้ำอยู่แล้ว แต่ UI ที่กดรัวได้ = บันทึกออดิท/sync กระแสเงินสดซ้ำ
//   (2) โหลดล้มต้อง "เห็นชัด": ห้ามให้ error หายไปกับ toast แล้วเหลือตารางว่าง
//       — ตารางว่างในเมนูเงินอ่านได้ว่า "ไม่มีหนี้ค้าง/ไม่มีค้างจ่าย" ซึ่งอันตรายกว่าหน้าพัง
//       → catch ต้อง setLoadError และใน JSX สาขา loadError ต้องมาก่อนข้อความ 🎉 ว่างเปล่า
//   (3) เจ้าหนี้เป็นหน้าอ่านอย่างเดียว — ถ้าวันหน้ามีคนเพิ่มจุดเขียนโดยไม่ใส่ guard test นี้ต้องเตือน
//
// สไตล์เดียวกับ test-invoice-guard.mjs: อ่านโค้ดจริง ตรวจโครงสร้าง ไม่ต้องมี DB
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (p) => fs.readFileSync(p, "utf8");
// ตัดตัวฟังก์ชันออกมาจากไฟล์ (จากหัวฟังก์ชันถึง "\n  }" ตัวแรกที่ปิดระดับเดียวกัน)
const fnBody = (src, head) => { const i = src.indexOf(head); if (i < 0) return ""; const j = src.indexOf("\n  }", i); return src.slice(i, j < 0 ? undefined : j); };
const lineWith = (src, needle) => src.split("\n").find((l) => l.includes(needle)) || "";

const rcv = read("src/components/Receivables.jsx");
const pay = read("src/components/Payables.jsx");
const rec = read("src/components/Receipts.jsx");

console.log("\nลูกหนี้ (Receivables) — กันกดซ้ำที่จุดเขียนเงิน:");
check("ประกาศ busy state สำหรับกันกดซ้ำ", /const \[busy, setBusy\] = React\.useState\(null\)/.test(rcv));
const wo = fnBody(rcv, "async function writeOff(r)");
check("writeOff: กันเรียกซ้อนตั้งแต่บรรทัดแรก (if (busy) return)", wo.includes("if (busy) return"));
check("writeOff: ตั้ง busy ด้วยเลขใบก่อนเขียน และล้างใน finally", wo.includes("setBusy(r.invoice_no)") && wo.includes("finally { setBusy(null); }"));
check("writeOff: บังคับระบุเหตุผล (required: true) — กติกาเอกสารเจ้าของ", wo.includes("required: true"));
// needle ต้องเจาะบรรทัด "ปุ่ม" ไม่ใช่บรรทัดประกาศ `async function writeOff(r)` ที่มาก่อน
check("ปุ่มตัดหนี้สูญ disabled ระหว่างเขียน", lineWith(rcv, "stopPropagation(); writeOff(r)").includes("disabled={busy === r.invoice_no}"));
const md = fnBody(rcv, "async function markDunned(cid)");
check("markDunned: กันเรียกซ้อน + ล้าง busy ใน finally", md.includes("if (busy) return") && md.includes("finally { setBusy(null); }"));
check("ปุ่มทวงแล้ววันนี้ disabled ระหว่างเขียน", lineWith(rcv, "markDunned(c.customer_id)").includes("disabled={busy === c.customer_id}"));

console.log("\nลูกหนี้/เจ้าหนี้ — โหลดล้มต้องเห็นชัด ไม่ใช่ตารางว่าง:");
for (const [name, src, emptyMsg] of [["ลูกหนี้", rcv, "ไม่มีเงินค้างรับ"], ["เจ้าหนี้", pay, "ไม่มียอดค้างจ่าย"]]) {
  check(`${name}: catch ของ load() ตั้ง loadError (ไม่ใช่แค่ toast แล้วหาย)`, src.includes('setLoadError("โหลดไม่สำเร็จ'), "catch ยังใช้ flash อย่างเดียว → error หายใน 3 วิ เหลือตารางว่าง");
  check(`${name}: เริ่ม load() ต้องล้าง loadError เดิม`, /async function load\(\) \{\s*setLoadError\(""\);/.test(src));
  const iErr = src.indexOf("loadError ?"), iEmpty = src.indexOf(emptyMsg);
  check(`${name}: สาขา loadError ใน JSX มาก่อนข้อความ 🎉 ว่างเปล่า`, iErr > 0 && iEmpty > 0 && iErr < iEmpty, "ถ้า error มาหลัง 🎉 ผู้ใช้จะเห็น 'ไม่มีหนี้ค้าง' ทั้งที่โหลดไม่สำเร็จ");
  check(`${name}: มีปุ่มลองใหม่ในแบนเนอร์ error`, /loadError \? <div role="alert"[^\n]*ลองใหม่/.test(src));
}

console.log("\nเจ้าหนี้ (Payables) — หน้าอ่านอย่างเดียว:");
const writes = (pay.match(/await (set|save|update|delete|record|pay|mark)[A-Z]\w*\(/g) || []);
check("ไม่มีจุดเขียนข้อมูล (ถ้าเพิ่มในอนาคตต้องใส่ busy guard แล้วมาแก้ test นี้)", writes.length === 0, "พบ: " + writes.join(", "));

console.log("\nใบเสร็จ (Receipts) — ป้ายสถานะ:");
check("RSTATUS มีสถานะ unpaid (ไม่ตกไป default แล้วโชว์ป้ายผิด)", /const RSTATUS = .*unpaid: \{/.test(rec));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
