// Execute the real status RPCs under synthetic authenticated roles. No live data/network.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const migrationDir = new URL('../../supabase/migrations/', import.meta.url);
const file = fs.readdirSync(migrationDir).find(n => n.endsWith('_lead_tech_work_status_scope.sql'));
assert.ok(file, 'lead-tech status migration exists');
const migration = fs.readFileSync(new URL(file, migrationDir), 'utf8');
const people = [
  ['lead', 'lead_tech', null, true], ['leadA', 'lead_tech', 'A', true],
  ['tech', 'tech', 'A', true], ['assistant', 'assistant', 'A', true],
  ['noTeam', 'tech', null, true], ['inactiveLead', 'lead_tech', null, false],
  ...['admin', 'exec', 'sales', 'field_sales', 'finance', 'stock', 'hr', 'graphic', 'maid'].map(r => [r, r, 'A', true]),
];
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const value = async (sql, args) => Object.values((await rows(sql, args))[0])[0];
async function actor(name) {
  await db.exec('reset role');
  const index = people.findIndex(p => p[0] === name);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [index < 0 ? '' : uid(index + 1)]);
  await db.exec('set role authenticated');
}
async function rootValue(sql) {
  await db.exec('reset role');
  try { return await value(sql); } finally { await db.exec('set role authenticated'); }
}
const snapshot = () => rootValue(`select jsonb_build_object(
 'jobs',(select jsonb_agg(to_jsonb(j) order by job_no) from job_orders j),
 'visits',(select jsonb_agg(to_jsonb(v) order by id) from job_visits v))`);
