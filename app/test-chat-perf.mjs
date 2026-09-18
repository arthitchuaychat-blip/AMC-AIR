// v853 — แชตลูกค้าอืด: สาเหตุจากข้อมูลจริง (18 ก.ย. 2026) LINE 1,065 ห้อง · 44,000 ข้อความ · ห้องใหญ่สุด 2,094 · เข้าใหม่ ~460 ข้อความ/วัน
//   (1) หน้าเป็นคอมโพเนนต์ก้อนเดียว 83 state — พิมพ์ 1 ตัวอักษร = วาดรายชื่อ 1,065 ห้อง + ฟองข้อความ 400 ฟองใหม่ทั้งหมด
//   (2) ข้อความเข้า 1 ข้อความ/กดเปลี่ยนสถานะ = โหลด line_contacts ทั้งตาราง + ลูกค้าทั้งหมด + ตารางเชื่อม ใหม่ทั้งชุด (ทุก 3 วิช่วงคุยรัว)
//   (3) เปิดหน้า = โหลดใบงานทั้งบริษัท ทั้งที่ใช้แค่ในแผงคิวช่าง · เปิดห้อง = 400 ข้อความ + รูปทุกรูปโหลดทันที
// suite นี้ล็อกการแก้ทั้ง 3 ข้อไว้ + รันตรรกะ mergeContactRow จริง
import fs from "node:fs";
import assert from "node:assert/strict";

const SRC = fs.readFileSync("src/components/Chat.jsx", "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + (e.message || e)); fail++; } };
const between = (a, b) => { const i = SRC.indexOf(a); assert.ok(i >= 0, "ไม่เจอ " + a); const j = SRC.indexOf(b, i + a.length); assert.ok(j > i, "ไม่เจอจุดจบ " + b); return SRC.slice(i, j); };
const RET = SRC.slice(SRC.indexOf("\n  return (\n    <div className=\"adm\">"));   // JSX ของหน้า (หลัง memo ทั้งหมด)

console.log("\n(1) ไม่วาดซ้ำทั้งหน้าเมื่อพิมพ์:");
check("รายชื่อแชต: กรอง+เรียงผ่าน useMemo · JSX ผ่าน useMemo · วาดทีละ CONVO_PAGE ห้อง มีปุ่มแสดงเพิ่ม", () => {
  assert.ok(SRC.includes("const shown = React.useMemo(() => contacts.filter((c) =>"));
  assert.ok(SRC.includes("}), [contacts, stageF, ownerF, myId, isFb, isSup, q, msgHits]);"));
  assert.ok(SRC.includes("const convoEl = React.useMemo(() => shown.slice(0, convoLimit).map((c) => {"));
  assert.ok(SRC.includes("}), [shown, convoLimit, sel, msgHits, staffMap, isFb]);"));
  assert.ok(RET.includes("{convoEl}") && RET.includes("setConvoLimit((n) => n + CONVO_PAGE)"));
  assert.ok(!RET.includes("{shown.map("), "ยังมี shown.map วาดตรง ๆ ใน JSX");
  assert.ok(SRC.includes("React.useEffect(() => { setConvoLimit(CONVO_PAGE); }, [channel, q, stageF, ownerF]);"), "เปลี่ยนตัวกรองต้องรีเซ็ตจำนวนที่วาด");
});
check("ฟองข้อความ: JSX ผ่าน useMemo (ขึ้นกับ msgs ไม่ขึ้นกับ text ที่พิมพ์) · ไม่มี msgs.map วาดตรง ๆ", () => {
  const m = between("const msgsEl = React.useMemo(() => msgs.map((m, i) => {", "\n  const custOptionsAll");
  assert.ok(m.includes("}), [msgs, myId, staffColor, staffMap, byLineId, selName, canSend, isFb, isSup, isCm, scanning]);"));
  assert.ok(!/\btext\b\s*[,\]]/.test(m.slice(m.lastIndexOf("}), ["))), "deps ห้ามมี text");
  assert.ok(RET.includes("{msgsEl}") && !RET.includes("{msgs.map("));
});
check("ฟังก์ชันที่ถูกเรียกจากใน memo วิ่งผ่าน fnRef (ได้ตัวล่าสุดเสมอ ไม่ติด closure เก่า)", () => {
  assert.ok(SRC.includes("fnRef.current = { openContact, jumpToMsg, dlFile, scanCoupon };"));
  const m = between("const msgsEl = React.useMemo(", "\n  const custOptionsAll");
  for (const fn of ["jumpToMsg(", "dlFile(", "scanCoupon("]) {
    const bare = m.split(fn).length - 1, viaRef = m.split("fnRef.current." + fn).length - 1;
    assert.ok(viaRef > 0 && bare === viaRef, `${fn} ต้องเรียกผ่าน fnRef ทุกจุด (bare ${bare} / ref ${viaRef})`);
  }
  const c = between("const convoEl = React.useMemo(", "\n  const selName");
  assert.ok(c.includes("fnRef.current.openContact(c)") && !c.includes("=> openContact(c)"));
});
check("ตัวเลือกลูกค้า 700+ รายการใน <select> ไม่ถูกสร้างใหม่ทุกครั้งที่วาด", () => {
  assert.ok(SRC.includes("const custOptionsAll = React.useMemo(() => custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>), [custs]);"));
  assert.ok(RET.includes("{custOptionsAll}"));
});

