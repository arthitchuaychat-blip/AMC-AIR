// Runs a real local PostgreSQL engine; never connects to production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20260914101017_job_read_scope_and_boq_page.sql');
const permissions = JSON.parse(read('./fixtures/job-menu-permissions.json'));
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const roles = ['exec','admin','finance','sales','field_sales','stock','lead_tech','tech','assistant','graphic','maid','hr'];
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function actor(n) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? uid(n) : '']);
  await db.exec('set role authenticated');
}
async function rows(sql, params=[]) { return (await db.query(sql,params)).rows; }
async function value(sql, params=[]) { return Object.values((await rows(sql,params))[0])[0]; }
try {
  await db.exec(read('./fixtures/job-read-baseline.sql'));
  const roleMigration = read('../../supabase/migrations/20260911041007_role_access_v831_scoped.sql');
  const start = roleMigration.indexOf('CREATE OR REPLACE FUNCTION public.recompute_job_status');
  await db.exec(roleMigration.slice(start,roleMigration.indexOf('CREATE OR REPLACE FUNCTION',start+30)));
  for (let i=0; i<roles.length; i++) await db.query('insert into profiles(id,role,team,name,active) values($1,$2,$3,$4,true)',[uid(i+1),roles[i],'A','Fixture '+roles[i]]);
  await db.exec(`insert into teams(id,name) values('A','Team A'),('B','Team B');
    insert into customers(id,name,address,vat) values(1,'ลูกค้า ตัวอย่าง','Test address',false);
    insert into customer_contacts(id,customer_id,name,phone) values(1,1,'ผู้ติดต่อ','081-234-5678');
    insert into customer_sites(id,customer_id,site_name,address,contact_name,phone) values(1,1,'Site A','Site address','ผู้ติดต่อไซต์','089-111-2222');
    insert into job_orders(job_no,assigned_team,quote_no,customer_id,status,locked,created_at,labor_total,internal_note)
      values('JA','A','QA',1,'scheduled',false,now(),1234,'office only'),('JB','B',null,1,'scheduled',false,now(),0,null),
      ('JS','B',null,1,'scheduled',false,now(),0,null),('JL','A',null,1,'scheduled',false,now(),0,null),('JN',null,null,1,'scheduled',false,now(),0,null);
    insert into job_visits(id,job_no,assigned_team,status,visit_date) values(1,'JA','A','scheduled','2026-09-14'),(2,'JB','B','scheduled','2026-09-14'),(3,'JS','A','scheduled','2026-09-14'),(4,'JS','B','scheduled','2026-09-14'),(5,'JN',null,'scheduled','2026-09-14');
    insert into job_logs(id,job_no,note) select row_number()over(),job_no,'fixture log' from job_orders;
    insert into jobs(job_no,team,status) values('JA','A','open'),('JB','B','open');
    insert into quotations(quote_no,customer_id,boq_no,status,vat,discount_type,discount_value) values('QA',1,'B000','draft',true,'amount',10),('QB',1,null,'draft',false,'amount',0);
    update job_orders set quote_no='QB' where job_no='JB';
    insert into quotation_items(id,quote_no,qty,unit_price,discount,kind,name,unit) values(1,'QA',2,100,5,'ac','AC','เครื่อง'),(2,'QB',1,9876,321,'service','Other team service','งาน');`);
  await db.query("insert into app_config(key,value) values('role_permissions',$1)",[JSON.stringify(permissions)]);
  await db.query("insert into profiles(id,role,team,active) values($1,'tech',null,true),($2,'tech','A',false)",[uid(13),uid(14)]);
  // Read behavior before the proposed migration; office datasets must remain identical.
  const before = {};
  const financialRoles = ['exec','admin','finance','sales','field_sales','stock'];
  for (let i=0;i<roles.length;i++) {
    const role=roles[i];
    await actor(i+1);
    eq(await value('select my_role()'),role==='assistant'?'tech':role==='field_sales'?'sales':role,role+' normalization before migration');
    eq(await value('select count(*)::int from quotations'),financialRoles.includes(role)?2:0,role+' direct quotation access before migration');
    eq(await value('select count(*)::int from quotation_items'),financialRoles.includes(role)?2:0,role+' direct price access before migration');
    if(['tech','assistant','lead_tech'].includes(role)) {
      eq(await value('select count(*)::int from job_orders'),0,role+' direct job headers blocked before migration');
      eq((await value('select jobs_for_team()')).map(j=>j.job_no).sort(),role==='lead_tech'?['JA','JB','JL','JN','JS']:['JA','JL','JS'],role+' authorized jobs remain available before migration');
    }
    before[role] = await value('select job_order_bundle()');
  }
  await db.exec('reset role; begin');
  await db.exec(migration);
  await db.exec('commit');
  for (let i=0;i<roles.length;i++) {
    const role=roles[i], field=['tech','assistant'].includes(role), denied=['maid','hr'].includes(role), lead=role==='lead_tech';
    await actor(i+1);
    const expected=denied?0:field?3:5;
    eq(await value('select count(*)::int from job_field_refs()'),expected,role+' reference scope');
    const projected=await value('select jobs_for_team()');
    eq(projected.length, role==='graphic'?0:expected,role+' safe job projection');
    for(const item of projected) for(const col of ['labor_total','labor_lines','internal_note','payout_id','rating','is_claim']) eq(col in item,false,role+' must omit '+col);
    eq(await value('select count(*)::int from job_orders'),field||lead||denied?0:5,role+' raw job read');
    eq(await value('select count(*)::int from quotations'),financialRoles.includes(role)?2:0,role+' direct quotation access after migration');
    eq(await value('select count(*)::int from quotation_items'),financialRoles.includes(role)?2:0,role+' direct price access after migration');
    if(field||lead) {
      // Nonempty own/other-team fixtures prove prices are blocked at the tables,
      // while technicians still receive the work-confirmation items they need.
      const items=projected.flatMap(j=>j.confirm_items);
      eq(items.length,lead?2:1,role+' required work items remain visible');
      for(const item of items) eq(Object.keys(item).sort(),['name','qty','unit'],role+' work item projection has no price/discount');
      const attemptedOffice=await value("select job_order_bundle(array['JA','JB'])");
      eq(attemptedOffice.jobs,[],role+' cannot request office job headers');
      eq(attemptedOffice.items,[],role+' cannot request office item prices');
    }
    eq(await value('select count(*)::int from job_logs'),expected,role+' timeline read');
    eq(await value('select count(*)::int from job_visits'),denied?0:field?3:5,role+' visit read');
    eq(await value('select count(*)::int from jobs'),lead?2:field?1:permissions[role]?.jobs!=='none'&&permissions[role]?.jobs?2:0,role+' stock job scope');
    eq(await value('select job_order_bundle()'),denied&&role==='maid'?{...before[role],jobs:[]}:before[role],role+' office bundle unchanged');
    if(field) eq((await value("select jobs_for_team('B')")).map(j=>j.job_no).sort(),['JA','JL','JS'],role+' forged team ignored');
    eq(await value("select has_function_privilege('anon','boq_page(text,date,date,text,text,integer)','execute')"),false,'anonymous BOQ RPC denied');
  }
  for(const n of [13,14,0]) { await actor(n); eq(await value('select count(*)::int from job_field_refs()'),0,'missing team/inactive/unknown'); eq((await value('select jobs_for_team()')).length,0,'safe projection fails closed'); }
  await db.exec('reset role');
  await db.exec("update app_config set value=jsonb_set(value,'{tech,jobs}','\"view\"') where key='role_permissions'");
  await actor(8);eq(await value('select count(*)::int from jobs'),1,'custom menu grant never bypasses technician team');
  // Exact status RPCs from production still permit own-team work and reject other teams.
  for(const role of ['tech','assistant','lead_tech']) {
    await actor(roles.indexOf(role)+1);
    eq(await value("select set_job_status('JA','in_progress')"),'in_progress',role+' own job status');
    eq(await value("select set_visit_status(1,'awaiting_approval')"),'awaiting_approval',role+' own visit');
    await assert.rejects(value("select set_job_status('JB','in_progress')")); checks++;
    await assert.rejects(value("select set_visit_status(2,'in_progress')")); checks++;
    await assert.rejects(value("select set_visit_status(1,'done')")); checks++;
  }
  await actor(13); await assert.rejects(value("select set_job_status('JN','in_progress')")); checks++;
  await assert.rejects(value("select set_visit_status(5,'in_progress')")); checks++;
  await actor(roles.indexOf('sales')+1);
  eq(await value("select set_visit_status(2,'done')"),'done','office closes work');
  // BOQ pagination, full-dataset search, amounts and cross-document locks/links.
  await db.exec('reset role');
  await db.query(`insert into boqs(boq_no,customer_id,site_id,title,job_type,status,created_at,issue_date,created_by,note,internal_note)
    select 'B'||lpad(n::text,3,'0'),1,case when n=0 then 1 else null end,case when n=122 then 'งาน   พิเศษ' else 'งาน '||n end,case when n%2=0 then 'install' else 'wash' end,
    'open','2026-09-14T12:00:00Z','2026-09-14',$1,'note','inside' from generate_series(0,122)n`,[uid(4)]);
  await db.exec(`insert into boq_items(id,boq_no,qty,unit_cost,section,name,description) select n,'B'||lpad(n::text,3,'0'),2,12.5,'ac','fixture',repeat('detail ',200) from generate_series(0,122)n;
    insert into boqs(boq_no,customer_id,status,created_at,issue_date,title) values('OLD',1,'open','2025-01-01',null,'old document'),('EDGE',1,'open','2026-09-14T23:59:59.999999Z',null,'edge date');
    insert into invoices(invoice_no,quote_no,status) values('IA','QA','issued');
    insert into receipts(receipt_no,quote_no,status) values('RA','QA','paid');
    insert into purchase_orders(po_no,quote_no,status) values('PA','QA','open');`);
  await actor(4);
  const pages=[];for(const offset of [0,50,100])pages.push(await value("select boq_page(p_from=>'2026-09-14',p_to=>'2026-09-14',p_offset=>$1)",[offset]));
  eq(pages.map(p=>p.rows.length),[50,50,24],'all 124 current BOQs across pages');
  eq(new Set(pages.flatMap(p=>p.rows.map(r=>r.boq_no))).size,124,'no duplicate or lost documents');
  eq(pages[0].hidden,1,'old date disclosed');
  eq(pages[0].total,124,'total counts all pages');
  eq(pages[0].rows.find(r=>r.boq_no==='B000').total,25,'summary preserves quantity times cost');
  eq(pages[0].rows.find(r=>r.boq_no==='B000').itemCount,1,'summary item count');
  eq(pages[0].rows.some(r=>'items' in r),false,'item bodies are lazy');
  eq(pages[0].links.byQuote.QA.invoiceNos,['IA'],'invoice link');
  eq(pages[0].links.byQuote.QA.receiptNos,['RA'],'receipt link');
  eq(pages[0].links.byQuote.QA.poNos,['PA'],'PO link');
  eq((await value("select boq_page(p_search=>'OLD')")).rows[0].boq_no,'OLD','search old BOQ');
  eq((await value("select boq_page(p_search=>'note')")).total,123,'customer note search');
  eq((await value("select boq_page(p_search=>'inside')")).total,123,'internal note search');
  eq((await value("select boq_page(p_search=>'0812345678')")).total,124,'phone punctuation ignored');
  eq((await value("select boq_page(p_search=>'ผู้ติดต่อไซต์')")).total,1,'site contact search');
  eq((await value("select boq_page(p_search=>'  งาน   พิเศษ  ')")).total,1,'whitespace search preserved');
  eq((await value("select boq_page(p_type=>'install')")).total,62,'type filter');
  eq((await value("select boq_page(p_creator=>'Fixture sales')")).total,123,'creator filter');
  eq((await value("select boq_page(p_offset=>500)")).rows.length,0,'empty page');
  await db.exec('reset role');await db.exec("update quotations set status='approved' where quote_no='QA'");await actor(4);
  eq((await value("select boq_page(p_search=>'B000')")).rows[0].quoteApproved,true,'approval lock reflected');
  for(const role of ['tech','assistant','lead_tech','graphic','maid','hr']) {await actor(roles.indexOf(role)+1);eq((await value('select boq_page()')).total,0,role+' BOQ denied');}
  await db.exec('reset role');
  await db.exec('create table public.adjustment_notes(note_no text,quote_no text,invoice_no text,receipt_no text,kind text,status text); grant select on public.adjustment_notes to authenticated;');
  await db.exec(read('../../supabase/migrations/20260912030204_quotation_server_pagination.sql'));
  await db.exec("update quotations set note='customer-note-find',internal_note='internal-note-find' where quote_no='QA'");
  await actor(4);
  eq((await value("select quotation_page(p_search=>'customer-note-find')")).nos,['QA'],'quotation customer note search');
  eq((await value("select quotation_page(p_search=>'internal-note-find')")).nos,['QA'],'quotation internal note search');
  await db.exec('reset role');
  const verification = await db.exec(read('../../docs/proposals/verify-v836-read-scope.sql'));
  eq(verification.flatMap(r=>r.rows||[]).find(r=>r.verification)?.verification.every(r=>r.passed),true,'production read-only verification script');
  // Rollback restores only this release; the previously installed field boundary stays.
  await db.exec('reset role');
  await db.exec(read('../../docs/proposals/rollback-v836-job-read-and-boq.sql'));
  eq(await value("select to_regprocedure('public.boq_page(text,date,date,text,text,integer)') is null"),true,'BOQ RPC removed by rollback');
  eq(await value("select count(*)::int from pg_policies where policyname like '%_actor_read_scope'"),0,'new policies removed by rollback');
  await actor(8);eq(await value('select count(*)::int from job_orders'),0,'rollback retains field financial boundary');
  eq((await value("select jobs_for_team('B')")).map(j=>j.job_no).sort(),['JA','JL','JS'],'rollback retains forced team scope');
  console.log(`PASS ${checks} database assertions: 12 roles, team isolation, missing team, inactive account, own-team status actions, BOQ pagination/search/amounts/links`);
} finally { await db.close(); }
