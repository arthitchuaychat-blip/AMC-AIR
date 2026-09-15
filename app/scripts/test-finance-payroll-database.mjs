import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const roles = ['exec','admin','finance','hr','sales','field_sales','stock','lead_tech','tech','assistant','graphic','maid'];
let checks = 0;
const eq = (a,b,label) => { assert.deepEqual(a,b,label); checks++; };
const value = async (sql,args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
async function root() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','service_role',false)"); }
async function actor(n) {
  await root();
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? uid(n) : '']);
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");
}
async function denied(sql,args=[]) { await assert.rejects(db.query(sql,args), e => ['42501','22023'].includes(e.code)); checks++; }
try {
  await db.exec(read('./fixtures/finance-payroll-baseline.sql')); await root();
  for (let i=0;i<roles.length;i++) {
    await db.query('insert into profiles(id,name,role,active) values($1,$2,$3,true)',[uid(i+1),`Test ${roles[i]}`,roles[i]]);
    await db.query('insert into hr_pay(user_id,base_pay,pay_type,citizen_id) values($1,20000,$2,$3)',[uid(i+1),'monthly','private-id']);
    for (const [period,status] of [['2099-01','draft'],['2098-12','paid']]) await db.query("insert into payslips(id,user_id,period,status,base,net,d_sso,other_note,pay_type) values($1,$2,$3,$4,20000,19125,875,$5,'monthly')",[uid((i+1)*100+(status==='paid'?1:2)),uid(i+1),period,status,'{"al":{}}']);
    await db.query("insert into hr_profiles(user_id,note) values($1,'private HR file')",[uid(i+1)]);
    await db.query("insert into hr_leaves(id,user_id,status) values($1,$2,'pending')",[uid(i+1),uid(i+1)]);
    await db.query("insert into hr_ot(id,user_id,status) values($1,$2,'pending')",[i+1,uid(i+1)]);
  }
  const config = Object.fromEntries(roles.map(r=>[r,{hr:'edit',attendance:'edit',cashflow:'edit'}]));
  await db.query("insert into app_config(key,value) values('role_permissions',$1)",[JSON.stringify(config)]);
  const before={};
  for(let i=0;i<roles.length;i++) {
    await actor(i+1);
    before[roles[i]]=await value("select jsonb_build_array((select count(*) from hr_pay),(select count(*) from payslips),(select count(*) from hr_profiles),(select count(*) from profiles),app_can('cashflow',true),app_can('attendance',true))");
  }
  eq(before.finance.slice(0,4),[1,13,1,1],'reproduce finance restriction before migration');
  await root();
  await db.exec(read('../../supabase/migrations/20260915090710_finance_payroll_read.sql'));
  for(let i=0;i<roles.length;i++) {
    const role=roles[i]; await actor(i+1);
    const after=await value("select jsonb_build_array((select count(*) from hr_pay),(select count(*) from payslips),(select count(*) from hr_profiles),(select count(*) from profiles),app_can('cashflow',true),app_can('attendance',true))");
    eq(after,role==='finance'?[12,24,...before[role].slice(2)]:before[role],role+' read scope and other modules');
    if(['finance','hr','exec','admin'].includes(role)) {
      const report=await value("select finance_payroll_report('2099-01')");
      eq(report.employees.length,12,role+' complete employees'); eq(report.slips.length,12,role+' all draft slips');
      eq(report.slips[0].net,19125,role+' stored amounts');
      eq(report.slips.every(s=>s.period==='2099-01'),true,role+' period isolation');
      eq(report.employees.some(p=>'citizen_id' in p || 'signature_url' in p || 'documents' in p),false,role+' limited directory');
    } else await denied("select finance_payroll_report('2099-01')");
    if(!['exec','admin'].includes(role)) {
      eq(await value("with changed as(update hr_pay set base_pay=999 where user_id=$1 returning *) select count(*)::int from changed",[uid(1)]),0,role+' cannot change other salary');
    }
  }
  await actor(3);
  eq(await value("select app_can('hr',false)"),true,'finance read menu');
  eq(await value("select app_can('hr',true)"),false,'finance never gets HR write');
  for(const target of [1,3]) {
    await denied("insert into hr_pay(user_id,base_pay) values($1,90000)",[uid(target+1000)]);
    await denied("insert into payslips(id,user_id,period,status) values($1,$2,'2099-02','draft')",[uid(target+2000),uid(target)]);
    for(const table of ['hr_pay','payslips']) {
      eq(await value(`with changed as(delete from ${table} where user_id=$1 returning *) select count(*)::int from changed`,[uid(target)]),0,'finance cannot delete '+table);
    }
    eq(await value("with changed as(update payslips set status='paid',net=1 where user_id=$1 returning *) select count(*)::int from changed",[uid(target)]),0,'finance cannot close or edit payroll');
  }
  for(const table of ['hr_leaves','hr_ot']) eq(await value(`with changed as(update ${table} set status='approved' where user_id=$1 returning *) select count(*)::int from changed`,[uid(9)]),0,'finance cannot approve '+table);
  for(const period of [null,'2099-13','2099-1',"2099-01' OR true--"]) await denied('select finance_payroll_report($1)',[period]);
  // An inactive employee still appears when they have an archived slip.
  await root();
  await db.query('update profiles set active=false where id=$1',[uid(9)]);
  await actor(3);
  eq((await value("select finance_payroll_report('2098-12')")).employees.some(p=>p.id===uid(9)&&p.active===false),true,'inactive employee history retained');
  eq((await value("select finance_payroll_report('2099-03')")).employees.length,11,'inactive employee without a slip excluded');
  // Configuration disable and forged edit grants retain the hard ceiling.
  await root();
  await db.exec("update app_config set value=jsonb_set(value,'{finance,hr}','\"none\"')");
  await actor(3); await denied("select finance_payroll_report('2099-01')");
  eq(await value('select count(*)::int from hr_pay'),1,'disabled finance sees own base only');
  eq(await value('select count(*)::int from payslips'),13,'existing approved-slip accounting access retained');
  await root();
  await db.exec("update app_config set value=jsonb_set(value,'{finance,hr}','\"edit\"')");
  await actor(3);eq(await value("select app_can('hr',true)"),false,'stale edit cannot grant write');
  // Actor is resolved from current server profile, not a role supplied by client.
  await root();await db.query('update profiles set active=false where id=$1',[uid(3)]);
  await actor(3);await denied("select finance_payroll_report('2099-01')");
  await actor(0);await denied("select finance_payroll_report('2099-01')");
  await root(); await db.exec('set role anon');await denied("select finance_payroll_report('2099-01')");
  await root();await db.query('update profiles set active=true where id=$1',[uid(3)]);
  // Bundled JSON is not cut off at the Data API's 1000-row result limit.
  for(let i=100;i<1110;i++) {
    await db.query("insert into profiles(id,name,role,active) values($1,'Fixture','tech',true)",[uid(i)]);
    await db.query("insert into payslips(id,user_id,period,status,net) values($1,$2,'2099-04','draft',1)",[uid(i+5000),uid(i)]);
  }
  await actor(3);eq((await value("select finance_payroll_report('2099-04')")).slips.length,1010,'all rows returned above 1000');
  eq(await value("select prosecdef from pg_proc where proname='finance_payroll_report'"),false,'RPC uses caller RLS');
  await root();await db.exec(read('../../docs/proposals/rollback-finance-payroll-read.sql'));
  await actor(3);eq(await value('select count(*)::int from hr_pay'),1,'rollback restores base privacy');
  eq(await value("select app_can('hr',false)"),false,'rollback restores menu ceiling');
  console.log(`PASS ${checks} finance payroll database assertions`);
} catch(e) { console.error(e.message, e.query || '', e.actual, e.expected); process.exitCode=1; } finally { await db.close(); }
