// ฟอร์มแก้สินค้าอ่านค่าเดิมจาก listMaterialsLite แล้ว saveMaterial เขียนกลับทุกคอลัมน์เสมอ
// คอลัมน์ไหนที่ "เขียนกลับ แต่ไม่ได้อ่านมา" = แก้สินค้าทีเดียวค่านั้นถูกล้างเงียบ ๆ
//
// เกิดจริง: web_published ไม่อยู่ในลิสต์คอลัมน์ → enrich() ได้ webPublished = false ทุกแถว
//   → MaterialModal เห็น false (ไม่ใช่ undefined) ?? เลยไม่ตกไปค่าจริง → toggle ขึ้น "ไม่แสดงบนเว็บ"
//   → saveMaterial เขียน false ทับ → **แก้ชื่อสินค้าผิดตัวเดียว สินค้าหลุดจากเว็บ www.amcair.net เงียบ ๆ**
// เป็นบั๊กคลาสเดียวกับฟอร์มลูกค้า (ดู test-customer-form.mjs) แค่คนละหน้า
import fs from "node:fs";

const api = fs.readFileSync("src/lib/api.js", "utf8");
let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };

// คอลัมน์ที่ saveMaterial เขียนจริง — อ่านจาก payload ในโค้ดจริง ไม่ hardcode
const sIdx = api.indexOf("export async function saveMaterial");
const pIdx = api.indexOf("const payload = {", sIdx);
const payload = api.slice(pIdx, api.indexOf("\n  };", pIdx));
const written = [...new Set([...payload.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]))];

// คอลัมน์ที่ listMaterialsLite อ่านมา
const lIdx = api.indexOf("export async function listMaterialsLite");
const fIdx = api.indexOf("const FULL = \"", lIdx);
const FULL = api.slice(api.indexOf('"', fIdx) + 1, api.indexOf('";', fIdx));
const read = new Set(FULL.split(",").map((s) => s.trim()));

console.log(`\nฟอร์มสินค้า — saveMaterial เขียน ${written.length} คอลัมน์ · listMaterialsLite อ่าน ${read.size} คอลัมน์:`);

const miss = written.filter((c) => !read.has(c));
check("ทุกคอลัมน์ที่เขียนกลับ อ่านมาครบ", miss.length === 0,
  "ขาด: " + miss.join(", ") + " → ฟอร์มไม่เห็นค่าเดิม แล้ว saveMaterial เขียนค่าว่างทับ (แก้สินค้าครั้งเดียวค่าหาย)");

// web_published สำคัญเป็นพิเศษ — พลาดแล้วสินค้าหลุดจากเว็บขายหน้าร้าน ไม่มีอะไรเตือน
check("web_published อยู่ในลิสต์ที่อ่าน", read.has("web_published"),
  "ขาดตัวนี้ = แก้สินค้าทีเดียว สินค้าหายจาก www.amcair.net โดยไม่มีสัญญาณอะไรบนจอ");

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
