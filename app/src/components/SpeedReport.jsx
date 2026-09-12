import React from 'react';
import { speedSamples } from '../lib/screenTiming';
const names = { quote: 'ใบเสนอราคา', receipt: 'ใบเสร็จ', subcontract: 'ช่างซัพ' };
export default function SpeedReport() {
  const [rows, setRows] = React.useState(null);
  return <>
    <button type="button" className="logout-btn" onClick={() => setRows(speedSamples())}>ผลวัดความเร็ว</button>
    {rows && <div role="dialog" aria-modal="true" aria-label="ผลวัดความเร็ว" style={{ position: 'fixed', inset: 0, background: '#0006', zIndex: 9999, display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ width: 'min(640px, 94vw)', maxHeight: '85vh', overflow: 'auto', padding: 24 }}>
        <h2>ความเร็วจากเครื่องนี้</h2>
        <p>วัดการเปิดใบเสนอราคา ใบเสร็จ และช่างซัพ ในรอบการใช้งานนี้ รวมเวลารอข้อมูลและแสดงผล ไม่รวมการบันทึกเอกสาร</p>
        {!rows.length ? <p>เปิดเมนูที่ระบุแล้วกลับมาดูผลได้ครับ</p> : <table style={{ width: '100%' }}><thead><tr><th>เมนู</th><th>เวลา</th><th>เริ่มวัด</th><th>ผล</th></tr></thead><tbody>{rows.map((r,i) => <tr key={i}><td>{names[r.menu] || r.menu}</td><td>{(r.milliseconds / 1000).toFixed(2)} วินาที</td><td>{r.source === 'navigation' ? 'กดเมนู' : 'เริ่มหน้าจอ'}</td><td>{r.outcome === 'ready' ? 'พร้อมใช้' : 'ผิดพลาด'}</td></tr>)}</tbody></table>}
        <p>“เริ่มหน้าจอ” ไม่รวมเวลาดาวน์โหลดหน้าจอครั้งแรก ผลนี้ยังไม่ใช่ตัวแทนผู้ใช้ทุกคน</p>
        <button className="btn" onClick={() => setRows(speedSamples())}>อัปเดตผล</button>{' '}
        <button className="btn" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ measurements: rows }, null, 2)], { type: 'application/json' })); const a=document.createElement('a'); a.href=url; a.download='amc-speed-report.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }}>ดาวน์โหลดผล</button>{' '}
        <button className="btn-primary" onClick={() => setRows(null)}>ปิด</button>
      </div>
    </div>}
  </>;
}
