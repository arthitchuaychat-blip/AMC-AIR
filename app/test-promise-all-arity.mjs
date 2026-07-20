// จำนวนตัวรับ ต้องเท่ากับจำนวน promise ที่ส่งเข้า Promise.all
//
// เกิดจริง: commit 6fdfa07 (กลาง 11/28) ตั้งใจเพิ่ม 2 query เข้า listMaterialPreps
// แต่แพตช์ไปลงใน listPurchaseOrders ที่อยู่ติดกัน ผลคือ
//   · listMaterialPreps รับ 8 ตัว มี query 6 อัน → poRes/txRes เป็น undefined
//     "Cannot read properties of undefined (reading 'data')" หน้าเตรียมวัสดุตายทั้งหน้า
//   · listPurchaseOrders ยิง 2 query ทิ้งเปล่า ๆ ทุกครั้งที่เปิดหน้าใบสั่งซื้อ (อ่านทั้งตาราง)
// build ผ่าน เทสต์ผ่าน เพราะไม่มีอะไรเรียกฟังก์ชันนี้จริง
//
// ตรวจน้อยกว่าตัวรับ = พัง · ตรวจมากกว่า = query ทิ้งเปล่า ทั้งคู่ผิดทั้งคู่
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default || _traverse;

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})("src");

let pass = 0, fail = 0;
const bad = [];
let checked = 0;

for (const f of files) {
  const ast = parse(fs.readFileSync(f, "utf8"), { sourceType: "module", plugins: ["jsx"] });
  traverse(ast, {
    VariableDeclarator(p) {
      const id = p.node.id, init = p.node.init;
      if (id?.type !== "ArrayPattern") return;
      // const [a, b] = await Promise.all([...])
      const call = init?.type === "AwaitExpression" ? init.argument : init;
      if (call?.type !== "CallExpression") return;
      const callee = call.callee;
      if (callee?.type !== "MemberExpression" || callee.object?.name !== "Promise" || callee.property?.name !== "all") return;
      const arg = call.arguments[0];
      if (arg?.type !== "ArrayExpression") return;            // ส่งตัวแปรมา — นับไม่ได้ ข้าม
      if (arg.elements.some((e) => e?.type === "SpreadElement")) return;  // มี spread — นับไม่ได้ ข้าม
      checked++;
      // ตัวรับ: ช่องว่าง (elision) ก็นับ แต่ rest element ทำให้จำนวนไม่ตายตัว
      if (id.elements.some((e) => e?.type === "RestElement")) return;
      const want = id.elements.length, got = arg.elements.length;
      if (want !== got) bad.push({ file: f, line: id.loc.start.line, want, got });
    },
  });
}

console.log(`\nจำนวนตัวรับ vs promise ใน Promise.all (ตรวจ ${checked} จุด):`);
if (bad.length === 0) { console.log("  ✓ ตรงกันหมด"); pass++; }
else {
  fail++;
  for (const b of bad) console.log(`  ✗ ${b.file}:${b.line} — รับ ${b.want} ตัว แต่ส่งเข้า ${b.got} อัน` +
    (b.want > b.got ? ` → ${b.want - b.got} ตัวท้ายเป็น undefined หน้าจะพังตอนอ่าน .data` : " → ยิง query ทิ้งเปล่า"));
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
