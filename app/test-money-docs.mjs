// เกราะ "เอกสารเงิน" รอบ 2 — ใบส่งของ/ใบแจ้งหนี้ · ใบเสร็จ · ใบเพิ่ม/ลดหนี้ · ใบวางบิล
//
// ทุกจุดที่ "เขียนเงิน" (ออกใบ / รับเงินแล้ว / ยกเลิก / ลบ) ต้องมี busy guard 2 ชั้น:
//   (1) ใน handler: `if (busy) return` บรรทัดแรก (กันเรียกซ้อนตอนคลิกรัว/เน็ตช้า) + `finally { setBusy(...) }` (ปลดล็อกเสมอแม้ error)
//   (2) ที่ปุ่ม: `disabled={busy ...}` (ผู้ใช้เห็นว่ากดไม่ได้ระหว่างรอ)
// ทำไมสำคัญ: ใบเสร็จ genNo ละเอียดแค่วินาที กดคร่อมวินาที = 2 ใบ · docNoTaken เช็คแล้วแต่สองคลิกซ้อนวิ่งผ่านพร้อมกันได้
// นี่คือชั้นแรก (UI) — ชั้นสอง (idempotency key ระดับ DB) เป็นงานถัดไปตามแผน
//
// สไตล์เดียวกับ test-money-views.mjs: อ่านโค้ดจริง ตรวจโครงสร้าง ไม่ต้องมี DB
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (p) => fs.readFileSync("src/components/" + p, "utf8");
// ตัวฟังก์ชันหลายบรรทัด: จากหัวถึง "\n  }" ตัวแรก (บรรทัดในฟังก์ชันเยื้อง ≥4 ช่องเสมอ)
const fnBody = (src, head) => { const i = src.indexOf(head); if (i < 0) return ""; const j = src.indexOf("\n  }", i); return src.slice(i, j < 0 ? undefined : j); };
// ฟังก์ชันบรรทัดเดียว (del/cancel/markPaid เขียนไว้บรรทัดเดียวจบ) — ต้องดูเฉพาะบรรทัดนั้น ไม่งั้นจะเหมาบรรทัดถัดไปมาด้วย
const lineWith = (src, needle) => src.split("\n").find((l) => l.includes(needle)) || "";
const guarded = (body, key) => body.includes("if (busy) return") && body.includes(`setBusy(${key})`) && /finally \{ setBusy\((null|false)\); \}/.test(body);

const FILES = [
  { f: "Invoices.jsx", label: "ใบส่งของ/ใบแจ้งหนี้", key: "x.invoice_no", multi: ["save"], single: ["del(x)", "cancel(x)"],
    btns: [["onClick={save}", "busy !== null"], ["onClick={() => cancel(x)}", "busy === x.invoice_no"], ["onClick={() => del(x)}", "busy === x.invoice_no"]] },
  { f: "Receipts.jsx", label: "ใบเสร็จ", key: "x.receipt_no", multi: ["save"], single: ["markPaid(x)", "del(x)", "cancel(x)"],
    btns: [["onClick={save}", "busy !== null"], ["onClick={() => markPaid(x)}", "busy === x.receipt_no"], ["onClick={() => cancel(x)}", "busy === x.receipt_no"], ["onClick={() => del(x)}", "busy === x.receipt_no"]] },
  { f: "AdjustmentNotes.jsx", label: "ใบเพิ่ม/ลดหนี้", key: "x.note_no", multi: ["save", "cancel(x)", "del(x)"], single: [],
    btns: [["onClick={save}", "busy !== null"], ["onClick={() => cancel(x)}", "busy === x.note_no"], ["onClick={() => del(x)}", "busy === x.note_no"]] },
  { f: "BillingNotes.jsx", label: "ใบวางบิล", key: "true", multi: [], single: ["cancel(b)", "del(b)"],
    btns: [["onClick={() => cancel(b)}", "disabled={busy}"], ["onClick={() => del(b)}", "disabled={busy}"]] },
];

for (const { f, label, key, multi, single, btns } of FILES) {
  const src = read(f);
  console.log(`\n${label} (${f}):`);
  check("ประกาศ busy state", /const \[busy, setBusy\] = React\.useState\((null|false)\)/.test(src));
  for (const name of multi) {
    const head = name === "save" ? "async function save() {" : `async function ${name} {`;
    const body = fnBody(src, head);
    const k = name === "save" ? '"save"' : key;
    check(`${name}: guard ครบ (if busy return · setBusy(${k}) · finally ปลดล็อก)`, guarded(body, k), body ? "ขาดชิ้นใดชิ้นหนึ่ง" : "ไม่เจอฟังก์ชัน " + head);
  }
  for (const name of single) {
    const line = lineWith(src, `async function ${name} {`);
    check(`${name}: guard ครบในบรรทัดเดียว`, guarded(line, key), line ? "ขาดชิ้นใดชิ้นหนึ่ง" : "ไม่เจอฟังก์ชัน " + name);
  }
  for (const [needle, expect] of btns) {
    const line = lineWith(src, needle);
    check(`ปุ่ม ${needle} disabled ระหว่างเขียน`, line.includes(expect), line ? `ไม่พบ "${expect}" บนบรรทัดปุ่ม` : "ไม่เจอปุ่ม");
  }
}

// ใบเสร็จ: ปุ่มส่ง FlowAccount มี guard ของตัวเอง (faBusy) อยู่แล้ว — ห้ามใครลบทิ้ง
const rec = read("Receipts.jsx");
console.log("\nใบเสร็จ — ส่ง FlowAccount:");
check("ปุ่ม sendToFlow ยังมี faBusy guard", lineWith(rec, "onClick={() => sendToFlow(x)}").includes("disabled={faBusy === x.receipt_no}"));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
