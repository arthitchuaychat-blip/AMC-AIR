import React from "react";
import { saveDraft, readDraft, clearDraft, draftAgo, registerUnsaved, clearUnsaved } from "./formDraft";
import { confirmDialog } from "../components/ConfirmDialog";

// ร่างอัตโนมัติสำหรับฟอร์มเอกสาร (BOQ / ใบเสนอราคา)
//   kind  = "boq" | "quote" — ใช้เป็น prefix ของคีย์ ไม่ให้ร่างข้ามชนิดเอกสารทับกัน
//   idOf  = (ed) => เลขที่เอกสาร ถ้าเป็นการแก้ไข · ใบใหม่ให้คืน null (เลขใบใหม่เปลี่ยนทุกครั้งที่เปิดฟอร์ม
//           ถ้าเอามาเป็นคีย์จะกู้ไม่เจอตลอดกาล)
//   label = ชื่อเอกสารที่จะขึ้นในกล่องถาม
//
// คืน { dirty, draftKey, clearOnSaved, closeGuard }
export function useFormDraft(ed, setEd, { kind, idOf, label }) {
  const [edBase, setEdBase] = React.useState(null);
  const askedRef = React.useRef(null);   // คีย์ที่ถามกู้ร่างไปแล้ว — กันถามซ้ำทุก render

  const draftKey = ed ? `${kind}-${idOf(ed) || "new"}` : null;
  // ⚠️ เทียบกับ "ใบที่เพิ่งโหลดมา" ไม่ใช่ null — ไม่งั้นแค่เปิดใบเก่ามาดูก็ถือว่าแก้แล้ว
  const dirty = React.useMemo(
    () => !!ed && !!edBase && JSON.stringify(ed) !== JSON.stringify(edBase),
    [ed, edBase]);

  // ฟอร์มเพิ่งเปิด → เก็บต้นฉบับ + ถามกู้ร่างถ้ามีค้างอยู่
  React.useEffect(() => {
    if (!ed) { setEdBase(null); askedRef.current = null; return; }
    if (edBase) return;
    setEdBase(ed);
    const key = `${kind}-${idOf(ed) || "new"}`;
    if (askedRef.current === key) return;
    askedRef.current = key;
    const d = readDraft(key);
    if (!d) return;
    // ร่างเหมือนกับที่เปิดอยู่แล้ว = ไม่มีอะไรให้กู้
    if (JSON.stringify(d.data) === JSON.stringify(ed)) { clearDraft(key); return; }
    (async () => {
      if (await confirmDialog({
        title: `พบ${label}ที่กรอกค้างไว้`,
        message: `มีข้อมูลที่กรอกค้างไว้เมื่อ ${draftAgo(d.at)} แต่ยังไม่ได้บันทึก\n\nกู้ข้อมูลนั้นกลับมาไหม? (กด "ไม่ใช้" จะใช้ข้อมูลล่าสุดจากระบบแทน และลบร่างทิ้ง)`,
        confirmText: "กู้กลับมา", cancelText: "ไม่ใช้ ลบร่างทิ้ง",
      })) setEd(d.data);
      else clearDraft(key);
    })();
  }, [ed]);

  // เก็บร่างอัตโนมัติระหว่างพิมพ์ (หน่วงไว้ ไม่เขียนทุกตัวอักษร)
  React.useEffect(() => {
    if (!dirty || !draftKey) return;
    const t = setTimeout(() => saveDraft(draftKey, ed), 800);
    return () => clearTimeout(t);
  }, [ed, dirty, draftKey]);

  // แจ้งทะเบียนกลางว่ามีฟอร์มค้างกรอก — App.jsx เอาไปถามก่อนพา Back/สลับเมนู
  React.useEffect(() => {
    registerUnsaved(draftKey, dirty);
    return () => clearUnsaved(draftKey);
  }, [draftKey, dirty]);

  // เรียกเมื่อบันทึก "สำเร็จ" เท่านั้น — ห้ามเรียกใน catch หรือปุ่มยกเลิก
  const clearOnSaved = React.useCallback((key) => { clearDraft(key || draftKey); clearUnsaved(key || draftKey); setEdBase(null); }, [draftKey]);

  // ปุ่มยกเลิก: ถามก่อนถ้ามีของค้าง — ตั้งใจไม่ลบร่าง เพื่อให้ยังกู้ได้ครั้งหน้า
  const closeGuard = React.useCallback(async () => {
    if (dirty && !await confirmDialog({
      title: "ปิดโดยไม่บันทึก?",
      message: `มีข้อมูลใน${label}ที่ยังไม่ได้บันทึก\n\nข้อมูลที่กรอกจะถูกเก็บไว้ กู้คืนได้ตอนเปิดใบนี้ครั้งหน้า`,
      confirmText: "ปิดเลย", cancelText: "กลับไปแก้ต่อ",
    })) return false;
    setEdBase(null);
    return true;
  }, [dirty, label]);

  return { dirty, draftKey, clearOnSaved, closeGuard };
}
