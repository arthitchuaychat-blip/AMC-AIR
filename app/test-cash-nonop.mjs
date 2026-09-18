// v851 — กระแสเงินสด: โอนระหว่างบัญชี / เจ้าของเบิกใช้ส่วนตัว / เจ้าของเติมเงินเข้า
// ต้อง "เข้ายอดคงเหลือ" แต่ "ไม่นับเป็นรับจริง/จ่ายจริง/แยกหมวดรายจ่าย" — และห้ามไปแตะชนิดของเส้นจากเอกสาร
import fs from "node:fs";
import assert from "node:assert/strict";
import { NONOP_TYPES, NONOP_LABEL, NONOP_DIRECTION, USER_TYPES, nonOpKind, isNonOp, NONOP_NOTE_PREFIX } from "./src/lib/cashKinds.js";

const norm = (s) => s.replace(/\r\n/g, "\n");
const API = norm(fs.readFileSync("src/lib/api.js", "utf8"));
const CF = norm(fs.readFileSync("src/components/CashFlow.jsx", "utf8"));
const MIG = norm(fs.readFileSync("../supabase/migrations/20260918150000_cash_nonoperating.sql", "utf8"));

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + e.message); fail++; } };
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, "ไม่เจอ " + a); const j = src.indexOf(b, i + a.length); assert.ok(j > i, "ไม่เจอจุดจบ " + b); return src.slice(i, j); };

console.log("\nlib/cashKinds — ตรรกะจริง:");
check("ชนิดใหม่ 3 ตัว มีป้ายชื่อครบ และทิศทางบังคับถูก (เบิกใช้=ออก · เติมเงิน=เข้า · โอน=ไม่บังคับ)", () => {
  assert.deepEqual(NONOP_TYPES, ["transfer", "owner_draw", "owner_in"]);
  NONOP_TYPES.forEach((t) => assert.ok(NONOP_LABEL[t], "ไม่มีป้าย " + t));
  assert.equal(NONOP_DIRECTION.owner_draw, "out"); assert.equal(NONOP_DIRECTION.owner_in, "in"); assert.equal(NONOP_DIRECTION.transfer, undefined);
  assert.deepEqual(USER_TYPES, ["manual", "transfer", "owner_draw", "owner_in"]);
});
check("nonOpKind: ชนิดใหม่ตรง ๆ", () => {
  assert.equal(nonOpKind({ source_type: "transfer" }), "transfer");
  assert.equal(nonOpKind({ source_type: "owner_draw" }), "owner_draw");
  assert.equal(nonOpKind({ source_type: "owner_in" }), "owner_in");
});
check("nonOpKind: รายการโอนเก่า (manual + โน้ตขึ้นต้น 🔄) ต้องนับเป็นโอน — ข้อมูลก่อน v851 ไม่ต้องแก้มือ", () => {
  assert.equal(nonOpKind({ source_type: "manual", note: "🔄 โอนไปบัญชีบุคคล · เงินหมุน" }), "transfer");
  assert.equal(nonOpKind({ source_type: "manual", note: "🔄 รับโอนจากบัญชีบริษัท" }), "transfer");
});
check("nonOpKind: fallback ก่อนรัน migration (manual + คำนำหน้า 👤/💰) จำชนิดได้", () => {
  assert.equal(nonOpKind({ source_type: "manual", note: NONOP_NOTE_PREFIX.owner_draw + " · ค่าเทอมลูก" }), "owner_draw");
  assert.equal(nonOpKind({ source_type: "manual", note: NONOP_NOTE_PREFIX.owner_in + " · เติมเงินหมุน" }), "owner_in");
});
check("รายการธุรกิจปกติ/เส้นจากเอกสาร ต้องไม่ถูกมองเป็น non-op (ยอดขาย-ค่าใช้จ่ายห้ามหาย)", () => {
  for (const e of [{ source_type: "manual", note: "มัดจำลูกค้า A" }, { source_type: "receipt", note: "ใบเสร็จ REC-1" }, { source_type: "expense_paid", note: "🔄 เบิกจ่าย: ค่าน้ำมัน" }, { source_type: "invoice", note: "👤 ลูกค้าบุคคล" }, { source_type: "manual", note: null }, null])
    assert.equal(isNonOp(e), false, JSON.stringify(e));
});

