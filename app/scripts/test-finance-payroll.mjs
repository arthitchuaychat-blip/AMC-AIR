import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const out=fs.mkdtempSync(path.join(os.tmpdir(),'finance-payroll-'));
const app=path.resolve(new URL('..',import.meta.url).pathname);
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
try {
  fs.writeFileSync(out+'/entry.jsx', `export * from '${app}/src/lib/financePayroll.js'; import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {PayrollReadSlip} from '${app}/src/components/FinancePayroll.jsx'; export const render=(row,period)=>renderToStaticMarkup(<PayrollReadSlip row={row} period={period}/>);`);
  await build({entryPoints:[out+'/entry.jsx'],outfile:out+'/entry.mjs',bundle:true,platform:'node',format:'esm',nodePaths:[app+'/node_modules'],loader:{'.css':'empty'},define:{'import.meta.env':'{}'},banner:{js:"import{createRequire}from'node:module';const require=createRequire(import.meta.url);"},logLevel:'silent'});
  const {loadFinancePayroll,financePayrollRows,financePayrollCsv,payrollTotals,render,PAYROLL_DEDUCTIONS}=await import(pathToFileURL(out+'/entry.mjs'));
  const data={period:'2099-01',employees:[{id:'A',name:'นาย ทดสอบ <script>bad</script>',base_pay:50000,pay_type:'daily',has_pay_rate:true},{id:'B',name:'=HYPERLINK("bad")',has_pay_rate:false},{id:'C',name:'รายวัน',base_pay:700,pay_type:'daily',has_pay_rate:true}],slips:[{user_id:'A',period:'2099-01',status:'paid',pay_type:'monthly',base:20000,ot_pay:500,hol_pay:100,bonus:300,other_note:'{"al":{"phone":100,"ai":200,"lodging":300,"welfare":400}}',d_late:1,d_absent:2,d_leave:3,d_sso:875,d_tax:400,d_advance:1000,d_loan:2000,d_water:50,d_electric:60,other_deduct:9,net:17500,ot_min:120},{user_id:'C',period:'2099-01',status:'draft',pay_type:'daily',base:6000,net:5000,d_advance:1000,present_days:10}]};
  const rows=financePayrollRows(data);
  eq(rows[0].calc.base,20000,'historical base never uses current rate');
  eq(rows[0].calc.gross,21900,'all income components');
  eq(rows[0].calc.ded,4400,'all deductions');
  eq(rows[0].calc.net,17500,'stored net');
  eq(rows[0].mismatch,false,'matching saved amounts');
  eq(rows[1].calc,null,'missing salary is not zero');
  eq(rows[2].calc.base,6000,'saved daily draft retained');
  eq(payrollTotals(rows),{count:2,gross:27900,ded:5400,net:22500},'sum only saved rows');
  eq(payrollTotals([rows[2]]).net,5000,'filtered total');
  const csv=financePayrollCsv(data.period,rows);
  eq(csv.startsWith('\uFEFF'),true,'Thai Excel BOM');
  eq(csv.includes("'=HYPERLINK"),true,'neutralize spreadsheet formulas in names');
  eq(csv.includes('ยังไม่บันทึกรอบ'),true,'missing slip explicit in export');
  const html=render(rows[0],data.period);
  eq(html.includes('&lt;script&gt;bad&lt;/script&gt;'),true,'names escaped in output');
  eq(html.includes('50,000'),false,'current base not substituted into old slip');
  eq(html.includes('รายเดือน'),true,'historical pay type retained');
  for(const [,label] of PAYROLL_DEDUCTIONS)eq(html.includes(label),true,'print deduction '+label);
  eq(render(rows[2],data.period).includes('ยอดร่างยังเปลี่ยนได้ก่อนอนุมัติ'),true,'draft print is marked');
  const bad=structuredClone(data);bad.slips[0].net=1;eq(financePayrollRows(bad)[0].mismatch,true,'legacy mismatch signalled without changing values');
  const orphan=structuredClone(data);orphan.employees=[];eq(financePayrollRows(orphan).length,2,'archived slips survive missing directory entry');
  let calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data,error:null};}};
  eq(await loadFinancePayroll(data.period,client),data,'RPC result');eq(calls,[{name:'finance_payroll_report',args:{p_period:data.period}}],'one scoped request');
  await assert.rejects(loadFinancePayroll('2099-13',client));checks++;eq(calls.length,1,'invalid period makes no request');
  for(const code of ['PGRST202','42501','timeout']) {
    let count=0;await assert.rejects(loadFinancePayroll(data.period,{rpc:async()=>{count++;return {error:new Error(code)};}}),new RegExp(code));checks++;
    eq(count,1,'fail closed without alternate load '+code);
  }
  await assert.rejects(loadFinancePayroll(data.period,{rpc:async()=>({data:{...data,period:'2099-02'}})}));checks++;
  console.log(`PASS ${checks} finance payroll data / report assertions`);
}finally{fs.rmSync(out,{recursive:true,force:true});}
