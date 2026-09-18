// v852 — เบิกจ่าย: ใบรวมจ่าย (แม่) ↔ ใบเบิกเดิม (ลูก)
// เดิม "รวมจ่ายหลายใบ" ปิดใบเดิมเป็น "ไม่อนุมัติ" → ผู้เบิกเห็นใบตัวเองถูกปฏิเสธ ไม่เห็นสถานะ/สลิป · ใบรวมขึ้นชื่อลูกค้าของ PO ใบแรกใบเดียว
// ทดสอบ 2 แบบ: (ก) รันโค้ดจริงจาก api.js กับ supabase ปลอม ตรวจลำดับ/ค่าที่เขียน  (ข) อ่านโค้ดตรวจจุดเชื่อมใน UI/รายงาน/migration
import fs from "node:fs";
import assert from "node:assert/strict";

const norm = (s) => s.replace(/\r\n/g, "\n");
const API = norm(fs.readFileSync("src/lib/api.js", "utf8"));
const UI = norm(fs.readFileSync("src/components/Expenses.jsx", "utf8"));
const MIG = norm(fs.readFileSync("../supabase/migrations/20260918170000_expense_merged.sql", "utf8"));
const SIG = norm(fs.readFileSync("src/lib/cacheSignals.js", "utf8"));

let pass = 0, fail = 0;
const check = async (name, fn) => { try { await fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + (e.message || e)); fail++; } };
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, "ไม่เจอ " + a); const j = src.indexOf(b, i + a.length); assert.ok(j > i, "ไม่เจอจุดจบ " + b); return src.slice(i, j); };

// ---------- (ก) รันโค้ดจริงกับ supabase ปลอม ----------
const chunk = between(API, "const _isMergeMigErr = (error) =>", "\n// ---------- CRM: customers (+ contacts + sites) ----------").replace(/export async function/g, "async function");
let ops = []; let respond = () => ({ data: null, error: null });
function from(table) {
  const rec = { table, op: "select", payload: null, filters: [], returning: false };
  ops.push(rec);
  const q = {
    select: (cols, opt) => { if (rec.op === "select") rec.cols = cols; else rec.returning = true; if (opt?.head) rec.head = true; return q; },
    insert: (p) => { rec.op = "insert"; rec.payload = p; return q; },
    update: (p) => { rec.op = "update"; rec.payload = p; return q; },
    delete: () => { rec.op = "delete"; return q; },
    eq: (c, v) => { rec.filters.push(`${c}=${v}`); return q; },
    in: (c, v) => { rec.filters.push(`${c} in [${[...v].join(",")}]`); return q; },
    is: (c, v) => { rec.filters.push(`${c} is ${v}`); return q; },
    maybeSingle: () => q, single: () => q, order: () => q, range: () => q,
    then: (res, rej) => Promise.resolve(respond(rec)).then(res, rej),
  };
  return q;
}
const notes = [];
const mod = new Function("supabase", "_uid", "_meSafe", "_usersByRole", "notify", "logAudit", "syncCashEntriesFromDocs",
  chunk + "\nreturn { _markMergedChildren, _restoreMergedChildren, requestPoPaymentBatch, unmergeExpense };")(
  { from }, async () => "u-office", async () => ({ name: "ธุรการ" }), async () => [], (to, n) => notes.push({ to, n }), async () => {}, () => Promise.resolve());

