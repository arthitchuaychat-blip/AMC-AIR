import React from 'react';
import { calculateSalesWht } from '../lib/salesWht.js';
import { fmtBaht2 } from '../lib/format';
import SalesWhtControl from './SalesWhtControl';
export default function LineWhtModal({ title, subtitle, items = [], rate = 3, customerType, enabled = false, savedAmount, docBase, docTotal, canEdit, onSave, onClose }) {
  const [ed, setEd] = React.useState({ wht: !!enabled, wht_rate: rate });
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const calc = calculateSalesWht({ items, base: docBase, total: docTotal, customerType, enabled: ed.wht, rate: ed.wht_rate });
  const editable = canEdit && customerType === 'company' && !items.some(i => i.kind === 'unknown');
  async function save() {
    if (!reason.trim()) return setError('กรุณาระบุเหตุผลที่เปลี่ยนเงื่อนไข');
    setBusy(true); setError('');
    try { await onSave({ enabled: ed.wht, rate: ed.wht_rate, reason: reason.trim() }); }
    catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  }
  const amount = editable ? calc.amount : Number(savedAmount ?? calc.amount);
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()} style={{ width: 700, maxWidth: '96vw' }}>
    <div className="modal-head"><div className="modal-title">{title}<span>{subtitle}</span></div><button className="drawer-close" onClick={onClose}>×</button></div>
    <div className="modal-body">
      <table><thead><tr><th>รายการ</th><th>หมวด</th><th>จำนวนเงิน</th></tr></thead><tbody>{items.map((it,i) => <tr key={i}><td>{it.name}</td><td>{it.kind === 'service' ? 'บริการ · ฐานหัก' : it.kind === 'unknown' ? 'รอตรวจหมวด' : 'สินค้า · ไม่หัก'}</td><td>{fmtBaht2(it.amount)}</td></tr>)}</tbody></table>
      <SalesWhtControl customerType={customerType} enabled={ed.wht} rate={ed.wht_rate} disabled={!editable} onChange={(k,v) => setEd(s => ({ ...s, [k]: v }))} />
      {!editable && <p className="page-sub">ดูข้อมูลตามเอกสารเดิม · ใบที่ส่งบัญชี/กระทบยอด/มีเอกสารต่อแล้วต้องให้ฝ่ายบัญชีตรวจและทำรายการปรับปรุงก่อนแก้ไข</p>}
      {customerType === 'company' && <div className="inv-summary"><div><span>ลูกค้าหัก ณ ที่จ่าย</span><b>{fmtBaht2(amount)}</b></div><div><span>รับสุทธิ</span><b>{fmtBaht2(Number(docTotal) - amount)}</b></div></div>}
      {editable && <label className="fld"><span>เหตุผลในการเปลี่ยนเงื่อนไข</span><textarea className="inp" value={reason} onChange={e => setReason(e.target.value)} placeholder="เช่น ลูกค้ายืนยันอัตราตามเงื่อนไขการชำระ พร้อมเลขอ้างอิง" /></label>}
      {error && <p role="alert" style={{color:'var(--down)'}}>{error}</p>}
    </div><div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ปิด</button>{editable && <button className="btn-primary" disabled={busy || !reason.trim()} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึกเงื่อนไข'}</button>}</div>
  </div></div>;
}
