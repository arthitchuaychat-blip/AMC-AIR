// แก้หมายเหตุของเอกสารที่ออกไปแล้ว (updateDocNotes)
// ใบส่งของ/ใบแจ้งหนี้ · ใบวางบิล · ใบเสร็จ ไม่มีฟอร์มแก้ทั้งใบโดยตั้งใจ (เอกสารการเงิน)
// จึงเปิดทางแคบ ๆ ให้แก้แค่ 2 คอลัมน์ กติกาที่ห้ามหลุด:
//   1. ใบที่ยกเลิกแล้ว = ประวัติ ห้ามแก้
//   2. RLS ที่ปฏิเสธคืน 0 แถวโดยไม่ error → ต้องเช็กผลจริง ไม่งั้นจอขึ้น "บันทึกแล้ว" ทั้งที่ไม่ได้เขียน
//   3. internal_note เป็นของทั้งสาย ต้องส่งต่อ "ทุกชนิด" ไม่งั้นค่าที่พิมพ์กลายเป็นเด็กกำพร้า
//      แล้วรอบหน้าที่ใครบันทึกใบใดในสาย ค่าเก่าจะถูกกวาดทับกลับมา = ที่พิมพ์ไว้หายเงียบ
//      (ข้อ 3 พลาดมาแล้วจริงในรอบแรก — เขียน link ไว้แค่ invoice ลืม receipt/billing ซึ่งเป็น 2 ใน 3 ใบที่ทำฟีเจอร์นี้ให้)
//   4. ชนิดเอกสารในสมุดตรวจสอบต้องตรงกับ AUDIT_TYPES ไม่งั้นกรองหาไม่เจอ
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const api = fs.readFileSync("src/lib/api.js", "utf8");

console.log("\nแก้หมายเหตุเอกสารที่ออกไปแล้ว:");

// ---------- เตรียมรัน updateDocNotes ตัวจริง ----------
const grab = (start, end) => api.slice(api.indexOf(start), api.indexOf(end, api.indexOf(start)));
const src = grab("const _NOTE_DOCS = {", "export async function saveBoq")
  .replace("export async function updateDocNotes", "async function updateDocNotes");

let synced = null, audited = null, updated = null;
const makeSupabase = (row, updateRows) => ({
  from: (table) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
    update: (patch) => ({ eq: (col, val) => ({ select: () => { updated = { table, patch, col, val }; return Promise.resolve({ data: updateRows, error: null }); } }) }),
  }),
});
const run = (kind, no, notes, row, updateRows = [{ x: 1 }]) => {
  synced = null; audited = null; updated = null;
  const fn = new Function("supabase", "syncInternalNote", "logAudit",
    src + "\n return updateDocNotes;")(
    makeSupabase(row, updateRows),
    async (link, n) => { synced = { link, n }; },
    async (a) => { audited = a; });
  return fn(kind, no, notes);
};

// 1) ใบยกเลิกแล้วห้ามแก้
await run("invoice", "INV-1", { note: "x" }, { status: "cancelled" })
  .then(() => check("ใบที่ยกเลิกแล้วแก้ไม่ได้", false, "ผ่านไปได้ = แก้เอกสารที่ยกเลิกไปแล้วได้"))
  .catch((e) => check("ใบที่ยกเลิกแล้วแก้ไม่ได้", /ยกเลิก/.test(e.message), e.message));

// 2) RLS ปฏิเสธ = 0 แถว ต้องโยน error ไม่ใช่บอกว่าสำเร็จ
await run("invoice", "INV-1", { note: "x" }, { status: "unpaid" }, [])
  .then(() => check("เขียนไม่ติด (RLS คืน 0 แถว) ต้องแจ้งว่าไม่สำเร็จ", false, "เงียบ = จอขึ้น 'บันทึกแล้ว' ทั้งที่ไม่ได้เขียนอะไร"))
  .catch((e) => check("เขียนไม่ติด (RLS คืน 0 แถว) ต้องแจ้งว่าไม่สำเร็จ", /ไม่มีสิทธิ์|ไม่สำเร็จ/.test(e.message), e.message));

// 3) หาไม่เจอ
await run("invoice", "INV-9", { note: "x" }, null)
  .then(() => check("ไม่พบเอกสารต้องแจ้ง", false))
  .catch((e) => check("ไม่พบเอกสารต้องแจ้ง", /ไม่พบ/.test(e.message), e.message));

