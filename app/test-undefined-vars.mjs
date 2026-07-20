// ตัวแปรที่ "เรียกใช้แต่ไม่มีในขอบเขต" — vite build ผ่านฉลุย แล้วไประเบิดตอนเปิดหน้าจริง
//
// เกิดจริงมาแล้ว 2 รอบ:
//   · confirmDialog ใน App.jsx เรียกโดยไม่ import
//   · role ใน MineTab ของหน้าเบิกจ่าย — งาน "กลาง 15" แก้ให้ listJobOrders รับ {fieldOnly}
//     แต่ MineTab ไม่มี prop role ทั้งหน้าเบิกจ่ายเลยพังหมด "role is not defined"
//     (build ผ่าน เทสต์ทุกตัวผ่าน เพราะไม่มีอะไรเปิดหน้าจริง — เจอตอนเจ้าของกดเข้าเมนู)
//
// ตรวจด้วย @babel/parser + @babel/traverse: babel เก็บ "ตัวที่อ้างถึงแต่ไม่มีใครประกาศ" ไว้ที่ scope.globals
// เหลือแค่หักรายชื่อ global จริงของเบราว์เซอร์ออก ที่เหลือคือบั๊ก
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default || _traverse;

// global ของภาษา (Math/JSON/Promise/Set/Date/…) เอาจาก node เอง ไม่ต้องไล่พิมพ์เองให้ตกหล่น
// + global ของเบราว์เซอร์ที่ node ไม่มี — เพิ่มได้ถ้าใช้ตัวใหม่จริง ๆ
const OK = new Set([...Object.getOwnPropertyNames(globalThis), "undefined", "NaN", "Infinity"]);
for (const g of `window document navigator location console fetch history screen performance crypto caches
setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback
queueMicrotask structuredClone alert confirm prompt atob btoa reportError getComputedStyle matchMedia
localStorage sessionStorage indexedDB
Blob File FileReader FormData Headers Request Response URL URLSearchParams TextEncoder TextDecoder
Image Audio Worker MessageChannel BroadcastChannel EventSource WebSocket XMLHttpRequest AbortController
MutationObserver IntersectionObserver ResizeObserver Event CustomEvent Node Element HTMLElement DOMParser
Notification ServiceWorker PushManager Intl WebAssembly createImageBitmap OffscreenCanvas
process globalThis self`.split(/\s+/).filter(Boolean)) OK.add(g);

const SRC = "src";
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})(SRC);

let pass = 0, fail = 0;
const bad = [];

for (const f of files) {
  const code = fs.readFileSync(f, "utf8");
  let ast;
  try {
    ast = parse(code, { sourceType: "module", plugins: ["jsx"], errorRecovery: false });
  } catch (e) {
    bad.push({ file: f, name: "(parse ไม่ผ่าน)", line: e.loc?.line, msg: e.message });
    continue;
  }
  traverse(ast, {
    Program(p) {
      for (const [name, refs] of Object.entries(p.scope.globals)) {
        if (OK.has(name)) continue;
        bad.push({ file: f, name, line: refs.loc?.start?.line });
      }
    },
  });
}

console.log(`\nตัวแปรที่เรียกใช้แต่ไม่มีในขอบเขต (ตรวจ ${files.length} ไฟล์ด้วย babel scope):`);
if (bad.length === 0) { console.log("  ✓ ไม่พบ"); pass++; }
else {
  fail++;
  console.log(`  ✗ พบ ${bad.length} จุด — build ผ่านแต่หน้าจะพังตอนเปิดจริง`);
  for (const b of bad) console.log(`      ${b.file}:${b.line ?? "?"}  ${b.name}${b.msg ? " — " + b.msg : ""}`);
  console.log("      ถ้าเป็น global ของเบราว์เซอร์จริง ให้เพิ่มชื่อลงรายชื่อ OK ในไฟล์นี้");
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
