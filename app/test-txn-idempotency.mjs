// กัน "ชุดหลายแถว" ซ้ำระดับ DB (v848) — เบิก/คืน/ชำรุด/รับของ ผ่าน recordTransactions
//
// ต่างจากเอกสาร (1 ใบ = 1 แถว → unique ต่อแถว): 1 การกด = หลายแถวแชร์ id เดียว → ต้อง "จอง" ในตาราง write_requests ก่อน
// กติกาที่ต้องคงไว้:
//   (1) api: จองก่อน insert · ซ้ำ → โยน error ที่มี e.dup (ให้หน้าจอหยุดทั้ง flow ไม่คิดต้นทุน/เบิกคู่แฝดซ้ำ) · insert ล้ม → ปล่อยจอง
//       · ตารางยังไม่มี → ไม่จอง ทำงานเหมือนเดิม (ไม่ทำแอปพังก่อนรัน SQL)
//   (2) หน้าจอ: request_id ต่อ "ความพยายามส่ง" (useRef ล้างเมื่อสำเร็จเท่านั้น) · ทั้ง 2 flow ส่ง request_id · ชุดคู่แฝดใช้ id+suffix
//       · catch ต้องแยก e.dup ออกจาก error จริง (บอกผู้ใช้ว่า "บันทึกไปแล้ว" ไม่ใช่ "ไม่สำเร็จ")
//   (3) migration: PK request_id · RLS insert/delete ของตัวเอง · select ของตัวเอง + admin/exec
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const fnBody = (src, head) => { const i = src.indexOf(head); if (i < 0) return ""; const j = src.indexOf("\n}", i); return src.slice(i, j < 0 ? undefined : j); };

const api = read("src/lib/api.js");
const mv = read("src/components/Movements.jsx");
const mig = read("../supabase/migrations/20260917130000_write_requests.sql");

console.log("\napi.js — _claimRequest / _releaseRequest:");
const claim = fnBody(api, "async function _claimRequest(request_id, kind, ref_no)");
check("จองด้วย insert ลง write_requests (request_id = PK)", claim.includes('from("write_requests").insert({ request_id'));
check("23505 → { dup: true } + คืน ref_no ของรอบที่บันทึกจริง", /23505/.test(claim) && claim.includes("return { dup: true, ref_no:"));
check("ตารางยังไม่มี → { dup: false } (ทำงานเหมือนเดิมก่อนรัน SQL)", /relation\|does not exist/.test(claim) && claim.includes("return { dup: false };   // ยังไม่รัน migration"));
check("error อื่นโยนต่อ", claim.includes("throw error;"));
check("มี _releaseRequest (ลบการจองเมื่อ insert ชุดล้ม)", /async function _releaseRequest\(request_id\) \{ await supabase\.from\("write_requests"\)\.delete\(\)\.eq\("request_id", request_id\); \}/.test(api));

console.log("\napi.js — recordTransactions:");
const rt = fnBody(api, "export async function recordTransactions(rows, opts = {})");
check("รับ opts.request_id (backward compatible: ไม่ส่งก็ทำงานเดิม)", rt.length > 0 && rt.includes("if (opts.request_id) {"));
check("จอง 'ก่อน' insert ชุด", rt.indexOf("_claimRequest(opts.request_id") > 0 && rt.indexOf("_claimRequest(opts.request_id") < rt.indexOf('from("transactions").insert(payload)'));
check("ซ้ำ → โยน error ที่มี e.dup = true (หยุดทั้ง flow)", rt.includes("e.dup = true") && rt.includes("throw e;"));
check("insert ชุดล้ม → ปล่อยการจอง แล้วโยนต่อ", rt.includes("_releaseRequest(opts.request_id).catch(() => {}); throw error;"));

console.log("\nMovements.jsx — หน้าจอ:");
check("request_id ต่อความพยายามส่ง: useRef + สร้างเมื่อยังไม่มี (||=)", mv.includes("const reqRef1 = React.useRef(null), reqRef2 = React.useRef(null);") && mv.includes("(r.current ||= crypto.randomUUID())"));
check("flow ส่งรายการเอง: ส่ง request_id", mv.includes("})), { request_id: reqIdOf(reqRef1) });"));
check("ชุดคู่แฝด (เบิกเข้างานหลังรับของ): id เดียวกัน + :job", mv.includes('await recordTransactions(jobRows, { request_id: reqIdOf(reqRef1) + ":job" })'));
check("flow เบิกตามงาน: ส่ง request_id", mv.includes("})), { request_id: reqIdOf(reqRef2) });"));
check("ล้าง ref เมื่อสำเร็จเท่านั้น (ทั้ง 2 flow)", (mv.match(/reqRef1\.current = null;/g) || []).length >= 2 && (mv.match(/reqRef2\.current = null;/g) || []).length >= 2);
check("catch แยก e.dup: บอกว่า 'บันทึกไปแล้ว' ไม่ใช่ 'ไม่สำเร็จ' (ทั้ง 2 flow)", (mv.match(/if \(e\?\.dup\) \{ flash\("รายการชุดนี้บันทึกไปแล้วจากรอบก่อน/g) || []).length === 2);

console.log("\nmigration 20260917130000_write_requests.sql:");
check("ตาราง write_requests: request_id text primary key", /create table if not exists public\.write_requests \(\s*request_id text primary key/.test(mig));
check("RLS เปิด + insert/delete เฉพาะของตัวเอง", /enable row level security/.test(mig) && /for insert to authenticated\s+with check \(user_id = auth\.uid\(\)\)/.test(mig) && /for delete to authenticated\s+using \(user_id = auth\.uid\(\)\)/.test(mig));
check("select ของตัวเอง + admin/exec", /for select to authenticated\s+using \(user_id = auth\.uid\(\) or my_role\(\) in \('admin', 'exec'\)\)/.test(mig));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