console.log("\n(2) ไม่โหลดรายชื่อแชตทั้งตารางซ้ำ ๆ:");
check("realtime: ผสานแถวที่เปลี่ยนเข้า state (mergeContactRow) · โหลดเต็มเหลือเป็นตาข่ายนิรภัย 30 วิ (เดิม 3 วิ)", () => {
  const rt = between("// realtime: new messages + contact changes", "// document + job history");
  assert.ok(rt.includes("loadContacts(); }, 30000); };"));
  assert.ok(rt.includes('if (p.eventType === "DELETE") mergeContactRow(key, p.old || {}, true); else if (p.new) mergeContactRow(key, p.new);'));
  assert.ok(!rt.includes("}, 3000);"));
});
check("เปลี่ยนสถานะ/ผู้ดูแล/โน้ต/แท็ก/ปิดบอท/ปักหมุด/เปิดอ่าน = patch ทันที ไม่โหลดทั้งตาราง", () => {
  for (const s of ["patchLocal(sel, { stage: s });", "patchLocal(sel, { assigned_to: uid || null });", "patchLocal(sel, { note: note || null });", "patchLocal(sel, { ai_off: !!off });", "patchLocal(c.line_user_id, { pinned: !c.pinned });", "patchLocal(c.line_user_id, { unread: 0 });"])
    assert.ok(SRC.includes(s), "ไม่เจอ " + s);
  for (const s of ["setLineStage(sel, s); await loadContacts()", "setLineOwner(sel, uid || null); await loadContacts()", "chMarkRead(c.line_user_id); loadContacts()"])
    assert.ok(!SRC.includes(s), "ยังโหลดทั้งตารางหลัง: " + s);
});
check("เปลี่ยนชื่อ/ผูก-ถอดลูกค้า ยังโหลดเต็ม (ต้องการชื่อโปรไฟล์ดิบ/ตารางเชื่อม ที่ realtime ไม่ส่งมา)", () => {
  const rn = between("async function renameContact(c)", "React.useEffect(() => { selRef.current = sel; }");
  assert.ok(rn.includes("await loadContacts();"));
});
// ---- รันตรรกะ mergeContactRow จริง ----
const fnSrc = between("  function mergeContactRow(key, row, removed) {", "\n  }\n") + "\n  }";
let state = { line: [{ line_user_id: "U1", display_name: "คุณเอ", customer_id: 7, customerName: "บจก. เอ", custIds: [7, 9], unread: 0, stage: "new" }], fb: [] };
const setAllC = (f) => { state = f(state); };
const merge = new Function("setAllC", "custNameRef", fnSrc + "\n return mergeContactRow;")(setAllC, { current: { 7: "บจก. เอ", 8: "ร้านบี" } });
check("ข้อความเข้า (UPDATE แถวเดิม): unread/ข้อความล่าสุดอัปเดต · ชื่อลูกค้าและลูกค้าที่ผูกเพิ่มไว้ไม่หาย", () => {
  merge("line", { line_user_id: "U1", display_name: "คุณเอ", custom_name: null, customer_id: 7, unread: 3, last_message: "สวัสดีครับ", stage: "new" });
  const c = state.line[0];
  assert.equal(c.unread, 3); assert.equal(c.last_message, "สวัสดีครับ"); assert.equal(c.customerName, "บจก. เอ"); assert.deepEqual(c.custIds, [7, 9]);
  assert.equal(state.line.length, 1, "ห้ามเพิ่มแถวซ้ำ");
});
check("ตั้งชื่อเอง (custom_name) ต้องชนะชื่อโปรไฟล์ · เปลี่ยนลูกค้าที่ผูก → ชื่อใหม่ + เพิ่มเข้า custIds", () => {
  merge("line", { line_user_id: "U1", display_name: "คุณเอ", custom_name: "เอ (ลูกค้า VIP)", customer_id: 8, unread: 0 });
  const c = state.line[0];
  assert.equal(c.display_name, "เอ (ลูกค้า VIP)"); assert.equal(c.customerName, "ร้านบี"); assert.deepEqual(c.custIds, [8, 7, 9]);
});
check("ห้องใหม่ (INSERT) ถูกเพิ่มเข้า · FB ใช้ psid เป็น line_user_id + channel fb · ลบ (DELETE) ถูกเอาออก · แถวไม่มี id ถูกข้าม", () => {
  merge("line", { line_user_id: "U2", display_name: "ลูกค้าใหม่", customer_id: null, unread: 1 });
  assert.equal(state.line.length, 2); assert.equal(state.line.find((c) => c.line_user_id === "U2").customerName, null);
  merge("fb", { psid: "P1", display_name: "เฟซบุ๊ก", customer_id: null, unread: 1 });
  assert.deepEqual([state.fb[0].line_user_id, state.fb[0].channel], ["P1", "fb"]);
  merge("line", { line_user_id: "U2" }, true); assert.equal(state.line.length, 1);
  merge("line", {}); merge("line", null); assert.equal(state.line.length, 1);
});