// ---- จำลองตรรกะ buckets/anchorAgg ของ CashFlow ด้วยกติกาเดียวกัน: ยอดคงเหลือนับทุกรายการ · รับ/จ่ายจริงไม่นับ non-op ----
console.log("\nสถานการณ์จริง — โอน 500,000 บริษัท→บุคคล + เจ้าของเบิกใช้ 30,000:");
const ents = [
  { entity: "company", source_type: "receipt", direction: "in", status: "actual", amount: 800000 },
  { entity: "company", source_type: "expense_paid", direction: "out", status: "actual", amount: 200000 },
  { entity: "company", source_type: "transfer", direction: "out", status: "actual", amount: 500000 },
  { entity: "personal", source_type: "transfer", direction: "in", status: "actual", amount: 500000 },
  { entity: "personal", source_type: "owner_draw", direction: "out", status: "actual", amount: 30000 },
];
const agg = (rows) => { let inA = 0, outA = 0, bal = 0; rows.forEach((e) => { const v = e.direction === "in" ? e.amount : -e.amount; bal += v; if (!isNonOp(e)) { if (e.direction === "in") inA += e.amount; else outA += e.amount; } }); return { inA, outA, bal }; };
check("มุมมองบริษัท: รับจริง 800k / จ่ายจริง 200k (ไม่ใช่ 700k) · คงเหลือ 100k (เงินออกไปจริง)", () => {
  assert.deepEqual(agg(ents.filter((e) => e.entity === "company")), { inA: 800000, outA: 200000, bal: 100000 });
});
check("มุมมองบุคคล: รับจริง 0 / จ่ายจริง 0 (โอนเข้าไม่ใช่รายได้ · เบิกใช้ไม่ใช่ค่าใช้จ่าย) · คงเหลือ 470k", () => {
  assert.deepEqual(agg(ents.filter((e) => e.entity === "personal")), { inA: 0, outA: 0, bal: 470000 });
});
check("มุมมองรวม: ขาโอนหักล้างกัน · คงเหลือ 570k = 800k − 200k − เบิกใช้ 30k", () => {
  assert.deepEqual(agg(ents), { inA: 800000, outA: 200000, bal: 570000 });
});

