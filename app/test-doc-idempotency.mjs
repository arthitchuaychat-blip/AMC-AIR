// กันบันทึกเอกสารเงินซ้ำ "ระดับ DB" (v844) — ชั้นสองต่อจาก busy guard ฝั่งจอ
//
// ดีไซน์ (ตกลงกับแผน stability): request_id = UUID ต่อการ "เปิดฟอร์ม" 1 ครั้ง ไม่ใช่ต่อใบ
//   → กดซ้ำ / retry หลังเน็ตหลุด = UUID เดิม → unique index ปฏิเสธใบที่ 2 → แอปถือว่า "บันทึกไปแล้ว"
//   → เปิดฟอร์มใหม่ = UUID ใหม่ → ออกใบใหม่/จ่ายงวดถัดไปผ่านตามปกติ (ไม่ขวางงานที่ถูกต้อง)
// ตรวจ 3 ชั้นให้ครบ ไม่งั้นระบบครึ่ง ๆ กลาง ๆ จะให้ความรู้สึกปลอดภัยที่ไม่จริง:
//   (1) ฟอร์มสร้าง request_id ตอนเปิด + ส่งมากับใบ   (2) api ส่ง request_id เข้า DB ผ่าน _upsertIdem
//   (3) _upsertIdem: fallback ถ้ายังไม่รัน migration · 23505 บน request_id = dup ไม่ใช่ error · error อื่นต้องโยนต่อ
//   (4) migration มี unique index แบบ partial ครบ 4 ตาราง
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (p) => fs.readFileSync(p, "utf8");
const fnBody = (src, head) => { const i = src.indexOf(head); if (i < 0) return ""; const j = src.indexOf("\n}", i); return src.slice(i, j < 0 ? undefined : j); };

const api = read("src/lib/api.js");
const mig = read("../supabase/migrations/20260917100000_doc_request_id.sql");

console.log("\n_upsertIdem (api.js):");
const idem = fnBody(api, "async function _upsertIdem(table, row, onConflict)");
check("มีฟังก์ชัน _upsertIdem", idem.length > 0);
check("ยังไม่รัน migration → ตัด request_id ทิ้งแล้ว upsert ใหม่ (ไม่ทำแอปพัง)", idem.includes('_missingCol(error) === "request_id"') && idem.includes("const { request_id, ...rest } = row"));
check("23505/unique บน request_id → คืน { dup: true } ไม่โยน error", /23505/.test(idem) && idem.includes("return { dup: true }"));
check("error อื่นต้องโยนต่อ (ห้ามกลืน)", idem.includes("if (error) throw error;"));

console.log("\nsave* ใน api.js ส่ง request_id และข้าม side effect เมื่อ dup:");
for (const [fn, table, v] of [["saveReceipt(r)", "receipts", "r"], ["saveInvoice(", "invoices", "inv"], ["saveAdjustmentNote(", "adjustment_notes", "a"], ["saveBillingNote(", "billing_notes", "b"]]) {
  const body = fnBody(api, `export async function ${fn}`);
  check(`${table}: ใช้ _upsertIdem + request_id: ${v}.request_id`, body.includes(`_upsertIdem("${table}", { request_id: ${v}.request_id || null`), body ? "ยังใช้ upsert ตรง / ไม่ส่ง request_id" : "ไม่เจอฟังก์ชัน");
  check(`${table}: dup → return ก่อน side effect (sync/สถานะ/ออดิท ไม่ทำซ้ำ)`, body.includes("if (dup) return { dup: true };"));
  check(`${table}: ไม่เหลือ 'if (error) throw error' ค้างหลัง upsert เดิม (error ไม่ถูกประกาศแล้ว)`, !/_upsertIdem\([^\n]*\n(?:[^\n]*\n){0,12}[^\n]*if \(error\) throw error;/.test(body) || body.indexOf("if (error) throw error;") > body.indexOf("if (dup) return") + 400);
}

console.log("\nฟอร์ม: สร้าง request_id ตอนเปิด + ส่งมากับใบ:");
for (const [f, openNeedle, rowNeedle] of [
  ["Receipts.jsx", "setEd({ request_id: crypto.randomUUID(), receipt_no: genNo()", "request_id: ed.request_id || null"],
  ["Invoices.jsx", "setEd({ request_id: crypto.randomUUID(), invoice_no: genNo()", "request_id: ed.request_id || null"],
  ["AdjustmentNotes.jsx", "setEd({ request_id: crypto.randomUUID(), note_no: genNo(kind)", "request_id: ed.request_id || null"],
  ["BillingNotes.jsx", "setEd({ request_id: crypto.randomUUID(), billing_no: genNo()", "saveBillingNote({ request_id: ed.request_id || null"],
]) {
  const src = read("src/components/" + f);
  check(`${f}: เปิดฟอร์มสร้าง → request_id ใหม่ (UUID ต่อการเปิด ไม่ใช่ต่อคลิก)`, src.includes(openNeedle));
  check(`${f}: ส่ง request_id ไปกับใบตอนบันทึก`, src.includes(rowNeedle));
}

console.log("\nmigration 20260917100000_doc_request_id.sql:");
for (const t of ["receipts", "invoices", "adjustment_notes", "billing_notes"]) {
  check(`${t}: add column request_id uuid (if not exists)`, new RegExp(`alter table public\\.${t}\\s+add column if not exists request_id uuid`).test(mig));
  check(`${t}: unique index แบบ partial (where request_id is not null — ใบเก่าไม่กระทบ)`, new RegExp(`create unique index if not exists ${t}_request_id_uidx\\s+on public\\.${t}\\(request_id\\)\\s+where request_id is not null`).test(mig));
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
