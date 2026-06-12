import React from "react";
import { fmtBaht2, round2 } from "../lib/format";
import { UIcon } from "../icons";

// View a document's line items and choose หัก ณ ที่จ่าย per line + rate.
// WHT base for this installment = docBase × (flagged amount / all amount); wht = base × rate%.
export default function LineWhtModal({ title, subtitle, items: initial, rate: initialRate, docBase, docTotal, canEdit, onSave, onClose }) {
  const [items, setItems] = React.useState((initial || []).map((x) => ({ ...x })));
  const [rate, setRate] = React.useState(Number(initialRate) || 3);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { const esc = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, []);

  const allSum = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const flaggedSum = items.filter((i) => i.wht).reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const ratio = allSum > 0 ? flaggedSum / allSum : 0;
  const whtBase = round2((Number(docBase) || 0) * ratio);
  const whtAmt = round2(whtBase * rate / 100);
  const net = round2((Number(docTotal) || 0) - whtAmt);

  const toggle = (i) => setItems((s) => s.map((x, j) => j === i ? { ...x, wht: !x.wht } : x));
  async function save() { setBusy(true); try { await onSave({ items, rate, whtAmt, net }); } finally { setBusy(false); } }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 660 }}>
        <div className="modal-head">
          <div className="modal-title">{title}{subtitle ? <span>{subtitle}</span> : null}</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="page-sub" style={{ marginBottom: 10 }}>ติ๊ก ✓ รายการที่ต้อง<b>หัก ณ ที่จ่าย</b> (ปกติเฉพาะค่าบริการ ส่วนค่าสินค้าไม่หัก)</p>
          <table className="lw-table">
            <thead><tr><th>รายการ</th><th className="r">จำนวนเงิน</th><th className="c">หัก ณ ที่จ่าย</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan="3" className="lw-empty">ใบนี้ไม่มี snapshot รายการ (สร้างก่อนอัปเดต) — สร้างใบใหม่เพื่อใช้หัก ณ ที่จ่ายรายบรรทัด</td></tr>}
              {items.map((it, i) => (
                <tr key={i}>
                  <td>{it.name}{it.code ? <span className="lw-code"> · {it.code}</span> : null}<div className="lw-sub">{Number(it.qty)} {it.unit || ""} × {fmtBaht2(it.price)}</div></td>
                  <td className="r">{fmtBaht2(it.amount)}</td>
                  <td className="c"><input type="checkbox" checked={!!it.wht} disabled={!canEdit} onChange={() => toggle(i)} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="lw-rate">
            <span>อัตราหัก ณ ที่จ่าย</span>
            <div className="inp inp-unit" style={{ width: 110 }}><input type="number" min="0" step="0.1" value={rate} disabled={!canEdit} onChange={(e) => setRate(Number(e.target.value) || 0)} /><span className="unit-suf">%</span></div>
          </div>
          <div className="inv-summary" style={{ marginTop: 12 }}>
            <div><span>ยอดงวดนี้ (รวม VAT)</span><b>{fmtBaht2(docTotal)}</b></div>
            <div><span>ฐานที่หัก ({Math.round(ratio * 100)}% ของงวด)</span><b>{fmtBaht2(whtBase)}</b></div>
            {whtAmt > 0 && <div><span>หัก ณ ที่จ่าย {rate}%</span><b style={{ color: "var(--down)" }}>− {fmtBaht2(whtAmt)}</b></div>}
            <div className="inv-remain"><span>ยอดรับสุทธิ</span><b>{fmtBaht2(net)}</b></div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>ปิด</button>
          {canEdit && items.length > 0 && <button className="btn-primary" disabled={busy} onClick={save}><UIcon name="check" size={15} color="#fff" /> {busy ? "กำลังบันทึก…" : "บันทึกหัก ณ ที่จ่าย"}</button>}
        </div>
      </div>
    </div>
  );
}
