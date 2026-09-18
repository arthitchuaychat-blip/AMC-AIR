// v856 — ไล่ข้อผิดพลาดจากข้อมูลจริง (client_errors + ตรวจความสอดคล้องใน DB 18 ก.ย. 2026)
//  (1) ReportChart: ResizeObserver ยิงหลังถอดหน้าแดชบอร์ด → host.current เป็น null → TypeError (11 ครั้ง 4 คน)
//  (2) ใบเสร็จรับเงินแล้ว แต่ใบแจ้งหนี้ค้าง "ยังไม่ชำระ" (1 ใบ) — update สถานะใบแจ้งหนี้ไม่เช็ก error · และตอนกดซ้ำ (dup) ข้าม side effect ทั้งที่รอบแรกอาจตายกลางทาง
//  (3) ใบเบิกรุ่นเก่า status=paid แต่ paid_amount=0 (4 ใบ ~66,500 บาท) ไม่ถูกนับเป็นเงินออกจริงในกระแสเงินสด
import fs from "node:fs";
import assert from "node:assert/strict";
const norm = (s) => s.replace(/\r\n/g, "\n");
const API = norm(fs.readFileSync("src/lib/api.js", "utf8"));
const RC = norm(fs.readFileSync("src/components/ReportChart.jsx", "utf8"));
const DP = norm(fs.readFileSync("src/components/DocPreview.jsx", "utf8"));
let pass = 0, fail = 0;
const check = async (name, fn) => { try { await fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + (e.message || e)); fail++; } };
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, "ไม่เจอ " + a); const j = src.indexOf(b, i + a.length); assert.ok(j > i, "ไม่เจอจุดจบ " + b); return src.slice(i, j); };

console.log("\n(1) ตัววัดขนาดกราฟ/พรีวิว ต้องไม่อ่านค่าจากกล่องที่ถูกถอดแล้ว:");
await check("ReportChart: จับ element ตอน mount + เช็ก isConnected ก่อนอ่าน clientWidth · ไม่อ่าน host.current ใน callback", () => {
  const eff = between(RC, "React.useEffect(() => {", "}, []);");
  assert.ok(eff.includes("const el = host.current;") && eff.includes("if (!el) return;"));
  assert.ok(eff.includes("const update = () => { if (!el.isConnected) return; setWidth(Math.max(220, el.clientWidth)); };"));
  assert.ok(eff.includes("observer.observe(el)") && eff.includes("return () => observer.disconnect();"));
  assert.ok(!/const update = [^\n]*host\.current/.test(eff), "callback ยังอ่าน host.current");
});
await check("DocPreview: เหมือนกัน (node ว่าง = ไม่ทำอะไร · ถูกถอดแล้ว = ไม่ setState)", () => {
  assert.ok(DP.includes("if (!node) return;") && DP.includes("const measure = () => { if (node.isConnected) setWidth(node.clientWidth); };"));
});

