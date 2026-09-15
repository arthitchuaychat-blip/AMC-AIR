import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const app=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const require=createRequire(app+'/package.json');
const {build}=require('esbuild');
const {parse}=await import(pathToFileURL(require.resolve('@babel/parser')));
const {default:traverse}=await import(pathToFileURL(require.resolve('@babel/traverse')));
const out=fs.mkdtempSync(path.join(os.tmpdir(),'amc-doc-output-'));
const phase='test';
// Render actual JSX without mounting the app, reading live data or sending documents.
try {
const fixtures={};
const co={name:'AMC AIR — เอกสารตัวอย่าง',branch:'สำนักงานใหญ่',address:'99 ถนนตัวอย่าง แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10000',tax_id:'0000000000000',phone:'02-000-0000',email:'sample@example.com',website:'www.amcair.net',bank_info:'ธนาคารตัวอย่าง · บัญชี 000-0-00000-0 · เอกสารทดสอบเท่านั้น',default_terms:'เอกสารตัวอย่างเพื่อทบทวนรูปแบบ ไม่ใช่เอกสารเรียกเก็บเงิน',logo_url:'/logo.png'};
const companies={vat:co,novat:{...co,name:'AMC AIR — ตัวอย่างไม่คิด VAT'}};
const customer={customerName:'บริษัท ลูกค้าตัวอย่าง จำกัด',customerCode:1,customerTaxId:'0000000000000',customerBranch:'สาขา 00001',customerAddr:'123 อาคารตัวอย่าง ชั้น 2 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10000',mainContactName:'ผู้ติดต่อตัวอย่าง',mainContactPhone:'02-000-0001',siteName:'อาคารสำนักงานตัวอย่าง',siteAddress:'456 ถนนตัวอย่าง แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10000',siteContactName:'ผู้ประสานงานตัวอย่าง',siteContactPhone:'02-000-0002',title:'ติดตั้งระบบปรับอากาศสำนักงาน — เอกสารตัวอย่าง',note:co.default_terms,terms_payment:'มัดจำ 50% ก่อนเริ่มงาน และชำระส่วนที่เหลือเมื่องานแล้วเสร็จ',terms_freebies:'ท่อทองแดง 4 เมตร สายไฟและรางครอบท่อตามมาตรฐาน',terms_warranty:'รับประกันงานติดตั้ง 1 ปี ตามเงื่อนไขที่ระบุในใบเสนอราคา',sign_url:'',internal_note:'INTERNAL-ONLY-DO-NOT-PRINT'};
function scenario(vat=true, count=3, discount=true, wht=true){
 const items=Array.from({length:count},(_,i)=>({item_code:i===0?'AIR-TEST-12345678901234567890':'ITEM-'+(i+1),name:i===0?'เครื่องปรับอากาศระบบอินเวอร์เตอร์ ขนาด 18,000 BTU พร้อมชุดติดตั้ง':i===1?'ค่าบริการติดตั้งและทดสอบระบบปรับอากาศ':'อุปกรณ์ประกอบและวัสดุเพิ่มเติม',description:i===0?'รุ่นตัวอย่าง ระบบประหยัดพลังงาน พร้อมรีโมตควบคุมอุณหภูมิ':i===1?'เดินท่อทองแดงและสายไฟ เก็บงานเรียบร้อยพร้อมส่งมอบ':'ตรวจสอบหน้างานตามเงื่อนไขในใบเสนอราคา',qty:i===0?2:1,unit:i===0?'ชุด':'งาน',unit_price:i===0?25000:i===1?7000:3000,discount:discount&&i===0?1000:0}));
 const subtotal=items.reduce((s,i)=>s+i.qty*i.unit_price,0),disc=items.reduce((s,i)=>s+i.discount,0),afterDisc=subtotal-disc,vatAmt=vat?Math.round(afterDisc*7)/100:0,grand=afterDisc+vatAmt;
 const q={...customer,quote_no:'QT-SAMPLE-001',boq_no:'BOQ-SAMPLE-001',issue_date:'2026-09-15',valid_until:'2026-09-30',vat,items,subtotal,discount:disc,afterDisc,vatAmt,grand,whtOn:wht,wht_rate:3,whtAmt:wht?210:0,netPay:grand-(wht?210:0)};
 const snap=items.map((i,k)=>({...i,amount:i.qty*i.unit_price-i.discount,wht:wht&&k===1}));
 const inv={...customer,invoice_no:'INV-SAMPLE-001',quote_no:q.quote_no,boq_no:q.boq_no,issue_date:q.issue_date,due_date:'2026-09-30',installment:1,pct:50,base:afterDisc/2,vat_amt:vatAmt/2,total:grand/2,wht_amt:wht?105:0,wht_rate:3,items:snap,status:'issued'};
 const r={...inv,receipt_no:'RC-SAMPLE-001',job_no:'JOB-SAMPLE-001',net:inv.total-inv.wht_amt,status:'paid',payment_method:'โอนเงิน'};
 const b={...customer,billing_no:'BN-SAMPLE-001',issue_date:q.issue_date,vat,invoices:[inv],total:inv.total,wht:inv.wht_amt,net:r.net};
 const a={...customer,kind:'credit',note_no:'CN-SAMPLE-001',issue_date:q.issue_date,receipt_no:r.receipt_no,invoice_no:inv.invoice_no,quote_no:q.quote_no,is_vat:vat,base:1000,vat_amt:vat?70:0,total:vat?1070:1000,wht_rate:3,wht_amt:30,net:vat?1040:970,reason:'ปรับลดค่าบริการตามรายการตัวอย่าง',items:[{code:'SERVICE-1',name:'ค่าบริการ',desc:'ส่วนต่างค่าบริการตามตกลง',qty:1,unit:'งาน',price:1000,amount:1000,wht:true}]};
 return {q,inv,r,b,a,companies};
}
for(const [name,opts] of Object.entries({standard:[true,3,true,true],simple:[true,2,false,false],novat:[false,3,false,false],long:[true,40,true,true]}))fixtures[name]=scenario(...opts);
for (const kind of ['card_full','card_inst10']) { const f=scenario(); f.q.payMethod=kind; fixtures[kind]=f; }
fixtures.unpaid=scenario(); fixtures.unpaid.r.status='unpaid';
fixtures.debit=scenario(); fixtures.debit.a.kind='debit';
fixtures.signature=scenario();
for(const key of ['q','inv','r','b','a'])Object.assign(fixtures.signature[key],{sign_url:'/sample-signature.svg',sign_name:'ผู้ลงนามตัวอย่าง'});
fixtures.cancelled=scenario(); fixtures.cancelled.b.invoices.push({...fixtures.cancelled.inv,invoice_no:'INV-CANCELLED-TEST',status:'cancelled'});
fixtures.fractional=scenario();
for(const key of ['inv','r','a'])Object.assign(fixtures.fractional[key],{wht_rate:1.5,wht_amt:52.51});
fixtures.fractional.r.net=fixtures.fractional.r.total-52.51;
fixtures.fractional.a.net=fixtures.fractional.a.total-52.51;
fixtures.full=scenario();
for(const key of ['q','inv','r','b','a'])fixtures.full[key].terms_payment='ชำระเต็มจำนวน 100%';
for(const key of ['inv','r'])Object.assign(fixtures.full[key],{pct:100,base:59000,vat_amt:4130,total:63130,wht_amt:210,net:62920});
Object.assign(fixtures.full.b,{total:63130,wht:210,net:62920});
fixtures.fullString=structuredClone(fixtures.full); fixtures.fullString.inv.pct='100'; fixtures.fullString.b.invoices[0].pct='100';
fixtures.nearlyFull=scenario(); fixtures.nearlyFull.inv.pct=99.99;
const saved=JSON.stringify(fixtures);
const prelude=`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import DocSlip from '${app}/src/components/DocSlip.jsx'; import * as F from '${app}/src/lib/format.js'; import {whtRate} from '${app}/src/lib/salesWht.js'; const {fmtBaht,fmtBaht2,fmtNum,custCode,round2,fmtDocDate,fmtDocAmount}=F; const parseWhtRate=whtRate;`;
let generated=prelude;
for(const [file,v] of [['Quotation','printQ'],['Invoices','printI'],['Receipts','printR'],['BillingNotes','printB'],['AdjustmentNotes','printA']]){
 const src=fs.readFileSync(`${app}/src/components/${file}.jsx`,'utf8'); let expression;
 traverse(parse(src,{sourceType:'module',plugins:['jsx']}),{JSXElement(p){if(p.node.openingElement.name.name==='DocSlip'){const parent=p.findParent(x=>x.isCallExpression()&&x.node.callee.type==='ArrowFunctionExpression'); expression=src.slice(parent.node.start,parent.node.end);p.stop();}}});
 if(!expression)throw Error('Missing print block '+file);
 generated+=`\nfunction native${file}(ctx){const {q,inv,r,b,a,companies}=ctx; const ${v}=${({printQ:'q',printI:'inv',printR:'r',printB:'b',printA:'a'})[v]}; const quoteByNo={[q.quote_no]:q},invByNo={[inv.invoice_no]:inv}; const liveInv=b=>b.liveInvoices||b.invoices.filter(iv=>iv.status!=='cancelled'); const KINDS={credit:{th:'ใบลดหนี้',en:'CREDIT NOTE',verb:'ลด'},debit:{th:'ใบเพิ่มหนี้',en:'DEBIT NOTE',verb:'เพิ่ม'}}; return ${expression};}\n`;
}
const capture=fs.readFileSync(`${app}/src/components/DocCapture.jsx`,'utf8');
generated+=capture.slice(capture.indexOf('function slip('));
generated+=`\nconst fixtures=${JSON.stringify(fixtures)}; const fixtureBefore=JSON.stringify(fixtures); const rendered={}; for(const [name,f] of Object.entries(fixtures)){ for(const [kind,fn] of Object.entries({quote:nativeQuotation,invoice:nativeInvoices,receipt:nativeReceipts,billing:nativeBillingNotes,credit:nativeAdjustmentNotes})) {rendered[name+'-print-'+kind]=renderToStaticMarkup(fn(f)); const type=kind==='credit'?'creditnote':kind; const x=({invoice:f.inv,receipt:f.r,billing:f.b,credit:f.a})[kind]; rendered[name+'-capture-'+kind]=renderToStaticMarkup(slip(type,{q:f.q,x,inv:f.inv,companies:f.companies})); } } if(fixtureBefore!==JSON.stringify(fixtures))throw Error('Rendering mutated input'); export default rendered;`;
fs.writeFileSync(`${out}/renderer.jsx`,generated);
await build({entryPoints:[`${out}/renderer.jsx`],outfile:`${out}/renderer-${phase}.mjs`,bundle:true,platform:'node',format:'esm',banner:{js:"import{createRequire}from'node:module';const require=createRequire(import.meta.url);"},nodePaths:[app+'/node_modules'],external:['stream','util'],logLevel:'warning'});
const {default:rendered}=await import(pathToFileURL(`${out}/renderer-${phase}.mjs`));
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(rendered));
let checks=0;
function check(ok,message){assert.ok(ok,message);checks++;}
for(const [key,html] of Object.entries(rendered)){
 check(!html.includes('฿'),key+': no currency prefix');
 check(html.includes('(บาท)'),key+': currency unit remains explicit');
 check(!html.includes('INTERNAL-ONLY-DO-NOT-PRINT'),key+': internal notes remain private');
 check(html.includes('สาขา 00001'),key+': correct customer branch');
 if(key.includes('-print-'))check(html===rendered[key.replace('-print-','-capture-')],key+': print and capture are identical');
}
for(const mode of ['print','capture']){
 for(const scenario of ['full','fullString']){
  for(const kind of ['invoice','receipt','billing']){
   const html=rendered[scenario+'-'+mode+'-'+kind];
   check(!html.includes('งวดที่')&&!html.includes('งวดนี้'),`${scenario}/${mode}/${kind}: full payment has no installment labels`);
   check(html.includes('62,920.00'),`${scenario}/${mode}/${kind}: net total unchanged`);
  }
  for(const kind of ['invoice','receipt']){
   const h=rendered[scenario+'-'+mode+'-'+kind];
   check(!h.includes('เต็มสัญญา'),`${scenario}/${mode}/${kind}: full-payment summary is not duplicated`);
   check((h.match(/ภาษีมูลค่าเพิ่ม 7%/g)||[]).length===1,`${scenario}/${mode}/${kind}: VAT appears once`);
  }
  const html=rendered[scenario+'-'+mode+'-invoice'];
  check(html.includes('มูลค่าก่อนภาษี</span><b>59,000.00'),scenario+'/'+mode+': full-payment base retained');
  check(html.includes('ภาษีมูลค่าเพิ่ม 7%</span><b>4,130.00'),scenario+'/'+mode+': full-payment VAT retained');
 }
 for(const scenario of ['standard','nearlyFull']){
  for(const kind of ['invoice','receipt','billing'])check(rendered[scenario+'-'+mode+'-'+kind].includes('งวดที่'),`${scenario}/${mode}/${kind}: partial payments retain installment labels`);
 }
 const invoice=rendered['standard-'+mode+'-invoice'];
 const receipt=rendered['standard-'+mode+'-receipt'];
 for(const html of [invoice,receipt]){
  check(html.includes('มูลค่าก่อนภาษีงวดนี้</span><b>29,500.00'),mode+': installment base');
  check(html.includes('ภาษีมูลค่าเพิ่ม 7% งวดนี้</span><b>2,065.00'),mode+': installment VAT');
  check(html.includes('31,460.00'),mode+': net installment');
  check(html.includes('หัก ณ ที่จ่าย 3% จากยอด 3,500.00 = − 105.00'),mode+': per-line withholding');
 }
 check(rendered['card_inst10-'+mode+'-quote'].includes('6,313.00 × 10 เดือน'),mode+': card installments');
 check(!rendered['unpaid-'+mode+'-receipt'].includes('ได้รับชำระเงินแล้ว'),mode+': unpaid receipt has no payment confirmation');
 check(receipt.includes('ได้รับชำระเงินแล้ว'),mode+': paid receipt preserves confirmation');
 check(!rendered['novat-'+mode+'-receipt'].includes('TAX INVOICE'),mode+': non-VAT receipt title');
 check(rendered['debit-'+mode+'-credit'].includes('DEBIT NOTE'),mode+': debit title');
 check(!rendered['cancelled-'+mode+'-billing'].includes('INV-CANCELLED-TEST'),mode+': cancelled invoice hidden');
 check(rendered['cancelled-'+mode+'-billing'].includes('จำนวนใบแจ้งหนี้</td><td><b>1</b>'),mode+': visible invoice count');
 check(rendered['fractional-'+mode+'-receipt'].includes('หัก ณ ที่จ่าย 1.5%'),mode+': fractional rate retained');
 for(const kind of ['quote','invoice','receipt','billing','credit']){
  const html=rendered['signature-'+mode+'-'+kind];
  check(html.includes('/sample-signature.svg')&&html.includes('ผู้ลงนามตัวอย่าง'),mode+': saved signature '+kind);
  check(!rendered['standard-'+mode+'-'+kind].includes('doc-sign-img'),mode+': explicit empty signature '+kind);
 }
}
check(saved===JSON.stringify(fixtures),'rendering does not mutate fixture inputs');
console.log(`PASS: ${checks} assertions across ${Object.keys(rendered).length} rendered sales documents`);
} finally { fs.rmSync(out,{recursive:true,force:true}); }
