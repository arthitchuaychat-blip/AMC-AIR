// Isolated browser review: real DocPeek/DocCapture and print pagination, synthetic API only.
// node scripts/build-document-preview-review.mjs /tmp/preview.html
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
const app = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-peek-review-'));
const fixtureSource = fs.readFileSync(path.join(app, 'scripts/test-sales-document-output.mjs'), 'utf8');
fs.writeFileSync(path.join(tmp, 'fixtures.js'), fixtureSource.slice(fixtureSource.indexOf('const fixtures={};'), fixtureSource.indexOf('const saved=')) + '\nexport default fixtures;');
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import DocPeek from '${app}/src/components/DocPeek.jsx';
import '${app}/src/styles.css';import '${app}/src/design-system.css';import '${app}/src/sales-documents.css';
import fixtures from '${tmp}/fixtures.js';
let active=fixtures.full, fail=false; const calls=[];
window.qaApi=async(name,args)=>{
 calls.push({name,args});document.getElementById('calls').textContent=JSON.stringify(calls);
 if(name==='getCompanies')return active.companies;
 if(fail){fail=false;throw Error('จำลองเครือข่ายขัดข้อง');}
 const item=({listQuotations:active.q,listInvoices:active.inv,listReceipts:active.r,listBillingNotes:active.b,listAdjustmentNotes:active.a})[name];
 if(item){if(['listQuotations','listInvoices','listReceipts'].includes(name)&&!args?.nos?.length)throw Error('Unscoped document load');return [item];}
 if(name==='getJobOrder')return {job_no:'JOB-SAMPLE-001',customerName:'ลูกค้าตัวอย่าง',title:'ใบงานเดิม',details:'รายละเอียดงานเดิม',status:'scheduled'};
 throw Error('Unexpected API '+name);
};
const root=createRoot(document.getElementById('root'));let serial=0;
window.qaMount=(type='quote',scenario='full')=>{active=structuredClone(fixtures[scenario==='error'?'full':scenario]);calls.length=0;fail=scenario==='error';
 const no=({quote:active.q.quote_no,invoice:active.inv.invoice_no,receipt:active.r.receipt_no,billing:active.b.billing_no,creditnote:active.a.note_no,debitnote:active.a.note_no,job:'JOB-SAMPLE-001'})[type];
 if(type==='debitnote')active.a.kind='debit';
 root.render(<DocPeek key={++serial} type={type} no={no} onClose={()=>{root.render(<p>ปิดตัวอย่างแล้ว</p>)}} onOpenFull={()=>{root.render(<p>เปิดหน้าเต็ม {type} {no}</p>)}}/>);
};
window.qaMount();`;
const names=['listBoqs','listQuotations','listInvoices','listReceipts','listPurchaseOrders','listMaterialsLite','getJobOrder','listBillingNotes','listAdjustmentNotes','listSuppliers','getCompanies'];
await build({stdin:{contents:entry,resolveDir:app,loader:'jsx'},outfile:path.join(tmp,'preview.js'),bundle:true,minify:true,format:'iife',nodePaths:[path.join(app,'node_modules')],define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'synthetic-api',setup(b){b.onLoad({filter:/\/lib\/api\.js$/},()=>({contents:names.map(n=>`export const ${n}=(...a)=>window.qaApi('${n}',...a);`).join('\n')}));}}]});
const packed = (p) => gzipSync(fs.readFileSync(p)).toString('base64');
const script = packed(path.join(tmp,'preview.js')), css = packed(path.join(tmp,'preview.css'));
const output = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ตรวจตัวอย่างเอกสาร v839 — ข้อมูลสมมติ</title><style>body{margin:0;background:#e8edf4;font-family:Arial,sans-serif}header{padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}select,button{padding:8px}#demo{display:block;width:100%;height:820px;border:0;margin:0 auto}#results{white-space:pre-wrap;padding:8px;font-size:12px}</style></head><body><header><b>ตรวจตัวอย่าง v839 · ข้อมูลสมมติ</b><label>เอกสาร <select id="kind"><option value="quote">ใบเสนอราคา</option><option value="invoice">ใบแจ้งหนี้</option><option value="receipt">ใบเสร็จ</option><option value="billing">ใบวางบิล</option><option value="creditnote">ใบลดหนี้</option><option value="debitnote">ใบเพิ่มหนี้</option><option value="job">ใบงานเดิม</option></select></label><label>กรณี <select id="scenario"><option value="full">เต็มจำนวน</option><option value="standard">แบ่งชำระ</option><option value="long">40 รายการ</option><option value="novat">ไม่มี VAT</option><option value="error">โหลดขัดข้อง</option></select></label><label>ความกว้าง <select id="width"><option value="1440">คอมพิวเตอร์ 1440</option><option value="390">มือถือ 390</option><option value="768">แท็บเล็ต 768</option></select></label><button id="open">เปิดตัวอย่าง</button><button id="suite">ตรวจทุกกรณี</button><span id="status">กำลังโหลด</span></header><iframe id="demo" title="แอปตัวอย่าง"></iframe><pre id="results"></pre><script>
const demo=document.getElementById('demo'),kind=document.getElementById('kind'),scenario=document.getElementById('scenario'),width=document.getElementById('width'),status=document.getElementById('status'),results=document.getElementById('results');
const unpack=async b=>new Response(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<160;i++){const x=fn();if(x)return x;await wait(50)}throw Error('Preview timeout')}
const inner=()=>demo.contentDocument;
const view=()=>inner().querySelector('.doc-preview-viewport');
async function ready(){await wait(120);await until(()=>view()?.getAttribute('aria-busy')==='false'&&inner().querySelector('.doc-preview-pages')?.textContent&&inner().querySelector('.doc-preview-sheet iframe')?.contentDocument?.querySelector('.pg'));await wait(80);return inner().querySelector('.doc-preview-sheet iframe').contentDocument}
function select(el,val){el.value=val;el.dispatchEvent(new Event('change',{bubbles:true}))}
function open(){demo.style.width=width.value+'px';demo.style.maxWidth='100%';demo.contentWindow.qaMount(kind.value,scenario.value);}
document.getElementById('open').onclick=open;kind.onchange=scenario.onchange=open;width.onchange=()=>demo.style.width=width.value+'px';
document.getElementById('suite').onclick=async()=>{
 const checks=[];const check=(ok,name)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name)};
 try{
 for(const w of [1440,390])for(const type of ['quote','invoice','receipt','billing','creditnote','debitnote']){
  width.value=String(w);kind.value=type;scenario.value='full';open();let d=await ready();
  check(view().scrollWidth<=view().clientWidth+1,w+'/'+type+' fit width');
  check(d.querySelectorAll('.pg').length>0,w+'/'+type+' A4 pages');
  check(d.body.textContent.includes('00001'),w+'/'+type+' customer branch');
  check(!d.body.textContent.includes('INTERNAL-ONLY'),w+'/'+type+' private note hidden');
  if(['quote','invoice','receipt'].includes(type))check(d.body.textContent.includes('รุ่นตัวอย่าง ระบบประหยัดพลังงาน'),w+'/'+type+' product description');
  if(['invoice','receipt','billing'].includes(type))check(!/งวดที่|งวดนี้/.test(d.body.textContent),w+'/'+type+' full payment');
  const count=d.querySelectorAll('.pg').length;
  select(inner().querySelector('[aria-label="ชุดเอกสาร"]'),'สำเนา');await until(()=>inner().querySelector('.doc-preview-sheet iframe')?.contentDocument?.querySelector('.doc')?.getAttribute('data-copy')==='สำเนา');d=await ready();
  check(d.querySelectorAll('.pg').length===count,w+'/'+type+' copy pages match');
  check(d.defaultView.getComputedStyle(d.querySelector('.doc-title')).color==='rgb(93, 99, 107)',w+'/'+type+' gray copy');
 }
 width.value='390';kind.value='quote';scenario.value='long';open();let d=await ready();
 check(d.querySelectorAll('.doc-item-desc').length===40,'long quote keeps 40 descriptions');
 check(d.querySelectorAll('.pg').length>2,'long quote multiple pages');
 const count=d.querySelectorAll('.pg').length;
 select(inner().querySelector('[aria-label="ขนาดตัวอย่าง"]'),'1.5');await wait(120);
 check(view().scrollWidth>view().clientWidth,'mobile zoom scrolls horizontally');
 check(d.querySelectorAll('.pg').length===count,'zoom preserves pagination');
 select(inner().querySelector('[aria-label="ขนาดตัวอย่าง"]'),'fit');await wait(120);
 check(view().scrollWidth<=view().clientWidth+1,'fit restores mobile width');
 scenario.value='error';open();await until(()=>inner().querySelector('[role="alert"]'));
 check(!inner().querySelector('.doc-preview-sheet iframe'),'error never shows stale document');
 [...inner().querySelectorAll('button')].find(b=>b.textContent==='ลองใหม่').click();await ready();check(true,'retry recovers');
 inner().querySelector('[aria-label="ปิดตัวอย่างเอกสาร"]').click();await until(()=>inner().body.textContent.includes('ปิดตัวอย่างแล้ว'));check(true,'close works');
 open();await until(()=>inner().querySelector('[role="alert"]'));[...inner().querySelectorAll('button')].find(b=>b.textContent.includes('เปิดหน้าเต็ม')).click();await until(()=>inner().body.textContent.includes('เปิดหน้าเต็ม quote QT-SAMPLE'));check(true,'full-page navigation works');
 scenario.value='full';kind.value='job';open();await until(()=>inner().body.textContent.includes('รายละเอียดงานเดิม'));check(!inner().querySelector('.doc-preview'),'job summary preserved');
 width.value='1440';kind.value='quote';scenario.value='full';open();await ready();
 status.textContent='PASS '+checks.length+' checks';results.textContent=JSON.stringify({checks:checks.length,failed:checks.filter(c=>!c.pass)},null,2);
 }catch(e){status.textContent='FAIL '+e.message;results.textContent=JSON.stringify({error:e.message,checks},null,2)}
};
(async()=>{const css=await unpack('${css}'),js=await unpack('${script}');demo.srcdoc='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap"><style>'+css+'</style><div id="root"></div><pre id="calls" hidden></pre><script>'+js.replace(/<\\/script/gi,'<\\\\/script')+'<\\/script>';await until(()=>demo.contentWindow.qaMount);status.textContent='พร้อมตรวจ';})();
</script></body></html>`;
fs.writeFileSync(process.argv[2] || path.join(tmp,'preview.html'), output);
console.log('Synthetic review HTML: '+(process.argv[2] || path.join(tmp,'preview.html'))+' ('+output.length+' characters)');
