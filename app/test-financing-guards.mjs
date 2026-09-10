import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { requireFinancingState, requireSubmittedInstallment } from './src/lib/financingGuards.js';

const source = readFileSync(new URL('./src/lib/api.js', import.meta.url), 'utf8');
function harness(loan, updateError = null) {
  const writes = [];
  const supabase = { from(table) { return {
    select() { return { eq() { return { maybeSingle: async () => ({data: loan}) }; } }; },
    update(value) { writes.push({table, value}); return {eq: async () => ({error: updateError})}; },
    insert(value) { writes.push({table, value}); return Promise.resolve({error: null}); },
  }; }};
  const context = vm.createContext({supabase, requireFinancingState, requireSubmittedInstallment,
    _uid: async () => 'test-user', installmentAt: () => 1000,
    dueDateOf: () => new Date('2026-09-10T00:00:00Z'),
    submitExpense: async value => writes.push({table:'expense_requests', value}),
    syncCashEntriesFromDocs: async () => {},
  });
  for (const name of ['payFinancingInstallment','autoDebitFinancing','confirmFinancingPaid']) {
    const start = source.indexOf(`export async function ${name}(`);
    const end = source.indexOf('\nexport async function ', start + 1);
    vm.runInContext(source.slice(start, end).replace('export async function', 'async function'), context);
  }
  return { context, writes };
}
const base = {name:'test loan',paid_count:2,submitted_seq:0,term_months:12,installment:1000};
for (const name of ['payFinancingInstallment','autoDebitFinancing','confirmFinancingPaid']) {
  const legacy = {...base}; delete legacy.submitted_seq;
  const h = harness(legacy);
  await assert.rejects(h.context[name](1), /สถานะค่างวดยังไม่พร้อม/);
  assert.equal(h.writes.length, 0, `${name}: legacy schema must perform zero writes`);
}
{
  const h = harness(base); await h.context.payFinancingInstallment(1);
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[1].value.submitted_seq, 3);
  assert.equal(Object.hasOwn(h.writes[1].value,'paid_count'), false);
}
{
  const h = harness(base, {message:'submitted_seq column missing'});
  await assert.rejects(h.context.payFinancingInstallment(1));
  assert.equal(h.writes.length, 2, 'no retry that advances paid_count after update failure');
  assert.ok(h.writes.every(w => !Object.hasOwn(w.value,'paid_count')));
}
for (const name of ['payFinancingInstallment','autoDebitFinancing']) {
  const h = harness({...base,submitted_seq:3});
  await assert.rejects(h.context[name](1));
  assert.equal(h.writes.length,0,'existing request must not create another expense');
}
for (const submitted_seq of [0,2,4]) {
  const h = harness({...base,submitted_seq});
  await assert.rejects(h.context.confirmFinancingPaid(1));
  assert.equal(h.writes.length,0);
}
assert.equal(requireSubmittedInstallment({...base,submitted_seq:3}),3);
for (const bad of [{...base,paid_count:-1},{...base,term_months:1},{...base,paid_count:1.5}]) {
  assert.throws(() => requireFinancingState(bad));
}
console.log('PASS: legacy schema zero-write, pending guards, no paid-count fallback, invalid confirmation guards');