async function denied(sql, label) {
  const before = await snapshot();
  await assert.rejects(value(sql), undefined, label); checks++;
  eq(await snapshot(), before, label + ': no changes on rejection');
}
async function outcome(sql) {
  await db.exec('begin');
  try { return { result: await value(sql) }; }
  catch (e) { return { error: e.code }; }
  finally { await db.exec('rollback'); }
}
try {
  await db.exec(read('./fixtures/job-read-baseline.sql'));
  const source = read('../../supabase/migrations/20260911041007_role_access_v831_scoped.sql');
  const start = source.indexOf('CREATE OR REPLACE FUNCTION public.recompute_job_status');
  await db.exec(source.slice(start, source.indexOf('CREATE OR REPLACE FUNCTION', start + 30)));
  await db.exec(read('../../supabase/migrations/20260914101017_job_read_scope_and_boq_page.sql'));
  // Preserve the real contract triggers as part of a visit-status transaction.
  const contracts = read('../../supabase/migrations/20260911175616_job_contract_mode_calendar.sql');
  const end = contracts.indexOf('for each row execute function public.job_contract_changed();', contracts.indexOf('create trigger job_contract_visit_changed'));
  await db.exec(contracts.slice(0, end + 'for each row execute function public.job_contract_changed();'.length));
  await db.query("insert into app_config(key,value) values('role_permissions',$1)", [read('./fixtures/job-menu-permissions.json')]);
  for (let i = 0; i < people.length; i++) {
    const [, role, team, active] = people[i];
    await db.query('insert into profiles(id,role,team,active) values($1,$2,$3,$4)', [uid(i + 1), role, team, active]);
  }
  await db.exec(`insert into teams(id,name,type) values('A','Team A','internal'),('B','Team B','internal'),('SUB','Sub team','sub');
    insert into quotations(quote_no,customer_id,status) values('QA',1,'draft'),('QB',1,'draft');
    insert into quotation_items(id,quote_no,name,qty,unit_price,discount) values(1,'QA','AC A',1,1000,10),(2,'QB','AC B',1,9000,50);
    insert into job_orders(job_no,assigned_team,status,locked,quote_no,labor_total) values
      ('JA','A','scheduled',false,'QA',1234),('JB','B','scheduled',false,'QB',5678),
      ('JN',null,'scheduled',false,null,0),('JL','A','scheduled',true,null,0),
      ('JD','A','done',false,null,0),('JC','A','cancelled',false,null,0),
      ('JS','B','scheduled',false,null,0);
    insert into job_visits(id,job_no,assigned_team,status,visit_date) values
      (1,'JA','A','scheduled','2026-09-15'),(2,'JB','B','scheduled','2026-09-15'),
      (3,'JN',null,'scheduled','2026-09-15'),(4,'JL','A','scheduled','2026-09-15'),
      (5,'JD','A','done','2026-09-15'),(6,'JC','A','cancelled','2026-09-15'),
      (7,'JS','A','scheduled','2026-09-15'),(8,'JS','B','scheduled','2026-09-16');
    insert into job_orders(job_no,assigned_team,status,locked,labor_mode,labor_manual,labor_confirmed,labor_paid_amt)
      values('JDAILY','SUB','scheduled',false,'daily',false,false,0);
    insert into job_visits(id,job_no,assigned_team,status,visit_date) values(9,'JDAILY','SUB','scheduled','2026-09-15');`);

  // Reproduce the incident first: a lead with no assigned team cannot start any team's work.
  await actor('lead');
  await denied("select set_visit_status(1,'in_progress')", 'baseline lead visit start fails');
  await denied("select set_job_status('JB','in_progress')", 'baseline lead legacy start fails');
  await actor('leadA');
  await denied("select set_visit_status(2,'in_progress')", 'baseline lead other-team start fails');
  // Some office roles have a read-only job menu; preserve the actual baseline decisions.
  const officeBefore = {};
  for (const role of ['admin', 'exec', 'sales', 'field_sales', 'finance', 'stock']) {
    await actor(role);
    officeBefore[role] = await outcome("select set_visit_status(2,'done')");
  }
  await db.exec('reset role');
  const readPoliciesBefore = await value("select md5(string_agg(policyname||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename,policyname)) from pg_policies where schemaname='public'");
  await db.exec(migration);
  eq(await value("select md5(string_agg(policyname||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename,policyname)) from pg_policies where schemaname='public'"), readPoliciesBefore, 'read/table policies unchanged');

  for (const lead of ['lead', 'leadA']) {
    await actor(lead);
    for (const [visit, job] of [[1, 'JA'], [2, 'JB'], [3, 'JN']]) {
      eq(await value(`select set_visit_status(${visit},'in_progress')`), 'in_progress', lead + ' starts visit ' + visit);
      eq(await value(`select set_visit_status(${visit},'awaiting_approval')`), 'awaiting_approval', lead + ' submits visit ' + visit);
      eq(await value(`select set_visit_status(${visit},'reschedule')`), 'reschedule', lead + ' requests another visit ' + visit);
      eq(await value(`select set_job_status('${job}','in_progress')`), 'in_progress', lead + ' starts legacy job ' + job);
      eq(await value(`select set_job_status('${job}','awaiting_approval')`), 'awaiting_approval', lead + ' submits legacy job ' + job);
    }
    for (const [sql, label] of [
      ["select set_visit_status(4,'in_progress')", 'locked visit'],
      ["select set_visit_status(5,'in_progress')", 'closed visit'],
      ["select set_visit_status(6,'in_progress')", 'cancelled job visit'],
      ["select set_job_status('JL','in_progress')", 'locked legacy job'],
      ["select set_job_status('JD','in_progress')", 'closed legacy job'],
      ["select set_job_status('JC','in_progress')", 'cancelled legacy job'],
      ["select set_visit_status(1,'done')", 'office approval'],
      ["select set_job_status('JA','cancelled')", 'office cancellation'],
      ["select set_visit_status(1,'in_progress','quote_pending',null)", 'job override'],
      ["select set_visit_status(1,'in_progress',null,false)", 'unlock override'],
      ["select set_visit_status(999,'in_progress')", 'missing visit'],
    ]) await denied(sql, lead + ' cannot change ' + label);
    eq(await value('select count(*)::int from job_orders'), 0, lead + ' still has no raw job/financial rows');
    eq(await value('select count(*)::int from quotation_items'), 0, lead + ' still has no prices');
  }
  for (const role of ['tech', 'assistant']) {
    await actor(role);
    eq(await value("select set_visit_status(1,'in_progress')"), 'in_progress', role + ' starts own visit');
    eq(await value("select set_visit_status(1,'awaiting_approval')"), 'awaiting_approval', role + ' submits own visit');
    await denied("select set_visit_status(2,'in_progress')", role + ' other-team visit');
    await denied("select set_visit_status(3,'in_progress')", role + ' unassigned visit');
    await denied("select set_job_status('JB','in_progress')", role + ' other-team legacy job');
    await denied("select set_job_status('JN','in_progress')", role + ' unassigned legacy job');
    await denied("select set_visit_status(1,'done')", role + ' office approval');
    eq(await value("select set_visit_status(7,'awaiting_approval')"), 'awaiting_approval', role + ' own shared-job visit');
    eq(await rootValue('select status from job_visits where id=8'), 'scheduled', 'other shared-team visit untouched');
  }
  for (const role of ['noTeam', 'inactiveLead', 'hr', 'graphic', 'maid', 'unknown']) {
    await actor(role);
    await denied("select set_visit_status(2,'in_progress')", role + ' denied visit start');
    await denied("select set_job_status('JB','in_progress')", role + ' denied legacy start');
  }
  await actor('lead');
  eq(await value("select set_visit_status(9,'in_progress')"), 'in_progress', 'lead starts subcontractor visit');
  eq(await value("select set_visit_status(9,'awaiting_approval')"), 'awaiting_approval', 'lead submits subcontractor visit');
  eq(await rootValue("select labor_total from job_orders where job_no='JDAILY'"), '2000.00', 'daily contract trigger retains correct amount');
  eq(await rootValue("select jsonb_agg(labor_total order by job_no) from job_orders where job_no in ('JA','JB')"), [1234, 5678], 'existing labor amounts unchanged');
  for (const role of ['admin', 'exec', 'sales', 'field_sales', 'finance', 'stock']) {
    await actor(role);
    eq(await value("select set_job_status('JB','in_progress')"), 'in_progress', role + ' keeps job status rights');
    eq(await outcome("select set_visit_status(2,'done')"), officeBefore[role], role + ' keeps original approval behavior');
  }
  eq(await value("select has_function_privilege('anon','set_job_status(text,text)','execute')"), false, 'anonymous job RPC blocked');
  eq(await value("select has_function_privilege('anon','set_visit_status(bigint,text,text,boolean)','execute')"), false, 'anonymous visit RPC blocked');
  // Rollback reinstates the old, failing scope; no changes to function signatures/ACLs.
  await db.exec('reset role');
  await db.exec(read('../../docs/proposals/rollback-lead-tech-work-status.sql'));
  await actor('lead');
  await denied("select set_visit_status(1,'in_progress')", 'rollback restores original scope');
  console.log(`PASS ${checks} lead-tech status assertions: reproduced failure, all-team start/submit, own-team isolation, terminal/lock guards, contract triggers, office approval and rollback`);
} finally { await db.close(); }