console.log("\n(2) สถานะใบแจ้งหนี้ต้องตามใบเสร็จ — โค้ดจริงกับ supabase ปลอม:");
const helperSrc = between(API, "async function _syncInvoicePaid(invoice_no, receiptStatus, soft) {", "\nexport async function setReceiptStatus");
let calls = []; let failTimes = 0;
const supabase = { from: (t) => { const rec = { t, filters: [] }; calls.push(rec); const q = { update: (p) => { rec.p = p; return q; }, eq: (c, v) => { rec.filters.push(c + "=" + v); return q; }, neq: (c, v) => { rec.filters.push(c + "!=" + v); return q; }, then: (res) => res(failTimes-- > 0 ? { error: { message: "network" } } : { error: null }) }; return q; } };
const sync = new Function("supabase", helperSrc + "\nreturn _syncInvoicePaid;")(supabase);
await check("รับเงินแล้ว → paid · สถานะอื่น (pending/cancelled/ลบ) → unpaid · ไม่แตะใบที่ยกเลิก · ไม่มีเลขใบ = ไม่ทำอะไร", async () => {
  calls = []; failTimes = 0;
  await sync("INV-1", "paid"); await sync("INV-1", "cancelled"); await sync("INV-1", "deleted"); await sync(null, "paid");
  assert.deepEqual(calls.map((c) => c.p.status), ["paid", "unpaid", "unpaid"]);
  assert.ok(calls.every((c) => c.t === "invoices" && c.filters.includes("invoice_no=INV-1") && c.filters.includes("status!=cancelled")));
});
await check("เน็ตสะดุด 1 ครั้ง → ลองซ้ำแล้วผ่าน (ผู้ใช้ไม่รู้สึก)", async () => { calls = []; failTimes = 1; await sync("INV-2", "paid"); assert.equal(calls.length, 2); });
await check("พลาด 2 ครั้ง → โยน error บอกให้กดบันทึกอีกครั้ง (เดิมเงียบ แล้วข้อมูลค้างผิดตลอดไป) · โหมด soft (กดซ้ำ) ไม่โยน", async () => {
  calls = []; failTimes = 2; await assert.rejects(() => sync("INV-3", "paid"), /ปรับสถานะใบแจ้งหนี้ INV-3 ไม่สำเร็จ/);
  calls = []; failTimes = 2; await sync("INV-3", "paid", true); assert.equal(calls.length, 2);
});
await check("saveReceipt: ปรับใบแจ้งหนี้ 'ก่อน' return dup และทำแม้เป็น dup · setReceiptStatus/deleteReceipt ใช้ตัวเดียวกัน · ไม่เหลือ update แบบไม่เช็ก error", () => {
  const sv = between(API, "export async function saveReceipt(r) {", "\n// ");
  const iSync = sv.indexOf("await _syncInvoicePaid(r.invoice_no, status, !!dup);"), iDup = sv.indexOf("if (dup) return { dup: true };");
  assert.ok(iSync > 0 && iDup > iSync, "ต้อง sync ก่อน return dup");
  assert.ok(API.includes("  await _syncInvoicePaid(invoice_no, status);") && API.includes('  await _syncInvoicePaid(invoice_no, "deleted");'));
  assert.ok(!/\n  if \((r\.)?invoice_no\) await supabase\.from\("invoices"\)\.update\(/.test(API), "ยังมี update ใบแจ้งหนี้แบบไม่เช็ก error");
});

console.log("\n(3) กระแสเงินสด: ใบเบิกรุ่นเก่าที่จ่ายแล้ว ต้องถูกนับเป็นเงินออกจริง:");
await check("status=paid + paid_amount ว่าง/0 → นับเต็มยอดเป็น expense_paid · ใบปกติ/จ่ายบางส่วนไม่เปลี่ยน", () => {
  const blk = between(API, "(expReq.data || []).forEach((x) => {", "\n  });");
  assert.ok(blk.includes('const paidAmt = x.status === "paid" && !(paidRaw > 0.01) ? total : paidRaw;'));
  // จำลองสูตรเดียวกัน
  const calc = (x) => { const total = Math.round((Number(x.amount) || 0) * 100) / 100; const paidRaw = Math.round((Number(x.paid_amount) || 0) * 100) / 100; const paidAmt = x.status === "paid" && !(paidRaw > 0.01) ? total : paidRaw; return { paidAmt, remaining: Math.round((total - paidAmt) * 100) / 100 }; };
  assert.deepEqual(calc({ status: "paid", amount: 16996.6, paid_amount: 0 }), { paidAmt: 16996.6, remaining: 0 });
  assert.deepEqual(calc({ status: "paid", amount: 1000, paid_amount: null }), { paidAmt: 1000, remaining: 0 });
  assert.deepEqual(calc({ status: "approved", amount: 1000, paid_amount: 0 }), { paidAmt: 0, remaining: 1000 });
  assert.deepEqual(calc({ status: "approved", amount: 1000, paid_amount: 400 }), { paidAmt: 400, remaining: 600 });
  assert.deepEqual(calc({ status: "paid", amount: 1000, paid_amount: 970 }), { paidAmt: 970, remaining: 30 });   // หัก ณ ที่จ่าย 30 — ไม่ถูกดันเป็นเต็มยอด
});

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
if (fail) process.exit(1);
