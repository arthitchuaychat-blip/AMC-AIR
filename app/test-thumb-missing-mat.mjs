// หน้าเคลื่อนไหวสินค้าพังทั้งหน้า: "Cannot read properties of undefined (reading 'color')"
//
// ต้นเหตุ: MaterialThumb อ่าน mat.color ตรง ๆ · แต่ทุกหน้าหาข้อมูลสินค้าจาก matMap[code]
//   ซึ่งสร้างจาก listMaterialsLite() ที่กรอง active = true ไว้
//   ⇒ สินค้าที่ถูก "ปิดใช้งาน" หลังออกใบสั่งซื้อ จะหาไม่เจอ → mat เป็น undefined → ทั้งหน้าตาย
// ทางที่ผู้ใช้เดินจริง: ใบสั่งซื้อ → กด "รับสินค้าเข้าสต๊อก" → prefill ตะกร้าด้วยรายการในใบ → พังทันที
// (เคยโดนมาแล้ว 2 จุด แก้ปลายทางด้วย mat={m || { color: "#888" }} — คราวนี้กันที่ตัว MaterialThumb เอง)
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const icons = strip(fs.readFileSync("src/icons.jsx", "utf8"));
const mv = strip(fs.readFileSync("src/components/Movements.jsx", "utf8"));
const api = fs.readFileSync("src/lib/api.js", "utf8");

console.log("\nรูปสินค้าเมื่อหาสินค้าไม่เจอ (สินค้าถูกปิดใช้งาน):");

// ---------- ต้นทาง: MaterialThumb ห้ามพังเมื่อไม่มีข้อมูลสินค้า ----------
const body = icons.slice(icons.indexOf("export function MaterialThumb"), icons.indexOf("export function MaterialThumb") + 400);
check("MaterialThumb อ่าน color แบบไม่พังถ้า mat เป็น undefined", /const c = mat\?\.color/.test(body),
  "mat.color ตรง ๆ = ทั้งหน้าตายด้วย Cannot read properties of undefined (reading 'color')");
check("MaterialThumb อ่านรูปแบบไม่พังเช่นกัน", /mat\?\.photoUrl \|\| mat\?\.photo_url/.test(body),
  "กันแค่ color แต่บรรทัดถัดไปยัง mat.photoUrl = ย้ายที่พังเฉย ๆ");
const derefs = [...body.matchAll(/\bmat\.(\w+)/g)].map((m) => m[1]);
check("ไม่มีการอ่าน mat.<อะไรก็ตาม> แบบตรง ๆ หลงเหลือ", derefs.length === 0, `ยังเหลือ: mat.${derefs.join(", mat.")}`);

// ---------- ปลายทาง: บอกผู้ใช้ให้รู้เรื่อง ไม่ใช่แค่ไม่พัง ----------
check("บรรทัดในตะกร้าโชว์รหัสสินค้าแทนเมื่อหาชื่อไม่เจอ", /\{l\.m\?\.th \|\| l\.code\}/.test(mv),
  "ไม่พังแต่บรรทัดว่างเปล่า = ไม่รู้ว่าของอะไร แย่พอกัน");
check("ติดป้ายบอกว่าสินค้าถูกปิดใช้งาน", /!l\.m && <span[^>]*>\s*· สินค้าถูกปิดใช้งาน/.test(mv));
check("เตือนตอน prefill จากใบสั่งซื้อว่ามีสินค้าที่ปิดใช้งานอยู่",
  /const missing = mapped\.filter\(\(l\) => !matMap\[l\.code\]\)/.test(mv) && /สินค้าที่ถูกปิดใช้งานอยู่ในใบนี้/.test(mv),
  "ไม่เตือน = ผู้ใช้เห็นแถวประหลาดแล้วเดาเองว่าระบบเพี้ยน");

// ---------- ยืนยันว่าเหตุยังอยู่จริง (ถ้าวันหนึ่งเลิกกรอง active ค่อยรื้อเทสต์นี้) ----------
const lite = api.slice(api.indexOf("async function _loadMaterialsLite"), api.indexOf("async function _loadMaterialsLite") + 1600);
check("listMaterialsLite ยังกรอง active = true (ที่มาของ mat undefined)", /\.eq\("active", true\)/.test(lite),
  "ถ้าไม่กรองแล้ว สาเหตุเปลี่ยน — กลับมาทบทวนเทสต์นี้");

// ---------- ทุกจุดที่ส่ง mat เข้า MaterialThumb ต้องรอดหมด (ตอนนี้รอดเพราะกันที่ต้นทางแล้ว) ----------
const files = fs.readdirSync("src/components").filter((f) => f.endsWith(".jsx"));
let sites = 0;
files.forEach((f) => { sites += (fs.readFileSync("src/components/" + f, "utf8").match(/<MaterialThumb mat=/g) || []).length; });
check(`ตรวจครบทุกจุดที่ใช้ MaterialThumb (${sites} จุด)`, sites >= 12,
  "เจอน้อยผิดปกติ — regex อาจไม่จับ ไม่ใช่ว่าโค้ดถูก");

// ---------- ประเภทธุรกรรมที่ไม่รู้จัก ต้องไม่ทำทั้งหน้าตายเหมือนกัน ----------
const badLookups = [...mv.matchAll(/TYPE_BY\[[^\]]+\]\.\w+/g)].map((m) => m[0]);
check("ไม่มีการอ่าน TYPE_BY[...] แล้วจุดต่อทันที", badLookups.length === 0,
  `ยังเหลือ: ${badLookups.join(", ")} — เจอ type ที่ไม่รู้จักแล้วพังทั้งหน้า ให้ผ่าน typeOf() แทน`);
check("มี typeOf() ที่คืนค่าสำรองเมื่อไม่รู้จักประเภท", /const typeOf = \(t\) => TYPE_BY\[t\] \|\| \{/.test(mv) && /color: "#64748b"/.test(mv));

// ---------- กล่อง error ต้องบอกได้ว่าพังที่ไหน ----------
const eb = strip(fs.readFileSync("src/components/ErrorBoundary.jsx", "utf8"));
check("กล่อง error เก็บ componentStack ไว้แสดง", /this\.setState\(\{ stack: info\?\.componentStack/.test(eb),
  "มีแต่ข้อความ error = ไล่ไม่ถูกว่าพังที่ component ไหน");
check("กล่อง error เปิดรายละเอียดไว้เลย ไม่ต้องกดหา", /<details style=\{\{ marginTop: 18, textAlign: "left" \}\} open>/.test(eb));
check("กล่อง error มีปุ่มคัดลอกรายละเอียด", /navigator\.clipboard\?\.writeText/.test(eb));

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