console.log("\n(3) โหลดเท่าที่ใช้:");
check("เปิดห้อง = ข้อความท้ายสุด CHAT_FIRST (80) · โหลดเก่าทีละ CHAT_OLDER (200) · ปุ่มโหลดเก่าอิงขนาดหน้าที่ขอจริง", () => {
  assert.ok(SRC.includes("const CHAT_FIRST = 80;") && SRC.includes("const CHAT_OLDER = 200;") && SRC.includes("const CONVO_PAGE = 80;"));
  assert.ok(SRC.includes("chListMessages(c.line_user_id, { limit: CHAT_FIRST })") && SRC.includes("setMoreOld(rows.length >= CHAT_FIRST);"));
  assert.ok(SRC.includes("{ before: msgs[0].created_at, limit: CHAT_OLDER }") && SRC.includes("setMoreOld(older.length >= CHAT_OLDER);"));
});
check("ใบงานทั้งบริษัท + ทีม โหลดเมื่อเปิดแผงคิวช่างเท่านั้น (ปุ่มส่งคอนเฟิมโหลดเองถ้ายังไม่มี)", () => {
  assert.ok(SRC.includes("React.useEffect(() => { if (!showQueue) return; if (!teams.length) listTeams().then(setTeams).catch(() => {}); if (!jobs) listJobOrders().then(setJobs).catch(() => {}); }, [showQueue]);"));
  assert.ok(!SRC.includes("listJobOrders().then(setJobs).catch(() => {}); }, []);"));
  assert.ok(SRC.includes("if (!js) { js = await listJobOrders(); setJobs(js); }"));
});
check("รูปโปรไฟล์ในรายชื่อโหลดแบบ lazy · รูปในแชตถอดรหัสแบบ async (ไม่ lazy — กันความสูงเปลี่ยนหลังเลื่อนลงล่างสุดตอนเปิดห้อง)", () => {
  assert.ok(SRC.includes('<img className="chat-img" src={m.image_url} alt="" decoding="async" />'));
  assert.ok(SRC.includes('<img src={c.picture_url} alt="" loading="lazy" decoding="async" />'));
});

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
if (fail) process.exit(1);