console.log("\nรวมจ่ายเจ้าหนี้หลายใบ (requestPoPaymentBatch) — โค้ดจริง:");
const POS = [{ po_no: "PO-1", supplier: "ร้าน A", total: 1000, expense_id: "e-old1" }, { po_no: "PO-2", supplier: "ร้าน A", total: 500, expense_id: "e-old2" }, { po_no: "PO-3", supplier: "ร้าน A", total: 250, expense_id: null }];
const happy = (rec) => {
  if (rec.table === "expense_requests" && rec.op === "select") return { data: [{ id: "e-old1", status: "approved", paid_amount: 0, title: "ชำระค่าสินค้า PO-1" }, { id: "e-old2", status: "pending", paid_amount: null, title: "ชำระค่าสินค้า PO-2" }], error: null };
  if (rec.table === "purchase_orders" && rec.op === "select") return { data: [{ po_no: "PO-1", expense_id: "e-old1" }, { po_no: "PO-2", expense_id: "e-old2" }], error: null };
  if (rec.table === "expense_requests" && rec.op === "insert") return { data: { id: "e-new" }, error: null };
  if (rec.table === "purchase_orders" && rec.op === "update" && rec.returning) return { data: [{ po_no: "PO-1" }, { po_no: "PO-2" }, { po_no: "PO-3" }], error: null };
  return { data: [], error: null };
};
await check("ใบเดิมกลายเป็น 'merged' ชี้ใบรวมใหม่ + จำสถานะเดิม/PO ของตัวเอง — ไม่ใช่ 'rejected' อีกต่อไป", async () => {
  ops = []; respond = happy;
  const id = await mod.requestPoPaymentBatch(POS);
  assert.equal(id, "e-new");
  const kids = ops.filter((o) => o.table === "expense_requests" && o.op === "update" && o.payload?.status === "merged");
  assert.equal(kids.length, 2);
  assert.deepEqual(kids[0].payload, { status: "merged", merged_into: "e-new", merged_prev_status: "approved", merged_po_nos: ["PO-1"], decide_note: null });
  assert.deepEqual(kids[1].payload, { status: "merged", merged_into: "e-new", merged_prev_status: "pending", merged_po_nos: ["PO-2"], decide_note: null });
  assert.ok(!ops.some((o) => o.payload?.status === "rejected"), "ยังมีการปิดใบเดิมเป็น rejected");
});
await check("ลำดับปลอดภัย: ปิดใบเดิมเป็น merged 'หลัง' ผูก PO เข้าใบรวมสำเร็จแล้วเท่านั้น", async () => {
  const iLink = ops.findIndex((o) => o.table === "purchase_orders" && o.op === "update" && o.returning);
  const iMerged = ops.findIndex((o) => o.payload?.status === "merged");
  assert.ok(iLink >= 0 && iMerged > iLink);
});
await check("มีคนชิงตั้งเบิกพร้อมกัน → ถอนใบรวมใหม่ + คืน PO ให้ใบเบิกเดิม (เดิม: ใบเดิมถูกปิดไปแล้ว PO ลอย)", async () => {
  ops = []; respond = (rec) => (rec.table === "purchase_orders" && rec.op === "update" && rec.returning ? { data: [{ po_no: "PO-1" }], error: null } : happy(rec));
  await assert.rejects(() => mod.requestPoPaymentBatch(POS), /ถูกตั้งเบิกไปแล้ว/);
  assert.ok(ops.some((o) => o.table === "expense_requests" && o.op === "delete" && o.filters.includes("id=e-new")), "ต้องลบใบรวมใหม่");
  assert.ok(ops.some((o) => o.table === "purchase_orders" && o.op === "update" && o.payload?.expense_id === "e-old1" && o.filters.includes("po_no in [PO-1]")), "ต้องคืน PO-1 ให้ e-old1");
  assert.ok(!ops.some((o) => o.payload?.status === "merged" || o.payload?.status === "rejected"), "ห้ามแตะสถานะใบเดิมเมื่อรวมไม่สำเร็จ");
});
await check("ใบเดิมจ่ายเงินไปแล้วบางส่วน → ห้ามรวม", async () => {
  ops = []; respond = (rec) => (rec.table === "expense_requests" && rec.op === "select" ? { data: [{ id: "e-old1", status: "approved", paid_amount: 100, title: "x" }], error: null } : happy(rec));
  await assert.rejects(() => mod.requestPoPaymentBatch(POS), /มีการจ่ายเงินไปแล้ว/);
});
await check("ใบเดิมเป็นใบรวมหลาย PO แต่เลือกมาไม่ครบ → ห้าม (กัน PO ที่ไม่ได้เลือกหลุดเป็นยังไม่ตั้งเบิกแบบเงียบ ๆ)", async () => {
  ops = []; respond = (rec) => (rec.table === "purchase_orders" && rec.op === "select" ? { data: [{ po_no: "PO-1", expense_id: "e-old1" }, { po_no: "PO-9", expense_id: "e-old1" }, { po_no: "PO-2", expense_id: "e-old2" }], error: null } : happy(rec));
  await assert.rejects(() => mod.requestPoPaymentBatch(POS), /ต้องเลือกให้ครบทุกใบ/);
  assert.ok(!ops.some((o) => o.op === "insert"), "ห้ามสร้างใบรวม");
});
await check("DB ยังไม่รัน migration (CHECK 23514) → fallback พฤติกรรมเดิม ระบบไม่พัง", async () => {
  ops = []; respond = (rec) => (rec.payload?.status === "merged" ? { data: null, error: { code: "23514", message: "violates check constraint expense_requests_status_check" } } : { data: [], error: null });
  await mod._markMergedChildren([{ id: "c1", status: "approved" }], "p1", "ยุบรวม (เดิม)");
  assert.deepEqual(ops[1].payload, { status: "rejected", decide_note: "ยุบรวม (เดิม)" });
});

