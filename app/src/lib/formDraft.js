// ร่างอัตโนมัติของฟอร์มเอกสาร + ทะเบียนกลาง "มีฟอร์มค้างกรอกอยู่ไหม"
//
// ปัญหาที่แก้: ฟอร์ม BOQ/ใบเสนอราคาอยู่ใน state ล้วน ไม่มีสแนปช็อตที่ไหนเลย
// กดปุ่ม Back ของ Android · เบราว์เซอร์รีโหลดแท็บหลังสลับไปเปิดกล้อง/LINE · เผลอกดเมนูอื่น
// = ที่คีย์ค้างไว้ทั้งใบหายทันที ไม่มีทางกู้
//
// ⚠️ กติกาสำคัญ 3 ข้อ (ผิดข้อไหนกลายเป็นทำข้อมูลพังแทนที่จะช่วย):
// 1. ต้องเทียบกับ "ใบที่เพิ่งโหลดมา" (base) ไม่ใช่เทียบกับ null — ไม่งั้นเปิดใบเก่ามาเฉย ๆ ก็ถือว่าแก้แล้ว
// 2. ล้างร่างเฉพาะตอนบันทึก "สำเร็จ" เท่านั้น — ห้ามล้างใน catch หรือปุ่มยกเลิก
//    เพราะจังหวะที่บันทึกล้มเหลวคือจังหวะที่ร่างเป็นสำเนาชิ้นเดียวที่เหลืออยู่
// 3. คีย์ต้องมี prefix แยกชนิดเอกสาร — ไม่งั้นร่าง BOQ กับใบเสนอราคาทับกัน

const KEY = (k) => `draft:${k}`;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;   // ร่างเกิน 7 วันถือว่าเลิกใช้แล้ว ไม่ต้องถามกู้

export function saveDraft(key, data) {
  if (!key) return;
  try { localStorage.setItem(KEY(key), JSON.stringify({ at: Date.now(), data })); } catch { /* เต็ม/ปิดไว้ = ไม่ใช่เรื่องคอขาดบาดตาย */ }
}

export function readDraft(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(KEY(key));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !o.data || !o.at || Date.now() - o.at > MAX_AGE_MS) { clearDraft(key); return null; }
    return o;
  } catch { return null; }
}

export function clearDraft(key) {
  if (!key) return;
  try { localStorage.removeItem(KEY(key)); } catch { /* ไม่เป็นไร */ }
}

// เวลาที่ผ่านมาแบบอ่านง่าย ไว้บอกในกล่องถามกู้ร่าง
export function draftAgo(at) {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 1) return "เมื่อครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} ชม.ที่แล้ว` : `${Math.round(h / 24)} วันที่แล้ว`;
}

// ---------- ทะเบียนกลาง: มีฟอร์มค้างกรอกเปิดอยู่ไหม ----------
// ให้ App.jsx ถามก่อนพา Back/สลับเมนูออกจากหน้า โดยไม่ต้องยก state ของฟอร์มขึ้นไปข้างบน
const dirtyForms = new Set();
export function registerUnsaved(key, isDirty) {
  if (!key) return;
  if (isDirty) dirtyForms.add(key); else dirtyForms.delete(key);
}
export function clearUnsaved(key) { dirtyForms.delete(key); }
export function hasUnsaved() { return dirtyForms.size > 0; }