// 4) เขียนแค่ 2 คอลัมน์ ไม่แตะยอดเงิน/รายการ
await run("receipt", "RC-1", { note: " ก ", internal_note: " ข " }, { status: "paid", invoice_no: "INV-1" });
check("เขียนแค่ note + internal_note", updated && Object.keys(updated.patch).sort().join(",") === "internal_note,note",
  "เขียน: " + Object.keys(updated?.patch || {}).join(", "));
check("ตัดช่องว่างหัวท้าย", updated?.patch.note === "ก" && updated?.patch.internal_note === "ข");

// 5) ส่งต่อหมายเหตุภายในครบทุกชนิด — ข้อที่พลาดมาแล้ว
check("ใบเสร็จ ส่งต่อผ่านใบแจ้งหนี้ของมัน", synced?.link?.invoiceNo === "INV-1",
  `ได้ ${JSON.stringify(synced?.link)} — ไม่ส่งต่อ = ค่าที่พิมพ์เป็นเด็กกำพร้า แล้วรอบหน้าโดนค่าเก่าทับหาย`);
await run("billing", "BN-1", { internal_note: "ข" }, { status: "open", invoice_nos: ["INV-7", "INV-8"] });
check("ใบวางบิล ส่งต่อผ่านใบแจ้งหนี้ใบแรก", synced?.link?.invoiceNo === "INV-7", `ได้ ${JSON.stringify(synced?.link)}`);
await run("invoice", "INV-1", { internal_note: "ข" }, { status: "unpaid" });
check("ใบแจ้งหนี้ ส่งต่อด้วยเลขตัวเอง", synced?.link?.invoiceNo === "INV-1", `ได้ ${JSON.stringify(synced?.link)}`);

// 6) ชนิดเอกสารในสมุดตรวจสอบต้องตรงกับที่หน้า Settings รู้จัก
const settings = fs.readFileSync("src/components/Settings.jsx", "utf8");
const known = new Set([...(settings.match(/const AUDIT_TYPES = \{[^}]*\}/) || [""])[0].matchAll(/(\w+):/g)].map((m) => m[1]));
await run("billing", "BN-1", { note: "x" }, { status: "open", invoice_nos: ["INV-7"] });
check("ใบวางบิลลงสมุดตรวจสอบด้วยชื่อที่ตัวกรองรู้จัก", known.has(audited?.target_type),
  `ลงเป็น "${audited?.target_type}" แต่ตัวกรองรู้จัก: ${[...known].join(", ")}`);

// 7) ห้ามเปิดทางให้ใบที่มีฟอร์มแก้ของตัวเองอยู่แล้ว (จะกลายเป็นประตูหลังข้ามล็อก เช่น ใบเสนอที่อนุมัติแล้ว)
for (const k of ["quote", "boq", "po"]) {
  await run(k, "X-1", { note: "x" }, { status: "open" })
    .then(() => check(`ไม่รับชนิด "${k}" (มีฟอร์มแก้ของตัวเอง + ล็อกของตัวเอง)`, false, "รับไว้ = ข้ามล็อกของฟอร์มนั้นได้"))
    .catch((e) => check(`ไม่รับชนิด "${k}" (มีฟอร์มแก้ของตัวเอง + ล็อกของตัวเอง)`, /ไม่รู้จัก/.test(e.message), e.message));
}

// 8) ฝั่งจอ — ปุ่มต้องไม่โผล่บนใบที่ยกเลิกแล้ว และต้องส่งค่าเดิมเข้าโมดัล
for (const [th, f, v] of [["ใบแจ้งหนี้", "Invoices.jsx", "x"], ["ใบวางบิล", "BillingNotes.jsx", "b"], ["ใบเสร็จ", "Receipts.jsx", "x"]]) {
  const s = fs.readFileSync("src/components/" + f, "utf8");
  const btn = s.split("\n").find((l) => l.includes("setNotesEd({")) || "";
  check(`${th}: ปุ่มหมายเหตุซ่อนบนใบที่ยกเลิกแล้ว`, btn.includes(`${v}.status !== "cancelled"`) && btn.includes("canEdit"),
    "ปุ่มโผล่บนใบที่ยกเลิก = กดแล้วเด้ง error เปล่า ๆ");
  check(`${th}: ส่งหมายเหตุเดิมเข้าโมดัล`, btn.includes(`note: ${v}.note`) && btn.includes(`internalNote: ${v}.internal_note`),
    "ไม่ส่งค่าเดิม = โมดัลเปิดมาว่าง แล้วบันทึกทับของจริงเป็นค่าว่าง");
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
