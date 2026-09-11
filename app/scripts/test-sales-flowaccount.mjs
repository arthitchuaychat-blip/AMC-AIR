import assert from 'node:assert/strict';
import handler from '../api/flowaccount-doc.js';
const oldFetch=globalThis.fetch;
process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-key';
delete process.env.FLOWACCOUNT_CLIENT_ID;delete process.env.FLOWACCOUNT_CLIENT_SECRET;
for(const [role,active,status] of [['sales',true,200],['field_sales',true,200],['hr',true,403],['tech',true,403],['sales',false,403]]){
 const calls=[];
 globalThis.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('/auth/')?{id:'test-user'}:[{role,active}]};};
 const res={code:0,body:null,status(n){this.code=n;return this;},json(b){this.body=b;return this;}};
 await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{docType:'tax-invoice'}},res);
 assert.equal(res.code,status,role);assert(calls.every(u=>u.startsWith('https://fixture.invalid')));
 if(status===200)assert.equal(res.body.reason,'no-creds');
}
globalThis.fetch=oldFetch;
console.log('PASS: sales and field sales can use document export endpoint; HR/technician/inactive denied; no real FlowAccount requests');
