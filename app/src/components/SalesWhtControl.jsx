import React from 'react';
export default function SalesWhtControl({ customerType, enabled, rate, onChange, disabled = false }) {
  if (customerType !== 'company') return null;
  return <div className="inv-summary" style={{ margin: '12px 0' }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input type="checkbox" checked={!!enabled} disabled={disabled} onChange={e => onChange('wht', e.target.checked)} />ลูกค้าหัก ณ ที่จ่าย · เฉพาะหมวดบริการ</label>
    <label className="fld" style={{ maxWidth: 190, marginTop: 10 }}><span>อัตราหัก ณ ที่จ่าย (%)</span><input className="inp" type="number" min="0" max="100" step="0.01" value={rate ?? 3} disabled={disabled || !enabled} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n <= 100) onChange('wht_rate', n); }} /></label>
    <p className="page-sub" style={{ margin: '8px 0 0' }}>คิดจากค่าบริการหลังส่วนลด ก่อน VAT · อัตรา 0% จะคงเป็น 0%<br />งานซ่อม/รับเหมาหรือหน่วยงานรัฐ: ให้ฝ่ายบัญชีตรวจฐานและอัตราตามสัญญาก่อนออกเอกสาร</p>
  </div>;
}