console.log("\nใบรวมถูกไม่อนุมัติ → คืนใบลูก (_restoreMergedChildren) — โค้ดจริง:");
await check("ใบลูกกลับสถานะเดิมของแต่ละใบ + ผูก PO กลับเฉพาะใบที่ยังว่าง", async () => {
  ops = []; respond = (rec) => (rec.op === "select" ? { data: [{ id: "c1", requester: "u1", title: "a", merged_prev_status: "approved", merged_po_nos: ["PO-1"] }, { id: "c2", requester: "u2", title: "b", merged_prev_status: null, merged_po_nos: null }], error: null } : { data: [], error: null });
  const back = await mod._restoreMergedChildren("p1");
  assert.equal(back.length, 2);
  const ups = ops.filter((o) => o.table === "expense_requests" && o.op === "update");
  assert.deepEqual(ups[0].payload, { status: "approved", merged_into: null, merged_prev_status: null, merged_po_nos: null });
  assert.equal(ups[1].payload.status, "pending");
  const po = ops.filter((o) => o.table === "purchase_orders");
  assert.equal(po.length, 1); assert.deepEqual(po[0].payload, { expense_id: "c1" }); assert.ok(po[0].filters.includes("expense_id is null"));
});

console.log("\nแยกออกจากใบรวม (unmergeExpense) — โค้ดจริง:");
await check("ใบรวมจ่ายเงินไปแล้ว → แยกไม่ได้", async () => {
  ops = []; let n = 0;
  respond = (rec) => (rec.op === "select" ? { data: n++ === 0 ? { id: "c1", status: "merged", merged_into: "p1", amount: 500 } : { id: "p1", status: "approved", paid_amount: 200 }, error: null } : { data: [], error: null });
  await assert.rejects(() => mod.unmergeExpense("c1"), /จ่ายเงินไปแล้ว/);
  assert.ok(!ops.some((o) => o.op === "update"));
});
await check("แยกได้: ใบลูกคืนสถานะ · PO ย้ายกลับ · ใบรวมลดยอด + ตัดรายการในหมายเหตุ + ลดจำนวนใบในชื่อ", async () => {
  ops = []; let n = 0;
  respond = (rec) => {
    if (rec.op === "select" && rec.head) return { count: rec.table === "purchase_orders" ? 2 : 1, error: null };
    if (rec.op === "select") return { data: n++ === 0 ? { id: "c1", status: "merged", merged_into: "p1", merged_prev_status: "approved", merged_po_nos: ["PO-1"], amount: 1000, title: "ชำระค่าสินค้า PO-1", requester: "u1" } : { id: "p1", status: "approved", paid_amount: 0, amount: 1750, title: "ชำระค่าสินค้า 3 ใบ · ร้าน A", note: "รวมใบสั่งซื้อ: PO-1 (1,000) · PO-2 (500) · PO-3 (250)" }, error: null };
    return { data: [], error: null };
  };
  await mod.unmergeExpense("c1");
  const upC = ops.find((o) => o.table === "expense_requests" && o.op === "update" && o.filters.includes("id=c1"));
  assert.equal(upC.payload.status, "approved"); assert.equal(upC.payload.merged_into, null);
  const upP = ops.find((o) => o.table === "expense_requests" && o.op === "update" && o.filters.includes("id=p1"));
  assert.equal(upP.payload.amount, 750);
  assert.equal(upP.payload.note, "รวมใบสั่งซื้อ: PO-2 (500) · PO-3 (250)");
  assert.equal(upP.payload.title, "ชำระค่าสินค้า 2 ใบ · ร้าน A");
  assert.ok(ops.some((o) => o.table === "purchase_orders" && o.payload?.expense_id === "c1"), "PO ต้องกลับไปผูกใบลูก");
});

