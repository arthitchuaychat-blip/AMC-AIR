import React from 'react';
import {setAppConfig} from '../lib/api';
import {DEFAULT_SUB_RATES,validateSubRates} from '../lib/subcontractRates';
export default function SubcontractRateSettings({value,canEdit,onSaved}) {
 const [form,setForm]=React.useState(value),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
 React.useEffect(()=>setForm(value),[value]);
 async function save(){setBusy(true);setMessage('');try{const cfg=validateSubRates(form);await setAppConfig('subcontractor_rates',cfg);onSaved(cfg);setMessage('บันทึกค่าเริ่มต้นแล้ว');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 return <div className="card"><h2>ตั้งค่าแรงช่างซัพ</h2><p>ใช้ราคาขายในใบเสนอราคาหลังส่วนลด ก่อน VAT ไม่รวมค่าเครื่องแอร์ วัสดุทุกชนิดใช้อัตราวัสดุ รวมอะไหล่และอุปกรณ์เสริม</p>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}>
 {Object.entries({labor:'เหมาเฉพาะค่าแรง (%)',material:'วัสดุทุกชนิด (%)',inclusive:'เหมาทั้งแรงและวัสดุ (%)',cleaning:'ค่าแรงงานล้าง (%)',daily:'รายวัน (บาท/ทีม/วัน)'}).map(([key,label])=><label className="fld" key={key}><span>{label}</span><input className="inp" type="number" min="0" max={key==='daily'?undefined:100} step="0.01" disabled={!canEdit||busy} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
 <label className="fld"><span>ประเภทการจ้างเริ่มต้น</span><select className="inp" disabled={!canEdit||busy} value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})}><option value="labor">เหมาเฉพาะค่าแรง</option><option value="inclusive">เหมาทั้งแรงและวัสดุ</option><option value="daily">รายวันต่อทีม</option></select></label></div>
 <p>การเปลี่ยนค่าเริ่มต้นไม่ปรับยอดงานที่บันทึกแล้ว ต้องเลือกคำนวณใหม่ในงานนั้น</p>
 {canEdit&&<div style={{display:'flex',gap:8}}><button className="btn-primary" disabled={busy} onClick={save}>บันทึกค่าเริ่มต้น</button><button className="btn-ghost" disabled={busy} onClick={()=>setForm({...DEFAULT_SUB_RATES})}>คืนค่าที่กำหนดเริ่มต้น</button></div>}
 {message&&<p role="status">{message}</p>}</div>;
}
