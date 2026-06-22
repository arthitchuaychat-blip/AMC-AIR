import React from "react";

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
