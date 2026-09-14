import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from '@babel/parser';

export function extractFunction(source, name) {
  let found;
  function walk(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) { found = source.slice(node.start,node.end); return; }
    for(const value of Object.values(node)) { if(Array.isArray(value)) value.forEach(walk); else if(value && typeof value==='object')walk(value); }
  }
  walk(parse(source,{sourceType:'module',plugins:['jsx']}));
  assert.ok(found,'missing function '+name); return found;
}
const api=fs.readFileSync('src/lib/api.js','utf8');
const resolve=new Function('_gmap',extractFunction(api,'_resolveJo')+';return _resolveJo;')(x=>'map:'+x);
const first=new Function(extractFunction(api,'_firstContacts')+';return _firstContacts;')();
let calls=[],reply;
const supabase={rpc:async(name,args)=>{calls.push({name,args});if(reply instanceof Error)throw reply;return reply;},from:()=>{throw Error('unexpected table read');}};
const load=new Function('supabase','_resolveJo','_firstContacts','_gmap',extractFunction(api,'_loadJobOrders')+';return _loadJobOrders;')(supabase,resolve,first,x=>'map:'+x);
for(const error of [{code:'PGRST202',message:'Could not find jobs_for_team'}, {code:'42501',message:'permission denied'}, {message:'timeout'},new Error('network offline')]) {
  calls=[];reply=error instanceof Error?error:{error};
  await assert.rejects(load({fieldOnly:true,team:'A'}));
  assert.deepEqual(calls.map(c=>c.name),['jobs_for_team'],'field failure must never request office data');
}
reply={data:null};await assert.rejects(load({fieldOnly:true}));
reply={data:[{job_no:'JA',assigned_team:'A',visits:[],confirm_items:[{name:'AC',qty:1,unit:'เครื่อง'}]}]};
assert.equal((await load({fieldOnly:true,team:'A'}))[0].job_no,'JA','retry succeeds');
calls=[];assert.deepEqual(await load({nos:[]}),[]);assert.equal(calls.length,0);
reply={data:{jobs:[{job_no:'JA',quote_no:'QA',customer_id:1,site_id:2,assigned_team:'A',created_by:'u'}],customers:[{id:1,name:'Customer',address:'Main'}],teams:[{id:'A',name:'Team A'}],sites:[{id:2,site_name:'Site',address:'Site address'}],contacts:[{customer_id:1,name:'Contact',phone:'081'}],quotes:[{quote_no:'QA',boq_no:'BA',discount_type:'amount',discount_value:10,vat:true,created_by:'u'}],items:[{quote_no:'QA',qty:2,unit_price:100,discount:5,kind:'ac',name:'AC',unit:'เครื่อง'}],visits:[{id:7,job_no:'JA',assigned_team:'A'}],creators:{u:'Sales'}}};
const office=(await load({nos:['JA']}))[0];
assert.ok(Math.abs(office.quoteGrand-197.95)<0.000001);
assert.equal(office.boq_no,'BA');assert.equal(office.salesName,'Sales');assert.equal(office.address,'Site address');assert.equal(office.visits[0].id,7);
assert.deepEqual(calls.at(-1),{name:'job_order_bundle',args:{p_nos:['JA']}});

// Execute the actual JobOrders loader, including its branches, with recorded calls.
const source=fs.readFileSync('src/components/JobOrders.jsx','utf8');
for(const role of ['exec','admin','finance','sales','field_sales','stock','graphic','lead_tech','tech','assistant']) {
  const called=[],state={},loadSeq={current:0},fieldOnly=['lead_tech','tech','assistant'].includes(role);
  const context={loadSeq,fieldOnly,role,myTeam:'A',flash:()=>{}};
  for(const name of ['listJobOrders','listTeams','listDocLinks','listHandoverFlags','listCustomers','listQuotations','listProfiles','listJobTemplates'])context[name]=async opts=>{called.push({name,opts});return [];};
  for(const key of ['Loading','LoadError','List','Teams','Templates','HoFlags','Custs','Quotes','DocLinks','Staff'])context['set'+key]=v=>state[key]=v;
  const loader=new Function(...Object.keys(context),extractFunction(source,'load')+';return load;')(...Object.values(context));
  await loader(true);
  const jobCall=called.find(c=>c.name==='listJobOrders');
  assert.equal(!!jobCall.opts.fieldOnly,fieldOnly,role+' must choose correct read path');
  assert.equal(jobCall.opts.force,true,'retry bypasses cache');
  assert.ok(!called.some(c=>['listCustomers','listQuotations','listProfiles'].includes(c.name)),'no eager editor-only datasets');
  context.listJobOrders=async()=>{throw Error('offline');};
  const failing=new Function(...Object.keys(context),extractFunction(source,'load')+';return load;')(...Object.values(context));
  await failing();assert.equal(state.LoadError,'offline');assert.equal(state.Loading,false);assert.deepEqual(state.List,[]);
}
console.log('PASS job RPC fail-closed/retry, office amount/address/links, empty scope and actual loader branches for 10 roles');
