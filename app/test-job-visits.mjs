// ทดสอบตรรกะ "แยกรอบเข้างานว่าแถวไหนแก้ / เพิ่ม / ลบ" ตอนบันทึกใบงาน
// ดึงโค้ดจริงออกจาก api.js มารัน ไม่ได้เขียนสูตรซ้ำ — ถ้าโค้ดเปลี่ยน เทสต์ต้องรู้
//
// ทำไมต้องมี: เดิมบันทึกใบงานทีไร ลบรอบทั้งใบแล้ว insert ใหม่หมด id เปลี่ยนทุกครั้ง
// มือถือช่างที่เปิดหน้าค้างไว้ถือ id เก่า กดอัปเดตสถานะไม่ได้ · และถ้าลบสำเร็จแต่ insert พัง รอบหายทั้งใบ
import fs from "node:fs";
import assert from "node:assert/strict";

const SRC = fs.readFileSync(process.argv[2], "utf8");
const START = "    const byId = Object.fromEntries(backup.map((v) => [String(v.id), v]));";
const END = "    vFinal = [...visitRows, ...otherAdded];   // ชุดรอบที่จะเป็นจริงหลังบันทึก";
const i = SRC.indexOf(START), j = SRC.indexOf(END);
assert.ok(i > 0 && j > i, "ไม่เจอบล็อกแยกรอบใน api.js — เทสต์นี้ต้องอัปเดตตาม");
const BODY = SRC.slice(i, j + END.length);

// ห่อเป็นฟังก์ชันโดยใช้โค้ดจริงทั้งบล็อก
const split = new Function("visitRows", "backup", "jo", `
  let vKeep = [], vFresh = [], vGone = [], vFinal = null;
  ${BODY}
  return { vKeep, vFresh, vGone, vFinal };
`);

let pass = 0, fail = 0;
const check = (name, fn) => { try { fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + e.message); fail++; } };

const row = (id, date, status = "scheduled") => ({ id, job_no: "JB-1", visit_date: date, status });
const ids = (a) => a.map((x) => String(x.id ?? "")).sort();

console.log("\nแยกรอบเข้างานตอนบันทึกใบงาน:");

check("ไม่แก้อะไรเลย → แก้ของเดิมทุกแถว ไม่ลบ ไม่เพิ่ม (id ต้องไม่เปลี่ยน)", () => {
  const backup = [row(1, "2026-08-01"), row(2, "2026-08-05")];
  const r = split([row(1, "2026-08-01"), row(2, "2026-08-05")], backup, { visitIdsLoaded: [1, 2] });
  assert.deepEqual(ids(r.vKeep), ["1", "2"]);
  assert.equal(r.vFresh.length, 0);
  assert.deepEqual(r.vGone, []);
});

check("เพิ่มรอบใหม่ → เข้า vFresh (ไม่มี id) ของเดิมยังคง id", () => {
  const backup = [row(1, "2026-08-01")];
  const r = split([row(1, "2026-08-01"), { id: null, job_no: "JB-1", visit_date: "2026-08-09", status: "scheduled" }], backup, { visitIdsLoaded: [1] });
  assert.deepEqual(ids(r.vKeep), ["1"]);
  assert.equal(r.vFresh.length, 1);
  assert.deepEqual(r.vGone, []);
});

check("ผู้ใช้เอารอบออกจากฟอร์ม → รอบนั้นถูกลบจริง", () => {
  const backup = [row(1, "2026-08-01"), row(2, "2026-08-05")];
  const r = split([row(1, "2026-08-01")], backup, { visitIdsLoaded: [1, 2] });
  assert.deepEqual(r.vGone, ["2"]);
});

// เคสที่บั๊กเดิมกินเงียบ ๆ: ออฟฟิศเปิดฟอร์มค้าง อีกเครื่องเพิ่มรอบเข้ามา
check("เครื่องอื่นเพิ่มรอบระหว่างฟอร์มเปิดค้าง → ต้องไม่ถูกลบ", () => {
  const backup = [row(1, "2026-08-01"), row(9, "2026-08-20")];   // id 9 เพิ่งถูกเพิ่มจากอีกเครื่อง
  const r = split([row(1, "2026-08-01")], backup, { visitIdsLoaded: [1] });   // ฟอร์มเปิดตอนมีแค่ id 1
  assert.deepEqual(r.vGone, [], "รอบของเครื่องอื่นถูกลบทิ้ง");
});

check("รอบของเครื่องอื่นต้องถูกนับตอนคิดสถานะหัวใบ (ไม่งั้นหัวใบขึ้นเสร็จทั้งที่ยังมีรอบค้าง)", () => {
  const backup = [row(1, "2026-08-01", "done"), row(9, "2026-08-20", "scheduled")];
  const r = split([row(1, "2026-08-01", "done")], backup, { visitIdsLoaded: [1] });
  assert.equal(r.vFinal.length, 2, "vFinal ไม่ได้รวมรอบของเครื่องอื่น");
  assert.ok(r.vFinal.some((v) => v.status === "scheduled"), "รอบค้างหายไปจาก vFinal");
});

check("ไคลเอนต์เก่าที่ไม่ส่ง visitIdsLoaded → ถอยไปเทียบกับ DB สด (ไม่ลบมั่ว)", () => {
  const backup = [row(1, "2026-08-01"), row(2, "2026-08-05")];
  const r = split([row(1, "2026-08-01")], backup, {});
  assert.deepEqual(r.vGone, ["2"]);
});

check("รอบใหม่ต้องไม่พก id ไปตอน insert (คอลัมน์เป็น generated always identity)", () => {
  const backup = [];
  const r = split([{ id: null, job_no: "JB-1", visit_date: "2026-08-09", status: "scheduled" }], backup, { visitIdsLoaded: [] });
  const stripped = r.vFresh.map(({ id: _i, ...rest }) => rest);
  assert.ok(!("id" in stripped[0]), "ยังมี id ติดไปกับแถวใหม่");
});

check("ลำดับการเขียนต้องเป็น แก้ → เพิ่ม → ลบ (ลบท้ายสุด พังกลางทางแล้วรอบไม่หาย)", () => {
  const w = SRC.search(/if \(visitRows\) \{\s+for \(const v of vKeep\)/);
  assert.ok(w > 0, "ไม่เจอบล็อกเขียนรอบ");
  const body = SRC.slice(w, w + 1400);
  const iU = body.indexOf("update("), iI = body.indexOf(".insert("), iD = body.indexOf(".delete(");
  assert.ok(iU > 0 && iI > iU && iD > iI, `ลำดับผิด (update ${iU} · insert ${iI} · delete ${iD})`);
});

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