console.log("\nCashFlow.jsx — ใช้กติกาเดียวกันทุกจุด:");
check("buckets: non-op เข้า nonOp (ไม่เข้า actIn/actOut) และเงินสดสะสม = actIn − actOut + nonOp", () => {
  const b = between(CF, "const buckets = React.useMemo", "}, [ents, grain, openingVal]);");
  assert.ok(b.includes('if (e.status === "actual" && isNonOp(e)) b.nonOp += (e.direction === "in" ? amt : -amt);'));
  assert.ok(b.includes("run += b.actIn - b.actOut + b.nonOp"));
});
check("การ์ดรับจริง/จ่ายจริงของเดือน ไม่นับ non-op แต่ยอดคงเหลือสิ้นเดือน (endBal) นับทุกรายการ", () => {
  const a = between(CF, "const anchorAgg = React.useMemo", "}, [ents, anchor, openingVal]);");
  assert.ok(a.includes("const op = !isNonOp(e);"));
  assert.equal((a.match(/if \(op && e\.status === "actual"/g) || []).length, 2);
  assert.ok(a.includes("if (e.entry_date <= lastY) endBal += v;"), "endBal ต้องไม่ถูกกรอง");
});
check("จุดต่ำสุด/เงินพร้อมใช้ (cash) ไม่กรอง non-op — เงินที่โอนออก/เบิกใช้ไปแล้วคือเงินที่ไม่มีจริง", () => {
  const c = between(CF, "const cash = React.useMemo", "}, [ents, openingVal]);");
  assert.ok(!c.includes("isNonOp"));
});
check("แยกหมวดรายจ่ายไม่รวม non-op + มียอดสรุปเจ้าของเบิกใช้/โอนให้เห็น", () => {
  assert.ok(CF.includes('viewEnts.filter((e) => e.direction === "out" && !isNonOp(e))'));
  assert.ok(CF.includes("const nonOpSum = React.useMemo"));
  assert.ok(CF.includes("nonOpSum.owner_draw > 0"));
});
check("ปุ่มโอนระหว่างบัญชี: บันทึก 2 ขาเป็นชนิด transfer + source_ref คู่กัน (-out/-in ไม่ชน unique index)", () => {
  const t = between(CF, "async function doTransfer", "async function removeEntry");
  assert.ok(t.includes('const xid = "xfer-" + crypto.randomUUID();'));
  assert.ok(t.includes('source_type: "transfer", source_ref: xid + "-out", direction: "out"'));
  assert.ok(t.includes('source_type: "transfer", source_ref: xid + "-in", direction: "in"'));
});
check("ลบได้เฉพาะรายการที่ผู้ใช้สร้างเอง (USER_TYPES) — เส้นจากเอกสาร/ยกมา ยังลบตรงนี้ไม่ได้", () => {
  assert.ok(CF.includes("if (e.source_type && !USER_TYPES.includes(e.source_type)) {"));
});
check("ฟอร์ม: มีช่อง 'ลักษณะรายการ' 3 ตัวเลือก · เลือกเงินเจ้าของแล้วล็อกทิศทาง+เป็นรายการจริง", () => {
  assert.ok(CF.includes('<option value="owner_draw">') && CF.includes('<option value="owner_in">') && CF.includes('<option value="manual">'));
  assert.ok(CF.includes('const setKind = (k) => setF((s) => ({ ...s, source_type: k, direction: NONOP_DIRECTION[k] || s.direction, status: k === "manual" ? s.status : "actual" }));'));
});
check("ฟอร์ม: แก้เส้นจากเอกสาร/ขาโอน ต้องไม่ส่ง source_type (กันเส้นเอกสารกลายเป็น manual → sync สร้างซ้ำ)", () => {
  assert.ok(CF.includes("const payload = kindEditable ? f : noKind;"));
  assert.ok(CF.includes('const kindEditable = isNew || USER_TYPES.includes(entry.source_type || "manual") && entry.source_type !== "transfer";'));
});

console.log("\napi.js + migration:");
const add = between(API, "export async function addCashEntry(e)", "export async function updateCashEntry");
check("addCashEntry: รับเฉพาะชนิดใน NONOP_TYPES (อย่างอื่น = manual) · บังคับทิศทาง · fallback เป็น manual+คำนำหน้า เมื่อ DB ยังไม่รัน migration", () => {
  assert.ok(add.includes('const kind = NONOP_TYPES.includes(e.source_type) ? e.source_type : "manual";'));
  assert.ok(add.includes("direction: NONOP_DIRECTION[kind] || e.direction"));
  assert.ok(add.includes('if (kind !== "manual" && _isTypeCheckErr(error)) { row = _asManualNonOp(row, kind);'));
});
const upd = between(API, "export async function updateCashEntry(id, f)", "export async function deleteCashEntry");
check("updateCashEntry: เปลี่ยนชนิดได้เฉพาะ manual/owner_draw/owner_in และต้องเช็กชนิดปัจจุบันของแถวก่อน (กันชั้นที่ 2)", () => {
  assert.ok(upd.includes('const kind = ["manual", "owner_draw", "owner_in"].includes(f.source_type) ? f.source_type : null;'));
  assert.ok(upd.includes('if (cur && ["manual", "owner_draw", "owner_in"].includes(cur.source_type))'));
  assert.ok(!upd.includes('"transfer"].includes(f.source_type)'));
});
check("sync จากเอกสารไม่จัดการชนิดใหม่ (ไม่อยู่ใน MANAGED) → ไม่มีวันถูกลบทิ้งตอน reconcile", () => {
  const m = between(API, "const MANAGED = new Set([", "]);");
  NONOP_TYPES.forEach((t) => assert.ok(!m.includes(`"${t}"`), t + " หลุดเข้า MANAGED"));
});
check("migration: เปิด 3 ชนิดใหม่ โดยคงชนิดเดิมครบ 14 ตัว (ตรงกับ constraint จริง ณ 18 ก.ย. 2026)", () => {
  for (const t of ["manual", "invoice", "receipt", "payout", "po", "opening", "expense", "salary", "labor_owed", "expense_paid", "expense_due", "advance", "loan", "recur", "transfer", "owner_draw", "owner_in"])
    assert.ok(MIG.includes(`'${t}'`), "ขาด " + t);
  assert.ok(MIG.includes("drop constraint if exists cash_entries_source_type_check"));
});

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
if (fail) process.exit(1);
