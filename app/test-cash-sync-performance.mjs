import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { cashEntryNeedsUpdate, createCashSyncRunner } from './src/lib/cashSync.js';
const source = fs.readFileSync('src/lib/api.js', 'utf8');
const oldSource = process.argv.includes('--benchmark') ? execFileSync('git', ['show', 'b78568406bc93fd1ac3acba11283e98118fd6e83:app/src/lib/api.js'], { encoding: 'utf8' }) : null;
function fixture(n = 1000) {
  const receipts = Array.from({ length: n }, (_, i) => ({ receipt_no: `RC-${i}`, issue_date: '2026-09-10', net: 700, total: 700, vat_amt: 0, status: 'paid' }));
  return { receipts, cash_entries: receipts.map((r, i) => ({ id: i + 1, source_type: 'receipt', source_ref: r.receipt_no, edited: false, direction: 'in', status: 'actual', entry_date: r.issue_date, amount: '700.00', note: `ใบเสร็จ ${r.receipt_no}`, entity: 'personal' })) };
}
// Real sync bodies with an in-memory Supabase double: no network or credentials.
function harness(code, input, { hasEntity = true, failUpdate = false } = {}) {
  const db = structuredClone(input), writes = [];
  const supabase = { from(table) {
    let op = 'select', cols = '*', payload, single = false;
    const filters = [];
    const q = {
      select(c) { cols = c; return q; }, update(p) { op = 'update'; payload = p; return q; },
      insert(p) { op = 'insert'; payload = p; return q; }, delete() { op = 'delete'; return q; },
      eq(k, v) { filters.push(r => r[k] === v); return q; }, neq(k, v) { filters.push(r => r[k] !== v); return q; },
      in(k, v) { filters.push(r => v.includes(r[k])); return q; },
      gt() { return q; }, not() { return q; }, or() { return q; }, order() { return q; }, range() { return q; }, limit() { return q; },
      maybeSingle() { single = true; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (table === 'cash_entries' && !hasEntity && cols.split(',').includes('entity')) return { error: { message: 'column entity missing' } };
        if (table === 'profiles' && single) return { data: { role: 'admin' } };
        const rows = db[table] || [], match = r => filters.every(f => f(r));
        if (op === 'select') {
          const found = rows.filter(match).map(r => cols === '*' ? { ...r } : Object.fromEntries(cols.split(',').map(k => [k, r[k]])));
          return { data: single ? found[0] : found, count: found.length };
        }
        if (op === 'update' && failUpdate) return { error: { message: 'write denied' } };
        writes.push({ table, op });
        if (op === 'update') rows.filter(match).forEach(r => Object.assign(r, payload));
        if (op === 'insert') (db[table] ||= []).push(...payload.map((r, i) => ({ id: 10000 + i, ...r })));
        if (op === 'delete') db[table] = rows.filter(r => !match(r));
        return { error: null };
      }).then(resolve, reject); }
    };
    return q;
  } };
  const start = code.includes('const runCashSync =') ? code.indexOf('const runCashSync =') : code.indexOf('export async function syncCashEntriesFromDocs()');
  const body = code.slice(start, code.indexOf('// rooms visible to me', start)).replace('export async function', 'async function');
  const context = { supabase, getProfile: async () => ({ role: 'admin' }), _uid: async () => 'test-user',
    _fetchAll: async f => { const r = await f(0, 999); if (r.error) throw r.error; return r.data; },
    _allRows: async f => { const r = await f(0, 999); if (r.error) throw r.error; return r; },
    cashEntryNeedsUpdate, createCashSyncRunner, installmentAt: () => 0 };
  vm.createContext(context); vm.runInContext(body, context);
  return { run: context.syncCashEntriesFromDocs, db, writes };
}
const plain = rows => rows.map(({ updated_at, ...r }) => ({ ...r, amount: Number(r.amount) }));
const input = fixture();
const optimized = harness(source, input);
const unchanged = await optimized.run();
assert.equal(optimized.writes.length, 0); assert.equal(unchanged.updated, 0);
assert.deepEqual(plain(input.cash_entries), plain(optimized.db.cash_entries));
if (oldSource) {
  const old = harness(oldSource, input); await old.run();
  assert.equal(old.writes.length, 1000);
  assert.deepEqual(plain(old.db.cash_entries), plain(optimized.db.cash_entries));
  console.log('PASS benchmark: update requests 1000 -> 0; same business data');
}
console.log('PASS 1,000 unchanged receipts: zero update requests');
const changed = fixture(3);
changed.receipts[0].net = 900;
changed.cash_entries[1].edited = true; changed.cash_entries[1].amount = 500;
changed.receipts.pop();
changed.invoices = [{ invoice_no: 'INV-new', due_date: '2026-09-20', total: 200, status: 'unpaid', vat_amt: 0 }];
changed.cash_entries.push({ id: 9000, source_type: 'manual', amount: 123 }, { id: 9001, source_type: 'salary', source_ref: 'salary-old', edited: true, amount: 456 });
const mixed = harness(source, changed);
const result = await mixed.run();
assert.equal(mixed.db.cash_entries.find(r => r.id === 1).amount, 900);
assert.equal(mixed.db.cash_entries.find(r => r.id === 2).amount, 500);
assert(!mixed.db.cash_entries.some(r => r.id === 3));
assert.equal(mixed.db.cash_entries.find(r => r.id === 9000).amount, 123);
assert.equal(mixed.db.cash_entries.find(r => r.id === 9001).amount, 456);
if (oldSource) { const mixedOld = harness(oldSource, changed); await mixedOld.run(); assert.deepEqual(plain(mixed.db.cash_entries), plain(mixedOld.db.cash_entries)); }
assert.equal(result.added, 1); assert.equal(result.updated, 1); assert.equal(result.removed, 1);
console.log('PASS changed amount, added invoice, stale removal, edited/manual/paid salary preservation');
for (const key of ['direction', 'status', 'entry_date', 'note', 'entity', 'amount']) {
  const r = fixture(1).cash_entries[0];
  assert.equal(cashEntryNeedsUpdate(r, { ...r, [key]: key === 'amount' ? 701 : 'changed' }), true);
}
const legacy = harness(source, fixture(2), { hasEntity: false }); await legacy.run(); assert.equal(legacy.writes.length, 0);
const failureInput = fixture(1); failureInput.receipts[0].net = 999;
await assert.rejects(harness(source, failureInput, { failUpdate: true }).run(), e => e.message === 'write denied');
console.log('PASS persisted fields, legacy entity fallback, failed write reported');
let release, passes = 0, concurrent = 0, maxConcurrent = 0;
const gate = new Promise(r => { release = r; });
const queued = createCashSyncRunner(async () => {
  passes++; concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
  if (passes === 1) await gate;
  concurrent--; return { added: 1, updated: 0, removed: 0 };
});
const first = queued(); await Promise.resolve();
const followers = Array.from({ length: 20 }, () => queued());
release(); const totals = await Promise.all([first, ...followers]);
assert.equal(passes, 2); assert.equal(maxConcurrent, 1); assert(totals.every(r => r.added === 2));
await queued(); assert.equal(passes, 3);
let attempts = 0;
const retry = createCashSyncRunner(async () => { if (++attempts === 1) throw new Error('offline'); return { updated: 1 }; });
await assert.rejects(retry(), /offline/); assert.equal((await retry()).updated, 1);
console.log('PASS 21 overlapping requests -> 2 serial passes; subsequent calls fresh; retry after failure');
