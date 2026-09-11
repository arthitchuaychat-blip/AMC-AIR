import assert from 'node:assert/strict';
import handler from '../api/admin-user.js';
const caller='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002';
process.env.SUPABASE_URL='https://unit-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fake-test-key';
async function run(role,targetRole,action,active=true) {
 const writes=[];
 globalThis.fetch=async(url,options={})=>{
  if(options.method && options.method!=='GET') {writes.push({url,options});return new Response('{}',{status:200});}
  if(url.endsWith('/auth/v1/user')) return Response.json({id:caller});
  return Response.json([{role:url.includes(caller)?role:targetRole,active}]);
 };
 const result={}; const res={status(n){result.status=n;return this},json(body){result.body=body;return this}};
 await handler({method:'POST',headers:{authorization:'Bearer fake-token'},body:{action,userId:target,email:'new@example.invalid',password:'fake-new-password'}},res);
 return {...result,writes};
}
for(const action of ['setEmail','setPassword','delete']) {
 const denied=await run('admin','exec',action);assert.equal(denied.status,403);assert.equal(denied.writes.length,0);
 const permitted=await run('exec','admin',action);assert.equal(permitted.status,200);assert.ok(permitted.writes.length);
}
for(const role of ['hr','sales','finance','lead_tech']){const x=await run(role,'tech','setPassword');assert.equal(x.status,403);assert.equal(x.writes.length,0);}
const inactive=await run('exec','tech','setPassword',false);assert.equal(inactive.status,403);assert.equal(inactive.writes.length,0);
const create=await run('admin','tech','create');assert.equal(create.status,403);assert.equal(create.writes.length,0);
const normal=await run('admin','tech','setPassword');assert.equal(normal.status,200);
console.log('PASS: owner credential protection, manager normal user operations, owner actions, inactive accounts and unprivileged API access');
