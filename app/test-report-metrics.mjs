import assert from 'node:assert/strict';
import { knownBoqCost, estimateSummary, cashAccounts, cashAccountTotal, signedDomain } from './src/lib/reportMetrics.js';

const costs = { A: 120, B: 0, C: null, D: 'invalid', E: '' };
assert.equal(knownBoqCost({ boq_no: 'B' }, costs), 0);
for (const boq_no of ['C', 'D', 'E', 'missing']) assert.equal(knownBoqCost({ boq_no }, costs), null);
const summary = estimateSummary([{ afterDisc: 100, boq_no: 'A' }, { afterDisc: 900, boq_no: 'missing' }], costs);
assert.deepEqual(summary, { sale: 1000, matchedSale: 100, cost: 120, covered: 1, count: 2, missing: 1, profit: -20, margin: -20 });
assert.equal(estimateSummary([{ afterDisc: 900 }], costs).profit, null, 'missing cost must not create 100% profit');
assert.equal(estimateSummary([{ afterDisc: 100, boq_no: 'B' }], costs).profit, 100, 'recorded zero cost is valid');
assert.equal(estimateSummary([], {}).profit, null);
const accounts = [
  { id: 1, kind: 'bank', entity: 'company', balance: 100 },
  { id: 2, kind: 'cash', entity: 'personal', balance: 30 },
  { id: 3, kind: 'card', entity: 'company', balance: 900 },
  { id: 4, kind: 'barter', entity: 'company', balance: 800 },
  { id: 5, kind: 'bank', balance: 20 },
  { id: 6, kind: 'bank', entity: 'company', balance: -10, active: false },
  { id: 7, kind: 'cash', entity: 'company', balance: 0, active: false },
];
assert.equal(cashAccountTotal(accounts), 140, 'credit and barter are not cash; unreconciled closed accounts remain');
assert.equal(cashAccountTotal(accounts, 'company'), 90);
assert.equal(cashAccountTotal(accounts, 'personal'), 30);
assert.deepEqual(cashAccounts(accounts).map(a => a.id), [1,2,5,6]);
assert.equal(cashAccountTotal(null), 0);
for (const values of [[100,-25,0], [-30,-10], [0,0], [null,undefined], [1e6, -2e6]]) {
  const { min,max } = signedDomain(values);
  assert.ok(min <= 0 && max >= 0 && max > min);
  for (const v of values.filter(v=>v!=null)) assert.ok(v >= min && v <= max);
}
console.log('PASS: reporting cohorts, missing/zero cost, negative profit, cash account type/entity, signed chart domain');
