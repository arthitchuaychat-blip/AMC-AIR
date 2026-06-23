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
export function InternalNoteTag({ note }) {
  if (!note) return null;
  return <div className="int-note-tag" title="หมายเหตุภายใน — ไม่แสดงให้ลูกค้า">🔒 <b>ภายใน:</b> {note}</div>;
}