// ---------- (ข) จุดเชื่อมที่ต้องถูก ----------
console.log("\napi.js — จุดเชื่อม:");
await check("decideExpense: ไม่อนุมัติใบรวม → คืนใบลูก 'หลัง' ปลด PO ออกจากใบรวม + แจ้งผู้เบิกตัวจริง", () => {
  const d = between(API, "export async function decideExpense(id, status, note)", "\n// สร้างบิลประจำเดือน");
  const iUnlink = d.indexOf('.update({ expense_id: null }).eq("expense_id", id)'), iRestore = d.indexOf("_restoreMergedChildren(id)");
  assert.ok(iUnlink > 0 && iRestore > iUnlink);
  assert.ok(d.includes("_mergedChildRequesters(id, ex?.requester)"));
});
await check("payExpense: จ่ายใบรวมแล้วแจ้งผู้เบิกของใบลูกทุกคน", () => {
  const p = between(API, "export async function payExpense(", "\n// ยกเลิกการจ่ายเงินเบิก");
  assert.ok(p.includes("_mergedChildRequesters(id, ex.requester)"));
});
await check("รวมเบิกทั่วไป (requestExpensePaymentBatch) ใช้ merged เหมือนกัน + รวมไม่สำเร็จต้องคืนใบลูกและลบใบรวม", () => {
  const b = between(API, "export async function requestExpensePaymentBatch(", "\nexport async function unpayExpense");
  assert.ok(b.includes("_markMergedChildren(payable.map((e) => ({ id: e.id, status: e.status })), ex.id,"));
  assert.ok(b.includes("_restoreMergedChildren(ex.id)"));
  assert.ok(!b.includes('update({ status: "rejected"'), "ยังปิดใบเดิมเป็น rejected ตรง ๆ");
});
await check("ต้นทุนงานนับใบเบิกเข้างานที่ถูกรวมจ่ายด้วย (เดิมหายเงียบเพราะเป็น rejected) · กระแสเงินสดไม่นับใบลูก (นับที่ใบรวม)", () => {
  const j = between(API, "export async function jobExpenseCost()", "\nexport async function updateProfile");
  assert.ok(j.includes('.in("status", ["approved", "paid", "merged"])'));
  const sync = between(API, "export async function syncCashEntriesFromDocs()", "const cn = Object.fromEntries");
  assert.ok(sync.includes('.in("status", ["pending", "approved", "paid"])'), "cash sync ต้องไม่รวม merged");
});
await check("ใบรวมหลาย PO ไม่เอาลูกค้า/งาน/ใบเสนอของ PO ใบแรกมาแปะ — ให้ customerNames ทั้งชุด", () => {
  const e = between(API, "async function _enrichExpenseJobs(rows)", "\nexport async function listMyExpenses");
  assert.ok(e.includes("const oneDoc = poList.length <= 1 || new Set(poList.map((p) => p.quote_no || \"\")).size === 1;"));
  assert.ok(e.includes("customerNames: custNames"));
  assert.ok(e.includes("jobNo: oneDoc ? (job?.job_no || null) : null") && e.includes("quoteNo: oneDoc ? quoteNo : null"));
});
await check("ผู้เบิกเห็นสถานะ/สลิปของใบรวมผ่าน RPC my_merged_parents (อยู่ใน READ_RPCS ไม่ล้างแคช) · ออฟฟิศได้ทั้ง mergedParent/mergedChildren", () => {
  const m = between(API, "export async function listMyExpenses()", "\nexport function listExpenses");
  assert.ok(m.includes('supabase.rpc("my_merged_parents")') && m.includes("mergedParent: byChild[r.id] || null"));
  assert.ok(SIG.includes("'my_merged_parents'"));
  assert.ok(API.includes("return _attachMergeLinks(named, nm, !!status);"));
});

