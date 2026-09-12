import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = fs.readFileSync('src/components/Quotation.jsx','utf8');
const save = src.slice(src.indexOf('  async function save()'), src.indexOf('  // ลำดับการยกเลิก:'));
async function run(extra={}, fail=false) {
 const calls=[];
 const ctx={ed:{quote_no:'QT-TEST',customer_id:'c',items:[{code:'a',kind:'ac',qty:1,unit:'เครื่อง',unit_price:1000},{code:'s',kind:'service',qty:1,unit_price:500}],...extra},draftKey:'d',matMap:{a:{cost:600},s:{cost:200}},
 flash:()=>{},setSaving:()=>{},confirmDialog:async()=>true,docNoTaken:async()=>false,
 adjUnit:x=>x,unitFactor:()=>1,genNo:()=> 'QT-OTHER',genBoqNo:()=> 'unused',today:()=> '2026-09-12',
 saveBoq:async(h,i)=>calls.push(['boq',h,i]),saveQuotation:async(h,i)=>{calls.push(['quote',h,i]);if(fail)throw Error('network');},
 syncBoqItems:async()=>0,mySignature:()=>null,redeemCoupon:async()=>{},clearOnSaved:()=>{},load:async()=>{},
 setEd:e=>{ctx.ed=typeof e==='function'?e(ctx.ed):e;}};
 vm.createContext(ctx);await vm.runInContext(save+';save()',ctx);return {calls,ctx};
}
for(const extra of [{},{variation_of:'QT-PARENT'}]) {
 const {calls}=await run(extra);
 assert.equal(calls[0][0],'boq');assert.equal(calls[1][0],'quote');
 assert.equal(calls[1][1].boq_no,calls[0][1].boq_no);
 assert.equal(calls[0][2].length,2);assert.equal(calls[0][2][1].unit_cost,200);
}
assert.equal((await run({boq_no:'BOQ-EXISTING'})).calls.filter(x=>x[0]==='boq').length,0);
assert.equal((await run({_edit:true,boq_no:'BOQ-OLD'})).calls.filter(x=>x[0]==='boq').length,0);
const failed=await run({},true);assert.equal(failed.ctx.ed.boq_no,'BOQ-QT-TEST');
assert.equal((await run({customer_id:''})).calls.length,0);
console.log('PASS normal/variation auto BOQ, preserved existing links, catalog service costs, retry reference, missing customer blocked');
