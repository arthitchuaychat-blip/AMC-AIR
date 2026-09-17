// ลด select("*") บนตาราง customers ใน loader เอกสาร (v845, ข้อ 6 ของแผนเก็บความเรียบร้อย)
//
// loader เอกสาร 6 ตัว (BOQ/ใบเสนอ/ใบแจ้งหนี้/ใบเสร็จ/ใบเพิ่ม-ลดหนี้/ใบวางบิล) เคยดึง customers ทุกคอลัมน์
// ทั้งที่ใช้แค่ 7 ฟิลด์ → ตอนนี้ดึงเฉพาะที่ใช้ (payload เล็กลงทุกครั้งที่เปิดเมนูเอกสาร)
// กติกาที่ test นี้คุมไว้:
//   (1) ทั้ง 6 loader ต้องใช้รายการคอลัมน์ที่กำหนด ไม่กลับไป "*" เงียบ ๆ
//   (2) ใน loader เหล่านั้น ห้ามอ่านฟิลด์ customers นอกรายการ (c.xxx ที่ pick ออกจาก map) — ถ้าอนาคตต้องใช้ฟิลด์ใหม่
//       ต้องมาเพิ่มในรายการ select ด้วย ไม่งั้นค่าจะเป็น undefined เงียบ ๆ บนเอกสาร
//   (3) _loadCustomers (เมนูลูกค้า ใช้ทุกฟิลด์) ต้องยังเป็น "*" — ห้ามใครตัดตาม
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };
const api = fs.readFileSync("src/lib/api.js", "utf8");
const fnBody = (head) => { const i = api.indexOf(head); if (i < 0) return ""; const j = api.indexOf("\n}", i); return api.slice(i, j < 0 ? undefined : j); };

const COLS = "id,name,address,tax_id,vat,branch,type";
const ALLOWED = new Set(COLS.split(","));
const NARROW = `from("customers").select("${COLS}", { count: "exact" })`;
const LOADERS = ["_loadBoqs", "_loadQuotations", "_loadInvoices", "_loadReceipts", "_loadAdjustmentNotes", "_loadBillingNotes"];

console.log("\nloader เอกสาร — ดึง customers เฉพาะคอลัมน์ที่ใช้:");
for (const fn of LOADERS) {
  const body = fnBody(`async function ${fn}(`);
  check(`${fn}: ใช้รายการคอลัมน์ (ไม่ใช่ *)`, body.includes(NARROW), body ? (body.includes('from("customers").select("*"') ? "ยังเป็น select(*)" : "ไม่พบ select customers ในฟังก์ชัน") : "ไม่เจอฟังก์ชัน");
  // ฟิลด์ที่ถูก pick ออกจาก customers ในฟังก์ชันนี้ ต้องอยู่ในรายการ select ทั้งหมด
  const picked = [...body.matchAll(/\(c\) => \[c\.id, c\.([a-z_]+)\]/g)].map((m) => m[1]);
  const bad = picked.filter((f) => !ALLOWED.has(f));
  check(`${fn}: ฟิลด์ที่อ่าน (${[...new Set(picked)].join(",") || "-"}) อยู่ในรายการ select ครบ`, bad.length === 0, "อ่านฟิลด์ที่ไม่ได้ select: " + bad.join(", "));
}

console.log("\nกันถอยหลัง:");
const starCustomers = [...api.matchAll(/from\("customers"\)\.select\("\*"/g)].length;
check("select(\"*\") บน customers เหลือที่เดียว = _loadCustomers (เมนูลูกค้า)", starCustomers === 1 && fnBody("async function _loadCustomers(").includes('from("customers").select("*"'), `พบ select(*) บน customers ${starCustomers} จุด`);

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
