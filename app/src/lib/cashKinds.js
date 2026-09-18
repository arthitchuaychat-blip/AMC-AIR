// รายการเงินสดที่ "เงินขยับจริง แต่ไม่ใช่รายรับ/รายจ่ายของธุรกิจ" (non-operating)
//   transfer   = โอนระหว่างบัญชีตัวเอง (บริษัท ↔ บุคคล) — 2 ขา ออก/เข้า หักล้างกันในมุมมองรวม
//   owner_draw = เจ้าของเบิกใช้ส่วนตัว (เงินออกจากบัญชีธุรกิจไปใช้เรื่องส่วนตัว) — ไม่ใช่ค่าใช้จ่ายของกิจการ
//   owner_in   = เจ้าของเติมเงินเข้า / เงินส่วนตัวเข้าบัญชีธุรกิจ — ไม่ใช่รายได้
// กติกา: "ยอดคงเหลือ" ต้องนับรายการพวกนี้เสมอ (เงินขยับจริง) แต่ "รับจริง/จ่ายจริง/แยกหมวดรายจ่าย" ต้องไม่นับ
//   ไม่งั้นโอนเงินไปมา 1 ล้าน = ยอดรับ-จ่ายของแต่ละกิจการพองขึ้น 1 ล้าน ทั้งที่ธุรกิจไม่ได้ขาย/จ่ายอะไรเลย
// ยอดขาย/ค่าใช้จ่าย/ภาษี คำนวณจากเอกสาร (ใบเสร็จ/ใบเบิก) ไม่ได้อ่าน cash_entries — รายการพวกนี้จึงไม่กระทบรายงานเหล่านั้นอยู่แล้ว
export const NONOP_TYPES = ["transfer", "owner_draw", "owner_in"];
export const NONOP_LABEL = {
  transfer: "โอนระหว่างบัญชี",
  owner_draw: "เจ้าของเบิกใช้ส่วนตัว",
  owner_in: "เจ้าของเติมเงินเข้า",
};
// ทิศทางเงินที่ถูกบังคับของแต่ละชนิด (transfer มีทั้ง 2 ขา จึงไม่บังคับ)
export const NONOP_DIRECTION = { owner_draw: "out", owner_in: "in" };
// ชนิดที่ผู้ใช้สร้าง/แก้เองได้เต็มที่ในฟอร์ม (ไม่ได้มาจากเอกสาร) — ใช้ตัดสินว่าล็อกช่องไหม / ลบได้ไหม
export const USER_TYPES = ["manual", ...NONOP_TYPES];

// รายการเก่าก่อนมีชนิด transfer: ปุ่ม "โอนระหว่างบัญชี" เคยบันทึกเป็น manual + โน้ตขึ้นต้น 🔄 → ต้องนับเป็นโอนด้วย
// (รวมกรณี DB ยังไม่รัน migration ที่เปิดชนิดใหม่ แล้วระบบ fallback ไปเก็บแบบ manual + คำนำหน้า)
const LEGACY_PREFIX = { "🔄": "transfer", "👤": "owner_draw", "💰": "owner_in" };
export function nonOpKind(e) {
  if (!e) return null;
  if (NONOP_TYPES.includes(e.source_type)) return e.source_type;
  if (e.source_type === "manual" || !e.source_type) {
    const note = String(e.note || "");
    for (const p of Object.keys(LEGACY_PREFIX)) if (note.startsWith(p)) return LEGACY_PREFIX[p];
  }
  return null;
}
export const isNonOp = (e) => nonOpKind(e) != null;
// คำนำหน้าโน้ตเมื่อจำเป็นต้องเก็บแบบ manual (pre-migration fallback) — ให้ nonOpKind จำได้
export const NONOP_NOTE_PREFIX = { transfer: "🔄", owner_draw: "👤 เจ้าของเบิกใช้ส่วนตัว", owner_in: "💰 เจ้าของเติมเงินเข้า" };
