// กันส่งคำขอเบิกจ่ายซ้ำระดับ DB (v847) — ต่อยอด pattern ของ doc_request_id (v844) มาที่ตาราง "insert ใหม่"
// เดิม submitExpense เป็น insert ตรง → กดซ้ำ/retry = ใบเบิก 2 ใบ → บัญชีอนุมัติ/จ่ายซ้ำได้
// ตรวจครบ 4 ชั้นเหมือน test-doc-idempotency: ฟอร์ม / api / helper / migration
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const fnBody = (src, head) => { const i = src.indexOf(head); if (i < 0) return ""; const j = src.indexOf("\n}", i); return src.slice(i, j < 0 ? undefined : j); };

const api = read("src/lib/api.js");
const ex = read("src/components/Expenses.jsx");
const mig = read("../supabase/migrations/20260917110000_expense_request_id.sql");

console.log("\n_insertIdem (api.js):");
const idem = fnBody(api, "async function _insertIdem(table, row)");
check("มีฟังก์ชัน _insertIdem", idem.length > 0);
check("ตัดคอลัมน์ที่ migration ยังไม่รันทีละคอลัมน์ (รวม request_id เอง) — แอปไม่พังก่อนรัน SQL", idem.includes("_missingCol(error)") && idem.includes("delete r[col]; continue;"));
check("23505/unique บน request_id → { dup: true } ไม่โยน error", /23505/.test(idem) && idem.includes("return { dup: true }"));
check("error อื่นต้องโยนต่อ", idem.includes("throw error;"));

console.log("\nsubmitExpense:");
const sub = fnBody(api, "export async function submitExpense(e)");
check("row มี request_id: e.request_id", sub.includes("request_id: e.request_id || null"));
check("ใช้ _insertIdem แทน insert ตรง", sub.includes('_insertIdem("expense_requests", row)') && !sub.includes('_insertDropMissing("expense_requests"'));
check("dup → return ก่อนแจ้งเตือน (ไม่ notify ซ้ำ)", sub.indexOf("if (dup) return { dup: true };") > 0 && sub.indexOf("if (dup) return { dup: true };") < sub.indexOf("notify("));

console.log("\nฟอร์มขอเบิก (Expenses.jsx):");
check("เปิดฟอร์มขอเบิกใหม่ → request_id ใหม่ (UUID ต่อการเปิด)", ex.includes("setForm({ request_id: crypto.randomUUID(), title: \"\""));
check("payload กระจาย ...form (request_id ติดไปด้วย)", /const payload = \{ \.\.\.form,/.test(ex));

console.log("\nmigration 20260917110000_expense_request_id.sql:");
check("add column request_id uuid (if not exists)", /alter table public\.expense_requests add column if not exists request_id uuid/.test(mig));
check("unique index แบบ partial (where request_id is not null)", /create unique index if not exists expense_requests_request_id_uidx on public\.expense_requests\(request_id\) where request_id is not null/.test(mig));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
