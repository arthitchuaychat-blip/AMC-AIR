import assert from 'node:assert/strict';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const app = path.dirname(fileURLToPath(import.meta.url));
// Render the actual parent Dashboard before effects/data arrive. Testing only its
// child with an array fixture misses mismatched loading-state props from the parent.
const source = `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import Dashboard from './src/components/Dashboard.jsx';
import ExecutiveOverview from './src/components/ExecutiveOverview.jsx';
for (const role of ['exec', 'finance', 'sales']) {
  const html = renderToStaticMarkup(<Dashboard role={role} />);
  assert.ok(html.includes('ภาพรวมผู้บริหาร') && html.includes('ต้องจัดการ'));
  assert.ok(html.includes('กำลังโหลดรายการ'));
}
const props = { role:'exec', ov:null, quotes:[], stats:{sale:0,count:0,covered:0}, accounts:null, act:null, stockLoading:true, stockReady:false, low:[], periodLabel:'เดือนนี้' };
for (const airRows of [undefined, null, {}, []]) {
  const html = renderToStaticMarkup(<ExecutiveOverview {...props} airRows={airRows} />);
  assert.ok(html.includes('กำลังโหลดรายการ'));
}
const rows = [{code:'B',name:'รุ่น B',qty:2,unit:'ชุด'}, {code:'A',name:'รุ่น A',qty:5,unit:'ชุด'}];
const ready = renderToStaticMarkup(<ExecutiveOverview {...props} ov={{}} stockLoading={false} stockReady={true} airRows={rows} />);
assert.ok(ready.indexOf('รุ่น A') < ready.indexOf('รุ่น B'));
assert.equal(rows[0].code, 'B', 'rendering must not mutate parent data');
const empty = renderToStaticMarkup(<ExecutiveOverview {...props} ov={{}} stockLoading={false} stockReady={true} airRows={[]} />);
assert.ok(empty.includes('ไม่มีรายการแอร์ในช่วงนี้'));
console.log('PASS: initial Dashboard render for exec/finance/sales; undefined/null/object/array loading inputs; loaded and empty results');
`;
try {
  const result = await build({ stdin:{contents:source,loader:'jsx',resolveDir:app}, bundle:true, platform:'node', format:'cjs', write:false, define:{'import.meta.env':'{}'}, loader:{'.css':'empty'} });
  assert.equal(result.outputFiles.length,1);
  const filename = path.join(app, 'dashboard-loading-test.cjs');
  const mod = new Module(filename); mod.filename=filename; mod.paths=Module._nodeModulePaths(app);
  mod._compile(result.outputFiles[0].text, filename);
} catch (error) {
  console.error('FAIL:', error.message); process.exitCode=1;
}
