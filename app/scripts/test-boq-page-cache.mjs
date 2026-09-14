import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let calls=0, user='one', auth, invalidate, revision=0, fail=false, pending=null, initial=true;
const data={rows:[{boq_no:'B',customerAddr:' ที่อยู่ ทดสอบ '}],total:1,links:{byQuote:{}}};
const ctx={Map,Date,Error,Number,Array,JSON,encodeURIComponent,
  cacheRevision:()=>revision,onDataInvalidated:f=>invalidate=()=>{revision++;f();},
  supabase:{auth:{onAuthStateChange:f=>auth=f,getSession:async()=>{if(initial){initial=false;auth('INITIAL_SESSION',{user:{id:user}});}return {data:{session:user?{user:{id:user}}:null}};}},
    rpc:async()=>{calls++;if(pending)await pending;return fail?{error:Error('offline')}:{data};}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/lib/boqPage.js','utf8').replace(/^import .*;$/gm,'').replace('export async function','async function'),ctx);
const filters={p_offset:0};
let result=await ctx.loadBoqPage(filters);
assert.equal(result.rows[0].mapUrl,'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('ที่อยู่ ทดสอบ'));
await ctx.loadBoqPage(filters);assert.equal(calls,1);
auth('TOKEN_REFRESHED',{user:{id:user}});await ctx.loadBoqPage(filters);assert.equal(calls,1,'refreshing the same session preserves cache');
await ctx.loadBoqPage(filters,true);assert.equal(calls,2);
user='two';auth('SIGNED_IN',{user:{id:user}});await ctx.loadBoqPage(filters);assert.equal(calls,3);
invalidate();await ctx.loadBoqPage(filters);assert.equal(calls,4);
auth('USER_UPDATED',{user:{id:user}});fail=true;await assert.rejects(ctx.loadBoqPage(filters));fail=false;
await ctx.loadBoqPage(filters);assert.equal(calls,6,'failed requests must not poison retry cache');
let release;pending=new Promise(r=>release=r);invalidate();
const stale=ctx.loadBoqPage(filters);await new Promise(r=>setImmediate(r));auth('SIGNED_OUT',null);release();
await assert.rejects(stale,/เปลี่ยนแปลง/);pending=null;
auth('SIGNED_IN',{user:{id:user}});await ctx.loadBoqPage(filters);assert.equal(calls,8);
data.rows=[];data.total=0;result=await ctx.loadBoqPage(filters,true);assert.equal(result.rows.length,0);
user=null;await assert.rejects(ctx.loadBoqPage(filters),/เข้าสู่ระบบ/);
console.log('PASS BOQ warm cache, force, per-account isolation, auth and write invalidation, in-flight logout, empty page, retry, map link');
