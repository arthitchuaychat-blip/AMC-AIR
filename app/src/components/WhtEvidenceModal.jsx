import React from 'react';
import { listWhtEvidence, saveWhtEvidence, uploadWhtEvidence, whtEvidenceUrl } from '../lib/salesWhtApi';
import { fmtBaht2 } from '../lib/format';
export default function WhtEvidenceModal({ receipt, role, onClose, onSaved }) {
  const canVerify = ['exec','admin','finance'].includes(role);
  const [row,setRow] = React.useState(null), [file,setFile] = React.useState(null), [error,setError] = React.useState(''), [busy,setBusy] = React.useState(false);
  React.useEffect(() => { let active=true; listWhtEvidence(receipt.receipt_no).then(data => { if(active) setRow(data[0] || { receipt_no:receipt.receipt_no, certificate_no:'', certificate_date:'', received_on:'', method:'paper', withheld_amount:Number(receipt.wht_amt), status:'waiting', note:'', file_path:null }); }).catch(e => { if(active) setError(e.message); }); return () => {active=false;}; },[receipt.receipt_no]);
  const locked = row?.status === 'verified' && !canVerify;
  const set = (key,value) => setRow(r=>({...r,[key]:value}));
  async function save(){setBusy(true);setError('');try{
    const path=file ? await uploadWhtEvidence(file) : row.file_path;
    await saveWhtEvidence({receipt_no:receipt.receipt_no,certificate_no:row.certificate_no,certificate_date:row.certificate_date || null,received_on:row.received_on || null,method:row.method,withheld_amount:Number(row.withheld_amount),status:row.status,note:row.note,file_path:path});
    onSaved?.();onClose();
  }catch(e){setError(e.message || String(e));}finally{setBusy(false);}}
  async function openFile(){const win=window.open('','_blank');if(win)win.opener=null;try{const url=await whtEvidenceUrl(row.file_path);if(win)win.location=url;else setError('อนุญาตเปิดหน้าต่างใหม่เพื่อดูหลักฐาน');}catch(e){win?.close();setError(e.message);}}
  return <div className="modal-overlay" onClick={onClose}><div className="modal" style={{width:650,maxWidth:'96vw'}} onClick={e=>e.stopPropagation()}><div className="modal-head"><div className="modal-title">หลักฐานลูกค้าหัก ณ ที่จ่าย<span>{receipt.receipt_no} · {receipt.customerName}</span></div><button className="drawer-close" onClick={onClose}>×</button></div><div className="modal-body">
    <p>ยอดหักตามใบเสร็จ <b>{fmtBaht2(receipt.wht_amt)}</b> · {receipt.status === 'paid' ? 'รับชำระแล้ว' : 'ยังรอรับชำระ'}</p>
    {row && <fieldset disabled={busy || locked} style={{border:0,padding:0}}>
      <div className="fld-row"><label className="fld"><span>สถานะหลักฐาน</span><select className="inp" value={row.status} onChange={e=>set('status',e.target.value)}><option value="waiting">รอรับหลักฐาน</option><option value="received">ได้รับแล้ว รอตรวจสอบ</option>{canVerify && <option value="verified">ตรวจสอบแล้ว</option>}{!canVerify && row.status==='verified' && <option value="verified">ตรวจสอบแล้ว</option>}</select></label><label className="fld"><span>ช่องทาง</span><select className="inp" value={row.method} onChange={e=>set('method',e.target.value)}><option value="paper">หนังสือรับรองหัก ณ ที่จ่าย</option><option value="ewht">e-Withholding Tax</option></select></label></div>
      <label className="fld"><span>เลขหนังสือรับรอง / เลขอ้างอิง</span><input className="inp" value={row.certificate_no || ''} onChange={e=>set('certificate_no',e.target.value)} /></label>
      <div className="fld-row"><label className="fld"><span>วันที่ในหลักฐาน</span><input className="inp" type="date" value={row.certificate_date || ''} onChange={e=>set('certificate_date',e.target.value)} /></label><label className="fld"><span>วันที่ได้รับหลักฐาน</span><input className="inp" type="date" value={row.received_on || ''} onChange={e=>set('received_on',e.target.value)} /></label></div>
      <label className="fld"><span>ยอดภาษีในหลักฐาน</span><input className="inp" type="number" min="0" step="0.01" value={row.withheld_amount} onChange={e=>set('withheld_amount',e.target.value)} /></label>
      <label className="fld"><span>แนบหลักฐาน PDF / JPG / PNG ไม่เกิน 10 MB</span><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setFile(e.target.files?.[0] || null)} /></label>
      <label className="fld"><span>หมายเหตุ / เหตุผลแก้ไข</span><textarea className="inp" value={row.note || ''} onChange={e=>set('note',e.target.value)} /></label>
    </fieldset>}
    {row?.file_path && <button className="btn-ghost" onClick={openFile}>เปิดไฟล์หลักฐาน</button>}
    {locked && <p>ฝ่ายบัญชีตรวจสอบแล้ว · ให้ฝ่ายบัญชีแก้ไขหากหลักฐานมีการเปลี่ยนแปลง</p>}
    {!row && !error && <p>กำลังโหลด…</p>}{error && <p role="alert" style={{color:'var(--down)'}}>{error}</p>}
  </div><div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ปิด</button>{row && !locked && <button className="btn-primary" disabled={busy} onClick={save}>{busy?'กำลังบันทึก…':'บันทึกหลักฐาน'}</button>}</div></div></div>;
}
