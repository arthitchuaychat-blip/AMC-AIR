import React from "react";
import { supabase } from "../lib/supabase";

export default function RenewQuotation({ quote, onClose, onRenewed }) {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const [date, setDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { error } = await supabase.rpc("renew_quotation", {
        p_quote_no: quote.quote_no, p_valid_until: date, p_reason: reason.trim(),
      });
      if (error) throw error;
    } catch (e) { setError(e.message || "ต่ออายุไม่สำเร็จ"); setBusy(false); return; }
    onRenewed();
  }
  return <div className="confirm-overlay">
    <form className="confirm-box" role="dialog" aria-modal="true" aria-labelledby="renew-title" onSubmit={submit}>
      <h2 id="renew-title" className="confirm-title">ต่ออายุ {quote.quote_no}</h2>
      <p>วันยืนราคาเดิม: {quote.valid_until || "ไม่ระบุ"}</p>
      <p>ใช้เลขที่และราคาเดิม กรุณาตรวจราคาและเงื่อนไขก่อนต่ออายุ ใบจะกลับเป็น “ส่งแล้ว” เพื่อให้อนุมัติได้ตามปกติ</p>
      <label className="fld"><span>ยืนราคาถึงวันที่ใหม่</span><input className="inp" type="date" required min={today} value={date} onChange={e => setDate(e.target.value)} disabled={busy} autoFocus /></label>
      <label className="fld"><span>เหตุผลที่ต่ออายุ</span><textarea className="inp" required maxLength={450} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} placeholder="เช่น ลูกค้ากลับมาติดต่อขออนุมัติงาน" /></label>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
      <div className="confirm-acts"><button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy || !date || date < today || !reason.trim()}>{busy ? "กำลังต่ออายุ…" : "ยืนยันต่ออายุ"}</button></div>
    </form>
  </div>;
}