console.log("\nExpenses.jsx — หน้าจอ:");
await check("มีสถานะ merged + ป้ายสถานะจริงตามใบรวม + แบนเนอร์/สลิปของใบรวมบนใบลูก", () => {
  assert.ok(UI.includes('merged: { t: "รวมจ่ายในใบอื่น"'));
  assert.ok(UI.includes("const parentStatusView = (p) =>") && UI.includes('x.status === "merged" && (() => { const v = parentStatusView(x.mergedParent);'));
  assert.ok(UI.includes("p.payment_proof.map((u, i) =>"));
});
await check("ใบรวม: หัวการ์ด 'หลายลูกค้า (N ราย)' + รายการใบเดิมพร้อมผู้เบิกและเอกสารแนบ (MergedChildren)", () => {
  assert.ok(UI.includes("x.customerNames?.length > 1 ? { name: L(`หลายลูกค้า (${x.customerNames.length} ราย)"));
  assert.ok(UI.includes("function MergedChildren({ kids, onFocusExpense, L })") && UI.includes("x.mergedChildren?.length > 0 && <MergedChildren"));
});
await check("ใบลูกไม่มีปุ่ม 'นำกลับมา' (เสี่ยงจ่ายซ้ำ) — มีแต่ 'แยกออกจากใบรวม' เฉพาะเมื่อใบรวมยังไม่จ่ายเงิน และอยู่ในแท็บออฟฟิศเท่านั้น", () => {
  assert.ok(UI.includes('{x.status === "merged" && !parentPaidAny(x) && <button className="btn-ghost sm danger"'));
  assert.ok(UI.includes('{x.status === "rejected" && !(Number(x.paid_amount) > 0) && <button className="btn-primary sm ok"'), "ปุ่มนำกลับมาต้องผูกกับ rejected เท่านั้น");
  const mine = between(UI, "function MineTab(", "\n// แนบใบเสร็จ/บิลย้อนหลัง");
  assert.ok(!mine.includes("unmerge("), "พนักงานแยกใบเองไม่ได้");
});
await check("แท็บอนุมัติมีชิป 'รวมจ่ายแล้ว' · สรุปค่าใช้จ่ายไม่นับใบลูกซ้ำ · ค้นด้วยเลขใบได้ · ใบลูกแนบใบเสร็จได้เมื่อใบรวมจ่ายแล้ว", () => {
  assert.ok(UI.includes('["merged", L("รวมจ่ายแล้ว"'));
  assert.ok(UI.includes('!["rejected", "merged"].includes(x.status) && (x.created_at'));
  assert.ok(UI.includes('matchText(q, String(x.id || "").slice(0, 8), x.title'));
  assert.ok(UI.includes('(x.status === "merged" && parentPaidAny(x))) && <button className="btn-ghost sm" onClick={() => setRcptFor(x)}>'));
});
await check("แก้ไขได้เฉพาะตอนรออนุมัติ (ของเดิม ต้องยังอยู่)", () => {
  assert.ok(UI.includes('{x.status === "pending" && <button className="btn-ghost sm" onClick={() => setForm(expenseToForm(x))}>'));
});

console.log("\nmigration:");
await check("เพิ่ม 3 คอลัมน์ + เปิดสถานะ merged (คงของเดิมครบ) + RPC เฉพาะใบของตัวเอง + ย้ายข้อมูลเก่าเฉพาะที่จับคู่ใบรวมที่ยังมีชีวิตได้", () => {
  for (const c of ["merged_into uuid references expense_requests(id) on delete set null", "merged_prev_status text", "merged_po_nos text[]"]) assert.ok(MIG.includes(c), c);
  assert.ok(MIG.includes("check (status in ('pending','approved','rejected','paid','merged'))"));
  assert.ok(MIG.includes("where c.requester = auth.uid() and c.status = 'merged'") && MIG.includes("security definer"));
  assert.ok(MIG.includes("p.status in ('pending','approved','paid')") && MIG.includes("where pick.id = e.id and pick.parent_id is not null"));
  assert.ok(MIG.includes("grant execute on function my_merged_parents() to authenticated"));
});

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
if (fail) process.exit(1);
