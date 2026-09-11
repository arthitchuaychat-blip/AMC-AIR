import React from 'react';
import { listWhtEvidence } from '../lib/salesWhtApi';
import { receiptWhtSummary, money } from '../lib/salesWht.js';
import { fmtBaht2, downloadCsv } from '../lib/format';
import WhtEvidenceModal from './WhtEvidenceModal';
const labels={expected:'คาดว่าจะถูกหัก',waiting:'ถูกหักแล้ว · รอหลักฐาน',received:'ได้รับหลักฐาน · รอตรวจ',verified:'ตรวจสอบแล้ว'};
export default function SalesWhtRegister({ receipts, role, year }) {
 const [evidence,setEvidence]=React.useState(null),[error,setError]=React.useState(''),[selected,setSelected]=React.useState(null),[filter,setFilter]=React.useState('all');
 async function load(){setEvidence(null);try{setEvidence(await listWhtEvidence());setError('');}catch(e){setError(e.message);}}
 React.useEffect(()=>{load();},[]);
 const rows=receiptWhtSummary(receipts || [],evidence || []).filter(r=>(r.taxDate || '').slice(0,4)===String(year));
 const sum=state=>money(rows.filter(r=>r.evidenceState===state).reduce((s,r)=>s+Number(r.wht_amt),0));
 const shown=rows.filter(r=>filter==='all'||r.evidenceState===filter).sort((a,b)=>(b.taxDate||'').localeCompare(a.taxDate||''));
 function csv(){downloadCsv(`ทะเบียนลูกค้าหักภาษี-${year}`,['ใบเสร็จ','ลูกค้า','วันที่รับเงิน/วันที่เอกสารเดิม','ฐานวันที่','ยอดตามใบเสร็จ','อัตรา %','ยอดถูกหัก','เงินรับสุทธิ','สถานะหลักฐาน','เลขหลักฐาน','วันที่หลักฐาน','วันที่ได้รับ','ยอดตามหลักฐาน'],shown.map(r=>[r.receipt_no,r.customerName,r.taxDate,r.paid_on?'วันที่รับเงิน':'วันที่เอกสารเดิม',r.total,r.wht_rate,r.wht_amt,r.net,labels[r.evidenceState],r.evidence?.certificate_no||'',r.evidence?.certificate_date||'',r.evidence?.received_on||'',r.evidence?.withheld_amount??'']));}
 return <>{evidence && !error && <div className="kpi-grid">{Object.keys(labels).map(k=><button className="stat-card" key={k} onClick={()=>setFilter(k)}><div className="stat-val">{fmtBaht2(sum(k))}</div><div className="stat-label">{labels[k]}</div></button>)}</div>}
 <p className="page-sub">ยอดคาดว่าจะถูกหักยังไม่ใช่ยอดถูกหักจริง · ใบเดิมที่ไม่มีวันที่รับเงินจริงใช้วันที่เอกสารและระบุไว้เพื่อให้ตรวจสอบ · การตรวจหลักฐานไม่ใช่การยื่นภาษี</p>
 <div className="fld-row"><select className="inp" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">ทุกสถานะ</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><button className="btn-ghost" disabled={!evidence || !!error} onClick={csv}>ส่งออกทะเบียน CSV</button></div>
 {error && <p role="alert" style={{color:'var(--down)'}}>โหลดหลักฐานไม่สำเร็จ: {error} <button onClick={load}>ลองใหม่</button></p>}
 {!evidence && !error && <p role="status">กำลังโหลดทะเบียนหลักฐาน…</p>}
 {evidence && !error && <div style={{overflowX:'auto'}}><table><thead><tr><th>ใบเสร็จ / ลูกค้า</th><th>วันที่</th><th>ถูกหัก</th><th>หลักฐาน</th><th></th></tr></thead><tbody>{shown.map(r=><tr key={r.receipt_no}><td>{r.receipt_no}<div className="page-sub">{r.customerName}</div></td><td>{r.taxDate}<div className="page-sub">{r.paid_on?'รับเงินจริง':'วันที่เอกสารเดิม'}</div></td><td>{fmtBaht2(r.wht_amt)} ({r.wht_rate}%)</td><td>{labels[r.evidenceState]}{r.evidence && Math.abs(Number(r.evidence.withheld_amount)-Number(r.wht_amt))>.01 && <div style={{color:'var(--down)'}}>ยอดหลักฐานไม่ตรงใบเสร็จ</div>}</td><td><button className="btn-ghost sm" onClick={()=>setSelected(r)}>ดู / แนบหลักฐาน</button></td></tr>)}</tbody></table>{!shown.length && <p className="empty">ไม่มีรายการในช่วงที่เลือก</p>}</div>}
 {selected && <WhtEvidenceModal receipt={selected} role={role} onClose={()=>setSelected(null)} onSaved={load} />}</>;
}
