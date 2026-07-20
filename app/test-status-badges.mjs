// ตารางป้ายสถานะแต่ละหน้า (STATUS/RSTATUS) ถูกอ่านแบบ `STATUS[x.status] || STATUS.somedefault`
// สถานะที่ไม่มีในตารางจึงไม่ระเบิด แต่ "กลายร่าง" เป็นค่า default เงียบ ๆ
//
// เกิดจริงมาแล้ว 2 หน้า:
//   · ใบเสร็จที่ยกเลิกแล้ว → ตกไป RSTATUS.paid → ขึ้นป้ายเขียว "ชำระเงินแล้ว" ทั้งที่ยกเลิกไปแล้ว
//   · ใบเสนอราคาที่ยกเลิกแล้ว → ตกไป STATUS.draft → ขึ้นป้ายเทา "ร่าง"
// ทั้งสองหน้ามีป้ายแดง "ยกเลิกแล้ว" แปะเพิ่มอีกใบ การ์ดเลยขัดกันเอง เขียวว่าจ่ายแล้ว แดงว่ายกเลิก
import fs from "node:fs";

// [ไฟล์, ชื่อตาราง]
const PAGES = [
  ["src/components/Receipts.jsx", "RSTATUS"],
  ["src/components/Quotation.jsx", "STATUS"],
  ["src/components/Invoices.jsx", "STATUS"],
  ["src/components/PurchaseOrders.jsx", "STATUS"],
  ["src/components/MaterialPrep.jsx", "STATUS"],
  ["src/components/Handover.jsx", "STATUS"],
  ["src/components/TaskBoard.jsx", "STATUS"],
];
let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name + (why ? "\n      " + why : "")); fail++; } };

console.log("\nป้ายสถานะ — ตารางต้องครอบคลุมทุกสถานะที่หน้านั้นเทียบเอง:");

for (const [f, mapName] of PAGES) {
  const s = fs.readFileSync(f, "utf8");
  const short = f.split("/").pop();

  // อ่านคีย์ในตาราง: ตั้งแต่ `const STATUS = {` ไปจนถึง `};` ที่คอลัมน์ 0
  const i = s.indexOf(`const ${mapName} = {`);
  if (i < 0) { check(`${short}: หาตาราง ${mapName} เจอ`, false, "ไม่เจอ — เปลี่ยนชื่อตารางแล้วหรือย้ายไฟล์?"); continue; }
  const body = s.slice(i, s.indexOf("\n};", i));
  const have = new Set([...body.matchAll(/(?:^|[{,\s])([a-z_]+):\s*\{/g)].map((m) => m[1]));

  // ตัวแปรที่ "เป็นเอกสารของหน้านี้" = ตัวที่ถูกยัดเข้าตาราง เช่น RSTATUS[x.status] → x
  // (จำเป็น ไม่งั้นจะไปนับ inv.status ในหน้าใบเสร็จ หรือ q.status ในหน้าใบแจ้งหนี้ ซึ่งเป็นเอกสารคนละใบ)
  const vars = new Set([...s.matchAll(new RegExp(`${mapName}\\[(\\w+)\\.status\\]`, "g"))].map((m) => m[1]));
  if (!vars.size) { check(`${short}: หาตัวแปรเอกสารของหน้าเจอ`, false, `ไม่เจอ ${mapName}[<var>.status] — เปลี่ยนวิธีอ่านตารางแล้ว`); continue; }

  // สถานะที่หน้านั้นเทียบเองจริง ๆ — โค้ดที่เขียน `x.status === "cancelled"` แปลว่าสถานะนี้เกิดขึ้นได้แน่
  // ข้ามบรรทัดที่ชื่อตัวแปรถูกผูกใหม่เป็นพารามิเตอร์ callback เช่น invoices.filter((x) => x.status === "unpaid")
  // — ตรงนั้น x เป็นใบแจ้งหนี้ ไม่ใช่ใบเสร็จ (ข้อเสียที่ยอมรับ: ถ้าสถานะหนึ่งถูกเทียบบนบรรทัดผูกตัวแปรที่เดียว จะตรวจไม่เจอ)
  const used = new Set(
    s.split("\n").flatMap((line) => {
      const bound = [...line.matchAll(/\(\s*(\w+)\s*(?:,[^)]*)?\)\s*=>/g)].map((m) => m[1]);
      if (bound.some((b) => vars.has(b))) return [];
      return [...line.matchAll(/(\w+)\.status\s*[!=]==\s*"([a-z_]+)"/g)].filter((m) => vars.has(m[1])).map((m) => m[2]);
    }));
  const miss = [...used].filter((k) => !have.has(k));
  check(`${short}: ${mapName} ครบทุกสถานะที่ใช้`, miss.length === 0,
    `ขาด: ${miss.join(", ")} → ตกไปค่า default แล้วโชว์ป้ายผิด (เช่น ยกเลิกแล้วแต่ขึ้น "ชำระเงินแล้ว" สีเขียว)`);
}

console.log(`\nสรุป: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
