// Real React screens and CSS, synthetic records, and no external network or writes.
// PLAYWRIGHT_MODULE can point to an installed playwright module; CHROMIUM_PATH is optional.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { parse } from '@babel/parser';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'amc-menu-qa-'));
const root=process.cwd();
const api=parse(fs.readFileSync('src/lib/api.js','utf8'),{sourceType:'module'}).program.body;
const names=api.filter(n=>n.type==='ExportNamedDeclaration').flatMap(n=>n.declaration?.declarations?.map(d=>d.id.name)||[n.declaration?.id?.name,...n.specifiers.map(s=>s.exported.name)]).filter(Boolean);
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';
import BOQ from './src/components/BOQ';import Quotation from './src/components/Quotation';
import MyJobs from './src/components/MyJobs';import Schedule from './src/components/Schedule';
import './src/styles.css';import './src/design-system.css';import './src/floating-theme.css';
const root=createRoot(document.getElementById('root'));let key=0;
window.mount=(name,props={},remount=true)=>root.render(React.createElement({BOQ,Quotation,MyJobs,Schedule}[name],{key:remount?++key:key,role:'admin',team:'A',me:{id:'qa',name:'QA'},onCreateQuote:()=>{},onOpenDoc:(...a)=>window.opened=a,...props}));
window.ready=true;`,resolveDir:root,loader:'jsx'},bundle:true,external:['/icons/*'],format:'iife',outfile:path.join(dir,'app.js'),loader:{'.woff2':'file','.woff':'file','.ttf':'file','.png':'file','.svg':'file'},plugins:[{name:'synthetic-only',setup(b){
 b.onLoad({filter:/\/lib\/api\.js$/},()=>({contents:names.map(n=>`export const ${n}=(...a)=>window.api('${n}',...a);`).join('\n')}));
 b.onLoad({filter:/\/lib\/supabase\.js$/},()=>({contents:`export const hasConfig=true;export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'qa'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(n,a)=>({data:await window.api(n,a)}),from(){throw Error('Unexpected raw table read')}};`}));
 b.onLoad({filter:/\/lib\/quotationPage\.js$/},()=>({contents:`export const loadQuotationPage=(...a)=>window.api('loadQuotationPage',...a);`}));
 b.onLoad({filter:/\/lib\/printDoc\.js$/},()=>({contents:`export const openPrintWindow=()=>({close(){}});export const writeAndPrint=()=>{window.printed=document.querySelector('.doc-page')?.textContent||document.body.textContent;};`}));
 }}]});
if(process.env.QA_THAI_FONT){fs.copyFileSync(process.env.QA_THAI_FONT,path.join(dir,'thai.woff2'));fs.appendFileSync(path.join(dir,'app.css'),"\n@font-face{font-family:'Noto Sans Thai';src:url('/thai.woff2')}\n");}
fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div class="app"><main class="main"><div id="root"></div></main></div><script src="/app.js"></script>');
const server=http.createServer((req,res)=>{const p=path.join(dir,req.url==='/'?'index.html':req.url);if(!p.startsWith(dir)||!fs.existsSync(p)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(p));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
await page.addInitScript(()=>{
 window.calls=[];window.fail=false;window.delayA=false;window.releaseA=null;
 const date=new Date().toISOString().slice(0,10);
 const bo=i=>({boq_no:'B'+String(i).padStart(3,'0'),customer_id:1,title:'ติดตั้งแอร์ทดสอบ '+i,customerName:'ลูกค้าทดสอบ',customerAddr:'กรุงเทพมหานคร',customerVat:false,created_at:date,issue_date:date,createdByName:'ฝ่ายขาย',job_type:'install',total:2500,itemCount:2,items:[{section:'ac',name:'เครื่องปรับอากาศ',qty:2,unit_cost:1250,unit:'เครื่อง'}],hasQuote:i===0,quoteApproved:i===0,quoteNo:i===0?'Q001':null});
 const job=(team)=>({job_no:'J'+team,assigned_team:team,teamName:'ทีม '+team,status:'scheduled',title:'งาน '+team,customerName:'ลูกค้า '+team,scheduled_at:date+'T08:00:00',visits:[],confirmItems:[],photos:[]});
 window.api=async(name,args)=>{
   window.calls.push({name,args});
   if(window.fail&&['boq_page','listJobOrders','loadQuotationPage'].includes(name))throw Error('offline-test');
   if(name==='boq_page') {const rows=args.p_search?[{...bo(0),boq_no:'OLD-2020',issue_date:'2020-01-01',hasQuote:false,quoteApproved:false}]:Array.from({length:Math.min(50,123-args.p_offset)},(_,i)=>bo(i+args.p_offset));return{rows,total:args.p_search?1:123,allTotal:124,baseTotal:123,hidden:1,types:{install:123},creators:['ฝ่ายขาย'],links:{byQuote:{Q001:{jobNos:['JA'],invoiceNos:['I001'],receiptNos:['R001'],poNos:['P001']}},jobStatusBy:{JA:'done'}}};}
   if(name==='loadQuotationPage')return{rows:[{quote_no:'Q001',boq_no:'B000',customerName:'ลูกค้าทดสอบ',title:'ใบเสนอทดสอบ',created_at:date,issue_date:date,status:'approved',items:[],total:2500,grand:2675,vat:true,vatAmt:175}],total:1,baseTotal:1,hidden:1,creators:[],statuses:{approved:1},links:{byQuote:{Q001:{jobNos:['JA'],invoiceNos:[],receiptNos:[],poNos:[]}},jobStatusBy:{JA:'done'}}};
   if(name==='listBoqs')return[(args?.nos?.[0]==='OLD-2020'?{...bo(0),boq_no:'OLD-2020',quoteApproved:false}:bo(Number(args?.nos?.[0]?.slice(1)||0)))];
   if(name==='listCustomers')return[{id:1,name:'ลูกค้าทดสอบ',vat:false,sites:[],contacts:[]}];
   if(name==='listMaterialsLite')return[{code:'AC',th:'แอร์ทดสอบ',kind:'ac',cost:1250,unit:'เครื่อง'}];
   if(name==='getCompanies')return{vat:{name:'VAT COMPANY'},novat:{name:'NO VAT COMPANY'}};
   if(name==='listJobOrders'){if(window.delayA&&args?.team==='A')await new Promise(r=>window.releaseA=r);return args?.team?[job(args.team)]:[job('A'),job('B')];}
   if(name==='listTeams')return[{id:'A',name:'ทีม A',color:'#2345ab'},{id:'B',name:'ทีม B',color:'#ab4523'}];
   if(['listStaff','listCalendarEvents','listJobLogs','listJobLogsByGroup'].includes(name))return[];
   if(name==='expireOverdueQuotes')return;
   throw Error('Unexpected API '+name);
 };
});
async function mount(name,props={},remount=true){await page.evaluate(a=>window.mount(...a),[name,props,remount]);}
async function waitText(text){await page.getByText(text,{exact:false}).first().waitFor();}
async function fits(){await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.main').scrollWidth<=document.querySelector('.main').clientWidth+1),'horizontal overflow');}
try{
 await page.goto(origin);await page.waitForFunction(()=>window.ready);
 await mount('BOQ');await page.locator('.job-card').first().waitFor();assert.equal(await page.locator('.job-card').count(),50);
 assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.name)),['boq_page'],'BOQ startup only reads one summary page');
 assert.equal(await page.locator('.job-card').first().getByRole('button',{name:'แก้ไข',exact:true}).isDisabled(),true);
 assert.ok((await page.locator('.job-card').nth(1).locator('a[href*="maps/search"]').first().getAttribute('href')).includes('query='));
 await fits();await page.screenshot({path:path.join(dir,'boq-desktop.png')});
 await page.getByRole('button',{name:'ถัดไป',exact:true}).click();await waitText('หน้า 2 / 3');await waitText('B050');
 await page.getByRole('button',{name:'ถัดไป',exact:true}).click();await waitText('หน้า 3 / 3');await waitText('B100');assert.equal(await page.locator('.job-card').count(),23);
 await mount('BOQ',{focus:'OLD-2020'});await waitText('OLD-2020');
 assert.ok(await page.evaluate(()=>calls.some(c=>c.name==='boq_page'&&c.args.p_search==='OLD-2020'&&c.args.p_from===null&&c.args.p_offset===0)));
 await page.getByRole('button',{name:'แก้ไข',exact:true}).click();await waitText('ประมาณการต้นทุน 4 ส่วน');
 assert.ok(await page.evaluate(()=>calls.some(c=>c.name==='listBoqs'&&c.args.force===true&&c.args.nos[0]==='OLD-2020')));
 await mount('BOQ');await page.locator('.job-card').first().waitFor();await page.locator('.job-card').nth(1).getByRole('button',{name:'พิมพ์',exact:true}).click();
 await page.waitForFunction(()=>window.printed);assert.ok(await page.evaluate(()=>printed.includes('NO VAT COMPANY')),'print uses customer VAT company');
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await fits();await page.screenshot({path:path.join(dir,'boq-'+width+'.png')});}
 await page.evaluate(()=>window.fail=true);await page.getByRole('button',{name:'รีเฟรช',exact:true}).click();await waitText('offline-test');assert.equal(await page.locator('.job-card').count(),0);
 await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'ลองใหม่',exact:true}).click();await page.locator('.job-card').first().waitFor();
 await page.setViewportSize({width:390,height:900});await mount('Quotation');await waitText('ใบเสนอทดสอบ');await fits();await page.screenshot({path:path.join(dir,'quote-mobile.png')});
 for(const name of ['MyJobs','Schedule'])for(const role of ['tech','assistant','lead_tech']){
   await page.evaluate(()=>{window.fail=true;window.calls=[];});await mount(name,{role,team:'A'});await waitText('offline-test');
   assert.ok(await page.evaluate(()=>calls.filter(c=>c.name==='listJobOrders').every(c=>c.args.fieldOnly===true)));
   await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'ลองใหม่',exact:true}).click();await waitText('งาน A');await fits();
 }
 await page.evaluate(()=>{window.delayA=true;window.calls=[];});await mount('MyJobs',{role:'tech',team:'A'});await page.waitForFunction(()=>window.releaseA);
 await mount('MyJobs',{role:'tech',team:'B'},false);await waitText('งาน B');await page.evaluate(()=>window.releaseA());
 assert.equal(await page.getByText('งาน A',{exact:true}).count(),0,'old team response is discarded');
 assert.deepEqual(errors,[]);
 console.log('PASS real BOQ/Quotation/MyJobs/Schedule screens: paging, old-document focus, lazy editing, VAT printing, mobile/tablet/desktop layout, 3 field roles, retry and stale team response');
 console.log('Screenshots: '+dir);
}finally{await browser.close();server.close();}
