import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { scopedDocuments } from '../src/lib/scopedDocuments.js';
let requests=[];
let rows=await scopedDocuments(async o=>{requests.push(o.nos);return o.nos;},[...Array.from({length:251},(_,i)=>'Q'+i),'Q0',null]);
assert.equal(rows.length,251);assert.equal(requests.length,3);assert.ok(requests.every(a=>a.length<=100));
requests=[];await scopedDocuments(async()=>{requests.push(1);},[]);assert.equal(requests.length,0);
await assert.rejects(scopedDocuments(async()=>{throw Error('offline');},['Q']));

function loader(file,end) { const s=fs.readFileSync('src/components/'+file,'utf8');return s.slice(s.indexOf('  async function load()'),s.indexOf(end,s.indexOf('  async function load()'))); }
const seen=[];const state={};
const ctx={Promise,Set,Map,Error,Object,scopedDocuments,flash:()=>{},
salesWhtLocks:async()=>[],listReceipts:async()=>[{quote_no:'Q1',invoice_no:'I1'}],getCompanies:async()=>({}),listDocLinks:async()=>({}),
listInvoices:async o=>{assert.deepEqual(o.nos,['I1']);seen.push('invoice');return [{invoice_no:'I1'}];},
listQuotations:async o=>{assert.deepEqual(o.nos,['Q1']);seen.push('quote');return [{quote_no:'Q1'}];}};
for(const key of ['Loading','LoadError','WhtLocks','List','Invoices','Quotes','Companies','DocLinks'])ctx['set'+key]=v=>state[key]=typeof v==='function'?v(state[key]||[]):v;
vm.createContext(ctx);await vm.runInContext(loader('Receipts.jsx','  React.useEffect(() => { load();')+';load()',ctx);
assert.equal(state.List.length,1);assert.equal(state.LoadError,'');assert.equal(seen.length,2);
const jobs={Promise,fieldOnly:false,role:'admin',myTeam:null,flash:()=>{}};
const called=[];
for(const name of ['listJobOrders','listTeams','listDocLinks','listHandoverFlags','listCustomers','listQuotations','listProfiles','listJobTemplates'])jobs[name]=async()=>{called.push(name);return [];};
for(const k of ['Loading','List','Teams','DocLinks','HoFlags','Custs','Quotes','Staff','Templates'])jobs['set'+k]=()=>{};
vm.createContext(jobs);await vm.runInContext(loader('JobOrders.jsx','  React.useEffect(() => { load();')+';load()',jobs);
assert.deepEqual(called.sort(),['listDocLinks','listHandoverFlags','listJobOrders','listTeams'].sort());
called.length=0;jobs.fieldOnly=true;jobs.role='tech';await vm.runInContext('load()',jobs);assert.ok(!called.includes('listQuotations')&&!called.includes('listCustomers'));
console.log('PASS bounded 251 IDs, empty scope, error propagation, receipt references only, office job startup dependencies, technician financial isolation');
