import React from "react";
import { mySignature } from "../lib/sign";

// per-document signature on/off — renders nothing if the user has no uploaded signature.
export function SignToggle({ on, onChange }) {
  const sig = mySignature();
  if (!sig) return null;
  return (
    <label className="fld sign-toggle-fld">
      <span>✍️ ลายเซ็นในเอกสาร</span>
      <label className="sign-toggle">
        <input type="checkbox" checked={!!on} onChange={(e) => onChange(e.target.checked)} />
        <span>ใส่ลายเซ็นของฉันในเอกสารนี้</span>
        {on && <img className="sign-toggle-prev" src={sig.url} alt="" />}
      </label>
    </label>
  );
}

// Back-office-only note. NEVER passed to DocSlip / printed output — shows only inside the app.
// หมายเหตุที่ "พิมพ์ลงเอกสาร" — คู่แฝดของ InternalNoteField ด้านล่าง วางคู่กันเสมอเพื่อให้เห็นชัดว่าอันไหนลูกค้าเห็น
// ค่านี้ไปโผล่ในกล่อง "หมายเหตุ" บน DocSlip (prop terms) · เริ่มกรอกที่ BOQ แล้วติดไปกับเอกสารใบถัดไปตอนสร้าง
export function DocNoteField({ value, onChange, placeholder }) {
  return (
    <label className="fld">
      <span>📄 หมายเหตุ <small>(พิมพ์ลงเอกสาร · ลูกค้าเห็น)</small></span>
      <textarea className="inp" rows={2} style={{ resize: "vertical" }} value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "เช่น ราคานี้ไม่รวมงานเดินท่อเพิ่ม · กำหนดส่งของภายใน 7 วัน"} />
    </label>
  );
}

export function InternalNoteField({ value, onChange, placeholder }) {
  return (
    <label className="fld int-note-fld">
      <span>🔒 หมายเหตุภายใน <small>(เห็นเฉพาะพนักงานหลังบ้าน · ไม่แสดงบนเอกสารลูกค้า)</small></span>
      <textarea className="inp" rows={2} style={{ resize: "vertical" }} value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "บันทึกภายใน เช่น ต่อรองราคาได้อีก / ลูกค้าจ่ายช้า / ของขาด ฯลฯ"} />
    </label>
  );
}

// compact display on a staff-facing card/list (hidden when empty)
// เห็นได้ทุกคนยกเว้น "ช่าง" (tech/lead_tech/แม่บ้าน) และลูกค้า — ส่ง role มาด้วยเพื่อซ่อนจากช่าง
const FIELD_ROLES = ["tech", "lead_tech", "maid"];
export function InternalNoteTag({ note, role }) {
  if (!note || FIELD_ROLES.includes(role)) return null;
  return <div className="int-note-tag" title="หมายเหตุภายใน — ไม่แสดงให้ลูกค้า">🔒 <b>ภายใน:</b> {note}</div>;
}
