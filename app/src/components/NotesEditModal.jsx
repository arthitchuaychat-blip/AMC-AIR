import React from "react";
import { updateDocNotes } from "../lib/api";
import { DocNoteField, InternalNoteField } from "./InternalNote";
import { UIcon } from "../icons";

// แก้หมายเหตุของเอกสารที่ออกไปแล้ว — เฉพาะ 2 คอลัมน์ ไม่แตะยอดเงิน/รายการ
// ใบส่งของ/ใบแจ้งหนี้ · ใบวางบิล · ใบเสร็จ ไม่มีฟอร์มแก้ทั้งใบโดยตั้งใจ (เอกสารการเงิน)
// แต่กติกาเจ้าของคือหมายเหตุต้องแก้ได้ทุกใบ จึงเปิดทางแคบ ๆ ทางนี้แทนการสร้างตัวแก้เอกสารเต็มรูป
export default function NotesEditModal({ kind, docNo, title, note, internalNote, onClose, onSaved, flash }) {
  const [n, setN] = React.useState(note || "");
  const [inn, setInn] = React.useState(internalNote || "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateDocNotes(kind, docNo, { note: n, internal_note: inn });
      flash && flash("บันทึกหมายเหตุแล้ว");
      if (onSaved) await onSaved();
      onClose();
    } catch (e) { flash && flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <div className="modal-overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "94vw" }}>
        <div className="modal-head">
          <div className="modal-title">แก้หมายเหตุ<span>{docNo}{title ? " · " + title : ""}</span></div>
          <button className="drawer-close" onClick={onClose} disabled={busy}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          {/* บอกให้ชัดว่าแก้ได้แค่หมายเหตุ กันเข้าใจผิดว่าแก้ยอดเงินได้ */}
          <p className="page-sub" style={{ marginBottom: 10 }}>
            แก้ได้เฉพาะ<b>หมายเหตุ</b> · ยอดเงินและรายการของเอกสารที่ออกไปแล้วแก้ไม่ได้
          </p>
          <DocNoteField value={n} onChange={setN} />
          <InternalNoteField value={inn} onChange={setInn} />
          <p className="page-sub" style={{ marginTop: 6 }}>
            📄 หมายเหตุ = ของใบนี้ใบเดียว (คือสิ่งที่พิมพ์ลงกระดาษของใบนี้)<br />
            🔒 หมายเหตุภายใน = ใช้ร่วมกันทั้งสายเอกสาร — แก้ที่นี่แล้วใบอื่นที่เชื่อมกัน (BOQ / ใบเสนอราคา / ใบงาน / ใบสั่งซื้อ / ใบเสร็จ) เปลี่ยนตามด้วย
          </p>
          {/* ล้างค่าเป็นว่างส่งต่อทั้งสายไม่ได้ (ระบบกันไว้ ไม่ให้เผลอล้างโน้ตทั้งสายจากใบเดียว)
              ⇒ ต้องบอกตรง ๆ ไม่งั้นผู้ใช้เข้าใจว่าล้างหมดแล้ว แต่ใบอื่นยังค้างของเก่าอยู่ */}
          {!inn.trim() && (internalNote || "").trim() ? (
            <p className="page-sub" style={{ marginTop: 6, color: "#b45309" }}>
              ⚠️ การ<b>ล้าง</b>หมายเหตุภายในมีผลกับใบนี้ใบเดียว — ใบอื่นในสายยังเก็บข้อความเดิมไว้
              และถ้ามีคนบันทึกใบใดในสายนี้อีกครั้ง ข้อความเดิมจะถูกส่งกลับมาที่ใบนี้
            </p>
          ) : null}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            <UIcon name="check" size={14} color="#fff" /> {busy ? "กำลังบันทึก…" : "บันทึกหมายเหตุ"}
          </button>
        </div>
      </div>
    </div>
  );
}
