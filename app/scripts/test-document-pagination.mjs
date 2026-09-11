import fs from 'node:fs';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8');
const start = source.indexOf('async function _fetchAll(build)');
const end = source.indexOf('\nexport function listCustomers', start);
const fetchAll = new Function(source.slice(start, end) + '; return _fetchAll;')();
for (const size of [0, 1, 1000, 2307]) {
 for (const cap of [100, 1000]) {
  for (const withCount of [false, true]) {
   const rows = Array.from({length:size}, (_, id)=>({id}));
   let requests=0;
   const actual = await fetchAll(async (from,to)=> {
    assert.ok(++requests < 100, 'pagination terminates');
    return {data: rows.slice(from, Math.min(to+1,from+cap)), count:withCount?size:null};
   });
   assert.deepEqual(actual,rows, `complete ${size} rows at cap ${cap}, count ${withCount}`);
  }
 }
}
let calls=0;
await assert.rejects(fetchAll(async()=> ++calls===1?{data:[{id:1}],count:null}:{error:new Error('timeout')}),/timeout/);
console.log('PASS: counted/count-free pagination, server caps, >1000 rows, errors');
